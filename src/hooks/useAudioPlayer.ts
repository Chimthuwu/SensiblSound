import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useSessionStore } from '../stores/useSessionStore';

export function useAudioPlayer(containerRef: React.RefObject<HTMLDivElement | null>, url?: string) {
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const { isPlaying } = useSessionStore();
  const [isReady, setIsReady] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current) return;

    wavesurfer.current = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#52525b', // zinc-600
      progressColor: '#a855f7', // primary purple
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      cursorWidth: 2,
      cursorColor: '#a855f7',
      height: 96,
      normalize: true,
    });

    wavesurfer.current.on('ready', () => {
      setIsReady(true);
    });

    wavesurfer.current.on('finish', () => {
      // Optional: stop playing when finished, but wait for store sync
      useSessionStore.getState().setIsPlaying(false);
    });

    return () => {
      wavesurfer.current?.destroy();
    };
  }, []); // Only run once to initialize

  // Handle URL change
  useEffect(() => {
    if (wavesurfer.current && url) {
      setIsReady(false);
      wavesurfer.current.load(url);
    }
  }, [url]);

  // Sync playback state
  useEffect(() => {
    if (!wavesurfer.current || !isReady) return;
    
    if (isPlaying) {
      wavesurfer.current.play();
    } else {
      wavesurfer.current.pause();
    }
  }, [isPlaying, isReady]);

  // Sync volume and mute
  useEffect(() => {
    if (!wavesurfer.current) return;
    wavesurfer.current.setVolume(isMuted ? 0 : volume);
  }, [volume, isMuted]);

  return {
    isReady,
    volume,
    setVolume,
    isMuted,
    setIsMuted
  };
}
