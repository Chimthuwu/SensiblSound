import { create } from 'zustand';
import { ALL_DEVICES, DEFAULT_EQ_BANDS, DEVICE_FLAG, type SessionState } from '../types';
import { recordingHistoryIndex } from '../services/recordingHistoryIndex';
import { isDriveConfigured } from '../lib/googleDrive';

export const useSessionStore = create<SessionState>((set) => ({
  bpm: 120,
  backingTrack: undefined,
  activeTake: undefined,
  layers: [],
  isRecording: false,
  isPlaying: false,
  isMetronomeEnabled: false,
  metronomeVolume: 0.5,
  backupStatus: 'idle',
  cloudBackupStatus: 'idle',
  driveBackupStatus: 'idle',
  // Seeded from whether this build has a client id at all, so the UI can
  // hide the Drive controls entirely rather than offering a button that
  // could only ever fail.
  driveConnection: isDriveConfigured ? 'disconnected' : 'unavailable',
  isMonitoring: true,
  fxEnabled: false,
  transportTimeMs: 0,
  // Seeded synchronously from localStorage on store creation — this is
  // what makes recordings recoverable after a refresh even though
  // activeTake/layers themselves reset to empty.
  recordingsHistory: recordingHistoryIndex.list(),
  mutedTracks: new Set(),
  soloedTracks: new Set(),
  trackVolumes: {},
  selectedTrackId: 'active_take',
  trackDevices: { active_take: ALL_DEVICES },
  fxSettings: {
    autotuneEnabled: false,
    compressorEnabled: false,
    eqEnabled: false,
    delayEnabled: false,
    reverbEnabled: false,
    autotuneKey: 'C',
    autotuneScale: 'Major',
    autotuneSpeed: 50,
    formantShift: 0,
    pitchShiftSemitones: 0,
    pitchCorrectionEnabled: false,
    compression: 40,
    doubleEnabled: false,
    doubleWidth: 70,
    eqBands: DEFAULT_EQ_BANDS,
    delayFeedback: 30,
    delayTime: 0.3,
    reverbWet: 40,
    reverbDecay: 50,
    micGain: 100,
  },

  setBpm: (bpm) => set({ bpm }),
  
  setBackingTrack: (file) => set({ backingTrack: file }),
  
  setActiveTake: (take) => set({ activeTake: take }),
  
  addLayer: (layer) => set((state) => ({
    // Keep a maximum of 5 layers
    layers: [...state.layers, layer].slice(-5)
  })),
  
  removeLayer: (id) => set((state) => ({
    layers: state.layers.filter((layer) => layer.id !== id)
  })),
  
  clearLayers: () => set({ layers: [] }),
  
  setIsRecording: (isRecording) => set({ isRecording }),
  
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  
  setIsMetronomeEnabled: (isMetronomeEnabled) => set({ isMetronomeEnabled }),
  
  setMetronomeVolume: (metronomeVolume) => set({ metronomeVolume }),
  
  setBackupStatus: (backupStatus) => set({ backupStatus }),

  setCloudBackupStatus: (cloudBackupStatus) => set({ cloudBackupStatus }),

  setDriveBackupStatus: (driveBackupStatus) => set({ driveBackupStatus }),

  setDriveConnection: (driveConnection) => set({ driveConnection }),

  setIsMonitoring: (isMonitoring) => set({ isMonitoring }),

  setFxEnabled: (fxEnabled) => set({ fxEnabled }),

  setFxSettings: (settings) => set((state) => ({
    fxSettings: { ...state.fxSettings, ...settings }
  })),

  setTransportTimeMs: (ms) => set({ transportTimeMs: Math.max(0, Math.round(ms)) }),

  rewindTransport: () => set({ transportTimeMs: 0 }),

  // These three no-op when the duration hasn't actually changed. Without
  // that guard, a component effect depending on the parent object (e.g.
  // `activeTake`) would loop forever: set duration -> new object reference
  // -> effect deps changed -> effect fires -> set duration -> ...
  setBackingTrackDurationMs: (ms) => set((state) => (
    state.backingTrack && state.backingTrack.durationMs !== ms
      ? { backingTrack: { ...state.backingTrack, durationMs: ms } }
      : {}
  )),

  setActiveTakeDurationMs: (ms) => set((state) => (
    state.activeTake && state.activeTake.durationMs !== ms
      ? { activeTake: { ...state.activeTake, durationMs: ms } }
      : {}
  )),

  setLayerDurationMs: (id, ms) => set((state) => {
    const layer = state.layers.find((l) => l.id === id);
    if (!layer || layer.durationMs === ms) return {};
    return { layers: state.layers.map((l) => l.id === id ? { ...l, durationMs: ms } : l) };
  }),

  markActiveTakeDownloaded: () => set((state) => (
    state.activeTake && !state.activeTake.downloaded
      ? { activeTake: { ...state.activeTake, downloaded: true } }
      : {}
  )),

  markLayerDownloaded: (id) => set((state) => {
    const layer = state.layers.find((l) => l.id === id);
    if (!layer || layer.downloaded) return {};
    return { layers: state.layers.map((l) => l.id === id ? { ...l, downloaded: true } : l) };
  }),

  addRecordingHistoryEntry: (entry) => set({
    recordingsHistory: recordingHistoryIndex.add(entry)
  }),

  toggleMuteTrack: (trackId) => set((state) => {
    const newMuted = new Set(state.mutedTracks);
    if (newMuted.has(trackId)) {
      newMuted.delete(trackId);
    } else {
      newMuted.add(trackId);
    }
    return { mutedTracks: newMuted };
  }),

  setTrackVolume: (trackId, volume) => set((state) => ({
    trackVolumes: { ...state.trackVolumes, [trackId]: Math.max(0, Math.min(1, volume)) },
  })),

  setSelectedTrackId: (trackId) => set({ selectedTrackId: trackId }),

  setEqBand: (bandId, patch) => set((state) => ({
    fxSettings: {
      ...state.fxSettings,
      eqBands: state.fxSettings.eqBands.map((b) => (b.id === bandId ? { ...b, ...patch } : b)),
    },
  })),

  addDevice: (trackId, device) => set((state) => {
    const chain = state.trackDevices[trackId] ?? [];
    if (chain.includes(device)) return {};
    return {
      trackDevices: { ...state.trackDevices, [trackId]: [...chain, device] },
      fxSettings: { ...state.fxSettings, [DEVICE_FLAG[device]]: true },
    };
  }),

  removeDevice: (trackId, device) => set((state) => {
    const chain = state.trackDevices[trackId] ?? [];
    if (!chain.includes(device)) return {};
    return {
      trackDevices: { ...state.trackDevices, [trackId]: chain.filter((d) => d !== device) },
      fxSettings: { ...state.fxSettings, [DEVICE_FLAG[device]]: false },
    };
  }),

  toggleSoloTrack: (trackId) => set((state) => {
    const newSoloed = new Set(state.soloedTracks);
    if (newSoloed.has(trackId)) {
      newSoloed.delete(trackId);
    } else {
      newSoloed.add(trackId);
    }
    return { soloedTracks: newSoloed };
  }),
}));
