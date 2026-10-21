import { createMeterTap, masterIn, playbackContext } from '../utils/audioBus';
import { useSessionStore } from '../stores/useSessionStore';
import { DEFAULT_DRUMS, DEFAULT_SYNTH, type Instrument, type MidiKind } from '../types';
import { playDrum, playSynthNote } from './instruments';

// Notes are scheduled slightly ahead of the clock so timing stays tight even when the UI is busy.
const LOOKAHEAD_S = 0.14;
const TICK_MS = 30;

interface Channel {
  gain: GainNode;
  pan: StereoPannerNode;
  untap: () => void;
}

const channels = new Map<string, Channel>();
const held = new Map<string, () => void>();

function channel(trackId: string): Channel {
  let ch = channels.get(trackId);
  if (!ch) {
    const ctx = playbackContext();
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    gain.connect(pan);
    pan.connect(masterIn());
    ch = { gain, pan, untap: createMeterTap(ctx, pan, trackId) };
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
      ch.gain.disconnect();
      ch.pan.disconnect();
      channels.delete(id);
    }
  }
  for (const id of liveIds) {
    const ch = channel(id);
    const silent = s.disabledTracks.has(id) || s.mutedTracks.has(id) || (anySolo && !s.soloedTracks.has(id));
    ch.gain.gain.value = silent ? 0 : (s.trackVolumes[id] ?? 1);
    ch.pan.pan.value = s.trackPans[id] ?? 0;
  }
}

const FALLBACK: Instrument = { synth: DEFAULT_SYNTH, drums: DEFAULT_DRUMS };

/** The instrument that plays a lane: the first synth or drum machine in its device rack. No instrument, no sound. */
export function laneInstrument(laneId: string): { kind: MidiKind; inst: Instrument } | null {
  const s = useSessionStore.getState();
  const dev = (s.trackDevices[laneId] ?? []).find((d) => d.type === 'synth' || d.type === 'drums');
  if (!dev) return null;
  return { kind: dev.type as MidiKind, inst: s.instruments[laneId] ?? FALLBACK };
}

function playNote(laneId: string, rig: { kind: MidiKind; inst: Instrument }, pitch: number, vel: number, when: number, durS: number | null) {
  const ctx = playbackContext();
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
  if (hold) held.set(key, () => { stop(); held.delete(key); });
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
    const clipEnd = clip.startMs + clip.bars * 4 * msPerBeat;
    if (clipEnd < scheduledUpTo || clip.startMs > horizon) continue;
    const rig = laneInstrument(clip.laneId);
    if (!rig) continue;
    for (const n of clip.notes) {
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
