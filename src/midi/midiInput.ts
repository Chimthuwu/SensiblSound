import { useSessionStore } from '../stores/useSessionStore';
import type { MidiNote } from '../types';
import { laneInstrument, laneNoteFx, previewNote, releaseNote } from './midiEngine';
import { applyNoteFxChain, arpPick, ARP_RATES, type FxDevice, type FxNote } from './noteFx';

// ---------------------------------------------------------------- drum note mapping
// Controllers send pads on all sorts of notes (MPC-style 36 up, General MIDI drum kit, ...). Fold them onto the eight pads.
const GM_DRUMS: Record<number, number> = {
  35: 36, 36: 36, // kick
  37: 37, 38: 37, 40: 37, // snare / rim
  39: 38, // clap
  42: 39, 44: 39, // closed hat, pedal hat
  46: 40, // open hat
  41: 41, 43: 41, 45: 41, // low toms
  47: 42, 48: 42, 50: 42, // high toms
  49: 43, 51: 43, 52: 43, 55: 43, 57: 43, // cymbals
};

export function mapDrumNote(pitch: number): number {
  if (GM_DRUMS[pitch] !== undefined && (pitch < 36 || pitch > 43)) return GM_DRUMS[pitch];
  if (pitch >= 36 && pitch <= 43) return pitch;
  // Pad banks above/below the kit: wrap onto the eight pads.
  return 36 + (((pitch - 36) % 8) + 8) % 8;
}

// ---------------------------------------------------------------- where live notes go
const hasInstrument = (laneId: string) => laneInstrument(laneId) !== null;

/** The lane live notes play: the selected track if it has an instrument, else the selected clip's track, else the first instrument track. */
export function targetLane(): string | null {
  const s = useSessionStore.getState();
  if (hasInstrument(s.selectedTrackId)) return s.selectedTrackId;
  const clipLane = s.selectedClip?.laneId;
  if (clipLane && hasInstrument(clipLane)) return clipLane;
  for (const id of Object.keys(s.trackDevices)) if (hasInstrument(id)) return id;
  return null;
}

// ---------------------------------------------------------------- recording
interface OpenNote { lane: string; pitch: number; atMs: number; vel: number }
const open = new Map<string, OpenNote>();
const GRID = 0.125; // record to 32nd notes: tight, but still feels played

const recordingLane = (): string | null => {
  const s = useSessionStore.getState();
  return s.isRecording && hasInstrument(s.armedTrackId) ? s.armedTrackId : null;
};

function commitNote(n: OpenNote, endMs: number) {
  const s = useSessionStore.getState();
  const msPerBeat = 60_000 / s.bpm;
  const barMs = msPerBeat * 4;
  const drums = laneInstrument(n.lane)?.kind === 'drums';

  // Find the clip under the note, or start a new one on the bar the note falls in.
  let clip = s.midiClips.find((c) => c.laneId === n.lane && n.atMs >= c.startMs - 1 && n.atMs < c.startMs + c.bars * barMs);
  if (!clip) {
    const id = s.addMidiClip(n.lane, { startMs: Math.floor(n.atMs / barMs) * barMs, bars: 4 });
    clip = useSessionStore.getState().midiClips.find((c) => c.id === id);
    if (!clip) return;
  }
  const startBeat = Math.max(0, Math.round(((n.atMs - clip.startMs) / msPerBeat) / GRID) * GRID);
  const lenBeats = drums ? 0.25 : Math.max(GRID, Math.round(((endMs - n.atMs) / msPerBeat) / GRID) * GRID);
  const neededBars = Math.min(64, Math.ceil((startBeat + lenBeats) / 4));
  const note: MidiNote = { id: crypto.randomUUID(), pitch: n.pitch, startBeat, lenBeats, vel: Math.max(0.2, n.vel) };
  const fresh = useSessionStore.getState().midiClips.find((c) => c.id === clip!.id) ?? clip;
  useSessionStore.getState().setMidiNotes(clip.id, [...fresh.notes, note]);
  if (neededBars > clip.bars) useSessionStore.getState().updateMidiClip(clip.id, { bars: neededBars });
}

function closeAll(endMs: number) {
  for (const n of open.values()) commitNote(n, endMs);
  open.clear();
}

// ---------------------------------------------------------------- live notes (keyboard, MIDI controller)
const sustained = new Map<string, { lane: string; pitch: number }>();
let pedal = false;

// ---------------------------------------------------------------- live note FX
// Played notes pass through the track's MIDI FX before the instrument, like the clip does. A live arpeggiator
// keeps its own clock; echoes are scheduled ahead with timers. Recording always stores the notes as played.
interface LiveHeld { fx: { pitch: number; vel: number }[]; sounding: { pitch: number }[] }
const liveHeld = new Map<string, LiveHeld>(); // key = lane:rawPitch
interface LiveArp { timer: number; counter: number; stepMs: number }
const liveArps = new Map<string, LiveArp>();

const msPerBeat = () => 60_000 / useSessionStore.getState().bpm;
const asFx = (id: string, pitch: number, vel: number, len = 1): FxNote => ({ id, pitch, startBeat: 0, lenBeats: len, vel });

/** Plays events from the chain after the arp (or the whole chain): immediate ones follow the key, delayed ones are timed. */
function playFxEvents(lane: string, events: FxNote[], holdFirst: boolean, track?: LiveHeld) {
  const mpb = msPerBeat();
  const synth = laneInstrument(lane)?.kind === 'synth';
  for (const e of events) {
    if (e.startBeat <= 1e-6) {
      previewNote(lane, e.pitch, e.vel, holdFirst && synth, Math.max(0.05, (e.lenBeats * mpb) / 1000));
      if (holdFirst && synth) track?.sounding.push({ pitch: e.pitch });
    } else {
      window.setTimeout(() => previewNote(lane, e.pitch, e.vel, false, Math.max(0.05, (e.lenBeats * mpb) / 1000)), e.startBeat * mpb);
    }
  }
}

function splitAtArp(chain: FxDevice[]): { pre: FxDevice[]; arp: FxDevice | null; post: FxDevice[] } {
  const i = chain.findIndex((d) => d.type === 'arp' && d.params.on !== 0);
  return i < 0 ? { pre: chain, arp: null, post: [] } : { pre: chain.slice(0, i), arp: chain[i], post: chain.slice(i + 1) };
}

function startLiveArp(lane: string, arp: FxDevice, post: FxDevice[]) {
  if (liveArps.has(lane)) return;
  const stepMs = ARP_RATES[Math.min(ARP_RATES.length - 1, Math.max(0, Math.round(arp.params.rate)))].beats * msPerBeat();
  const state: LiveArp = { counter: 0, stepMs, timer: 0 };
  const tick = () => {
    const pool: { pitch: number; vel: number }[] = [];
    for (const [key, h] of liveHeld) if (key.startsWith(lane + ':')) pool.push(...h.fx);
    const pick = arpPick(pool, state.counter++, arp.params);
    if (pick) {
      const len = Math.max(0.03, (stepMs / msPerBeat()) * Math.min(1, Math.max(0.05, arp.params.gate)));
      const out = post.length ? applyNoteFxChain([asFx(`arp${state.counter}`, pick.pitch, pick.vel, len)], post) : [asFx('a', pick.pitch, pick.vel, len)];
      playFxEvents(lane, out, false);
    }
  };
  tick();
  state.timer = window.setInterval(tick, stepMs);
  liveArps.set(lane, state);
}

function stopLiveArpIfIdle(lane: string) {
  for (const key of liveHeld.keys()) if (key.startsWith(lane + ':')) return;
  const a = liveArps.get(lane);
  if (a) { window.clearInterval(a.timer); liveArps.delete(lane); }
}

/** A key goes down. Plays the target track's instrument (through its MIDI FX) and, when recording, captures the note. */
export function liveNoteOn(pitchIn: number, vel = 0.85, laneOverride?: string) {
  const lane = laneOverride && hasInstrument(laneOverride) ? laneOverride : targetLane();
  if (!lane) return;
  const rig = laneInstrument(lane);
  const pitch = rig?.kind === 'drums' ? mapDrumNote(pitchIn) : pitchIn;
  const key = `${lane}:${pitch}`;
  sustained.delete(key);
  const { pre, arp, post } = splitAtArp(laneNoteFx(lane));
  const held: LiveHeld = { fx: [], sounding: [] };
  const processed = pre.length ? applyNoteFxChain([asFx(key, pitch, vel)], pre) : [asFx(key, pitch, vel)];
  if (arp) {
    held.fx = processed.map((e) => ({ pitch: e.pitch, vel: e.vel }));
    liveHeld.set(key, held);
    startLiveArp(lane, arp, post);
  } else {
    const events = post.length ? applyNoteFxChain(processed, post) : processed;
    liveHeld.set(key, held);
    playFxEvents(lane, events, true, held);
  }
  const rec = recordingLane();
  if (rec === lane) {
    const prev = open.get(key);
    if (prev) commitNote(prev, useSessionStore.getState().transportTimeMs);
    open.set(key, { lane, pitch, atMs: useSessionStore.getState().transportTimeMs, vel });
  }
}

export function liveNoteOff(pitchIn: number, laneOverride?: string) {
  const lane = laneOverride && hasInstrument(laneOverride) ? laneOverride : targetLane();
  if (!lane) return;
  const rig = laneInstrument(lane);
  const pitch = rig?.kind === 'drums' ? mapDrumNote(pitchIn) : pitchIn;
  const key = `${lane}:${pitch}`;
  if (pedal && rig?.kind === 'synth') { sustained.set(key, { lane, pitch }); return; }
  releaseLive(key, lane, pitch);
  const n = open.get(key);
  if (n) { commitNote(n, useSessionStore.getState().transportTimeMs); open.delete(key); }
}

/** Ends what a key started: the notes it is holding, or its place in a live arpeggio. */
function releaseLive(key: string, lane: string, pitch: number) {
  const h = liveHeld.get(key);
  liveHeld.delete(key);
  if (h) for (const s of h.sounding) releaseNote(lane, s.pitch);
  else releaseNote(lane, pitch);
  stopLiveArpIfIdle(lane);
}

function setPedal(down: boolean) {
  pedal = down;
  if (down) return;
  for (const [key, h] of [...sustained]) {
    releaseLive(key, h.lane, h.pitch);
    const n = open.get(key);
    if (n) { commitNote(n, useSessionStore.getState().transportTimeMs); open.delete(key); }
    sustained.delete(key);
  }
}

function allNotesOff() {
  setPedal(false);
  for (const [key, n] of [...open]) { releaseLive(key, n.lane, n.pitch); commitNote(n, useSessionStore.getState().transportTimeMs); open.delete(key); }
  for (const key of [...liveHeld.keys()]) { const [lane, p] = key.split(':'); releaseLive(key, lane, Number(p)); }
}

// ---------------------------------------------------------------- Web MIDI
let access: MIDIAccess | null = null;
let lastActivity = 0;

function onMessage(e: MIDIMessageEvent) {
  const d = e.data;
  if (!d || d.length < 2) return;
  const status = d[0] & 0xf0;
  const a = d[1];
  const b = d.length > 2 ? d[2] : 0;
  const now = performance.now();
  if (status === 0x90 && b > 0) {
    liveNoteOn(a, b / 127);
    if (now - lastActivity > 60) { lastActivity = now; useSessionStore.getState().bumpMidiActivity(); }
  } else if (status === 0x80 || (status === 0x90 && b === 0)) {
    liveNoteOff(a);
  } else if (status === 0xb0) {
    if (a === 64) setPedal(b >= 64);
    else if (a === 123 || a === 120) allNotesOff();
    else if (a === 1 || a === 74) {
      // Mod wheel / cutoff knob sweeps the synth filter on the target track.
      const lane = targetLane();
      if (lane && laneInstrument(lane)?.kind === 'synth') {
        const st = useSessionStore.getState();
        const cur = st.instruments[lane]?.synth;
        if (cur) st.setInstrument(lane, { synth: { ...cur, cutoff: Math.round(Math.pow(2, Math.log2(80) + (b / 127) * (Math.log2(16000) - Math.log2(80)))) } });
      }
    }
  }
}

function refreshInputs() {
  if (!access) return;
  const st = useSessionStore.getState();
  const inputs: { id: string; name: string }[] = [];
  access.inputs.forEach((input) => {
    inputs.push({ id: input.id, name: input.name || 'MIDI input' });
    const chosen = st.midiInputId === 'all' || st.midiInputId === input.id;
    input.onmidimessage = chosen ? onMessage : null;
  });
  st.setMidiInputs(inputs);
  // The chosen device was unplugged: fall back to listening to everything.
  if (st.midiInputId !== 'all' && !inputs.some((i) => i.id === st.midiInputId)) st.setMidiInputId('all');
}

/** Asks the browser for MIDI access (shows its permission prompt the first time). */
export async function connectMidi(): Promise<void> {
  const st = useSessionStore.getState();
  if (access) { refreshInputs(); return; }
  if (!navigator.requestMIDIAccess) { st.setMidiStatus('unsupported'); return; }
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
    access.onstatechange = refreshInputs;
    st.setMidiStatus('ready');
    refreshInputs();
  } catch {
    st.setMidiStatus('denied');
  }
}

/** Starts MIDI: connects right away when the user already allowed it, and wires recording. Returns an unsubscribe. */
export function startMidiInput(): () => void {
  if (!navigator.requestMIDIAccess) useSessionStore.getState().setMidiStatus('unsupported');
  else {
    (navigator.permissions?.query({ name: 'midi' as PermissionName }) ?? Promise.reject())
      .then((p) => { if (p.state === 'granted') void connectMidi(); })
      .catch(() => {});
  }
  const unsub = useSessionStore.subscribe((s, prev) => {
    if (!s.isRecording && prev.isRecording) closeAll(s.transportTimeMs);
    if (s.midiInputId !== prev.midiInputId) refreshInputs();
  });
  return () => { unsub(); allNotesOff(); };
}
