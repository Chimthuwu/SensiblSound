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
  mimeType?: string; // Recorder's actual output type, used to pick a download file extension
  downloaded?: boolean; // Has she saved this take to disk yet — drives the unmissable-CTA + beforeunload warning
}

export interface VocalLayer {
  id: string;
  url: string; // Object URL for playback
  timestamp: number;
  transportStartMs: number; // Project position where this layer was recorded
  durationMs?: number; // Populated once WaveSurfer decodes the audio
  mimeType?: string; // Recorder's actual output type, used to pick a download file extension
  downloaded?: boolean; // Has she saved this take to disk yet — drives the unmissable-CTA + beforeunload warning
}

// A durable audit-trail entry for every completed recording, independent
// of what the active session does with it (Keep as Layer / Record Again /
// a refresh that wipes activeTake+layers). Persisted to localStorage so it
// survives a refresh even though the recording's audio itself lives in
// IndexedDB/Firebase, keyed by the same id.
export interface RecordingMeta {
  id: string;
  timestamp: number;
  transportStartMs: number;
  mimeType?: string;
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
  backupStatus: "idle" | "uploading" | "success" | "failed"; // local (IndexedDB) save status
  cloudBackupStatus: "idle" | "uploading" | "success" | "failed"; // real Firebase Storage upload status
  isMonitoring: boolean;
  fxEnabled: boolean;
  fxSettings: FxSettings;
  transportTimeMs: number; // Project playhead position in ms
  recordingsHistory: RecordingMeta[]; // Every recording ever made this browser, independent of the active session

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
  setCloudBackupStatus: (status: SessionState['cloudBackupStatus']) => void;
  setIsMonitoring: (enabled: boolean) => void;
  setFxEnabled: (enabled: boolean) => void;
  setFxSettings: (settings: Partial<FxSettings>) => void;
  setTransportTimeMs: (ms: number) => void;
  rewindTransport: () => void;
  setBackingTrackDurationMs: (ms: number) => void;
  setActiveTakeDurationMs: (ms: number) => void;
  setLayerDurationMs: (id: string, ms: number) => void;
  markActiveTakeDownloaded: () => void;
  markLayerDownloaded: (id: string) => void;
  addRecordingHistoryEntry: (entry: RecordingMeta) => void;
}
