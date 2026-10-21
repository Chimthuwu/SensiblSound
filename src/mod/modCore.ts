// Modulation maths: LFO and envelope values, parameter scaling, automation curves. Pure functions, so they can be tested without a browser.

export type LfoShape = 'sine' | 'triangle' | 'saw' | 'square' | 'random';
export const LFO_SHAPES: LfoShape[] = ['sine', 'triangle', 'saw', 'square', 'random'];

export interface LfoMod {
  id: string;
  kind: 'lfo';
  name: string;
  shape: LfoShape;
  /** Cycles per second, when not synced to the tempo. */
  rate: number;
  /** Lock the rate to the project tempo. */
  sync: boolean;
  /** Length of one cycle in beats when synced. */
  division: number;
}

export interface EnvMod {
  id: string;
  kind: 'adsr';
  name: string;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  /** What opens the envelope: playback running, or any note sounding. */
  gate: 'transport' | 'notes';
}

export type Modulator = LfoMod | EnvMod;

export interface ModMapping {
  id: string;
  modId: string;
  paramId: string;
  /** -1..1: how far, as a share of the parameter's range, the modulator pushes it. */
  amount: number;
}

export interface AutoPoint {
  /** Position on the timeline in beats. */
  beat: number;
  /** 0..1 across the parameter's range. */
  value: number;
}

export interface Automation {
  paramId: string;
  points: AutoPoint[];
}

export interface ParamRange {
  min: number;
  max: number;
  /** Frequency-like parameters move on a log scale. */
  log?: boolean;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const DIVISIONS: { name: string; beats: number }[] = [
  { name: '1/16', beats: 0.25 },
  { name: '1/8', beats: 0.5 },
  { name: '1/4', beats: 1 },
  { name: '1/2', beats: 2 },
  { name: '1 bar', beats: 4 },
  { name: '2 bars', beats: 8 },
  { name: '4 bars', beats: 16 },
];

function hash01(n: number): number {
  let h = Math.imul(Math.floor(n) ^ 0x9e3779b9, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** One LFO sample, -1..1. `phase` is the position in the cycle (0..1); `cycle` is the cycle number (for sample-and-hold). */
export function lfoValue(shape: LfoShape, phase: number, cycle = 0): number {
  const p = phase - Math.floor(phase);
  switch (shape) {
    case 'sine': return Math.sin(2 * Math.PI * p);
    case 'triangle': return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
    case 'saw': return 2 * p - 1;
    case 'square': return p < 0.5 ? 1 : -1;
    case 'random': return hash01(cycle) * 2 - 1;
  }
}

/** Where an LFO is, given the time: its phase and cycle number. */
export function lfoPhase(m: LfoMod, seconds: number, beat: number): { phase: number; cycle: number } {
  const cycles = m.sync ? beat / Math.max(0.01, m.division) : seconds * m.rate;
  return { phase: cycles - Math.floor(cycles), cycle: Math.floor(cycles) };
}

/**
 * ADSR level 0..1. `onAt` is when the gate opened and `offAt` when it closed (null while held), both in seconds.
 * Releasing starts from whatever level the envelope had reached.
 */
export function adsrValue(m: Pick<EnvMod, 'attack' | 'decay' | 'sustain' | 'release'>, onAt: number | null, offAt: number | null, now: number): number {
  if (onAt === null) return 0;
  const held = (t: number) => {
    const a = Math.max(0.001, m.attack);
    if (t < a) return t / a;
    const d = Math.max(0.001, m.decay);
    if (t < a + d) return 1 - (1 - m.sustain) * ((t - a) / d);
    return m.sustain;
  };
  if (offAt === null) return clamp01(held(now - onAt));
  const level = held(offAt - onAt);
  const r = Math.max(0.001, m.release);
  const t = now - offAt;
  return t >= r ? 0 : clamp01(level * (1 - t / r));
}

/** Parameter value -> 0..1 position across its range. */
export function toNorm(r: ParamRange, v: number): number {
  if (r.log) return clamp01((Math.log(Math.max(r.min, v)) - Math.log(r.min)) / (Math.log(r.max) - Math.log(r.min)));
  return clamp01((v - r.min) / (r.max - r.min));
}

/** 0..1 position -> parameter value. */
export function fromNorm(r: ParamRange, n: number): number {
  const x = clamp01(n);
  if (r.log) return Math.exp(Math.log(r.min) + x * (Math.log(r.max) - Math.log(r.min)));
  return r.min + x * (r.max - r.min);
}

/** The base value pushed by a set of modulator contributions (each already `amount * modulator value`). */
export function modulate(r: ParamRange, base: number, contributions: number[]): number {
  if (contributions.length === 0) return base;
  return fromNorm(r, toNorm(r, base) + contributions.reduce((a, b) => a + b, 0));
}

/** Automation value (0..1) at a beat: straight lines between points, flat before the first and after the last. */
export function automationAt(points: AutoPoint[], beat: number): number {
  if (points.length === 0) return 0;
  if (beat <= points[0].beat) return points[0].value;
  const last = points[points.length - 1];
  if (beat >= last.beat) return last.value;
  for (let i = 1; i < points.length; i++) {
    const b = points[i], a = points[i - 1];
    if (beat <= b.beat) {
      const span = b.beat - a.beat;
      return span <= 1e-9 ? b.value : a.value + ((beat - a.beat) / span) * (b.value - a.value);
    }
  }
  return last.value;
}
