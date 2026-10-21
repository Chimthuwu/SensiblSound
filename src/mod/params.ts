import { useSessionStore } from '../stores/useSessionStore';
import { laneInfos } from '../utils/lanes';
import { DEFAULT_DRUMS, DEFAULT_SYNTH, DEFAULT_TRACK_VOLUME, type DrumParams, type SynthParams } from '../types';
import type { ParamRange } from './modCore';

// Every knob or slider that can be modulated or automated has a parameter id:
//   track:<lane>:vol | track:<lane>:pan | master:vol | synth:<lane>:<key> | drums:<lane>:<key>

export interface ParamDesc extends ParamRange {
  id: string;
  label: string;
  /** The value the user set (before any modulation). */
  get: () => number;
  set: (v: number) => void;
}

interface Spec { label: string; min: number; max: number; log?: boolean }

export const SYNTH_SPECS: Record<keyof SynthParams, Spec | null> = {
  wave: null, wave2: null, // choices, not numbers
  detune: { label: 'Detune', min: -50, max: 50 },
  mix2: { label: 'Osc 2', min: 0, max: 1 },
  fm: { label: 'FM', min: 0, max: 1 },
  fmRatio: { label: 'FM Ratio', min: 0.5, max: 8 },
  cutoff: { label: 'Cutoff', min: 80, max: 16000, log: true },
  resonance: { label: 'Reso', min: 0.1, max: 18 },
  filterEnv: { label: 'Filter Env', min: 0, max: 4 },
  attack: { label: 'Attack', min: 0.002, max: 2 },
  decay: { label: 'Decay', min: 0.02, max: 2 },
  sustain: { label: 'Sustain', min: 0, max: 1 },
  release: { label: 'Release', min: 0.02, max: 3 },
  volume: { label: 'Level', min: 0, max: 1 },
};

export const DRUM_SPECS: Record<keyof DrumParams, Spec> = {
  tune: { label: 'Tune', min: -12, max: 12 },
  decay: { label: 'Decay', min: 0.4, max: 2 },
  volume: { label: 'Level', min: 0, max: 1 },
};

const laneName = (id: string): string => {
  if (id === 'master') return 'Master';
  const s = useSessionStore.getState();
  return laneInfos(s).find((l) => l.id === id)?.name ?? 'Track';
};

/** Describes a parameter id: its label, range, and how to read and write the user's value. */
export function describeParam(id: string): ParamDesc | null {
  const [kind, lane, key] = id.split(':');
  const st = () => useSessionStore.getState();
  if (kind === 'master' && lane === 'vol') {
    return { id, label: 'Master Volume', min: 0, max: 1, get: () => st().masterVolume, set: (v) => st().setMasterVolume(v) };
  }
  if (kind === 'track' && key === 'vol') {
    return { id, label: `${laneName(lane)} Volume`, min: 0, max: 1, get: () => st().trackVolumes[lane] ?? DEFAULT_TRACK_VOLUME, set: (v) => st().setTrackVolume(lane, v) };
  }
  if (kind === 'track' && key === 'pan') {
    return { id, label: `${laneName(lane)} Pan`, min: -1, max: 1, get: () => st().trackPans[lane] ?? 0, set: (v) => st().setTrackPan(lane, v) };
  }
  if (kind === 'synth') {
    const spec = SYNTH_SPECS[key as keyof SynthParams];
    if (!spec) return null;
    return {
      id, label: `${laneName(lane)} ${spec.label}`, min: spec.min, max: spec.max, log: spec.log,
      get: () => (st().instruments[lane]?.synth ?? DEFAULT_SYNTH)[key as keyof SynthParams] as number,
      set: (v) => { const cur = st().instruments[lane]?.synth ?? DEFAULT_SYNTH; st().setInstrument(lane, { synth: { ...cur, [key]: v } }); },
    };
  }
  if (kind === 'drums') {
    const spec = DRUM_SPECS[key as keyof DrumParams];
    if (!spec) return null;
    return {
      id, label: `${laneName(lane)} ${spec.label}`, min: spec.min, max: spec.max,
      get: () => (st().instruments[lane]?.drums ?? DEFAULT_DRUMS)[key as keyof DrumParams],
      set: (v) => { const cur = st().instruments[lane]?.drums ?? DEFAULT_DRUMS; st().setInstrument(lane, { drums: { ...cur, [key]: v } }); },
    };
  }
  return null;
}
