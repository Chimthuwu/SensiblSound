import { useCallback, useEffect, useRef, useState } from 'react';
import type { EqBand } from '../../types';

// Web Audio runs at the device rate; 48 kHz is the common case and the curve
// only shifts a fraction of a dB at the top of the range if it differs.
const SAMPLE_RATE = 48000;
const F_MIN = 20;
const F_MAX = 20000;
const DB_RANGE = 12;
const PAD = 8;
const HIT_RADIUS = 16;
const BAND_NAMES = ['Low', 'Low mid', 'High mid', 'High'];
const BAND_COLORS = ['#3b82f6', '#a855f7', '#ec4899', '#f59e0b'];

const LOG_MIN = Math.log10(F_MIN);
const LOG_RANGE = Math.log10(F_MAX) - LOG_MIN;

const xFromFreq = (f: number, w: number) => ((Math.log10(f) - LOG_MIN) / LOG_RANGE) * w;
const freqFromX = (x: number, w: number) => 10 ** (LOG_MIN + (x / w) * LOG_RANGE);
const yFromDb = (db: number, h: number) => h / 2 - (db / DB_RANGE) * (h / 2 - PAD);
const dbFromY = (y: number, h: number) => ((h / 2 - y) / (h / 2 - PAD)) * DB_RANGE;

/**
 * Magnitude response of one band at frequency f, in dB. These are the RBJ
 * "Audio EQ Cookbook" biquads that Web Audio's BiquadFilterNode uses, so the
 * drawn curve is the curve the audio graph produces. Shelves use slope S = 1,
 * which is what Web Audio does (it ignores Q for shelves).
 */
export function bandDbAt(band: EqBand, f: number): number {
  const A = 10 ** (band.gain / 40);
  const w0 = (2 * Math.PI * band.freq) / SAMPLE_RATE;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;

  if (band.type === 'peak') {
    const alpha = sin / (2 * band.q);
    b0 = 1 + alpha * A;
    b1 = -2 * cos;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cos;
    a2 = 1 - alpha / A;
  } else {
    const alpha = (sin / 2) * Math.SQRT2;
    const sq = 2 * Math.sqrt(A) * alpha;
    if (band.type === 'lowshelf') {
      b0 = A * (A + 1 - (A - 1) * cos + sq);
      b1 = 2 * A * (A - 1 - (A + 1) * cos);
      b2 = A * (A + 1 - (A - 1) * cos - sq);
      a0 = A + 1 + (A - 1) * cos + sq;
      a1 = -2 * (A - 1 + (A + 1) * cos);
      a2 = A + 1 + (A - 1) * cos - sq;
    } else {
      b0 = A * (A + 1 + (A - 1) * cos + sq);
      b1 = -2 * A * (A - 1 + (A + 1) * cos);
      b2 = A * (A + 1 + (A - 1) * cos - sq);
      a0 = A + 1 - (A - 1) * cos + sq;
      a1 = 2 * (A - 1 - (A + 1) * cos);
      a2 = A + 1 - (A - 1) * cos - sq;
    }
  }

  // H(e^jw) = (b0 + b1 e^-jw + b2 e^-2jw) / (a0 + a1 e^-jw + a2 e^-2jw)
  const w = (2 * Math.PI * f) / SAMPLE_RATE;
  const c1 = Math.cos(w);
  const s1 = Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = Math.sin(2 * w);
  const nr = b0 + b1 * c1 + b2 * c2;
  const ni = -(b1 * s1 + b2 * s2);
  const dr = a0 + a1 * c1 + a2 * c2;
  const di = -(a1 * s1 + a2 * s2);
  return 20 * Math.log10(Math.hypot(nr, ni) / Math.hypot(dr, di));
}

function formatFreq(f: number): string {
  return f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)} kHz` : `${Math.round(f)} Hz`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface ParametricEQProps {
  bands: EqBand[];
  enabled: boolean;
  onChange: (bandId: string, patch: Partial<Omit<EqBand, 'id'>>) => void;
}

export function ParametricEQ({ bands, enabled, onChange }: ParametricEQProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!canvas || !rect || rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Grid: decades for frequency, 6 dB steps for gain.
    ctx.lineWidth = 1;
    for (const f of [100, 1000, 10000]) {
      const x = xFromFreq(f, w);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (const db of [-12, -6, 6, 12]) {
      const y = yFromDb(db, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const zeroY = yFromDb(0, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(w, zeroY);
    ctx.stroke();

    // Combined response: sum of every band's dB at each pixel column.
    ctx.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const f = freqFromX(x, w);
      let db = 0;
      for (const b of bands) db += bandDbAt(b, f);
      const y = yFromDb(clamp(db, -DB_RANGE, DB_RANGE), h);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = enabled ? '#c78bff' : 'rgba(199,139,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Band handles.
    bands.forEach((b, i) => {
      const cx = xFromFreq(b.freq, w);
      const cy = yFromDb(b.gain, h);
      ctx.beginPath();
      ctx.arc(cx, cy, b.id === selectedId ? 7 : 5.5, 0, Math.PI * 2);
      ctx.fillStyle = BAND_COLORS[i % BAND_COLORS.length];
      ctx.fill();
      ctx.strokeStyle = '#0e0b15';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }, [bands, enabled, selectedId]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Redraw when the panel changes size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  const localPos = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width, h: rect.height };
  };

  const bandAt = (x: number, y: number, w: number, h: number): EqBand | undefined => {
    let best: EqBand | undefined;
    let bestDist = HIT_RADIUS;
    for (const b of bands) {
      const dist = Math.hypot(xFromFreq(b.freq, w) - x, yFromDb(b.gain, h) - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = b;
      }
    }
    return best;
  };

  const selected = bands.find((b) => b.id === selectedId) ?? null;
  const selectedIndex = selected ? bands.indexOf(selected) : -1;

  return (
    <div ref={wrapRef} style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: 120, display: 'block', borderRadius: 8, background: '#0e0b15', cursor: 'crosshair', touchAction: 'none' }}
        onPointerDown={(e) => {
          const p = localPos(e);
          const band = bandAt(p.x, p.y, p.w, p.h);
          if (!band) return;
          dragRef.current = band.id;
          setSelectedId(band.id);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const id = dragRef.current;
          if (!id) return;
          const p = localPos(e);
          onChange(id, {
            freq: Math.round(clamp(freqFromX(p.x, p.w), F_MIN, F_MAX)),
            gain: Math.round(clamp(dbFromY(p.y, p.h), -DB_RANGE, DB_RANGE) * 10) / 10,
          });
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onWheel={(e) => {
          // Wheel over a peak band changes its Q (bandwidth).
          const p = localPos(e);
          const band = bandAt(p.x, p.y, p.w, p.h);
          if (!band || band.type !== 'peak') return;
          setSelectedId(band.id);
          const q = clamp(band.q * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.2, 8);
          onChange(band.id, { q: Math.round(q * 100) / 100 });
        }}
        onDoubleClick={(e) => {
          // Double-click a band to reset its gain to 0 dB.
          const p = localPos(e);
          const band = bandAt(p.x, p.y, p.w, p.h);
          if (band) onChange(band.id, { gain: 0 });
        }}
      />
      <div style={{ fontSize: 10, color: '#8b8299', minHeight: 14, fontFamily: 'ui-monospace, Menlo, monospace' }}>
        {selected
          ? `${BAND_NAMES[selectedIndex] ?? 'Band'} · ${formatFreq(selected.freq)} · ${selected.gain > 0 ? '+' : ''}${selected.gain} dB${selected.type === 'peak' ? ` · Q ${selected.q}` : ''}`
          : 'Drag a point · wheel on a peak for Q · double-click to reset'}
      </div>
    </div>
  );
}
