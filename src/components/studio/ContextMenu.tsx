import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type MenuItem =
  | { kind: 'separator' }
  | {
      kind?: 'item';
      label: string;
      onSelect: () => void;
      disabled?: boolean;
      danger?: boolean;
      checked?: boolean;
    };

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

type OpenMenu = (e: { clientX: number; clientY: number; preventDefault: () => void }, items: MenuItem[]) => void;

const ContextMenuContext = createContext<OpenMenu>(() => {});

/** Opens the app's own right-click menu. Use from any onContextMenu handler. */
export function useContextMenu(): OpenMenu {
  return useContext(ContextMenuContext);
}

const EDITABLE = 'input, textarea, select, [contenteditable="true"]';

/**
 * One context menu for the whole app. It also blocks the browser's own menu
 * everywhere except text fields, where copy/paste is still useful.
 */
export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const open = useCallback<OpenMenu>((e, items) => {
    e.preventDefault();
    if (items.length === 0) return;
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, []);

  // Block the browser menu app-wide, except in text fields.
  useEffect(() => {
    const block = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(EDITABLE)) return;
      e.preventDefault();
    };
    document.addEventListener('contextmenu', block);
    return () => document.removeEventListener('contextmenu', block);
  }, []);

  // Close on outside click, Escape, scroll or resize.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  // Keep the menu on screen.
  const width = 220;
  const estimatedHeight = menu ? menu.items.length * 30 + 12 : 0;
  const left = menu ? Math.min(menu.x, window.innerWidth - width - 8) : 0;
  const top = menu ? Math.min(menu.y, window.innerHeight - estimatedHeight - 8) : 0;

  return (
    <ContextMenuContext.Provider value={open}>
      {children}
      {menu && (
        <div
          ref={menuRef}
          className="studio-context-menu"
          role="menu"
          style={{ left: Math.max(8, left), top: Math.max(8, top) }}
        >
          {menu.items.map((item, i) => {
            if (item.kind === 'separator') {
              return <div key={`sep-${i}`} className="studio-context-sep" role="separator" />;
            }
            return (
              <button
                key={`${item.label}-${i}`}
                type="button"
                role="menuitem"
                className="studio-context-item"
                data-danger={String(!!item.danger)}
                disabled={item.disabled}
                onClick={() => {
                  setMenu(null);
                  item.onSelect();
                }}
              >
                <span className="studio-context-check" aria-hidden="true">{item.checked ? '✓' : ''}</span>
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </ContextMenuContext.Provider>
  );
}
