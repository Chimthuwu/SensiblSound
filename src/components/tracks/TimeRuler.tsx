interface TimeRulerProps {
  bpm: number;
  duration: number; // Seconds of loaded audio (0 = nothing to render)
}

// Overlay component that draws musical-bar grid lines + numbers on top of a wave.
// Assumes a 4/4 time signature. Bar duration = 4 beats = (240 / bpm) seconds.
//
// Every 4th bar's number is bold and slightly more prominent — these mark the
// end of a 4-bar phrase, which is the most common musical "checkpoint" for
// pattern recognition.
//
// Pure visual; click events pass through (pointer-events-none).
export function TimeRuler({ bpm, duration }: TimeRulerProps) {
  if (duration <= 0 || bpm <= 0) return null;

  const barDurationSec = (60 / bpm) * 4; // 4 beats per bar at 4/4
  const totalBars = Math.ceil(duration / barDurationSec);

  const bars: { index: number; xPercent: number; isBold: boolean }[] = [];
  for (let i = 1; i <= totalBars + 1; i++) {
    const time = (i - 1) * barDurationSec;
    if (time > duration + 0.0001) break;
    bars.push({
      index: i,
      xPercent: (time / duration) * 100,
      // i % 4 === 0 → bars 4, 8, 12, ... are the bold "phrase-end" markers.
      isBold: i > 0 && i % 4 === 0,
    });
  }

  return (
    <div className="absolute inset-0 z-20 pointer-events-none select-none overflow-hidden">
      {bars.map((bar) => (
        <div
          key={bar.index}
          className="absolute top-0 bottom-0"
          style={{
            left: `${bar.xPercent}%`,
            transform: 'translateX(-50%)',
          }}
        >
          {/* Vertical grid line: spans from below the number down to the
              bottom of the wave container so it visually "lines up to" the
              waveform the user is reading. */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 ${
              bar.isBold
                ? 'w-px bg-primary/70 top-4 bottom-0'
                : 'w-px bg-white/15 top-3 bottom-0'
            }`}
          />
          {/* Bar number above the tick. Bold/larger for every 4th bar. */}
          <span
            className={`absolute left-1/2 -translate-x-1/2 top-0 font-mono ${
              bar.isBold
                ? 'text-[10px] font-bold text-primary tracking-tight'
                : 'text-[8px] font-medium text-zinc-500 tracking-tighter'
            }`}
          >
            {bar.index}
          </span>
        </div>
      ))}
    </div>
  );
}
