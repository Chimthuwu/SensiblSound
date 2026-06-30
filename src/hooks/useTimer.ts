import { useState, useEffect, useRef } from 'react';
import { useSessionStore } from '../stores/useSessionStore';

export function useTimer() {
  const { isPlaying, isRecording } = useSessionStore();
  const [time, setTime] = useState(0); 
  const requestRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    const isActive = isPlaying || isRecording;

    const tick = (currentTime: number) => {
      if (startTimeRef.current === 0) {
        startTimeRef.current = currentTime;
      }
      const elapsed = currentTime - startTimeRef.current;
      setTime(elapsed);
      requestRef.current = requestAnimationFrame(tick);
    };

    if (isActive) {
      startTimeRef.current = performance.now();
      requestRef.current = requestAnimationFrame(tick);
    } else {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      // Reset playhead on stop for the MVP 
      setTime(0);
      startTimeRef.current = 0;
    }

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, isRecording]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(2, '0')}`;
  };

  return { time, formattedTime: formatTime(time) };
}
