import { useSessionStore } from '../../stores/useSessionStore';
import { MIN_TRACK_HEIGHT, MAX_TRACK_HEIGHT } from '../../hooks/useTrackLayout';
import type { TrackGroup } from '../../types';

interface TrackDecorProps {
  trackId: string;
  height: number;
  isSelected: boolean;
  group?: TrackGroup;
}

// Overlay for a track row: selection ring, group stripe + name, and a bottom
// drag handle. Dragging resizes this row, or every selected row if this one
// is part of the selection (grouped tracks always resize together).
export function TrackDecor({ trackId, height, isSelected, group }: TrackDecorProps) {
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const state = useSessionStore.getState();
    const mates = group ? group.trackIds : [trackId];
    const ids = state.selectedTracks.has(trackId) ? [...state.selectedTracks] : mates;
    const startY = e.clientY;
    const startH = height;

    const onMove = (ev: PointerEvent) => {
      const h = Math.min(MAX_TRACK_HEIGHT, Math.max(MIN_TRACK_HEIGHT, startH + ev.clientY - startY));
      useSessionStore.getState().setTrackHeights(ids, Math.round(h));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <>
      {isSelected && (
        <div className="absolute inset-0 rounded-[inherit] ring-2 ring-inset ring-primary/70 pointer-events-none z-30" />
      )}
      {group && (
        <>
          <div className="absolute left-0 top-0 bottom-0 w-1 z-30 pointer-events-none" style={{ background: group.color }} />
          <span
            className="absolute left-2 bottom-1 z-30 px-1.5 rounded text-[9px] font-bold tracking-wide pointer-events-none text-black"
            style={{ background: group.color }}
          >
            {group.name}
          </span>
        </>
      )}
      <div
        onPointerDown={startResize}
        className="absolute left-0 right-0 bottom-0 h-2 z-40 cursor-row-resize hover:bg-primary/40 transition-colors"
        title="Drag to resize (resizes all selected tracks)"
      />
    </>
  );
}
