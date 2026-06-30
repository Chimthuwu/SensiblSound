import { useState, useEffect, useRef } from 'react';
import { useSessionStore } from '../stores/useSessionStore';
import { backupService } from '../services/backupService';

export function useAudioRecorder() {
  const { isRecording, setIsRecording, setActiveTake, setIsPlaying, backingTrack } = useSessionStore();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isReady, setIsReady] = useState(false);
  
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Enumerate devices on mount
  useEffect(() => {
    async function getDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }); // Request permission first
        const devs = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devs.filter(d => d.kind === 'audioinput');
        setDevices(audioInputs);
        if (audioInputs.length > 0) {
          setSelectedDeviceId(audioInputs[0].deviceId);
        }
        setIsReady(true);
      } catch (err) {
        console.error("Microphone access denied or error:", err);
        setIsReady(false);
      }
    }
    getDevices();
  }, []);

  // Handle Recording State Changes
  useEffect(() => {
    if (isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  }, [isRecording]);

  const startRecording = async () => {
    audioChunks.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true
      });
      streamRef.current = stream;
      
      mediaRecorder.current = new MediaRecorder(stream);
      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };
      
      mediaRecorder.current.onstop = async () => {
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' }); 
        const url = URL.createObjectURL(blob);
        const id = crypto.randomUUID();
        setActiveTake({ id, url, timestamp: Date.now() });
        
        // Clean up tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        // Trigger Backup Process
        useSessionStore.getState().setBackupStatus('uploading');
        const success = await backupService.backupTake(id, url);
        useSessionStore.getState().setBackupStatus(success ? 'success' : 'failed');
      };
      
      mediaRecorder.current.start(1000); // chunk every second
      
      // Auto-play backing track if it exists
      if (backingTrack) {
        setIsPlaying(true);
      }
    } catch (err) {
      console.error("Failed to start recording:", err);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop();
      setIsPlaying(false); // Stop backing track playback too
    }
  };

  return { 
    devices, 
    selectedDeviceId, 
    setSelectedDeviceId,
    isReady
  };
}
