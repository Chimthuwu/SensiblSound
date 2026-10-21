import { useSessionStore } from '../stores/useSessionStore';
import type { MenuItem } from '../components/studio/ContextMenu';
import { toNorm } from './modCore';
import { describeParam } from './params';

/** The right-click menu every modulatable knob and slider shares: automate it, or modulate it with an LFO or envelope. */
export function buildParamMenu(paramId: string): MenuItem[] {
  const desc = describeParam(paramId);
  if (!desc) return [];
  const st = useSessionStore.getState();
  const openDrawer = (tab: 'mods' | 'auto') => { st.setModTab(tab); st.setModDrawerOpen(true); };
  const auto = st.automation.find((a) => a.paramId === paramId);
  const mappings = st.modMappings.filter((m) => m.paramId === paramId);

  const items: MenuItem[] = [{ label: desc.label, disabled: true, onSelect: () => {} }, { kind: 'separator' }];

  if (auto) {
    items.push({ label: 'Edit automation', onSelect: () => openDrawer('auto') });
    items.push({ label: 'Remove automation', danger: true, onSelect: () => useSessionStore.getState().removeAutomation(paramId) });
  } else {
    items.push({
      label: 'Automate',
      onSelect: () => {
        const n = toNorm(desc, desc.get());
        useSessionStore.getState().addAutomation(paramId, [{ beat: 0, value: n }, { beat: 16, value: n }]);
        openDrawer('auto');
      },
    });
  }

  items.push({ kind: 'separator' });
  for (const m of st.modulators) {
    const mapped = mappings.find((x) => x.modId === m.id);
    items.push({
      label: `Modulate with ${m.name}`,
      checked: !!mapped,
      onSelect: () => {
        const s = useSessionStore.getState();
        if (mapped) s.removeMapping(mapped.id);
        else { s.setMapping(m.id, paramId, 0.5); openDrawer('mods'); }
      },
    });
  }
  for (const [kind, label] of [['lfo', 'Modulate with a new LFO'], ['adsr', 'Modulate with a new envelope']] as const) {
    items.push({
      label,
      onSelect: () => {
        const s = useSessionStore.getState();
        s.setMapping(s.addModulator(kind), paramId, 0.5);
        openDrawer('mods');
      },
    });
  }
  if (mappings.length) {
    items.push({ kind: 'separator' });
    items.push({
      label: 'Remove all modulation',
      danger: true,
      onSelect: () => { for (const m of mappings) useSessionStore.getState().removeMapping(m.id); },
    });
  }
  return items;
}
