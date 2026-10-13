import { useRef, useState, useCallback, useEffect } from 'react';

const A_MIN = -135;
const A_MAX = 135;

function polarDegrees(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polarDegrees(cx, cy, r, a0);
  const [x1, y1] = polarDegrees(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export interface KnobProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  default?: number;
  unit?: string;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
  size?: number;
}

export function Knob({
  value,
  min,
  max,
  step = 0,
  default: defaultVal = min + (max - min) / 2,
  onChange,
  size = 46,
}: KnobProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [local, setLocal] = useState(value);
  const drag = useRef<{ startY: number; startV: number } | null>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const range = max - min;
  const t = range === 0 ? 0 : Math.min(1, Math.max(0, (local - min) / range));
  const ang = A_MIN + t * (A_MAX - A_MIN);

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.37;
  const indR = size * 0.20;

  const fillPath = arcPath(cx, cy, r, A_MIN, Math.max(A_MIN + 0.01, ang));
  const [ix, iy] = polarDegrees(cx, cy, indR, ang);

  const setValue = useCallback(
    (next: number) => {
      const stepped = step > 0 ? Math.round(next / step) * step : next;
      const clamped = Math.min(max, Math.max(min, stepped));
      setLocal(clamped);
      onChange(clamped);
    },
    [min, max, step, onChange],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      drag.current = { startY: e.clientY, startV: local };
    },
    [local],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag.current) return;
      const delta = (drag.current.startY - e.clientY) / 150 * range;
      setValue(drag.current.startV + delta);
    },
    [range, setValue],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const target = e.currentTarget as HTMLElement;
      drag.current = null;
      try {
        target.releasePointerCapture(e.pointerId);
      } catch {
        // noop
      }
    },
    [],
  );

  const onDoubleClick = useCallback(() => {
    setValue(defaultVal);
  }, [defaultVal, setValue]);

  return (
    <div
      className="studio-knob"
      style={{ width: size, height: size }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      aria-label="Knob"
      tabIndex={0}
    >
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <path
          d={arcPath(cx, cy, r, A_MIN, A_MAX)}
          stroke="#2a2336"
          strokeWidth={size * 0.098}
          fill="none"
          strokeLinecap="round"
        />
        <path
          className="studio-knob-fill"
          d={fillPath}
          stroke="currentColor"
          strokeWidth={size * 0.098}
          fill="none"
          strokeLinecap="round"
          style={{ color: '#b06bff' }}
        />
        <circle cx={cx} cy={cy} r={size * 0.25} fill="#1d1828" stroke="#322a42" strokeWidth={1} />
        <line
          className="studio-knob-ind"
          x1={cx}
          y1={cy}
          x2={ix.toFixed(2)}
          y2={iy.toFixed(2)}
          stroke="#e2d4ff"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
