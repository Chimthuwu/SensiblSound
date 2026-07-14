export interface AudioFile {
  id: string;
  name: string;
  url: string; // Object URL for playback
}

export interface VocalTake {
  id: string;
  url: string; // Object URL for playback
  timestamp: number;
}

export interface VocalLayer {
  id: string;
  url: string; // Object URL for playback
  timestamp: number;
}

export interface FxSettings {
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
}
