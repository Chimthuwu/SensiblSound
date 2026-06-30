import { useState, useEffect } from 'react';
import { useSessionStore } from '../stores/useSessionStore';

export function useTempoDetector() {
  const { backingTrack, setBpm } = useSessionStore();
  const [detectedBpm, setDetectedBpm] = useState<number | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (backingTrack) {
      // Simulate Tempo Detection
      setIsDetecting(true);
      setShowPrompt(false);
      
      const timer = setTimeout(() => {
        setIsDetecting(false);
        // Mock detected BPM between 80 and 160
        const mockBpm = Math.floor(Math.random() * (160 - 80 + 1) + 80);
        setDetectedBpm(mockBpm);
        setShowPrompt(true);
      }, 2000); // 2 second mock processing time
      
      return () => clearTimeout(timer);
    }
  }, [backingTrack]);

  const acceptDetectedBpm = () => {
    if (detectedBpm) {
      setBpm(detectedBpm);
    }
    setShowPrompt(false);
  };

  const dismissPrompt = () => {
    setShowPrompt(false);
  };

  return {
    isDetecting,
    showPrompt,
    detectedBpm,
    acceptDetectedBpm,
    dismissPrompt
  };
}
