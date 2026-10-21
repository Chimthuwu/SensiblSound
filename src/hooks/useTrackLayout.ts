import { useSessionStore } from '../stores/useSessionStore';

export const MIN_TRACK_HEIGHT = 96;
export const MAX_TRACK_HEIGHT = 360;

// Selection, group and height state for one track row. Clicking a row selects
// it (Ctrl/Shift/Cmd-click adds or removes); resizing any selected row resizes
// every selected row.
export function useTrackLayout(trackId: string, defaultHeight: number) {
  const height = useSessionStore((s) => s.trackHeights[trackId]) ?? defaultHeight;
  const isSelected = useSessionStore((s) => s.selectedTracks.has(trackId));
  const group = useSessionStore((s) => s.groups.find((g) => g.trackIds.includes(trackId)));
  const selectTrack = useSessionStore((s) => s.selectTrack);

  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    selectTrack(trackId, e.ctrlKey || e.shiftKey || e.metaKey);
  };

  return { height, isSelected, group, onMouseDown, waveHeight: Math.max(48, height - 16) };
}
