import { useCallback, useMemo } from 'react';
import { useSessionStore } from '../../stores/useSessionStore';
import { Knob } from './Knob';
import { ParametricEQ, type EQBand } from './ParametricEQ';

// All twelve keys — the audio graph maps the note name through a 12-entry
// table, so a short list silently made G# and A# unselectable.
const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// Must match the scales the FX graph actually implements (getScaleFrequencies).
const SCALES = ['Major', 'Minor', 'Chromatic'];

function Switch({
  checked,
  onChange,
  label,
  compact,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  compact?: boolean;
}) {
  return (
    <label className="studio-switch-label">
      <span>{label}</span>
      <span
        className={`studio-switch${compact ? ' studio-switch--sm' : ''}`}
        data-on={String(checked)}
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onChange(!checked);
          }
        }}
      />
    </label>
  );
}

function MiniSelect({
  value,
  onChange,
  options,
  caret,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  caret?: boolean;
}) {
  return (
    <div className="studio-mini-select">
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Select">
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {caret !== false && <span className="studio-caret">▾</span>}
    </div>
  );
}

export function FXRack() {
  const fxEnabled = useSessionStore((s) => s.fxEnabled);
  const setFxEnabled = useSessionStore((s) => s.setFxEnabled);
  const fxSettings = useSessionStore((s) => s.fxSettings);
  const setFxSettings = useSessionStore((s) => s.setFxSettings);

  const eqBands: EQBand[] = useMemo(
    () => [
      { x: 0.14, g: fxSettings.eqLow / 12 },
      { x: 0.45, g: fxSettings.eqMid / 12 },
      { x: 0.72, g: fxSettings.eqHigh / 12 },
    ],
    [fxSettings.eqLow, fxSettings.eqMid, fxSettings.eqHigh],
  );

  const setEQ = useCallback(
    (bands: EQBand[]) => {
      if (bands.length < 3) return;
      setFxSettings({
        eqLow: Math.max(-12, Math.min(12, bands[0].g * 12)),
        eqMid: Math.max(-12, Math.min(12, bands[1].g * 12)),
        eqHigh: Math.max(-12, Math.min(12, bands[2].g * 12)),
      });
    },
    [setFxSettings],
  );

  const grWidth = fxEnabled && fxSettings.compressorEnabled && fxSettings.compression > 0
    ? Math.min(40, Math.round((fxSettings.compression / 100) * 40))
    : 0;

  return (
    <section className="studio-card" aria-label="Vocal FX Rack">
      <div className="studio-card-head">
        <span className="studio-card-head-ic" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 3v6M6 15v6M12 3v9M12 18v3M18 3v3M18 12v9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            <circle cx="6" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.9" />
            <circle cx="12" cy="15" r="2.2" stroke="currentColor" strokeWidth="1.9" />
            <circle cx="18" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.9" />
          </svg>
        </span>
        <h2 className="studio-card-head-title">Vocal FX Rack</h2>
        <span className="studio-tag">Sensimilliea</span>
        <div className="studio-head-spacer" />
        <Switch
          checked={fxEnabled}
          onChange={setFxEnabled}
          label="Enable Effects"
        />
      </div>

      <div className="studio-fx-grid" data-disabled={String(!fxEnabled)}>
        {/* T-Pain & Doubler */}
        <div
          className="studio-fx-module"
          data-off={String(!fxSettings.autotuneEnabled && !fxSettings.doubleEnabled)}
        >
          <div className="studio-fx-head">
            <span className="studio-fx-head-dot" />
            <span className="studio-fx-head-name">T-Pain &amp; Doubler</span>
            <Switch
              compact
              checked={fxSettings.autotuneEnabled}
              onChange={(v) => setFxSettings({ autotuneEnabled: v })}
              label="Tune"
            />
            <Switch
              compact
              checked={fxSettings.doubleEnabled}
              onChange={(v) => setFxSettings({ doubleEnabled: v })}
              label="Doub"
            />
          </div>
          <div className="studio-mini-selects">
            <MiniSelect
              value={fxSettings.autotuneKey}
              onChange={(k) => setFxSettings({ autotuneKey: k })}
              options={KEYS}
            />
            <MiniSelect
              value={fxSettings.autotuneScale}
              onChange={(s) => setFxSettings({ autotuneScale: s })}
              options={SCALES}
            />
          </div>
          <div className="studio-knob-row">
            <div className="studio-knob-unit">
              <Knob
                value={fxSettings.autotuneSpeed}
                min={0}
                max={100}
                unit="ms"
                onChange={(v) => setFxSettings({ autotuneSpeed: v })}
                aria-label="Return"
              />
              <span className="studio-knob-name">Return</span>
              <span className="studio-knob-value">{fxSettings.autotuneSpeed} ms</span>
            </div>
            <div className="studio-knob-unit">
              <Knob
                value={fxSettings.pitchShiftSemitones}
                min={-12}
                max={12}
                step={1}
                onChange={(v) => setFxSettings({ pitchShiftSemitones: v })}
                aria-label="Pitch"
              />
              <span className="studio-knob-name">Pitch</span>
              <span className="studio-knob-value">{fxSettings.pitchShiftSemitones} st</span>
            </div>
            <div className="studio-knob-unit">
              <Knob
                value={fxSettings.formantShift}
                min={-12}
                max={12}
                step={1}
                onChange={(v) => setFxSettings({ formantShift: v })}
                aria-label="Formant"
              />
              <span className="studio-knob-name">Formant</span>
              <span className="studio-knob-value">{fxSettings.formantShift} st</span>
            </div>
            <div className="studio-knob-unit">
              <Knob
                value={fxSettings.doubleWidth}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => setFxSettings({ doubleWidth: v })}
                aria-label="Width"
              />
              <span className="studio-knob-name">Width</span>
              <span className="studio-knob-value">{fxSettings.doubleWidth}%</span>
            </div>
          </div>
        </div>

        {/* Dynamics */}
        <div className="studio-fx-module" data-off={String(!fxSettings.compressorEnabled)}>
          <div className="studio-fx-head">
            <span className="studio-fx-head-dot" />
            <span className="studio-fx-head-name">Dynamics</span>
            <Switch
              compact
              checked={fxSettings.compressorEnabled}
              onChange={(v) => setFxSettings({ compressorEnabled: v })}
              label="Comp"
            />
          </div>
          <div className="studio-knob-row">
            <div className="studio-knob-unit">
              <Knob
                value={fxSettings.compression}
                min={-60}
                max={0}
                unit=" dB"
                onChange={(v) => setFxSettings({ compression: v })}
                aria-label="Thresh"
              />
              <span className="studio-knob-name">Thresh</span>
              <span className="studio-knob-value">{fxSettings.compression} dB</span>
            </div>
            <div className="studio-knob-unit">
              <Knob
                value={3}
                min={1}
                max={20}
                step={1}
                unit=":1"
                onChange={() => {
                  /* Ratio is a static mockup control for this skin pass;
                     the existing recorder FX graph does not currently expose a
                     runtime compressor ratio from fxSettings. */
                }}
                aria-label="Ratio"
              />
              <span className="studio-knob-name">Ratio</span>
              <span className="studio-knob-value">3:1</span>
            </div>
          </div>
          <div className="studio-gr-meter">
            <span className="studio-gr-label">Gain Reduction</span>
            <div className="studio-gr-bar">
              <span data-meter-fill style={{ width: `${grWidth}%` }} />
            </div>
          </div>
        </div>

        {/* Parametric EQ */}
        <div className="studio-fx-module" data-off={String(!fxSettings.eqEnabled)}>
          <div className="studio-fx-head">
            <span className="studio-fx-head-dot" />
            <span className="studio-fx-head-name">Parametric EQ</span>
            <Switch
              compact
              checked={fxSettings.eqEnabled}
              onChange={(v) => setFxSettings({ eqEnabled: v })}
              label="EQ"
            />
          </div>
          <ParametricEQ
            bands={eqBands}
            enabled={fxEnabled && fxSettings.eqEnabled}
            onChange={setEQ}
          />
        </div>

        {/* Space & Echo */}
        <div
          className="studio-fx-module"
          data-off={String(!fxSettings.delayEnabled && !fxSettings.reverbEnabled)}
        >
          <div className="studio-fx-head">
            <span className="studio-fx-head-dot" />
            <span className="studio-fx-head-name">Space &amp; Echo</span>
            <Switch
              compact
              checked={fxSettings.delayEnabled}
              onChange={(v) => setFxSettings({ delayEnabled: v })}
              label="Delay"
            />
            <Switch
              compact
              checked={fxSettings.reverbEnabled}
              onChange={(v) => setFxSettings({ reverbEnabled: v })}
              label="Verb"
            />
          </div>
          <div className="studio-knob-row">
            <div className="studio-knob-unit">
              <Knob
                value={fxSettings.delayFeedback}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => setFxSettings({ delayFeedback: v })}
                aria-label="Feedback"
              />
              <span className="studio-knob-name">Feedback</span>
              <span className="studio-knob-value">{fxSettings.delayFeedback}%</span>
            </div>
            <div className="studio-knob-unit">
              <Knob
                value={fxSettings.delayTime}
                min={0}
                max={1}
                step={0.01}
                unit="s"
                formatValue={(v) => v.toFixed(2)}
                onChange={(v) => setFxSettings({ delayTime: v })}
                aria-label="Delay"
              />
              <span className="studio-knob-name">Delay</span>
              <span className="studio-knob-value">{fxSettings.delayTime.toFixed(2)} s</span>
            </div>
            <div className="studio-knob-unit">
              <Knob
                value={fxSettings.reverbWet}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => setFxSettings({ reverbWet: v })}
                aria-label="Reverb"
              />
              <span className="studio-knob-name">Reverb</span>
              <span className="studio-knob-value">{fxSettings.reverbWet}%</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
