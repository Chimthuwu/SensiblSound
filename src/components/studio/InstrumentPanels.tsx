import { Select } from './Select';
import { useSessionStore } from '../../stores/useSessionStore';
import { DEFAULT_DRUMS, DEFAULT_SYNTH, DRUM_PADS, SYNTH_PRESETS, type DrumParams, type SynthParams, type SynthWave } from '../../types';
import { previewNote } from '../../midi/midiEngine';
import { Knob } from './Knob';

const WAVES: SynthWave[] = ['sine', 'triangle', 'sawtooth', 'square'];
const WAVE_LABEL: Record<SynthWave, string> = { sine: 'Sine', triangle: 'Tri', sawtooth: 'Saw', square: 'Square' };

export function Unit(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  fmt?: (v: number) => string;
  onChange: (v: number) => void;
  paramId?: string;
}) {
  const { label, value, min, max, step, fmt, onChange, paramId } = props;
  return (
    <div className="studio-knob-unit">
      <Knob value={value} min={min} max={max} step={step} onChange={onChange} paramId={paramId} aria-label={label} />
      <span className="studio-knob-name">{label}</span>
      <span className="studio-knob-value">{fmt ? fmt(value) : Math.round(value * 100) / 100}</span>
    </div>
  );
}

function WaveSelect({ label, value, onChange }: { label: string; value: SynthWave; onChange: (w: SynthWave) => void }) {
  return (
    <div className="studio-mini-select">
      <Select value={value} onChange={(e) => onChange(e.target.value as SynthWave)} aria-label={label} title={label}>
        {WAVES.map((w) => (
          <option key={w} value={w}>
            {label} {WAVE_LABEL[w]}
          </option>
        ))}
      </Select>
      <span className="studio-caret">▾</span>
    </div>
  );
}

/** PsydeNote Lite: two oscillators, FM, filter and an amp envelope. A small cousin of the PsydeNote plug-in. */
export function SynthPanel({ laneId }: { laneId: string }) {
  const params = useSessionStore((s) => s.instruments[laneId]?.synth) ?? DEFAULT_SYNTH;
  const setInstrument = useSessionStore((s) => s.setInstrument);
  const set = (patch: Partial<SynthParams>) => setInstrument(laneId, { synth: { ...params, ...patch } });
  const secs = (v: number) => `${v.toFixed(2)}s`;
  return (
    <>
      <div className="studio-mini-selects">
        <div className="studio-mini-select">
          <Select
            value=""
            onChange={(e) => {
              const p = SYNTH_PRESETS[e.target.value];
              if (p) setInstrument(laneId, { synth: { ...p } });
            }}
            aria-label="Preset"
          >
            <option value="" disabled>
              Preset…
            </option>
            {Object.keys(SYNTH_PRESETS).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          <span className="studio-caret">▾</span>
        </div>
        <WaveSelect label="Osc 1" value={params.wave} onChange={(wave) => set({ wave })} />
        <WaveSelect label="Osc 2" value={params.wave2} onChange={(wave2) => set({ wave2 })} />
      </div>
      <div className="studio-knob-row">
        <Unit paramId={`synth:${laneId}:mix2`} label="Osc 2" value={params.mix2} min={0} max={1} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(mix2) => set({ mix2 })} />
        <Unit paramId={`synth:${laneId}:detune`} label="Detune" value={params.detune} min={-50} max={50} fmt={(v) => `${Math.round(v)}c`} onChange={(detune) => set({ detune })} />
        <Unit paramId={`synth:${laneId}:fm`} label="FM" value={params.fm} min={0} max={1} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(fm) => set({ fm })} />
        <Unit paramId={`synth:${laneId}:fmRatio`} label="Ratio" value={params.fmRatio} min={0.5} max={8} step={0.5} onChange={(fmRatio) => set({ fmRatio })} />
        <Unit paramId={`synth:${laneId}:cutoff`} label="Cutoff" value={Math.log2(params.cutoff)} min={Math.log2(80)} max={Math.log2(16000)} fmt={() => `${Math.round(params.cutoff)}Hz`} onChange={(v) => set({ cutoff: Math.round(Math.pow(2, v)) })} />
        <Unit paramId={`synth:${laneId}:resonance`} label="Reso" value={params.resonance} min={0.1} max={18} onChange={(resonance) => set({ resonance })} />
        <Unit paramId={`synth:${laneId}:filterEnv`} label="Env" value={params.filterEnv} min={0} max={4} fmt={(v) => `${v.toFixed(1)}oct`} onChange={(filterEnv) => set({ filterEnv })} />
        <Unit paramId={`synth:${laneId}:attack`} label="Atk" value={params.attack} min={0.002} max={2} fmt={secs} onChange={(attack) => set({ attack })} />
        <Unit paramId={`synth:${laneId}:decay`} label="Dec" value={params.decay} min={0.02} max={2} fmt={secs} onChange={(decay) => set({ decay })} />
        <Unit paramId={`synth:${laneId}:sustain`} label="Sust" value={params.sustain} min={0} max={1} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(sustain) => set({ sustain })} />
        <Unit paramId={`synth:${laneId}:release`} label="Rel" value={params.release} min={0.02} max={3} fmt={secs} onChange={(release) => set({ release })} />
        <Unit paramId={`synth:${laneId}:volume`} label="Level" value={params.volume} min={0} max={1} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(volume) => set({ volume })} />
      </div>
    </>
  );
}

/** Eight-pad synthesised drum machine. Click a pad to hear it; notes 36 to 43 play the pads. */
export function DrumPanel({ laneId }: { laneId: string }) {
  const params = useSessionStore((s) => s.instruments[laneId]?.drums) ?? DEFAULT_DRUMS;
  const setInstrument = useSessionStore((s) => s.setInstrument);
  const set = (patch: Partial<DrumParams>) => setInstrument(laneId, { drums: { ...params, ...patch } });
  return (
    <>
      <div className="studio-drum-pads">
        {DRUM_PADS.map((p) => (
          <button key={p.id} className="studio-mini-btn" type="button" onClick={() => previewNote(laneId, p.pitch, 0.9)} title={`${p.name} (note ${p.pitch})`}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="studio-knob-row">
        <Unit paramId={`drums:${laneId}:tune`} label="Tune" value={params.tune} min={-12} max={12} step={1} fmt={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}st`} onChange={(tune) => set({ tune })} />
        <Unit paramId={`drums:${laneId}:decay`} label="Decay" value={params.decay} min={0.4} max={2} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(decay) => set({ decay })} />
        <Unit paramId={`drums:${laneId}:volume`} label="Level" value={params.volume} min={0} max={1} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(volume) => set({ volume })} />
      </div>
    </>
  );
}
