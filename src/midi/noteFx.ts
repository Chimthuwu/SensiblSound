// Note FX: devices that sit in front of an instrument and change the notes it receives (Bitwig-style note effects).
// Pure functions on note lists, so they can be tested without a browser. Time is in beats.

export type NoteFxType = 'arp' | 'chord' | 'transpose' | 'noteFilter' | 'echo' | 'scale' | 'randomize';

export const NOTE_FX_TYPES: NoteFxType[] = ['arp', 'chord', 'transpose', 'noteFilter', 'echo', 'scale', 'randomize'];
export const isNoteFx = (t: string): t is NoteFxType => (NOTE_FX_TYPES as string[]).includes(t);

export type FxParams = Record<string, number>;

/** Defaults for every note effect. `on` is 1 when the device is active. */
export const NOTE_FX_DEFAULTS: Record<NoteFxType, FxParams> = {
  // rate: step in beats as an index into RATES; mode: 0 up, 1 down, 2 up-down, 3 random, 4 as played
  arp: { on: 1, rate: 2, mode: 0, octaves: 1, gate: 0.8 },
  // up to four extra notes above the played one, in semitones (0 = unused)
  chord: { on: 1, i1: 4, i2: 7, i3: 0, i4: 0 },
  transpose: { on: 1, semitones: 0, octaves: 0 },
  // keep only notes inside the key and velocity range
  noteFilter: { on: 1, lowKey: 0, highKey: 127, lowVel: 0, highVel: 100, invert: 0 },
  // repeats: how many echoes; delay in beats; feedback: velocity kept per repeat (0..1); shift: semitones per repeat
  echo: { on: 1, repeats: 3, delay: 0.5, feedback: 0.65, shift: 0 },
  // snap pitches to a scale: key 0..11 (C..B), scale index into SCALES
  scale: { on: 1, key: 0, scale: 0 },
  // probabilistic variation: amounts 0..1
  randomize: { on: 1, velocity: 0.3, timing: 0.1, pitch: 0, pitchRange: 2 },
};

/** Arpeggiator step lengths in beats: 1/4, 1/8, 1/8T... as an indexed table the UI shows by name. */
export const ARP_RATES: { name: string; beats: number }[] = [
  { name: '1/4', beats: 1 },
  { name: '1/8', beats: 0.5 },
  { name: '1/16', beats: 0.25 },
  { name: '1/32', beats: 0.125 },
  { name: '1/8T', beats: 1 / 3 },
  { name: '1/16T', beats: 1 / 6 },
];
export const ARP_MODES = ['Up', 'Down', 'Up-Down', 'Random', 'As played'];

export const SCALES: { name: string; steps: number[] }[] = [
  { name: 'Major', steps: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'Minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'Pentatonic Major', steps: [0, 2, 4, 7, 9] },
  { name: 'Pentatonic Minor', steps: [0, 3, 5, 7, 10] },
  { name: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
  { name: 'Harmonic Minor', steps: [0, 2, 3, 5, 7, 8, 11] },
];

export interface FxNote {
  /** Stable id of the source note, so effects that use randomness stay repeatable. */
  id: string;
  pitch: number;
  startBeat: number;
  lenBeats: number;
  vel: number;
}

export interface FxDevice {
  type: NoteFxType;
  params: FxParams;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clampPitch = (p: number) => clamp(Math.round(p), 0, 127);

/** Small deterministic generator: the same note and device always give the same "random" numbers. */
function seeded(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function snapToScale(pitch: number, key: number, steps: number[]): number {
  const rel = ((pitch - key) % 12 + 12) % 12;
  let best = steps[0], dist = 99;
  for (const s of steps) {
    for (const cand of [s, s + 12, s - 12]) {
      const d = Math.abs(cand - rel);
      if (d < dist || (d === dist && cand < best)) { dist = d; best = cand; }
    }
  }
  return pitch - rel + best;
}

function arpeggiate(notes: FxNote[], p: FxParams): FxNote[] {
  if (notes.length === 0) return [];
  const step = ARP_RATES[clamp(Math.round(p.rate), 0, ARP_RATES.length - 1)].beats;
  const octaves = clamp(Math.round(p.octaves), 1, 4);
  const mode = Math.round(p.mode);
  const gate = clamp(p.gate, 0.05, 1);
  const out: FxNote[] = [];

  // Notes that overlap in time form one held chord; each chord is arpeggiated over its own length.
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);
  const groups: FxNote[][] = [];
  for (const n of sorted) {
    const g = groups[groups.length - 1];
    const gEnd = g ? Math.max(...g.map((x) => x.startBeat + x.lenBeats)) : -1;
    if (g && n.startBeat < gEnd - 1e-6) g.push(n); else groups.push([n]);
  }

  for (const g of groups) {
    const t0 = Math.min(...g.map((x) => x.startBeat));
    const t1 = Math.max(...g.map((x) => x.startBeat + x.lenBeats));
    let counter = 0;
    let pingDir = 1, pingIdx = 0;
    const rng = seeded(g[0].id + ':arp');
    // Steps sit on the global grid, so arps line up with the beat however the chord was played.
    for (let t = Math.ceil((t0 - 1e-6) / step) * step; t < t1 - 1e-6; t += step, counter++) {
      const held = g.filter((x) => x.startBeat <= t + 1e-6 && x.startBeat + x.lenBeats > t + 1e-6);
      if (held.length === 0) continue;
      let pool: { pitch: number; vel: number }[] = (mode === 4 ? [...held] : [...held].sort((a, b) => a.pitch - b.pitch)).map((x) => ({ pitch: x.pitch, vel: x.vel }));
      const base = pool;
      pool = [];
      for (let o = 0; o < octaves; o++) for (const b of base) pool.push({ pitch: b.pitch + 12 * o, vel: b.vel });
      let pick: { pitch: number; vel: number };
      if (mode === 0 || mode === 4) pick = pool[counter % pool.length];
      else if (mode === 1) pick = pool[pool.length - 1 - (counter % pool.length)];
      else if (mode === 2) {
        pick = pool[clamp(pingIdx, 0, pool.length - 1)];
        if (pool.length > 1) { pingIdx += pingDir; if (pingIdx >= pool.length - 1) pingDir = -1; if (pingIdx <= 0) pingDir = 1; }
      } else pick = pool[Math.floor(rng() * pool.length)];
      out.push({ id: `${g[0].id}:a${counter}`, pitch: clampPitch(pick.pitch), startBeat: t, lenBeats: Math.max(0.03, step * gate), vel: pick.vel });
    }
  }
  return out;
}

/** The note an arpeggiator plays on step number `counter` for the notes currently held (live playing). */
export function arpPick(held: { pitch: number; vel: number }[], counter: number, p: FxParams): { pitch: number; vel: number } | null {
  if (held.length === 0) return null;
  const octaves = clamp(Math.round(p.octaves), 1, 4);
  const mode = Math.round(p.mode);
  const base = mode === 4 ? [...held] : [...held].sort((a, b) => a.pitch - b.pitch);
  const pool: { pitch: number; vel: number }[] = [];
  for (let o = 0; o < octaves; o++) for (const b of base) pool.push({ pitch: b.pitch + 12 * o, vel: b.vel });
  const n = pool.length;
  let i: number;
  if (mode === 1) i = n - 1 - (counter % n);
  else if (mode === 2) { const period = Math.max(1, 2 * (n - 1)); const c = counter % period; i = c < n ? c : period - c; }
  else if (mode === 3) i = Math.floor(seeded('live:' + counter)() * n);
  else i = counter % n;
  const pick = pool[clamp(i, 0, n - 1)];
  return { pitch: clampPitch(pick.pitch), vel: pick.vel };
}

/** Runs one note effect over a list of notes. */
export function applyNoteFx(notes: FxNote[], dev: FxDevice): FxNote[] {
  const p = dev.params;
  if (p.on === 0) return notes;
  switch (dev.type) {
    case 'arp':
      return arpeggiate(notes, p);
    case 'chord': {
      const out: FxNote[] = [];
      for (const n of notes) {
        out.push(n);
        [p.i1, p.i2, p.i3, p.i4].forEach((iv, k) => {
          if (iv) out.push({ ...n, id: `${n.id}:c${k}`, pitch: clampPitch(n.pitch + iv) });
        });
      }
      return out;
    }
    case 'transpose': {
      const shift = Math.round(p.semitones) + 12 * Math.round(p.octaves);
      return shift === 0 ? notes : notes.map((n) => ({ ...n, pitch: clampPitch(n.pitch + shift) }));
    }
    case 'noteFilter': {
      const lowVel = p.lowVel / 100, highVel = p.highVel / 100;
      return notes.filter((n) => {
        const inside = n.pitch >= p.lowKey && n.pitch <= p.highKey && n.vel >= lowVel - 1e-6 && n.vel <= highVel + 1e-6;
        return p.invert ? !inside : inside;
      });
    }
    case 'echo': {
      const out: FxNote[] = [...notes];
      const repeats = clamp(Math.round(p.repeats), 0, 16);
      for (const n of notes) {
        for (let r = 1; r <= repeats; r++) {
          const vel = n.vel * Math.pow(clamp(p.feedback, 0, 1), r);
          if (vel < 0.04) break;
          out.push({ ...n, id: `${n.id}:e${r}`, startBeat: n.startBeat + r * p.delay, vel, pitch: clampPitch(n.pitch + Math.round(p.shift) * r) });
        }
      }
      return out;
    }
    case 'scale': {
      const steps = SCALES[clamp(Math.round(p.scale), 0, SCALES.length - 1)].steps;
      return notes.map((n) => ({ ...n, pitch: clampPitch(snapToScale(n.pitch, Math.round(p.key), steps)) }));
    }
    case 'randomize':
      return notes.map((n) => {
        const r = seeded(n.id + ':rnd');
        const vel = clamp(n.vel + (r() * 2 - 1) * p.velocity * 0.5, 0.05, 1);
        const startBeat = Math.max(0, n.startBeat + (r() * 2 - 1) * p.timing * 0.25);
        const pitch = p.pitch > 0 && r() < p.pitch ? clampPitch(n.pitch + Math.round((r() * 2 - 1) * p.pitchRange)) : n.pitch;
        return { ...n, vel, startBeat, pitch };
      });
  }
}

/** Runs a whole chain, first device first. */
export function applyNoteFxChain(notes: FxNote[], chain: FxDevice[]): FxNote[] {
  return chain.reduce((acc, dev) => applyNoteFx(acc, dev), notes);
}
