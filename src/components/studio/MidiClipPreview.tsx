import type { MidiNote } from '../../types';

/** Tiny note map drawn inside a MIDI clip on the arrangement. */
export function MidiClipPreview({
  notes,
  bars,
  width,
  color,
  drums,
}: {
  notes: MidiNote[];
  bars: number;
  width: number;
  color: string;
  drums: boolean;
}) {
  const beats = Math.max(1, bars * 4);
  const pitches = notes.map((n) => n.pitch);
  const lo = drums ? 36 : Math.min(60, ...pitches);
  const hi = drums ? 43 : Math.max(72, ...pitches);
  const span = Math.max(1, hi - lo + 1);
  return (
    <svg className="studio-midi-preview" width={width} height="100%" viewBox={`0 0 ${beats} ${span}`} preserveAspectRatio="none" aria-hidden="true">
      {notes.map((n) => (
        <rect
          key={n.id}
          x={n.startBeat}
          y={hi - n.pitch}
          width={Math.max(0.08, n.lenBeats)}
          height={0.82}
          rx={0.12}
          fill={color}
          opacity={0.45 + n.vel * 0.55}
        />
      ))}
    </svg>
  );
}
