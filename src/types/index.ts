export interface AudioFile {
  id: string;
  name: string;
  url: string; // Object URL for playback
  durationMs?: number; // Populated once WaveSurfer decodes the audio
}

export interface VocalTake {
  id: string;
  url: string; // Object URL for playback
  timestamp: number;
  transportStartMs: number; // Project position where this take was recorded
  durationMs?: number; // Populated once WaveSurfer decodes the audio
}

export interface VocalLayer {
  id: string;
  url: string; // Object URL for playback
  timestamp: number;
  transportStartMs: number; // Project position where this layer was recorded
  durationMs?: number; // Populated once WaveSurfer decodes the audio
}

export interface FxSettings {
  autotuneEnabled: boolean;
  compressorEnabled: boolean;
  eqEnabled: boolean;
  delayEnabled: boolean;
  reverbEnabled: boolean;
  autotuneKey: string;
  autotuneScale: string;
  autotuneSpeed: number;
  compression: number;
  doubleEnabled: boolean;
  doubleWidth: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  delayFeedback: number;
  delayTime: number;
  reverbWet: number;
}

export interface SessionState {
  bpm: number;
  backingTrack?: AudioFile;
  activeTake?: VocalTake;
  layers: VocalLayer[];
  isRecording: boolean;
  isPlaying: boolean;
  isMetronomeEnabled: boolean;
  metronomeVolume: number;
  backupStatus: "idle" | "uploading" | "success" | "failed";
  isMonitoring: boolean;
  fxEnabled: boolean;
  fxSettings: FxSettings;
  transportTimeMs: number; // Project playhead position in ms

  // Actions
  setBpm: (bpm: number) => void;
  setBackingTrack: (file: AudioFile | undefined) => void;
  setActiveTake: (take: VocalTake | undefined) => void;
  addLayer: (layer: VocalLayer) => void;
  removeLayer: (id: string) => void;
  clearLayers: () => void;
  setIsRecording: (isRecording: boolean) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setIsMetronomeEnabled: (enabled: boolean) => void;
  setMetronomeVolume: (volume: number) => void;
  setBackupStatus: (status: SessionState['backupStatus']) => void;
  setIsMonitoring: (enabled: boolean) => void;
  setFxEnabled: (enabled: boolean) => void;
  setFxSettings: (settings: Partial<FxSettings>) => void;
  setTransportTimeMs: (ms: number) => void;
  rewindTransport: () => void;
  setBackingTrackDurationMs: (ms: number) => void;
  setActiveTakeDurationMs: (ms: number) => void;
  setLayerDurationMs: (id: string, ms: number) => void;
}
