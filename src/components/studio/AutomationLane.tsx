import { useRef } from 'react';
import { useSessionStore } from '../../stores/useSessionStore';
import { automationAt, fromNorm, toNorm, type AutoPoint } from '../../mod/modCore';
import { describeParam, type ParamDesc } from '../../mod/params';
import { useContextMenu } from './ContextMenu';
import { paramColor } from '../../utils/sliderFill';

/** Which track an automated parameter belongs to ('master' for the master fader). */
export function automationLaneOf(paramId: string): string {
  const [kind, lane] = paramId.split(':');
  return kind === 'master' ? 'master' : lane;
}

/** Readable value for a parameter: L/R for pan, dB for volume, Hz for cutoff. */
function fmt(desc: ParamDesc, v: number): string {
  if (desc.id.endsWith(':pan')) return Math.abs(v) < 0.02 ? 'C' : v < 0 ? `${Math.round(-v * 100)}L` : `${Math.round(v * 100)}R`;
  if (desc.id.endsWith(':vol')) {
    const db = v <= 0.0001 ? -Infinity : 20 * Math.log10(v);
    return db === -Infinity ? '-inf dB' : `${db.toFixed(1)} dB`;
  }
  if (desc.id.endsWith(':cutoff')) return `${Math.round(v)} Hz`;
  if (desc.id.includes(':tune')) return `${v > 0 ? '+' : ''}${Math.round(v)} st`;
  return Math.abs(v) >= 100 ? String(Math.round(v)) : v.toFixed(2);
}

/** A parameter is bipolar when zero sits inside its range (pan, tune, detune): its lane gets a centre line. */
export const isBipolar = (d: { min: number; max: number }) => d.min < 0 && d.max > 0;

/** Left-hand header of an automation lane: what it automates, current value, hide and remove. */
export function AutomationHead({ paramId, height }: { paramId: string; height: number }) {
  const points = useSessionStore((s) => s.automation.find((a) => a.paramId === paramId)?.points);
  const bpm = useSessionStore((s) => s.bpm);
  const transport = useSessionStore((s) => s.transportTimeMs);
  const setHidden = useSessionStore((s) => s.setAutomationHidden);
  const remove = useSessionStore((s) => s.removeAutomation);
  const desc = describeParam(paramId);
  if (!desc || !points) return null;
  const value = fromNorm(desc, automationAt(points, transport / (60_000 / bpm)));
  return (
    <div className="studio-auto-head" style={{ height, ...({ '--auto-color': paramColor(paramId) } as React.CSSProperties) }} data-bipolar={String(isBipolar(desc))}>
      <div className="studio-auto-head-top">
        <span className="studio-auto-tag" aria-hidden="true">A</span>
        <span className="studio-auto-title" title={desc.label}>{desc.label}</span>
        <button type="button" className="studio-mini-btn" onClick={() => setHidden(paramId, true)} title="Hide this automation lane (the A button on the track brings it back)" aria-label={`Hide automation for ${desc.label}`}>Hide</button>
      </div>
      <div className="studio-auto-head-bottom">
        <span className="studio-auto-value">{fmt(desc, value)}</span>
        <button type="button" className="studio-mini-btn" onClick={() => remove(paramId)} title="Delete this automation" aria-label={`Delete automation for ${desc.label}`}>Delete</button>
      </div>
    </div>
  );
}

/**
 * The breakpoint editor of one automation lane, drawn under its track on the arrangement's own time scale.
 * Click to add a point, drag to move it, double-click to delete it. Bipolar parameters get a zero line in the
 * middle, the curve fills outward from it, and points snap to it.
 */
export function AutomationLane({ paramId, points, pxPerBeat, width, height }: { paramId: string; points: AutoPoint[]; pxPerBeat: number; width: number; height: number }) {
  const setPoints = useSessionStore((s) => s.setAutomationPoints);
  const setHidden = useSessionStore((s) => s.setAutomationHidden);
  const remove = useSessionStore((s) => s.removeAutomation);
  const bpm = useSessionStore((s) => s.bpm);
  const transport = useSessionStore((s) => s.transportTimeMs);
  const openMenu = useContextMenu();
  const dragging = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const desc = describeParam(paramId);
  if (!desc) return null;

  const bipolar = isBipolar(desc);
  const zero = bipolar ? toNorm(desc, 0) : 0;
  const PAD = 8;
  const x = (beat: number) => beat * pxPerBeat;
  const y = (v: number) => (1 - v) * (height - 2 * PAD) + PAD;
  const baseY = y(bipolar ? zero : 0);

  const at = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    const beat = Math.max(0, Math.round((e.clientX - r.left) / pxPerBeat * 4) / 4);
    let value = Math.min(1, Math.max(0, 1 - (e.clientY - r.top - PAD) / (height - 2 * PAD)));
    if (bipolar && Math.abs(value - zero) < 0.04) value = zero; // snap to the centre
    return { beat, value };
  };
  const near = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return points.findIndex((p) => Math.abs(x(p.beat) - (e.clientX - r.left)) < 8 && Math.abs(y(p.value) - (e.clientY - r.top)) < 10);
  };

  const line = [`0,${y(points[0]?.value ?? 0)}`, ...points.map((p) => `${x(p.beat)},${y(p.value)}`), `${width},${y(points[points.length - 1]?.value ?? 0)}`];
  const fill = `${line.join(' ')} ${width},${baseY} 0,${baseY}`;
  const playBeat = transport / (60_000 / bpm);

  return (
    <div
      className="studio-lane studio-auto-lane"
      style={{ height, ...({ '--auto-color': paramColor(paramId) } as React.CSSProperties) }}
      data-bipolar={String(bipolar)}
      onContextMenu={(e) => {
        e.stopPropagation();
        openMenu(e, [
          { label: desc.label, disabled: true, onSelect: () => {} },
          { kind: 'separator' },
          { label: bipolar ? 'Flatten to centre' : 'Flatten', onSelect: () => setPoints(paramId, points.map((p) => ({ ...p, value: bipolar ? zero : p.value }))) },
          { label: 'Hide lane', onSelect: () => setHidden(paramId, true) },
          { label: 'Delete automation', danger: true, onSelect: () => remove(paramId) },
        ]);
      }}
    >
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="auto-svg auto-svg-lane"
        onPointerDown={(e) => {
          e.stopPropagation(); // not a time selection
          if (e.button !== 0) return;
          const hit = near(e);
          e.currentTarget.setPointerCapture(e.pointerId);
          if (hit >= 0) { dragging.current = hit; return; }
          const { beat, value } = at(e);
          const next = [...points, { beat, value }].sort((a, b) => a.beat - b.beat);
          dragging.current = next.findIndex((p) => p.beat === beat && p.value === value);
          setPoints(paramId, next);
        }}
        onPointerMove={(e) => {
          if (dragging.current === null) return;
          const { beat, value } = at(e);
          const next = points.map((p, i) => (i === dragging.current ? { beat, value } : p));
          setPoints(paramId, next);
          dragging.current = [...next].sort((a, b) => a.beat - b.beat).findIndex((p) => p.beat === beat && p.value === value);
        }}
        onPointerUp={() => { dragging.current = null; }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          const hit = near(e);
          if (hit >= 0 && points.length > 1) setPoints(paramId, points.filter((_, i) => i !== hit));
        }}
      >
        {bipolar && <line className="auto-zero" x1={0} x2={width} y1={y(zero)} y2={y(zero)} />}
        <polygon className="auto-fill" points={fill} />
        <polyline className="auto-line" fill="none" points={line.join(' ')} />
        {points.map((p, i) => <circle key={i} className="auto-pt" cx={x(p.beat)} cy={y(p.value)} r={5} />)}
        <line className="auto-play" x1={x(playBeat)} x2={x(playBeat)} y1={0} y2={height} />
      </svg>
      <span className="auto-edge" data-pos="top">{fmt(desc, desc.max)}</span>
      {bipolar && <span className="auto-edge" data-pos="mid" style={{ top: y(zero) - 7 }}>0</span>}
      <span className="auto-edge" data-pos="bottom">{fmt(desc, desc.min)}</span>
    </div>
  );
}
