import { useEffect, useRef } from 'react';
import { useSessionStore } from '../stores/useSessionStore';

export function useTimer() {
  const isPlaying = useSessionStore((s) => s.isPlaying);
  const isRecording = useSessionStore((s) => s.isRecording);
  const transportTimeMs = useSessionStore((s) => s.transportTimeMs);

  const rafRef = useRef<number | null>(null);
  const baseMsRef = useRef<number>(0);
  const baseTimeRef = useRef<number>(0);

  // Drive transportTimeMs via rAF while playing or recording.
  // Re-anchors baseline when a large delta is detected (e.g., user scrub) so
  // we never overwrite a position the user has manually set.
  useEffect(() => {
    const isActive = isPlaying || isRecording;
    if (!isActive) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // Snapshot baseline at the moment playback/recording starts.
    baseMsRef.current = useSessionStore.getState().transportTimeMs;
    baseTimeRef.current = performance.now();

    const tick = (now: number) => {
      const expected = baseMsRef.current + (now - baseTimeRef.current);
      const actual = useSessionStore.getState().transportTimeMs;

      if (Math.abs(expected - actual) > 50) {
        // Big jump → assume external change (scrub/rewind). Re-anchor without overwriting.
        baseMsRef.current = actual;
        baseTimeRef.current = now;
      } else {
        // Normal progression — advance transport time.
        useSessionStore.getState().setTransportTimeMs(expected);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, isRecording]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((ms % 1000) / 10);

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${centiseconds.toString().padStart(2, '0')}`;
  };

  return { transportTimeMs, formattedTime: formatTime(transportTimeMs) };
}
