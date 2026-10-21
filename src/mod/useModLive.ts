import { useEffect, useState } from 'react';
import { useSessionStore } from '../stores/useSessionStore';
import { getEffective, isModulated, onModTick } from './modEngine';
import { toNorm } from './modCore';
import { describeParam } from './params';

/** Whether a parameter has any modulator mapped to it or an automation curve. Re-evaluates when those change. */
export function useIsDriven(paramId?: string): boolean {
  return useSessionStore((s) => !!paramId && (s.automation.some((a) => a.paramId === paramId) || s.modMappings.some((m) => m.paramId === paramId)));
}

/** The live, modulated position (0..1 across the range) of a driven parameter, or null when nothing is driving it. */
export function useModLive(paramId?: string): number | null {
  const [pos, setPos] = useState<number | null>(null);
  useEffect(() => {
    if (!paramId) return;
    return onModTick(() => {
      if (!isModulated(paramId)) { setPos((p) => (p === null ? p : null)); return; }
      const d = describeParam(paramId);
      if (!d) return;
      const n = toNorm(d, getEffective(paramId, d.get()));
      setPos((p) => (p !== null && Math.abs(p - n) < 0.004 ? p : n));
    });
  }, [paramId]);
  return pos;
}
