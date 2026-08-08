import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useSessionStore } from '../stores/useSessionStore';

export interface AudioPlayerOptions {
  /** Project-time offset (in ms) at which this element should start being audible. */
  startOffsetMs?: number;
  /** When true (default), clicks/drags on the wave seek the global transport. */
  interactive?: boolean;
}

export function useAudioPlayer(
  containerRef: React.RefObject<HTMLDivElement | null>,
  url?: string,
  options?: AudioPlayerOptions
) {
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const isWsPlayingRef = useRef(false);
  const startOffsetMsRef = useRef(options?.startOffsetMs ?? 0);

  const isPlaying = useSessionStore((s) => s.isPlaying);
  const transportTimeMs = useSessionStore((s) => s.transportTimeMs);
  const [isReady, setIsReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const interactive = options?.interactive ?? true;

  // Keep the offset ref fresh so the interaction handler always uses the latest value.
  useEffect(() => {
    startOffsetMsRef.current = options?.startOffsetMs ?? 0;
  }, [options?.startOffsetMs]);

  // Initialize WaveSurfer (once per interactive flag)
  useEffect(() => {
    if (!containerRef.current) return;

    wavesurfer.current = WaveSurfer.create({
      container: containerRef.current,
      url: url || undefined,
      waveColor: '#52525b', // zinc-600
      progressColor: '#a855f7', // primary purple
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      cursorWidth: 2,
      cursorColor: '#a855f7',
      height: 96,
      normalize: true,
      interact: interactive, // controls clickability / dragability of the wave UI
    });

    wavesurfer.current.on('ready', () => {
      setIsReady(true);
      setDuration(wavesurfer.current?.getDuration() || 0);
    });

    wavesurfer.current.on('play', () => {
      isWsPlayingRef.current = true;
    });

    wavesurfer.current.on('pause', () => {
      isWsPlayingRef.current = false;
    });

    wavesurfer.current.on('finish', () => {
      isWsPlayingRef.current = false;
      // Optional: stop playing when finished, but wait for store sync
      useSessionStore.getState().setIsPlaying(false);
    });

    wavesurfer.current.on('error', (err) => {
      console.warn('WaveSurfer error:', err);
      // Ensure we don't get permanently stuck in "Analyzing..."
      setIsReady(true);
    });

    // When interactive, user clicks/drags on the wave should drive the global
    // transport scrubber (backing-track is the project timeline reference).
    if (interactive) {
      wavesurfer.current.on('interaction', (newTimeSec: number) => {
        const newTransportMs = startOffsetMsRef.current + newTimeSec * 1000;
        useSessionStore.getState().setTransportTimeMs(Math.max(0, newTransportMs));
      });
    }

    return () => {
      wavesurfer.current?.destroy();
      wavesurfer.current = null;
      isWsPlayingRef.current = false;
    };
  }, [interactive]);

  // Handle URL change (resets play state and duration so the new wavesurfer starts fresh)
  useEffect(() => {
    if (!wavesurfer.current) return;
    // WaveSurfer.load()/empty() reset internal playback state, but our ref
    // would otherwise stale-claim the new instance is "playing". Reset it.
    isWsPlayingRef.current = false;
    setDuration(0);
    if (url) {
      setIsReady(false);
      wavesurfer.current.load(url).catch(err => {
        console.warn('WaveSurfer load failed:', err);
        setIsReady(true);
      });
    } else {
      wavesurfer.current.empty();
      setIsReady(false);
    }
  }, [url]);

  // Sync volume and mute
  useEffect(() => {
    if (!wavesurfer.current) return;
    wavesurfer.current.setVolume(isMuted ? 0 : volume);
  }, [volume, isMuted]);

  // THE main sync effect: offset-aware seeking + play/pause windowing.
  //
  // Element is audible when: isPlaying && transportTimeMs >= startOffsetMs
  //                          && transportTimeMs < startOffsetMs + duration.
  // Outside its window → paused (so takes don't leak before/after their slot).
  useEffect(() => {
    if (!wavesurfer.current || !isReady) return;
    const ws = wavesurfer.current;
    const duration = ws.getDuration() || 0;
    const durationMs = duration * 1000;
    const startOffset = startOffsetMsRef.current;
    const relativeMs = transportTimeMs - startOffset;
    const clampedMs = Math.max(0, Math.min(relativeMs, durationMs));
    const targetSec = clampedMs / 1000;
    const withinWindow = relativeMs >= 0 && relativeMs < durationMs;

    if (isPlaying && withinWindow) {
      if (!isWsPlayingRef.current) {
        // Just entered window (or initial play). Mark intent before invoking play()
        // so a re-entry before the WaveSurfer 'play' event fires won't redundantly
        // call play() again.
        ws.setTime(targetSec);
        isWsPlayingRef.current = true;
        ws.play();
      } else {
        // Already playing — only seek on large delta (scrub during play).
        // WaveSurfer otherwise plays naturally and stays synced with the timer.
        const currentSec = ws.getCurrentTime();
        if (Math.abs(targetSec - currentSec) > 0.15) {
          ws.setTime(targetSec);
        }
      }
    } else {
      if (isWsPlayingRef.current) {
        isWsPlayingRef.current = false;
        ws.pause();
      }
      // Scrub while paused (or rewound out of window): seek to current transport-relative position.
      // This keeps the waveform cursor in sync with the playhead.
      if (!isPlaying) {
        ws.setTime(targetSec);
      }
    }
  }, [transportTimeMs, isPlaying, isReady]);

  return {
    isReady,
    duration,
    volume,
    setVolume,
    isMuted,
    setIsMuted,
  };
}
