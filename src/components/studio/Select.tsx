import { Children, isValidElement, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface OptionData { value: string; label: ReactNode; disabled: boolean }

export interface SelectChange { target: { value: string }; currentTarget: { value: string } }

interface SelectProps {
  value: string | number;
  onChange: (e: SelectChange) => void;
  /** `<option>` elements, as for a native select. */
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  title?: string;
  onClick?: (e: MouseEvent) => void;
  'aria-label'?: string;
}

/**
 * A drop-in replacement for a native `<select>`. The browser draws a native select's list itself, in system colours,
 * which cannot follow the app theme; this one draws its own list, so it matches the theme (hue, saturation, contrast).
 * Same props, same `e.target.value` in onChange.
 */
export function Select({ value, onChange, children, className, style, disabled, title, onClick, ...rest }: SelectProps) {
  const options = useMemo<OptionData[]>(() => {
    const out: OptionData[] = [];
    Children.forEach(children, (c) => {
      if (isValidElement(c) && c.type === 'option') {
        const p = c.props as { value?: string | number; children?: ReactNode; disabled?: boolean };
        out.push({ value: String(p.value ?? (typeof p.children === 'string' ? p.children : '')), label: p.children, disabled: !!p.disabled });
      }
    });
    return out;
  }, [children]);

  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const [active, setActive] = useState(0);
  const current = options.find((o) => o.value === String(value));

  const openList = () => {
    const el = btnRef.current;
    if (!el || disabled) return;
    const r = el.getBoundingClientRect();
    const win = el.ownerDocument.defaultView ?? window;
    const room = win.innerHeight - r.bottom;
    const need = Math.min(260, options.length * 28 + 10);
    setActive(Math.max(0, options.findIndex((o) => o.value === String(value))));
    setOpen({ left: r.left, top: room < need && r.top > room ? r.top : r.bottom, width: r.width, up: room < need && r.top > room });
  };

  const choose = (o: OptionData) => {
    if (o.disabled) return;
    setOpen(null);
    onChange({ target: { value: o.value }, currentTarget: { value: o.value } });
    btnRef.current?.focus();
  };

  // Close on an outside click, and drive the list with the keyboard.
  useEffect(() => {
    if (!open) return;
    const doc = btnRef.current?.ownerDocument ?? document;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || doc.querySelector('.studio-select-pop')?.contains(t)) return;
      setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(null); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); const o = options[active]; if (o) choose(o); }
    };
    doc.addEventListener('pointerdown', onDown);
    doc.addEventListener('keydown', onKey, true);
    return () => { doc.removeEventListener('pointerdown', onDown); doc.removeEventListener('keydown', onKey, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active, options]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={!!open}
        aria-label={rest['aria-label']}
        className={`themed-select ${className ?? ''}`}
        style={style}
        disabled={disabled}
        title={title}
        data-value={String(value)}
        onClick={(e) => { onClick?.(e); if (open) setOpen(null); else openList(); }}
      >
        <span className="themed-select-label">{current?.label ?? ''}</span>
        <span className="themed-select-caret" aria-hidden="true">▾</span>
      </button>
      {open && btnRef.current && createPortal(
        <div
          className="studio-select-pop"
          role="listbox"
          style={{ left: open.left, minWidth: Math.max(open.width, 120), ...(open.up ? { bottom: (btnRef.current.ownerDocument.defaultView?.innerHeight ?? 0) - open.top + 4 } : { top: open.top + 4 }) }}
        >
          {options.map((o, i) => (
            <div
              key={o.value + i}
              role="option"
              aria-selected={o.value === String(value)}
              aria-disabled={o.disabled}
              className="studio-select-opt"
              data-active={String(i === active)}
              data-selected={String(o.value === String(value))}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(o)}
            >
              {o.label}
            </div>
          ))}
        </div>,
        btnRef.current.ownerDocument.body,
      )}
    </>
  );
}
