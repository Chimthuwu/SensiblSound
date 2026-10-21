import { useEffect, useRef } from 'react';
import { useSessionStore } from '../stores/useSessionStore';
import type { SessionState } from '../types';

/** Where the last clip on the timeline ends, in ms: audio clips and MIDI clips on every track. 0 when the project is empty. */
export function contentEndMs(s: Pick<SessionState, 'backingTrack' | 'activeTake' | 'layers' | 'extraTracks' | 'midiClips' | 'bpm'>): number {
  const msPerBar = (60_000 / s.bpm) * 4;
  const ends: number[] = [];
  if (s.backingTrack?.durationMs) ends.push((s.backingTrack.startMs ?? 0) + s.backingTrack.durationMs);
  if (s.activeTake?.durationMs) ends.push(s.activeTake.transportStartMs + s.activeTake.durationMs);
  for (const l of s.layers) if (l.durationMs) ends.push(l.transportStartMs + l.durationMs);
  for (const t of s.extraTracks) if (t.clip?.durationMs) ends.push(t.clip.startMs + t.clip.durationMs);
  for (const c of s.midiClips) ends.push(c.startMs + c.bars * msPerBar);
  return ends.length ? Math.max(...ends) : 0;
}

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

      // Playback ends a moment after the last clip, audio or MIDI, on any track (never while recording).
      const st = useSessionStore.getState();
      if (st.isPlaying && !st.isRecording) {
        const end = contentEndMs(st);
        if (end > 0 && actual > end + 1500) st.setIsPlaying(false);
      }

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
