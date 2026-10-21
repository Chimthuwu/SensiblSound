import { useSessionStore } from '../../stores/useSessionStore';
import { ARP_MODES, ARP_RATES, NOTE_FX_DEFAULTS, SCALES, type FxParams, type NoteFxType } from '../../midi/noteFx';
import { Unit } from './InstrumentPanels';

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (p: number) => `${KEYS[p % 12]}${Math.floor(p / 12) - 1}`;
const st = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}st`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

function Pick({ label, value, options, onChange }: { label: string; value: number; options: string[]; onChange: (i: number) => void }) {
  return (
    <div className="studio-mini-select">
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} title={label}>
        {options.map((o, i) => (
          <option key={o} value={i}>
            {label}: {o}
          </option>
        ))}
      </select>
      <span className="studio-caret">▾</span>
    </div>
  );
}

/** Settings panel for one note effect. Each device instance keeps its own settings. */
export function NoteFxPanel({ type, uid }: { type: NoteFxType; uid: string }) {
  const stored = useSessionStore((s) => s.midiFxParams[uid]);
  const setParam = useSessionStore((s) => s.setMidiFxParam);
  const p: FxParams = { ...NOTE_FX_DEFAULTS[type], ...(stored ?? {}) };
  const set = (patch: FxParams) => setParam(uid, patch);

  switch (type) {
    case 'arp':
      return (
        <>
          <div className="studio-mini-selects">
            <Pick label="Rate" value={p.rate} options={ARP_RATES.map((r) => r.name)} onChange={(rate) => set({ rate })} />
            <Pick label="Mode" value={p.mode} options={ARP_MODES} onChange={(mode) => set({ mode })} />
          </div>
          <div className="studio-knob-row">
            <Unit label="Octaves" value={p.octaves} min={1} max={4} step={1} fmt={(v) => String(Math.round(v))} onChange={(octaves) => set({ octaves })} />
            <Unit label="Gate" value={p.gate} min={0.1} max={1} fmt={pct} onChange={(gate) => set({ gate })} />
          </div>
        </>
      );
    case 'chord':
      return (
        <div className="studio-knob-row">
          {(['i1', 'i2', 'i3', 'i4'] as const).map((k, i) => (
            <Unit key={k} label={`Note ${i + 2}`} value={p[k]} min={-24} max={24} step={1} fmt={(v) => (v === 0 ? 'off' : st(v))} onChange={(v) => set({ [k]: Math.round(v) })} />
          ))}
        </div>
      );
    case 'transpose':
      return (
        <div className="studio-knob-row">
          <Unit label="Semitones" value={p.semitones} min={-24} max={24} step={1} fmt={st} onChange={(semitones) => set({ semitones: Math.round(semitones) })} />
          <Unit label="Octaves" value={p.octaves} min={-3} max={3} step={1} fmt={(v) => (v > 0 ? '+' : '') + Math.round(v)} onChange={(octaves) => set({ octaves: Math.round(octaves) })} />
        </div>
      );
    case 'noteFilter':
      return (
        <>
          <div className="studio-mini-selects">
            <Pick label="Mode" value={p.invert} options={['Keep inside', 'Drop inside']} onChange={(invert) => set({ invert })} />
          </div>
          <div className="studio-knob-row">
            <Unit label="Low key" value={p.lowKey} min={0} max={127} step={1} fmt={(v) => noteName(Math.round(v))} onChange={(v) => set({ lowKey: Math.min(Math.round(v), p.highKey) })} />
            <Unit label="High key" value={p.highKey} min={0} max={127} step={1} fmt={(v) => noteName(Math.round(v))} onChange={(v) => set({ highKey: Math.max(Math.round(v), p.lowKey) })} />
            <Unit label="Low vel" value={p.lowVel} min={0} max={100} step={1} fmt={(v) => `${Math.round(v)}`} onChange={(v) => set({ lowVel: Math.min(Math.round(v), p.highVel) })} />
            <Unit label="High vel" value={p.highVel} min={0} max={100} step={1} fmt={(v) => `${Math.round(v)}`} onChange={(v) => set({ highVel: Math.max(Math.round(v), p.lowVel) })} />
          </div>
        </>
      );
    case 'echo':
      return (
        <div className="studio-knob-row">
          <Unit label="Repeats" value={p.repeats} min={0} max={16} step={1} fmt={(v) => String(Math.round(v))} onChange={(repeats) => set({ repeats: Math.round(repeats) })} />
          <Unit label="Delay" value={p.delay} min={0.125} max={2} fmt={(v) => `${v.toFixed(2)} beat`} onChange={(delay) => set({ delay: Math.round(delay * 8) / 8 })} />
          <Unit label="Feedback" value={p.feedback} min={0} max={1} fmt={pct} onChange={(feedback) => set({ feedback })} />
          <Unit label="Shift" value={p.shift} min={-12} max={12} step={1} fmt={st} onChange={(shift) => set({ shift: Math.round(shift) })} />
        </div>
      );
    case 'scale':
      return (
        <div className="studio-mini-selects">
          <Pick label="Key" value={p.key} options={KEYS} onChange={(key) => set({ key })} />
          <Pick label="Scale" value={p.scale} options={SCALES.map((s) => s.name)} onChange={(scale) => set({ scale })} />
        </div>
      );
    case 'randomize':
      return (
        <div className="studio-knob-row">
          <Unit label="Velocity" value={p.velocity} min={0} max={1} fmt={pct} onChange={(velocity) => set({ velocity })} />
          <Unit label="Timing" value={p.timing} min={0} max={1} fmt={pct} onChange={(timing) => set({ timing })} />
          <Unit label="Pitch" value={p.pitch} min={0} max={1} fmt={pct} onChange={(pitch) => set({ pitch })} />
          <Unit label="Range" value={p.pitchRange} min={1} max={12} step={1} fmt={st} onChange={(pitchRange) => set({ pitchRange: Math.round(pitchRange) })} />
        </div>
      );
  }
}
