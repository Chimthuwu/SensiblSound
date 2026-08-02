import { useSessionStore } from '../../stores/useSessionStore';

interface PlayheadProps {
  totalDurationMs: number;
}

// Vertical line spanning a stacked multi-track area, driven directly by the
// shared transport clock — gives the layer timeline a single moving
// reference point instead of relying on each track's own WaveSurfer cursor
// (which only tracks while that track is inside its own audible window).
export function Playhead({ totalDurationMs }: PlayheadProps) {
  const transportTimeMs = useSessionStore((s) => s.transportTimeMs);

  if (totalDurationMs <= 0) return null;

  const leftPercent = Math.min(100, (transportTimeMs / totalDurationMs) * 100);

  return (
    <div
      className="absolute top-0 bottom-0 z-30 pointer-events-none"
      style={{ left: `${leftPercent}%` }}
    >
      <div className="w-px h-full bg-primary shadow-[0_0_8px_rgba(168,85,247,0.8)] -translate-x-1/2" />
      <div className="absolute -top-[3px] left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-primary shadow-[0_0_6px_rgba(168,85,247,0.8)]" />
    </div>
  );
}
