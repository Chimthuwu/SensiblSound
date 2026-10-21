import { useSessionStore } from '../stores/useSessionStore';
import { adsrValue, automationAt, fromNorm, lfoPhase, lfoValue, modulate, type Modulator } from './modCore';
import { describeParam } from './params';

// Runs the modulators, mappings and automation about 30 times a second and keeps the resulting
// "effective" value of every modulated parameter. Audio code asks getEffective(id, base) for the value to use.

const effective = new Map<string, number>();
const modLevels = new Map<string, number>();
const listeners = new Set<() => void>();

/** The value a parameter should have right now: modulated/automated if it is, else the base. */
export function getEffective(paramId: string, base: number): number {
  const v = effective.get(paramId);
  return v === undefined ? base : v;
}
export const isModulated = (paramId: string) => effective.has(paramId);
/** Current output of a modulator: -1..1 for an LFO, 0..1 for an envelope. */
export const modLevel = (modId: string) => modLevels.get(modId) ?? 0;
/** Called after every update, so meters and knobs can follow along. */
export function onModTick(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ---- gates for envelopes that follow the notes
let sounding = 0;
export const modNoteOn = () => { sounding++; };
export const modNoteOff = () => { sounding = Math.max(0, sounding - 1); };
/** A note that starts in `delayMs` and lasts `lenMs` (scheduled playback). */
export function modNotePulse(delayMs: number, lenMs: number) {
  window.setTimeout(modNoteOn, Math.max(0, delayMs));
  window.setTimeout(modNoteOff, Math.max(0, delayMs) + Math.max(20, lenMs));
}

interface EnvState { onAt: number | null; offAt: number | null; open: boolean }
const envStates = new Map<string, EnvState>();

function tick() {
  const s = useSessionStore.getState();
  if (s.modulators.length === 0 && s.automation.length === 0) {
    if (effective.size) { effective.clear(); modLevels.clear(); for (const l of listeners) l(); }
    return;
  }
  const now = performance.now() / 1000;
  const msPerBeat = 60_000 / s.bpm;
  const beat = s.transportTimeMs / msPerBeat;

  // 1. each modulator's output
  const levels = new Map<string, number>();
  for (const m of s.modulators) levels.set(m.id, level(m, now, beat, s.isPlaying));
  modLevels.clear();
  for (const [k, v] of levels) modLevels.set(k, v);

  // 2. automation sets the base; modulators push on top
  const next = new Map<string, number>();
  const contributions = new Map<string, number[]>();
  for (const map of s.modMappings) {
    const v = levels.get(map.modId);
    if (v === undefined) continue;
    (contributions.get(map.paramId) ?? contributions.set(map.paramId, []).get(map.paramId)!).push(map.amount * v);
  }
  const ids = new Set<string>([...contributions.keys(), ...s.automation.map((a) => a.paramId)]);
  for (const id of ids) {
    const desc = describeParam(id);
    if (!desc) continue;
    const auto = s.automation.find((a) => a.paramId === id);
    const base = auto ? fromNorm(desc, automationAt(auto.points, beat)) : desc.get();
    next.set(id, modulate(desc, base, contributions.get(id) ?? []));
  }
  effective.clear();
  for (const [k, v] of next) effective.set(k, v);
  for (const l of listeners) l();
}

function level(m: Modulator, now: number, beat: number, playing: boolean): number {
  if (m.kind === 'lfo') {
    const { phase, cycle } = lfoPhase(m, now, beat);
    return lfoValue(m.shape, phase, cycle);
  }
  const open = m.gate === 'transport' ? playing : sounding > 0;
  const st = envStates.get(m.id) ?? { onAt: null, offAt: null, open: false };
  if (open && !st.open) { st.onAt = now; st.offAt = null; }
  else if (!open && st.open) st.offAt = now;
  st.open = open;
  envStates.set(m.id, st);
  return adsrValue(m, st.onAt, st.offAt, now);
}

/** Starts the modulation clock. Returns a function that stops it. */
export function startModEngine(): () => void {
  const timer = window.setInterval(tick, 33);
  return () => { window.clearInterval(timer); effective.clear(); modLevels.clear(); };
}

// Debug handles, like the game project: lets tests and the console inspect the modulation state.
if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__sensi = { store: useSessionStore, getEffective, isModulated, modLevel };
