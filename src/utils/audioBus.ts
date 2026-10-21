import { useSessionStore } from '../stores/useSessionStore';
import { getEffective, onModTick } from '../mod/modEngine';

// One AudioContext for all playback (audio clips and MIDI instruments), a master bus every track feeds,
// and level meters that tap tracks and the master without changing the sound.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function playbackContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

// Browsers keep audio suspended until a user gesture; resume on the first click or key press.
if (typeof window !== 'undefined') {
  const resume = () => {
    if (ctx?.state === 'suspended') void ctx.resume();
  };
  window.addEventListener('pointerdown', resume);
  window.addEventListener('keydown', resume);
}

/** Where every track's output goes. Its gain is the master fader. */
export function masterIn(): GainNode {
  if (!master) {
    const c = playbackContext();
    master = c.createGain();
    master.gain.value = useSessionStore.getState().masterVolume;
    // Soft clipper on the way out: unity gain for normal levels, and a smooth ceiling below full scale so stacked
    // tracks and hard-hitting drums can't clip the output (a compressor would add make-up gain instead).
    const clip = c.createWaveShaper();
    const curve = new Float32Array(4097);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 4 - 2;
      curve[i] = Math.abs(x) < 0.6 ? x : Math.sign(x) * (0.6 + 0.38 * Math.tanh((Math.abs(x) - 0.6) / 0.38));
    }
    clip.curve = curve;
    clip.oversample = '2x';
    master.connect(clip);
    clip.connect(c.destination);
    const applyMaster = () => { if (master) master.gain.setTargetAtTime(getEffective('master:vol', useSessionStore.getState().masterVolume), c.currentTime, 0.015); };
    useSessionStore.subscribe((s, prev) => { if (s.masterVolume !== prev.masterVolume) applyMaster(); });
    onModTick(applyMaster); // modulation / automation of the master fader
    createMeterTap(c, clip, 'master');
  }
  return master;
}

interface Tap { l: AnalyserNode; r: AnalyserNode; buf: Float32Array<ArrayBuffer> }
const taps = new Map<string, Set<Tap>>();

/** Meters whatever flows out of `source`. Returns a function that removes the meter. */
export function createMeterTap(c: AudioContext, source: AudioNode, id: string): () => void {
  const splitter = c.createChannelSplitter(2);
  const l = c.createAnalyser();
  const r = c.createAnalyser();
  l.fftSize = r.fftSize = 1024;
  source.connect(splitter);
  splitter.connect(l, 0);
  splitter.connect(r, 1);
  const tap: Tap = { l, r, buf: new Float32Array(1024) as Float32Array<ArrayBuffer> };
  if (!taps.has(id)) taps.set(id, new Set());
  taps.get(id)!.add(tap);
  return () => {
    taps.get(id)?.delete(tap);
    try { source.disconnect(splitter); } catch { /* already gone */ }
    splitter.disconnect();
  };
}

const peakOf = (a: AnalyserNode, buf: Float32Array<ArrayBuffer>) => {
  a.getFloatTimeDomainData(buf);
  let p = 0;
  for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > p) p = v; }
  return p;
};

/** Current left/right peak of a track (or 'master'), 0..1+. A lane with audio and MIDI shows the louder of the two. */
export function readLevel(id: string): { l: number; r: number } {
  const set = taps.get(id);
  let l = 0, r = 0;
  if (set) for (const t of set) { l = Math.max(l, peakOf(t.l, t.buf)); r = Math.max(r, peakOf(t.r, t.buf)); }
  return { l, r };
}
