import { Select } from './Select';
import { useEffect, useMemo, useRef } from 'react';
import { useSessionStore } from '../../stores/useSessionStore';
import { adsrValue, DIVISIONS, LFO_SHAPES, lfoPhase, lfoValue, type AutoPoint, type EnvMod, type LfoMod, type LfoShape, type Modulator } from '../../mod/modCore';
import { describeParam } from '../../mod/params';
import { modLevel } from '../../mod/modEngine';
import { Unit } from './InstrumentPanels';

const SHAPE_NAME: Record<LfoShape, string> = { sine: 'Sine', triangle: 'Triangle', saw: 'Saw', square: 'Square', random: 'Random' };

/** Draws one LFO cycle or an ADSR curve on a canvas, with a dot that follows the live output. */
function Scope({ mod }: { mod: Modulator }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const modRef = useRef(mod);
  modRef.current = mod;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext('2d');
    if (!g) return;
    let raf = 0;
    const W = cv.width, H = cv.height, pad = 6;
    const draw = () => {
      const m = modRef.current;
      g.clearRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
      g.strokeStyle = '#c084fc';
      g.lineWidth = 2;
      g.beginPath();
      const st = useSessionStore.getState();
      let dotX = 0, dotY = H / 2;
      if (m.kind === 'lfo') {
        for (let x = 0; x <= W; x++) {
          const y = H / 2 - lfoValue(m.shape, x / W, 1) * (H / 2 - pad);
          if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        const { phase } = lfoPhase(m, performance.now() / 1000, st.transportTimeMs / (60_000 / st.bpm));
        dotX = phase * W;
        dotY = H / 2 - modLevel(m.id) * (H / 2 - pad);
      } else {
        // attack, decay, a short sustain stretch, release: drawn to scale of their own total length
        const total = m.attack + m.decay + 0.5 + m.release;
        const sample = (x: number) => {
          const t = (x / W) * total;
          const holdEnd = m.attack + m.decay + 0.5;
          return t < holdEnd ? adsrValue(m, 0, null, t) : adsrValue(m, 0, holdEnd, t);
        };
        for (let x = 0; x <= W; x++) {
          const y = H - pad - sample(x) * (H - 2 * pad);
          if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        const lv = modLevel(m.id);
        dotX = W - 8;
        dotY = H - pad - lv * (H - 2 * pad);
        g.stroke();
        g.fillStyle = 'rgba(251,191,36,0.25)';
        g.fillRect(W - 14, dotY, 12, H - pad - dotY);
      }
      g.stroke();
      g.fillStyle = '#fbbf24';
      g.beginPath(); g.arc(dotX, dotY, 4, 0, Math.PI * 2); g.fill();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="mod-scope" width={190} height={64} aria-label={`${mod.name} output`} />;
}

function MappingRows({ modId }: { modId: string }) {
  const allMaps = useSessionStore((s) => s.modMappings);
  const maps = useMemo(() => allMaps.filter((m) => m.modId === modId), [allMaps, modId]);
  const setMapping = useSessionStore((s) => s.setMapping);
  const removeMapping = useSessionStore((s) => s.removeMapping);
  if (maps.length === 0) return <div className="mod-hint">Right-click a knob or slider to map this to it.</div>;
  return (
    <div className="mod-maps">
      {maps.map((m) => (
        <div key={m.id} className="mod-map">
          <span className="mod-map-name" title={describeParam(m.paramId)?.label}>{describeParam(m.paramId)?.label ?? m.paramId}</span>
          <input
            type="range" min={-100} max={100} value={Math.round(m.amount * 100)}
            onChange={(e) => setMapping(m.modId, m.paramId, Number(e.target.value) / 100)}
            onDoubleClick={() => setMapping(m.modId, m.paramId, 0.5)}
            aria-label={`Amount for ${describeParam(m.paramId)?.label ?? 'parameter'}`}
            title="How much it pushes the parameter (negative inverts)"
          />
          <output>{Math.round(m.amount * 100)}%</output>
          <button type="button" className="mod-x" onClick={() => removeMapping(m.id)} aria-label="Remove mapping" title="Remove">×</button>
        </div>
      ))}
    </div>
  );
}

function ModCard({ mod }: { mod: Modulator }) {
  const update = useSessionStore((s) => s.updateModulator);
  const remove = useSessionStore((s) => s.removeModulator);
  return (
    <div className="mod-card" data-kind={mod.kind}>
      <div className="mod-card-head">
        <input className="mod-name" value={mod.name} onChange={(e) => update(mod.id, { name: e.target.value })} aria-label="Modulator name" />
        <button type="button" className="mod-x" onClick={() => remove(mod.id)} aria-label={`Delete ${mod.name}`} title="Delete (also removes its mappings)">×</button>
      </div>
      <Scope mod={mod} />
      {mod.kind === 'lfo' ? <LfoControls m={mod} /> : <EnvControls m={mod} />}
      <MappingRows modId={mod.id} />
    </div>
  );
}

function LfoControls({ m }: { m: LfoMod }) {
  const update = useSessionStore((s) => s.updateModulator);
  return (
    <>
      <div className="mod-shapes" role="group" aria-label="Shape">
        {LFO_SHAPES.map((sh) => (
          <button key={sh} type="button" className="mod-shape" data-on={String(m.shape === sh)} onClick={() => update(m.id, { shape: sh })} title={SHAPE_NAME[sh]} aria-label={SHAPE_NAME[sh]}>
            <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
              <polyline fill="none" stroke="currentColor" strokeWidth="1.6" points={Array.from({ length: 23 }, (_, i) => `${i},${7 - lfoValue(sh, i / 22, 3) * 5.5}`).join(' ')} />
            </svg>
          </button>
        ))}
      </div>
      <div className="mod-row">
        {m.sync ? (
          <div className="studio-mini-select">
            <Select value={m.division} onChange={(e) => update(m.id, { division: Number(e.target.value) })} aria-label="Cycle length">
              {DIVISIONS.map((d) => <option key={d.name} value={d.beats}>{d.name}</option>)}
            </Select>
            <span className="studio-caret">▾</span>
          </div>
        ) : (
          <Unit label="Rate" value={Math.log2(m.rate)} min={Math.log2(0.05)} max={Math.log2(20)} fmt={() => `${m.rate.toFixed(2)}Hz`} onChange={(v) => update(m.id, { rate: Math.round(Math.pow(2, v) * 100) / 100 })} />
        )}
        <button type="button" className="studio-mini-btn" data-on={String(m.sync)} onClick={() => update(m.id, { sync: !m.sync })} title="Lock the speed to the project tempo">
          {m.sync ? 'Synced' : 'Free'}
        </button>
      </div>
    </>
  );
}

function EnvControls({ m }: { m: EnvMod }) {
  const update = useSessionStore((s) => s.updateModulator);
  const secs = (v: number) => `${v.toFixed(2)}s`;
  return (
    <>
      <div className="mod-row mod-knobs">
        <Unit label="Atk" value={m.attack} min={0.005} max={4} fmt={secs} onChange={(attack) => update(m.id, { attack })} />
        <Unit label="Dec" value={m.decay} min={0.005} max={4} fmt={secs} onChange={(decay) => update(m.id, { decay })} />
        <Unit label="Sust" value={m.sustain} min={0} max={1} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(sustain) => update(m.id, { sustain })} />
        <Unit label="Rel" value={m.release} min={0.005} max={6} fmt={secs} onChange={(release) => update(m.id, { release })} />
      </div>
      <div className="mod-row">
        <div className="studio-mini-select">
          <Select value={m.gate} onChange={(e) => update(m.id, { gate: e.target.value as EnvMod['gate'] })} aria-label="Gate">
            <option value="transport">Gate: playback</option>
            <option value="notes">Gate: notes</option>
          </Select>
          <span className="studio-caret">▾</span>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ automation
const BAR_PX = 56;
const ROW_H = 84;

function AutomationRow({ paramId, points }: { paramId: string; points: AutoPoint[] }) {
  const setPoints = useSessionStore((s) => s.setAutomationPoints);
  const remove = useSessionStore((s) => s.removeAutomation);
  const bpm = useSessionStore((s) => s.bpm);
  const transport = useSessionStore((s) => s.transportTimeMs);
  const dragging = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const desc = describeParam(paramId);
  const lastBeat = points.length ? points[points.length - 1].beat : 0;
  const bars = Math.max(8, Math.ceil(lastBeat / 4) + 2);
  const W = bars * BAR_PX;
  const beatPx = BAR_PX / 4;
  const x = (beat: number) => beat * beatPx;
  const y = (v: number) => (1 - v) * (ROW_H - 12) + 6;

  const at = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const beat = Math.max(0, Math.round((e.clientX - r.left) / beatPx * 4) / 4);
    const value = Math.min(1, Math.max(0, 1 - (e.clientY - r.top - 6) / (ROW_H - 12)));
    return { beat, value };
  };

  const label = desc?.label ?? paramId;
  const playBeat = transport / (60_000 / bpm);
  return (
    <div className="auto-row">
      <div className="auto-head">
        <span className="auto-name" title={label}>{label}</span>
        <button type="button" className="studio-mini-btn" onClick={() => setPoints(paramId, [{ beat: 0, value: points[0]?.value ?? 0.5 }, { beat: 16, value: points[0]?.value ?? 0.5 }])} title="Flatten the curve">Flatten</button>
        <button type="button" className="studio-mini-btn" onClick={() => remove(paramId)}>Remove</button>
        <span className="mod-hint">Click to add a point · drag to move · double-click a point to delete</span>
      </div>
      <div className="auto-scroll">
        <svg
          ref={svgRef} width={W} height={ROW_H} className="auto-svg"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const { beat, value } = at(e);
            const hit = points.findIndex((p) => Math.abs(x(p.beat) - (e.clientX - svgRef.current!.getBoundingClientRect().left)) < 7 && Math.abs(y(p.value) - (e.clientY - svgRef.current!.getBoundingClientRect().top)) < 9);
            e.currentTarget.setPointerCapture(e.pointerId);
            if (hit >= 0) { dragging.current = hit; return; }
            const next = [...points, { beat, value }].sort((a, b) => a.beat - b.beat);
            dragging.current = next.findIndex((p) => p.beat === beat && p.value === value);
            setPoints(paramId, next);
          }}
          onPointerMove={(e) => {
            if (dragging.current === null) return;
            const { beat, value } = at(e);
            const next = points.map((p, i) => (i === dragging.current ? { beat, value } : p));
            setPoints(paramId, next);
            // keep following the same point after the list re-sorts
            dragging.current = [...next].sort((a, b) => a.beat - b.beat).findIndex((p) => p.beat === beat && p.value === value);
          }}
          onPointerUp={() => { dragging.current = null; }}
          onDoubleClick={(e) => {
            const r = svgRef.current!.getBoundingClientRect();
            const hit = points.findIndex((p) => Math.abs(x(p.beat) - (e.clientX - r.left)) < 8 && Math.abs(y(p.value) - (e.clientY - r.top)) < 10);
            if (hit >= 0 && points.length > 1) setPoints(paramId, points.filter((_, i) => i !== hit));
          }}
        >
          {Array.from({ length: bars + 1 }).map((_, b) => <line key={b} x1={b * BAR_PX} x2={b * BAR_PX} y1={0} y2={ROW_H} className="auto-grid" data-bar="true" />)}
          {Array.from({ length: bars * 4 }).map((_, i) => <line key={`q${i}`} x1={i * beatPx} x2={i * beatPx} y1={0} y2={ROW_H} className="auto-grid" />)}
          <polyline className="auto-line" fill="none" points={[`0,${y(points[0]?.value ?? 0)}`, ...points.map((p) => `${x(p.beat)},${y(p.value)}`), `${W},${y(points[points.length - 1]?.value ?? 0)}`].join(' ')} />
          {points.map((p, i) => <circle key={i} className="auto-pt" cx={x(p.beat)} cy={y(p.value)} r={5} />)}
          <line className="auto-play" x1={x(playBeat)} x2={x(playBeat)} y1={0} y2={ROW_H} />
        </svg>
      </div>
    </div>
  );
}

/** The global modulator section: it drops down from the top bar. Modulators are small LFOs and envelopes that
 *  can be mapped to any knob or slider (right-click it); automation curves play along the timeline. */
export function ModDrawer() {
  const open = useSessionStore((s) => s.modDrawerOpen);
  const setOpen = useSessionStore((s) => s.setModDrawerOpen);
  const tab = useSessionStore((s) => s.modTab);
  const setTab = useSessionStore((s) => s.setModTab);
  const modulators = useSessionStore((s) => s.modulators);
  const automation = useSessionStore((s) => s.automation);
  const add = useSessionStore((s) => s.addModulator);

  return (
    <section className="mod-drawer" data-open={String(open)} aria-label="Modulators" aria-hidden={!open}>
      <div className="mod-drawer-inner">
        <div className="mod-tabs">
          <button type="button" data-on={String(tab === 'mods')} onClick={() => setTab('mods')}>Modulators <span>{modulators.length}</span></button>
          <button type="button" data-on={String(tab === 'auto')} onClick={() => setTab('auto')}>Automation <span>{automation.length}</span></button>
          <div className="studio-head-spacer" />
          {tab === 'mods' && (
            <>
              <button type="button" className="studio-mini-btn" onClick={() => add('lfo')}>+ LFO</button>
              <button type="button" className="studio-mini-btn" onClick={() => add('adsr')}>+ Envelope</button>
            </>
          )}
          <button type="button" className="studio-mini-btn" onClick={() => setOpen(false)} aria-label="Close modulators" title="Close">▲</button>
        </div>
        {tab === 'mods' ? (
          <div className="mod-cards">
            {modulators.length === 0 && <div className="mod-empty">No modulators yet. Add an LFO or an envelope, then right-click any knob or slider to map it.</div>}
            {modulators.map((m) => <ModCard key={m.id} mod={m} />)}
          </div>
        ) : (
          <div className="auto-list">
            {automation.length === 0 && <div className="mod-empty">Nothing automated. Right-click a knob or slider and choose Automate.</div>}
            {automation.map((a) => <AutomationRow key={a.paramId} paramId={a.paramId} points={a.points} />)}
          </div>
        )}
      </div>
    </section>
  );
}
