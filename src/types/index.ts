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
}
