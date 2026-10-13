import { useRef, useEffect, useCallback } from 'react';

export interface EQBand {
  /** Normalized 0..1 position on the EQ canvas. */
  x: number;
  /** dB gain, intended roughly -12..+12. */
  g: number;
}

export interface ParametricEQProps {
  bands: EQBand[];
  enabled: boolean;
  /** Called when a dragged band changes. */
  onChange: (bands: EQBand[]) => void;
  /** Optional label rendered above the canvas. */
  label?: string;
  /** Hint text rendered on the right of the header. */
  hint?: string;
}

function bandSigma(widthPx: number): number {
  return widthPx * 0.17;
}

function bandResponseAt(x: number, bands: EQBand[], sigma: number): number {
  let g = 0;
  for (const b of bands) {
    const d = x - b.x;
    g += b.g * Math.exp(-((d * d) / (2 * sigma * sigma)));
  }
  return g;
}

export function ParametricEQ({ bands, enabled, onChange, hint = 'Drag points' }: ParametricEQProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<number | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!canvas || !rect || rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = rect.height;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const mid = h / 2;
    const amp = h / 2 - 8;
    const sigma = bandSigma(w);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let i = 1; i < 6; i += 1) {
      const x = (w / 6) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();

    // Response curve
    ctx.beginPath();
    ctx.moveTo(0, mid - bandResponseAt(0, bands, sigma) * amp);
    for (let x = 1; x <= w; x += 1.5) {
      ctx.lineTo(x, mid - bandResponseAt(x, bands, sigma) * amp);
    }

    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#8A2BE2');
    grad.addColorStop(1, '#c78bff');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(176,107,255,0.55)';
    ctx.shadowBlur = enabled ? 10 : 0;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Fill below curve
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    const fillGrad = ctx.createLinearGradient(0, 0, 0, h);
    fillGrad.addColorStop(0, 'rgba(138,43,226,0.20)');
    fillGrad.addColorStop(1, 'rgba(138,43,226,0)');
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Control points
    for (let i = 0; i < bands.length; i += 1) {
      const b = bands[i];
      const x = b.x * w;
      const y = mid - b.g * amp;
      ctx.beginPath();
      ctx.arc(x, y, dragRef.current === i ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = dragRef.current === i ? '#e2d4ff' : '#b06bff';
      ctx.fill();
      ctx.strokeStyle = '#0e0b15';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [bands]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver(() => {
      redraw();
    });
    ro.observe(canvas);
    return () => {
      ro.disconnect();
    };
  }, [redraw]);

  const findBandAt = useCallback(
    (clientX: number, rect: DOMRect): number => {
      const x = (clientX - rect.left) / rect.width;
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < bands.length; i += 1) {
        const d = Math.abs(bands[i].x - x);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return bestD < 0.034 ? best : -1;
    },
    [bands],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const idx = findBandAt(e.clientX, rect);
      if (idx >= 0) {
        dragRef.current = idx;
        canvas.setPointerCapture(e.pointerId);
        redraw();
      }
    },
    [enabled, findBandAt, redraw],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const idx = dragRef.current;
      if (idx < 0) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0.02, Math.min(0.98, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      const amp = rect.height / 2 - 8;
      const next = bands.map((b, i) =>
        i === idx ? { ...b, x, g: (rect.height / 2 - y) / amp } : b,
      );
      onChange(next);
    },
    [bands, onChange],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      dragRef.current = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // noop
      }
      redraw();
    },
    [redraw],
  );

  return (
    <div className="studio-eq-wrap" title={hint}>
      <canvas
        ref={canvasRef}
        className="studio-eq-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
}
