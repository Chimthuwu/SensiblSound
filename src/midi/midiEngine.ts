import { createMeterTap, masterIn, playbackContext } from '../utils/audioBus';
import { useSessionStore } from '../stores/useSessionStore';
import { DEFAULT_DRUMS, DEFAULT_SYNTH, isNoteFxDevice, type Instrument, type MidiClip, type MidiKind } from '../types';
import { getEffective, isModulated, modNoteOff, modNoteOn, modNotePulse } from '../mod/modEngine';
import { DRUM_SPECS, SYNTH_SPECS } from '../mod/params';
import { audioFxKey, audioFxOf, buildLaneFx } from './laneFx';
import { applyNoteFxChain, isNoteFx, NOTE_FX_DEFAULTS, type FxDevice, type FxNote } from './noteFx';
import { playDrum, playSynthNote } from './instruments';

// Notes are scheduled slightly ahead of the clock so timing stays tight even when the UI is busy.
const LOOKAHEAD_S = 0.14;
const TICK_MS = 30;

interface Channel {
  gain: GainNode;
  /** Audio FX after the instrument sit between these two. */
  fxIn: GainNode;
  fxOut: GainNode;
  pan: StereoPannerNode;
  untap: () => void;
  fxKey: string;
  fxDispose: (() => void) | null;
}

const channels = new Map<string, Channel>();
const held = new Map<string, () => void>();

function channel(trackId: string): Channel {
  let ch = channels.get(trackId);
  if (!ch) {
    const ctx = playbackContext();
    const gain = ctx.createGain();
    const fxIn = ctx.createGain();
    const fxOut = ctx.createGain();
    const pan = ctx.createStereoPanner();
    gain.connect(fxIn);
    fxIn.connect(fxOut); // no audio FX yet: straight through
    fxOut.connect(pan);
    pan.connect(masterIn());
    ch = { gain, fxIn, fxOut, pan, untap: createMeterTap(ctx, pan, trackId), fxKey: '[[],0,0,0,0]', fxDispose: null };
    channels.set(trackId, ch);
  }
  return ch;
}

/** Pushes volume, pan and mute/solo from the store into each track's channel. */
function syncChannels() {
  const s = useSessionStore.getState();
  const anySolo = s.soloedTracks.size > 0;
  const liveIds: string[] = Array.from(new Set<string>(s.midiClips.map((c) => c.laneId)));
  const live = new Set<string>(liveIds);
  for (const [id, ch] of channels) {
    if (!live.has(id)) {
      ch.untap();
      ch.fxDispose?.();
      ch.gain.disconnect();
      ch.fxIn.disconnect();
      ch.fxOut.disconnect();
      ch.pan.disconnect();
      channels.delete(id);
    }
  }
  for (const id of liveIds) {
    const ch = channel(id);
    // Audio FX after the instrument: rebuilt only when a device or one of its settings changes.
    const types = audioFxOf(s.trackDevices[id] ?? [], s.devicePower);
    const key = audioFxKey(types, s.fxSettings);
    if (key !== ch.fxKey) {
      ch.fxKey = key;
      ch.fxDispose?.();
      ch.fxDispose = null;
      ch.fxIn.disconnect();
      if (types.length) ch.fxDispose = buildLaneFx(playbackContext(), ch.fxIn, ch.fxOut, types, s.fxSettings);
      else ch.fxIn.connect(ch.fxOut);
    }
    const silent = s.disabledTracks.has(id) || s.mutedTracks.has(id) || (anySolo && !s.soloedTracks.has(id));
    ch.gain.gain.value = silent ? 0 : getEffective(`track:${id}:vol`, s.trackVolumes[id] ?? 1);
    ch.pan.pan.value = getEffective(`track:${id}:pan`, s.trackPans[id] ?? 0);
  }
}

const FALLBACK: Instrument = { synth: DEFAULT_SYNTH, drums: DEFAULT_DRUMS };

/** The instrument that plays a lane: the first synth or drum machine in its device rack. No instrument, no sound. */
export function laneInstrument(laneId: string): { kind: MidiKind; inst: Instrument } | null {
  const s = useSessionStore.getState();
  const dev = (s.trackDevices[laneId] ?? []).find((d) => (d.type === 'synth' || d.type === 'drums') && s.devicePower[d.uid] !== false);
  if (!dev) return null;
  return { kind: dev.type as MidiKind, inst: s.instruments[laneId] ?? FALLBACK };
}

/** The lane's MIDI FX, in rack order, with their settings. */
export function laneNoteFx(laneId: string): FxDevice[] {
  const s = useSessionStore.getState();
  const out: FxDevice[] = [];
  for (const d of s.trackDevices[laneId] ?? []) {
    if (!isNoteFxDevice(d.type) || !isNoteFx(d.type) || s.devicePower[d.uid] === false) continue;
    out.push({ type: d.type, params: { ...NOTE_FX_DEFAULTS[d.type], ...(s.midiFxParams[d.uid] ?? {}) } });
  }
  return out;
}

// Processing a clip is pure, so the result is cached until the clip's notes or the lane's FX settings change.
const fxCache = new Map<string, { notes: MidiClip['notes']; key: string; out: FxNote[] }>();

/** A clip's notes after the lane's MIDI FX, as note events in beats. */
export function processedNotes(clip: MidiClip): FxNote[] {
  const chain = laneNoteFx(clip.laneId);
  const key = JSON.stringify(chain);
  const hit = fxCache.get(clip.id);
  if (hit && hit.notes === clip.notes && hit.key === key) return hit.out;
  const input: FxNote[] = clip.notes.map((n) => ({ id: n.id, pitch: n.pitch, startBeat: n.startBeat, lenBeats: n.lenBeats, vel: n.vel }));
  const out = chain.length ? applyNoteFxChain(input, chain) : input;
  fxCache.set(clip.id, { notes: clip.notes, key, out });
  return out;
}

/**
 * Writes what comes out of a clip's MIDI FX into a new track: same instrument and settings, no MIDI FX, a clip of the
 * resulting notes. Returns the new lane id (null if the clip or its instrument is missing).
 */
export function bakeMidiFx(clipId: string): string | null {
  const st = useSessionStore.getState();
  const clip = st.midiClips.find((c) => c.id === clipId);
  const rig = clip ? laneInstrument(clip.laneId) : null;
  if (!clip || !rig) return null;
  const notes = processedNotes(clip);
  const lastBeat = notes.reduce((m, n) => Math.max(m, n.startBeat + n.lenBeats), 0);
  const lane = st.addTrack();
  const inst = st.instruments[clip.laneId];
  if (inst) st.setInstrument(lane, { synth: { ...inst.synth }, drums: { ...inst.drums } });
  st.addDevice(lane, rig.kind);
  const id = useSessionStore.getState().addMidiClip(lane, { startMs: clip.startMs, bars: Math.min(64, Math.max(1, Math.ceil(lastBeat / 4))) });
  useSessionStore.getState().setMidiNotes(id, notes.map((n) => ({ id: crypto.randomUUID(), pitch: n.pitch, startBeat: n.startBeat, lenBeats: n.lenBeats, vel: n.vel })));
  return lane;
}

/** The instrument's settings with any modulation/automation applied, sampled as the note starts. */
function modulatedInstrument(laneId: string, inst: Instrument): Instrument {
  let synth = inst.synth, drums = inst.drums;
  for (const key of Object.keys(SYNTH_SPECS) as (keyof typeof SYNTH_SPECS)[]) {
    if (SYNTH_SPECS[key] && isModulated(`synth:${laneId}:${key}`)) synth = { ...synth, [key]: getEffective(`synth:${laneId}:${key}`, synth[key] as number) };
  }
  for (const key of Object.keys(DRUM_SPECS) as (keyof typeof DRUM_SPECS)[]) {
    if (isModulated(`drums:${laneId}:${key}`)) drums = { ...drums, [key]: getEffective(`drums:${laneId}:${key}`, drums[key]) };
  }
  return synth === inst.synth && drums === inst.drums ? inst : { ...inst, synth, drums };
}

function playNote(laneId: string, rigIn: { kind: MidiKind; inst: Instrument }, pitch: number, vel: number, when: number, durS: number | null) {
  const rig = { kind: rigIn.kind, inst: modulatedInstrument(laneId, rigIn.inst) };
  const ctx = playbackContext();
  // Envelopes that follow the notes open while a note sounds.
  const delayMs = Math.max(0, (when - ctx.currentTime) * 1000);
  if (durS !== null) modNotePulse(delayMs, durS * 1000);
  const out = channel(laneId).gain;
  if (rig.kind === 'drums') {
    playDrum(ctx, out, rig.inst.drums, pitch, vel, when);
    return () => {};
  }
  return playSynthNote(ctx, out, rig.inst.synth, pitch, vel, when, durS);
}

/** Sound a note right now (keyboard, MIDI input, piano-roll preview). Pass `hold` to keep it until noteOff. */
export function previewNote(trackId: string, pitch: number, vel = 0.8, hold = false, durS = 0.3) {
  const rig = laneInstrument(trackId);
  if (!rig) return;
  const ctx = playbackContext();
  if (ctx.state === 'suspended') void ctx.resume();
  syncChannels();
  const key = `${trackId}:${pitch}`;
  held.get(key)?.();
  const stop = playNote(trackId, rig, pitch, vel, ctx.currentTime + 0.005, hold ? null : durS);
  channel(trackId);
  if (hold) {
    modNoteOn(); // envelopes that follow the notes stay open while the key is down
    held.set(key, () => { stop(); modNoteOff(); held.delete(key); });
  }
}

export function releaseNote(trackId: string, pitch: number) {
  held.get(`${trackId}:${pitch}`)?.();
}

// --------------------------------------------------------------- transport scheduler
let timer: number | null = null;
// Maps transport time to the audio clock: audioTime = anchorAudio + (transportMs - anchorMs) / 1000.
let anchorAudio = 0;
let anchorMs = 0;
let scheduledUpTo = 0; // transport ms already handed to the audio clock

function start() {
  const ctx = playbackContext();
  if (ctx.state === 'suspended') void ctx.resume();
  const ms = useSessionStore.getState().transportTimeMs;
  anchorAudio = ctx.currentTime;
  anchorMs = ms;
  scheduledUpTo = ms;
  if (timer === null) timer = window.setInterval(tick, TICK_MS);
}

function stop() {
  if (timer !== null) { window.clearInterval(timer); timer = null; }
  for (const release of [...held.values()]) release();
}

function tick() {
  const ctx = playbackContext();
  const s = useSessionStore.getState();
  if (!s.isPlaying) return;
  syncChannels();

  // The transport is the master clock. If it jumped (scrub, rewind), re-anchor instead of playing stale notes.
  const predicted = anchorMs + (ctx.currentTime - anchorAudio) * 1000;
  if (Math.abs(s.transportTimeMs - predicted) > 120) {
    anchorAudio = ctx.currentTime;
    anchorMs = s.transportTimeMs;
    scheduledUpTo = s.transportTimeMs;
  }

  const nowMs = anchorMs + (ctx.currentTime - anchorAudio) * 1000;
  const horizon = nowMs + LOOKAHEAD_S * 1000;
  if (horizon <= scheduledUpTo) return;
  const msPerBeat = 60_000 / s.bpm;

  for (const clip of s.midiClips) {
    if (s.disabledTracks.has(clip.laneId)) continue;
    const rig = laneInstrument(clip.laneId);
    if (!rig) continue;
    const fxNotes = processedNotes(clip);
    // Echo tails and arps can run past the end of the clip, so the window is as long as the last note FX output.
    const lastBeat = fxNotes.reduce((m, n) => Math.max(m, n.startBeat + n.lenBeats), clip.bars * 4);
    const clipEnd = clip.startMs + lastBeat * msPerBeat;
    if (clipEnd < scheduledUpTo || clip.startMs > horizon) continue;
    for (const n of fxNotes) {
      const at = clip.startMs + n.startBeat * msPerBeat;
      if (at < scheduledUpTo || at >= horizon) continue;
      const when = anchorAudio + (at - anchorMs) / 1000;
      playNote(clip.laneId, rig, n.pitch, n.vel, Math.max(when, ctx.currentTime), (n.lenBeats * msPerBeat) / 1000);
    }
  }
  scheduledUpTo = horizon;
}

/** Starts and stops the scheduler with the transport. Call once; returns an unsubscribe. */
export function startMidiEngine(): () => void {
  const sub = useSessionStore.subscribe((state, prev) => {
    if (state.isPlaying && !prev.isPlaying) start();
    else if (!state.isPlaying && prev.isPlaying) stop();
  });
  if (useSessionStore.getState().isPlaying) start();
  return () => { sub(); stop(); };
}
