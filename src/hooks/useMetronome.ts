import { useEffect, useRef } from 'react';
import { useSessionStore } from '../stores/useSessionStore';

export function useMetronome() {
  const { bpm, isPlaying, isRecording, isMetronomeEnabled, metronomeVolume } = useSessionStore();
  const audioContext = useRef<AudioContext | null>(null);
  const nextNoteTime = useRef(0);
  const timerID = useRef<number | null>(null);
  
  // Create audio context on first interaction/mount
  useEffect(() => {
    if (!audioContext.current) {
      audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return () => {
      audioContext.current?.close();
    };
  }, []);

  useEffect(() => {
    // We only run the metronome if enabled AND we are playing/recording
    const isActive = isMetronomeEnabled && (isPlaying || isRecording);
    
    if (isActive && audioContext.current) {
      // Resume context in case it was suspended by browser policy
      if (audioContext.current.state === 'suspended') {
        audioContext.current.resume();
      }
      
      // Reset next note time slightly in the future to ensure sync
      nextNoteTime.current = audioContext.current.currentTime + 0.05;
      scheduler();
    } else {
      if (timerID.current) {
        window.clearTimeout(timerID.current);
        timerID.current = null;
      }
    }
    
    return () => {
      if (timerID.current) {
        window.clearTimeout(timerID.current);
      }
    };
  }, [isPlaying, isRecording, isMetronomeEnabled, bpm, metronomeVolume]);

  const scheduleNote = (time: number) => {
    if (!audioContext.current) return;
    
    const osc = audioContext.current.createOscillator();
    const gainNode = audioContext.current.createGain();
    
    // Higher pitch for first beat of measure? Keep it simple for MVP.
    osc.frequency.value = 880; 
    
    // Envelope for a sharp click
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(metronomeVolume, time + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    
    osc.connect(gainNode);
    gainNode.connect(audioContext.current.destination);
    
    osc.start(time);
    osc.stop(time + 0.1);
  };

  const scheduler = () => {
    if (!audioContext.current) return;
    
    const lookahead = 25.0; // ms
    const scheduleAheadTime = 0.1; // s
    
    while (nextNoteTime.current < audioContext.current.currentTime + scheduleAheadTime) {
      scheduleNote(nextNoteTime.current);
      const secondsPerBeat = 60.0 / bpm;
      nextNoteTime.current += secondsPerBeat;
    }
    
    timerID.current = window.setTimeout(scheduler, lookahead);
  };
}
