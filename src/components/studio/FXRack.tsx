import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSessionStore } from '../../stores/useSessionStore';
import { ALL_DEVICES, type DeviceId } from '../../types';
import { Knob } from './Knob';
import { useContextMenu, type MenuItem } from './ContextMenu';
import { ParametricEQ } from './ParametricEQ';

// All twelve keys — the audio graph maps the note name through a 12-entry
// table, so a short list silently made G# and A# unselectable.
const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// Must match the scales the FX graph actually implements (getScaleFrequencies).
const SCALES = ['Major', 'Minor', 'Chromatic'];

const DEVICE_NAMES: Record<DeviceId, string> = {
  autotune: 'Autotune',
  doubler: 'Doubler',
  compressor: 'Dynamics',
  eq: 'Parametric EQ',
  delay: 'Delay',
  reverb: 'Reverb',
};

// Short label on each device's on/off switch.
const DEVICE_SWITCH_LABEL: Record<DeviceId, string> = {
  autotune: 'Tune',
  doubler: 'Doub',
  compressor: 'Comp',
  eq: 'EQ',
  delay: 'Delay',
  reverb: 'Verb',
};

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

// One-line descriptions for the device browser.
const DEVICE_INFO: Record<DeviceId, string> = {
  autotune: 'Pitch correction and T-Pain style autotune',
  doubler: 'A second, offset copy for a wider vocal',
  compressor: 'Evens out peaks so the vocal sits steady',
  eq: 'Four-band parametric EQ',
  delay: 'Echo with feedback',
  reverb: 'Room tail behind the vocal',
};

function trackName(trackId: string): string {
  if (trackId === 'backing') return 'Backing Track';
  if (trackId === 'active_take') return 'Vocal Take';
  return 'Layer';
}

export function FXRack() {
  const fxEnabled = useSessionStore((s) => s.fxEnabled);
  const setFxEnabled = useSessionStore((s) => s.setFxEnabled);
  const fxSettings = useSessionStore((s) => s.fxSettings);
  const setFxSettings = useSessionStore((s) => s.setFxSettings);
  const selectedTrackId = useSessionStore((s) => s.selectedTrackId);
  const trackDevices = useSessionStore((s) => s.trackDevices);
  const addDevice = useSessionStore((s) => s.addDevice);
  const removeDevice = useSessionStore((s) => s.removeDevice);
  // Device browser: opened from the add slot at the end of the chain.
  const [browserAnchor, setBrowserAnchor] = useState<{ left: number; bottom: number } | null>(null);
  const addSlotRef = useRef<HTMLButtonElement>(null);
  const browserRef = useRef<HTMLDivElement>(null);
  const reorderDevice = useSessionStore((s) => s.reorderDevice);
  const openMenu = useContextMenu();
  const addDeviceItems = (): MenuItem[] =>
    ALL_DEVICES.map((d) => ({ label: `Add ${DEVICE_NAMES[d]}`, onSelect: () => addDevice(selectedTrackId, d) }));
  const stripRef = useRef<HTMLDivElement>(null);
  const [reorder, setReorder] = useState<{ from: number; over: number } | null>(null);

  // Close the device browser on an outside click or Escape.
  useEffect(() => {
    if (!browserAnchor) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (browserRef.current?.contains(t) || addSlotRef.current?.contains(t)) return;
      setBrowserAnchor(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBrowserAnchor(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [browserAnchor]);

  const chain = trackDevices[selectedTrackId] ?? [];

  const setEqBand = useSessionStore((s) => s.setEqBand);

  const grWidth = fxEnabled && fxSettings.compressorEnabled && fxSettings.compression > 0
    ? Math.min(40, Math.round((fxSettings.compression / 100) * 40))
    : 0;

  const renderDevice = (device: DeviceId) => {
    switch (device) {
      case 'autotune':
        return (
          <>
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
            </div>
          </>
        );

      case 'doubler':
        return (
          <div className="studio-knob-row">
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
        );

      case 'compressor':
        return (
          <>
            <div className="studio-knob-row">
              <div className="studio-knob-unit">
                <Knob
                  value={fxSettings.compression}
                  min={-60}
                  max={0}
                  step={1}
                  unit=" dB"
                  onChange={(v) => setFxSettings({ compression: v })}
                  aria-label="Thresh"
                />
                <span className="studio-knob-name">Thresh</span>
                <span className="studio-knob-value">{Math.round(fxSettings.compression)} dB</span>
              </div>
            </div>
            <div className="studio-gr-meter">
              <span className="studio-gr-label">Gain Reduction</span>
              <div className="studio-gr-bar">
                <span data-meter-fill style={{ width: `${grWidth}%` }} />
              </div>
            </div>
          </>
        );

      case 'eq':
        return (
          <ParametricEQ
            bands={fxSettings.eqBands}
            enabled={fxEnabled && fxSettings.eqEnabled}
            onChange={setEqBand}
          />
        );

      case 'delay':
        return (
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
          </div>
        );

      case 'reverb':
        return (
          <div className="studio-knob-row">
            <div className="studio-knob-unit">
              <Knob
                value={fxSettings.reverbDecay}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => setFxSettings({ reverbDecay: v })}
                aria-label="Space"
              />
              <span className="studio-knob-name">Space</span>
              <span className="studio-knob-value">{fxSettings.reverbDecay}%</span>
            </div>
            <div className="studio-knob-unit">
              <Knob
                value={fxSettings.reverbWet}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => setFxSettings({ reverbWet: v })}
                aria-label="Reverb Mix"
              />
              <span className="studio-knob-name">Verb Mix</span>
              <span className="studio-knob-value">{fxSettings.reverbWet}%</span>
            </div>
          </div>
        );
    }
  };

  const flagFor: Record<DeviceId, boolean> = {
    autotune: fxSettings.autotuneEnabled,
    doubler: fxSettings.doubleEnabled,
    compressor: fxSettings.compressorEnabled,
    eq: fxSettings.eqEnabled,
    delay: fxSettings.delayEnabled,
    reverb: fxSettings.reverbEnabled,
  };
  const setFlag = (device: DeviceId, on: boolean) => {
    const key = {
      autotune: 'autotuneEnabled',
      doubler: 'doubleEnabled',
      compressor: 'compressorEnabled',
      eq: 'eqEnabled',
      delay: 'delayEnabled',
      reverb: 'reverbEnabled',
    } as const;
    setFxSettings({ [key[device]]: on });
  };

  return (
    <section
      className="studio-card"
      aria-label="Devices"
      onContextMenu={(e) => {
        // The chain strip has already claimed the event where it is; this covers the rest of the rack.
        if (e.defaultPrevented) return;
        openMenu(e, addDeviceItems());
      }}
    >
      <div className="studio-card-head">
        <span className="studio-card-head-ic" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 3v6M6 15v6M12 3v9M12 18v3M18 3v3M18 12v9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            <circle cx="6" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.9" />
            <circle cx="12" cy="15" r="2.2" stroke="currentColor" strokeWidth="1.9" />
            <circle cx="18" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.9" />
          </svg>
        </span>
        <h2 className="studio-card-head-title">Devices</h2>
        <span className="studio-tag">{trackName(selectedTrackId)}</span>
        <div className="studio-head-spacer" />
        <Switch checked={fxEnabled} onChange={setFxEnabled} label="Enable Effects" />
      </div>

      <div
        ref={stripRef}
        className="studio-fx-grid"
        data-disabled={String(!fxEnabled)}
        onContextMenu={(e) => openMenu(e, addDeviceItems())}
      >
          {chain.map((instance, index) => {
            const device = instance.type;
            // Numbers copies of the same device: "Delay", "Delay 2", ...
            const copyNumber = chain.slice(0, index + 1).filter((d) => d.type === device).length;
            const copyCount = chain.filter((d) => d.type === device).length;
            // Where a dragged device would land, shown as a bar on the module.
            const dropBefore = reorder !== null && reorder.over === index && reorder.from !== index;
            const dropAfter =
              reorder !== null && reorder.over === chain.length && index === chain.length - 1;
            return (
            <div
              key={instance.uid}
              className="studio-fx-module"
              data-device-index={index}
              data-off={String(!flagFor[device])}
              onContextMenu={(e) => {
                e.stopPropagation();
                openMenu(e, [
                  { label: 'Duplicate', onSelect: () => addDevice(selectedTrackId, device) },
                  { label: 'Remove', danger: true, onSelect: () => removeDevice(selectedTrackId, instance.uid) },
                  { kind: 'separator' },
                  ...addDeviceItems(),
                ]);
              }}
              data-dragging={String(reorder?.from === index)}
              data-drop={dropBefore ? 'before' : dropAfter ? 'after' : undefined}
            >
              <div className="studio-fx-head">
                <span
                  className="studio-fx-grip"
                  title="Drag to reorder"
                  aria-label={`Drag to reorder ${DEVICE_NAMES[device]}`}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setReorder({ from: index, over: index });
                  }}
                  onPointerMove={(e) => {
                    if (!reorder || !stripRef.current) return;
                    // Insertion point = how many module centres sit left of the pointer.
                    const mods = Array.from(stripRef.current.querySelectorAll<HTMLElement>('[data-device-index]'));
                    const over = mods.filter((m) => {
                      const r = m.getBoundingClientRect();
                      return e.clientX > r.left + r.width / 2;
                    }).length;
                    if (over !== reorder.over) setReorder({ ...reorder, over });
                  }}
                  onPointerUp={() => {
                    if (!reorder) return;
                    // Removing the dragged device first shifts later positions left by one.
                    const to = reorder.over > reorder.from ? reorder.over - 1 : reorder.over;
                    reorderDevice(selectedTrackId, reorder.from, to);
                    setReorder(null);
                  }}
                  onPointerCancel={() => setReorder(null)}
                >
                  ⋮⋮
                </span>
                <span className="studio-fx-head-dot" />
                <span className="studio-fx-head-name">
                  {DEVICE_NAMES[device]}
                  {copyCount > 1 ? ` ${copyNumber}` : ''}
                </span>
                <Switch
                  compact
                  checked={flagFor[device]}
                  onChange={(v) => setFlag(device, v)}
                  label={DEVICE_SWITCH_LABEL[device]}
                />
                <button
                  className="studio-mini-btn"
                  type="button"
                  onClick={() => removeDevice(selectedTrackId, instance.uid)}
                  aria-label={`Remove ${DEVICE_NAMES[device]}`}
                  title="Remove device"
                >
                  ×
                </button>
              </div>
              {renderDevice(device)}
            </div>
            );
          })}

        {chain.length === 0 && (
          <div className="studio-fx-empty-chain">No devices on this track yet.</div>
        )}
        <div className="studio-fx-add-slot">
          <button
            ref={addSlotRef}
            className="studio-fx-add-btn"
            type="button"
            aria-expanded={browserAnchor !== null}
            onClick={() => {
              if (browserAnchor) {
                setBrowserAnchor(null);
                return;
              }
              const r = addSlotRef.current?.getBoundingClientRect();
              if (r) setBrowserAnchor({ left: r.left, bottom: window.innerHeight - r.top + 8 });
            }}
          >
            <span aria-hidden="true">+</span> Add device
          </button>
        </div>
        </div>

      {browserAnchor && createPortal(
        <div
          ref={browserRef}
          className="studio-device-browser"
          role="dialog"
          aria-label="Device browser"
          style={{ left: browserAnchor.left, bottom: browserAnchor.bottom }}
        >
          <div className="studio-device-browser-head">
            Device browser <span>click to add, as many as you like</span>
          </div>
          {ALL_DEVICES.map((d) => (
            <button
              key={d}
              className="studio-device-item"
              type="button"
              onClick={() => addDevice(selectedTrackId, d)}
            >
              {DEVICE_NAMES[d]}
              <span>{DEVICE_INFO[d]}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </section>
  );
}
