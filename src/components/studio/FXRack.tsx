import { Select } from './Select';
import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSessionStore } from '../../stores/useSessionStore';
import { ALL_DEVICES, deviceStage, isInstrumentDevice, isNoteFxDevice, type DeviceId, type DeviceStage } from '../../types';
import { NoteFxPanel } from './NoteFxPanels';
import type { NoteFxType } from '../../midi/noteFx';
import { DrumPanel, SynthPanel } from './InstrumentPanels';
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
  synth: 'PsydeNote Lite',
  drums: 'Drum Machine',
  arp: 'Arpeggiator',
  chord: 'Chord',
  transpose: 'Transpose',
  noteFilter: 'Note Filter',
  echo: 'Note Echo',
  scale: 'Scale',
  randomize: 'Randomize',
};

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
      <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Select">
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
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
  synth: 'Instrument: a small PsydeNote with FM, two oscillators and a filter. Plays MIDI clips',
  drums: 'Instrument: eight synthesised drum pads. Plays MIDI clips',
  arp: 'Note FX: turns held notes into a stepped pattern',
  chord: 'Note FX: adds up to four notes above every note',
  transpose: 'Note FX: shifts notes by semitones and octaves',
  noteFilter: 'Note FX: lets through only notes in a key and velocity range',
  echo: 'Note FX: repeats notes, fading and shifting each repeat',
  scale: 'Note FX: snaps notes to a key and scale',
  randomize: 'Note FX: varies velocity, timing and pitch a little',
};

const STAGE_LABEL: Record<DeviceStage, string> = { midi: 'MIDI FX', instrument: 'Instrument', audio: 'Audio FX' };

/** Marks where each stage of the rack starts. The rack flows MIDI FX, then instrument, then audio FX. */
function StageLabel({ stage }: { stage: DeviceStage }) {
  return (
    <div className="studio-fx-stage" data-stage={stage} title="The rack flows MIDI FX, then instrument, then audio FX">
      <span>{STAGE_LABEL[stage]}</span>
    </div>
  );
}

export function FXRack() {
  const fxEnabled = useSessionStore((s) => s.fxEnabled);
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
  const devicePower = useSessionStore((s) => s.devicePower);
  const setDevicePower = useSessionStore((s) => s.setDevicePower);

  // Selection: click a device to select it (Ctrl/Shift-click adds), Ctrl+A selects the whole rack.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const rackRef = useRef<HTMLElement>(null);
  const rackActive = useRef(false);
  useEffect(() => setSelected(new Set()), [selectedTrackId]);
  const selectDevice = (e: React.MouseEvent, uid: string) => {
    if ((e.target as HTMLElement).closest('button, input, .studio-knob, [role="combobox"], .studio-fx-grip')) return;
    setSelected((prev) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        const next = new Set(prev);
        if (next.has(uid)) next.delete(uid); else next.add(uid);
        return next;
      }
      return new Set([uid]);
    });
  };
  const chainRef = useRef(chain);
  chainRef.current = chain;
  useEffect(() => {
    const doc = rackRef.current?.ownerDocument ?? document;
    const onDown = (e: PointerEvent) => { rackActive.current = !!rackRef.current?.contains(e.target as Node); };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && rackActive.current) {
        e.preventDefault();
        setSelected(new Set(chainRef.current.map((d) => d.uid)));
      } else if (e.key === 'Escape' && rackActive.current) setSelected(new Set());
    };
    doc.addEventListener('pointerdown', onDown, true);
    doc.addEventListener('keydown', onKey);
    return () => { doc.removeEventListener('pointerdown', onDown, true); doc.removeEventListener('keydown', onKey); };
  }, []);
  /** One device, or every selected device when this one is part of a multi-selection. */
  const togglePower = (uid: string) => {
    const targets = selected.has(uid) && selected.size > 1 ? [...selected] : [uid];
    setDevicePower(targets, devicePower[uid] === false);
  };

  const setEqBand = useSessionStore((s) => s.setEqBand);

  const grWidth = fxEnabled && fxSettings.compressorEnabled && fxSettings.compression > 0
    ? Math.min(40, Math.round((fxSettings.compression / 100) * 40))
    : 0;

  const renderDevice = (device: DeviceId, uid: string) => {
    if (isNoteFxDevice(device)) return <NoteFxPanel type={device as NoteFxType} uid={uid} />;
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

      case 'synth':
        return <SynthPanel laneId={selectedTrackId} />;

      case 'drums':
        return <DrumPanel laneId={selectedTrackId} />;

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

  return (
    <section
      ref={rackRef}
      className="studio-card"
      aria-label="Devices"
      onContextMenu={(e) => {
        // The chain strip has already claimed the event where it is; this covers the rest of the rack.
        if (e.defaultPrevented) return;
        openMenu(e, addDeviceItems());
      }}
    >
      <div
        ref={stripRef}
        className="studio-fx-grid"
        title="Click a device to select it. Ctrl+A selects all. A power button switches every selected device."
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
            const stage = deviceStage(device);
            const startsStage = index === 0 || deviceStage(chain[index - 1].type) !== stage;
            return (
            <Fragment key={instance.uid}>
            {startsStage && <StageLabel stage={stage} />}
            <div
              className="studio-fx-module"
              data-device-index={index}
              data-off={String(devicePower[instance.uid] === false)}
              data-selected={String(selected.has(instance.uid))}
              onClick={(e) => selectDevice(e, instance.uid)}
              data-stage={deviceStage(device)}
              data-instrument={String(isInstrumentDevice(device))}
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
                <button
                  className="studio-fx-power"
                  type="button"
                  data-on={String(devicePower[instance.uid] !== false)}
                  aria-pressed={devicePower[instance.uid] !== false}
                  aria-label={`Power ${DEVICE_NAMES[device]}`}
                  title={selected.has(instance.uid) && selected.size > 1 ? `Power: switches all ${selected.size} selected devices` : 'Power on / off'}
                  onClick={(e) => { e.stopPropagation(); togglePower(instance.uid); }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 3v8M6.3 6.8a8 8 0 1011.4 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                </button>
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
              {renderDevice(device, instance.uid)}
            </div>
            </Fragment>
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
