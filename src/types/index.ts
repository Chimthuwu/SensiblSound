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

export interface ExtraTrack {
  id: string;
  name: string;
  clip?: {
    id: string;
    name: string;
    url: string;
    blob?: Blob;
    durationMs?: number;
    startMs: number;
  };
}

// 'synth' and 'drums' are instruments: a MIDI clip only makes sound when its track's rack holds one.
export type DeviceId = 'autotune' | 'doubler' | 'compressor' | 'eq' | 'delay' | 'reverb' | 'synth' | 'drums';

export const ALL_DEVICES: DeviceId[] = ['autotune', 'doubler', 'compressor', 'eq', 'delay', 'reverb', 'synth', 'drums'];

export const INSTRUMENT_DEVICES: DeviceId[] = ['synth', 'drums'];
export const isInstrumentDevice = (d: DeviceId) => d === 'synth' || d === 'drums';

// One device placed on a track's chain. The same type can appear several times, each with its own uid.
export interface DeviceInstance {
  uid: string;
  type: DeviceId;
}

export function makeDeviceInstance(type: DeviceId): DeviceInstance {
  return { uid: crypto.randomUUID(), type };
}

// Which fxSettings flag each device switches on and off.
export const DEVICE_FLAG: Partial<Record<DeviceId, keyof FxSettings>> = {
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
  // The clip the keyboard acts on (Delete, Backspace, Ctrl+C/X/V/B).
  selectedClip: { laneId: string; clipId: string } | null;
  setSelectedClip: (clip: { laneId: string; clipId: string } | null) => void;
  // New audio for an existing clip (after reverse or length change). Keeps the clip's place on the timeline.
  replaceClipAudio: (laneId: string, audio: { url: string; blob: Blob; durationMs: number }) => void;
  // The track the record button writes to: 'backing', 'active_take' or an extra track id.
  armedTrackId: string;
  setArmedTrackId: (trackId: string) => void;
  // Per-track stereo pan, -1 (left) to 1 (right). Missing keys mean 0 (centre).
  trackPans: Record<string, number>;
  setTrackPan: (trackId: string, pan: number) => void;
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
  // Move a clip on the timeline. trackId is a lane id: 'backing', 'active_take', a layer id or an extra track id.
  setClipStart: (trackId: string, startMs: number) => void;
  // Audio tracks the user added (+ Track, or dropped audio). Each holds at most one clip for now.
  extraTracks: ExtraTrack[];
  addTrack: (clip?: { name: string; url: string; blob?: Blob }) => string;
  setTrackClip: (trackId: string, clip: { name: string; url: string; blob?: Blob }) => void;
  setExtraTrackDuration: (trackId: string, durationMs: number) => void;
  reorderDevice: (trackId: string, from: number, to: number) => void;
  removeExtraTrack: (trackId: string) => void;
  clearClip: (trackId: string) => void;
  // Copied clip, pasted as a new track. Plain data: no playback state.
  clipboard: { name: string; url: string; blob?: Blob; durationMs?: number } | null;
  copyClip: (clip: { name: string; url: string; blob?: Blob; durationMs?: number } | null) => void;
  // Ordered device chain per track. Adding/removing a device also turns its
  // effect on/off in fxSettings.
  trackDevices: Record<string, DeviceInstance[]>;
  addDevice: (trackId: string, device: DeviceId) => void;
  removeDevice: (trackId: string, uid: string) => void;

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
  // Disabled tracks are silent and dimmed; they can't be armed.
  disabledTracks: Set<string>;
  toggleDisabledTrack: (trackId: string) => void;
  // Display order of the tracks, top to bottom. Tracks missing from it keep their default place.
  trackOrder: string[];
  setTrackOrder: (ids: string[]) => void;
  toggleSoloTrack: (trackId: string) => void;

  // Centre panel: the arrangement or the mixer.
  viewMode: 'arrange' | 'mixer';
  setViewMode: (m: 'arrange' | 'mixer') => void;
  /** Master fader, 0..1 (1 = 0 dB). */
  masterVolume: number;
  setMasterVolume: (v: number) => void;

  // External MIDI controllers (Web MIDI).
  midiStatus: 'idle' | 'ready' | 'denied' | 'unsupported';
  setMidiStatus: (s: SessionState['midiStatus']) => void;
  midiInputs: { id: string; name: string }[];
  setMidiInputs: (inputs: { id: string; name: string }[]) => void;
  /** 'all' listens to every connected controller. */
  midiInputId: string;
  setMidiInputId: (id: string) => void;
  /** Ticks on incoming notes; drives the activity light. */
  midiActivity: number;
  bumpMidiActivity: () => void;

  // Auto-warp: audio that drops in is snapped and stretched to the project tempo while this is on.
  autoWarp: boolean;
  setAutoWarp: (on: boolean) => void;
  /** "Don't ask me again" on the warp prompt. */
  warpPromptDisabled: boolean;
  setWarpPromptDisabled: (off: boolean) => void;
  /** Set while the warp prompt is open for a freshly added clip. */
  warpPrompt: { laneId: string; name: string } | null;
  setWarpPrompt: (p: { laneId: string; name: string } | null) => void;
  warpBusy: number;
  setWarpBusy: (delta: number) => void;
  toast: { id: number; text: string } | null;
  showToast: (text: string) => void;

  // MIDI: clips can sit on any lane; each lane has one instrument they play through.
  midiClips: MidiClip[];
  instruments: Record<string, Instrument>;
  /** Adds a MIDI clip to a lane. It stays silent until the lane's rack has an instrument. Returns the clip id. */
  addMidiClip: (laneId: string, opts?: { startMs?: number; bars?: number }) => string;
  /** New track with an instrument in its rack and an empty MIDI clip. Returns the lane id. */
  addMidiTrack: (kind: MidiKind, preset?: string) => string;
  removeMidiClip: (clipId: string) => void;
  updateMidiClip: (clipId: string, patch: Partial<Omit<MidiClip, 'id' | 'laneId'>>) => void;
  setMidiNotes: (clipId: string, notes: MidiNote[]) => void;
  setInstrument: (laneId: string, patch: Partial<Instrument>) => void;
}

// ---------------------------------------------------------------- MIDI tracks
export interface MidiNote {
  id: string;
  /** MIDI pitch 0..127. Drum tracks use 36..43 for the eight pads. */
  pitch: number;
  /** Beats from the start of the clip. */
  startBeat: number;
  lenBeats: number;
  /** 0..1 */
  vel: number;
}

export type SynthWave = 'sine' | 'triangle' | 'sawtooth' | 'square';

// A small subtractive + FM synth: two oscillators, optional FM modulator, low-pass filter, amp envelope.
export interface SynthParams {
  wave: SynthWave;
  wave2: SynthWave;
  /** Oscillator 2 detune in cents. */
  detune: number;
  /** Oscillator 2 level 0..1. */
  mix2: number;
  /** FM depth 0..1 (0 = off). */
  fm: number;
  /** FM modulator frequency as a multiple of the note. */
  fmRatio: number;
  cutoff: number; // Hz
  resonance: number; // Q 0.1..18
  /** How far the filter envelope opens the cutoff, in octaves. */
  filterEnv: number;
  attack: number; // seconds
  decay: number;
  sustain: number; // 0..1
  release: number;
  volume: number; // 0..1
}

export interface DrumParams {
  /** Pitch of the whole kit in semitones, -12..12. */
  tune: number;
  /** Decay scale, 0.4..2. */
  decay: number;
  volume: number;
}

export const DRUM_PADS = [
  { pitch: 36, id: 'kick', name: 'Kick' },
  { pitch: 37, id: 'snare', name: 'Snare' },
  { pitch: 38, id: 'clap', name: 'Clap' },
  { pitch: 39, id: 'hatC', name: 'Hat' },
  { pitch: 40, id: 'hatO', name: 'Open Hat' },
  { pitch: 41, id: 'tomL', name: 'Tom Lo' },
  { pitch: 42, id: 'tomH', name: 'Tom Hi' },
  { pitch: 43, id: 'crash', name: 'Crash' },
] as const;

export type MidiKind = 'synth' | 'drums';

// A MIDI clip lives on any lane (audio track or not), so every track is a hybrid: audio clips and MIDI clips side by side.
export interface MidiClip {
  id: string;
  laneId: string;
  startMs: number;
  /** Clip length in bars (4/4). */
  bars: number;
  notes: MidiNote[];
}

// Settings for the instrument devices on a lane's rack. Which one plays is decided by the rack ('synth' or 'drums').
export interface Instrument {
  synth: SynthParams;
  drums: DrumParams;
}

export const DEFAULT_SYNTH: SynthParams = {
  wave: 'sawtooth', wave2: 'square', detune: 7, mix2: 0.5, fm: 0, fmRatio: 2,
  cutoff: 2400, resonance: 3, filterEnv: 1.5, attack: 0.01, decay: 0.25, sustain: 0.55, release: 0.25, volume: 0.7,
};

export const DEFAULT_DRUMS: DrumParams = { tune: 0, decay: 1, volume: 0.9 };

export const SYNTH_PRESETS: Record<string, SynthParams> = {
  'Psyde Pluck': { ...DEFAULT_SYNTH, wave: 'sawtooth', wave2: 'triangle', fm: 0.25, fmRatio: 3, cutoff: 1800, filterEnv: 2.2, attack: 0.003, decay: 0.18, sustain: 0.15, release: 0.2 },
  'Warm Pad': { ...DEFAULT_SYNTH, wave: 'sawtooth', wave2: 'sawtooth', detune: 12, mix2: 0.8, cutoff: 1100, filterEnv: 0.6, attack: 0.5, decay: 0.6, sustain: 0.8, release: 1.1 },
  'Sub Bass': { ...DEFAULT_SYNTH, wave: 'sine', wave2: 'square', detune: 0, mix2: 0.25, cutoff: 700, resonance: 1.2, filterEnv: 1, attack: 0.005, decay: 0.2, sustain: 0.8, release: 0.12 },
  'Bright Lead': { ...DEFAULT_SYNTH, wave: 'square', wave2: 'sawtooth', detune: 9, mix2: 0.6, cutoff: 3800, resonance: 5, filterEnv: 1.2, attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.25 },
  'FM Bell': { ...DEFAULT_SYNTH, wave: 'sine', wave2: 'sine', detune: 3, mix2: 0.3, fm: 0.55, fmRatio: 3.5, cutoff: 8000, resonance: 0.7, filterEnv: 0, attack: 0.002, decay: 0.9, sustain: 0.05, release: 1.2 },
};
