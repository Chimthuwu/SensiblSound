export interface AudioFile {
  id: string;
  name: string;
  url: string; // Object URL for playback
  blob?: Blob; // Actual file/blob for robust loading
  durationMs?: number; // Populated once WaveSurfer decodes the audio
  startMs?: number; // Where the track starts on the timeline (default 0)
}

export interface VocalTake {
  id: string;
  url: string; // Object URL for playback
  blob?: Blob; // Actual file/blob for robust loading
  timestamp: number;
  transportStartMs: number; // Project position where this take was recorded
  durationMs?: number; // Populated once WaveSurfer decodes the audio
  mimeType?: string; // Recorder's actual output type, used to pick a download file extension
  downloaded?: boolean; // Has she saved this take to disk yet — drives the unmissable-CTA + beforeunload warning
}

export interface VocalLayer {
  id: string;
  url: string; // Object URL for playback
  blob?: Blob; // Actual file/blob for robust loading
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

// One band of the parametric EQ. Maps 1:1 onto a Web Audio BiquadFilterNode.
export interface EqBand {
  id: string;
  type: 'lowshelf' | 'peak' | 'highshelf';
  freq: number; // Hz, 20..20000
  gain: number; // dB, -12..12
  q: number; // peaks only (shelves ignore Q in Web Audio)
}

export const DEFAULT_EQ_BANDS: EqBand[] = [
  { id: 'b1', type: 'lowshelf', freq: 100, gain: 0, q: 0.7 },
  { id: 'b2', type: 'peak', freq: 400, gain: 0, q: 1 },
  { id: 'b3', type: 'peak', freq: 2500, gain: 0, q: 1 },
  { id: 'b4', type: 'highshelf', freq: 8000, gain: 0, q: 0.7 },
];

export interface FxSettings {
  autotuneEnabled: boolean;
  compressorEnabled: boolean;
  eqEnabled: boolean;
  delayEnabled: boolean;
  reverbEnabled: boolean;
  autotuneKey: string;
  autotuneScale: string;
  autotuneSpeed: number;
  formantShift: number; // in semitones, -12 to 12
  pitchShiftSemitones: number; // in semitones, -12 to 12
  pitchCorrectionEnabled: boolean;
  compression: number;
  doubleEnabled: boolean;
  doubleWidth: number;
  eqBands: EqBand[];
  delayFeedback: number;
  delayTime: number;
  reverbWet: number;
  reverbDecay: number; // 0-100, drives the reverb feedback (tail length)
  micGain: number;
}

export type DeviceId = 'autotune' | 'doubler' | 'compressor' | 'eq' | 'delay' | 'reverb';

export const ALL_DEVICES: DeviceId[] = ['autotune', 'doubler', 'compressor', 'eq', 'delay', 'reverb'];

// Which fxSettings flag each device switches on and off.
export const DEVICE_FLAG: Record<DeviceId, keyof FxSettings> = {
  autotune: 'autotuneEnabled',
  doubler: 'doubleEnabled',
  compressor: 'compressorEnabled',
  eq: 'eqEnabled',
  delay: 'delayEnabled',
  reverb: 'reverbEnabled',
};

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
  // Google Drive backup into her OWN account. "skipped" is a first-class
  // state: Drive is opt-in, so not connecting it is a choice, not a fault.
  driveBackupStatus: "idle" | "uploading" | "success" | "failed" | "skipped";
  // "unavailable" = no VITE_GOOGLE_CLIENT_ID in this build at all.
  driveConnection: "unavailable" | "disconnected" | "connecting" | "connected";
  isMonitoring: boolean;
  fxEnabled: boolean;
  fxSettings: FxSettings;
  transportTimeMs: number; // Project playhead position in ms
  recordingsHistory: RecordingMeta[]; // Every recording ever made this browser, independent of the active session
  mutedTracks: Set<string>;
  soloedTracks: Set<string>;
  // Per-track playback volume, 0..1. Missing keys mean 1 (full volume).
  trackVolumes: Record<string, number>;
  setTrackVolume: (trackId: string, volume: number) => void;
  // Microphone input. The recorder hook fills these in; the UI reads them.
  micDevices: MediaDeviceInfo[];
  selectedMicId: string;
  micReady: boolean;
  setMicDevices: (devices: MediaDeviceInfo[]) => void;
  setSelectedMicId: (deviceId: string) => void;
  setMicReady: (ready: boolean) => void;
  // The track whose device chain the FX rack is showing.
  selectedTrackId: string;
  setSelectedTrackId: (trackId: string) => void;
  setEqBand: (bandId: string, patch: Partial<Omit<EqBand, 'id'>>) => void;
  // Move a clip on the timeline. trackId is a lane id: 'backing', 'active_take' or a layer id.
  setClipStart: (trackId: string, startMs: number) => void;
  // Ordered device chain per track. Adding/removing a device also turns its
  // effect on/off in fxSettings.
  trackDevices: Record<string, DeviceId[]>;
  addDevice: (trackId: string, device: DeviceId) => void;
  removeDevice: (trackId: string, device: DeviceId) => void;

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
  setDriveBackupStatus: (status: SessionState['driveBackupStatus']) => void;
  setDriveConnection: (status: SessionState['driveConnection']) => void;
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
  toggleMuteTrack: (trackId: string) => void;
  toggleSoloTrack: (trackId: string) => void;
}
