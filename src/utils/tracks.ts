import { useSessionStore } from '../stores/useSessionStore';
import { laneInfos } from './lanes';

/**
 * Adds an empty track, selects it and scrolls it into view. With `afterSelected` it goes right below the selected
 * track instead of at the bottom (Ctrl+T / Alt+T).
 */
export function insertTrack(afterSelected: boolean): string {
  const id = useSessionStore.getState().addTrack();
  const s = useSessionStore.getState();
  if (afterSelected) {
    const order = laneInfos(s).map((l) => l.id).filter((x) => x !== id);
    const at = order.indexOf(s.selectedTrackId);
    if (at >= 0) {
      order.splice(at + 1, 0, id);
      s.setTrackOrder(order);
    }
  }
  s.setSelectedTrackId(id);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelector(`[data-track-head="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  }));
  return id;
}
