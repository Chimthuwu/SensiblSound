import { create } from 'zustand';
import { DEFAULT_EQ_BANDS, DEVICE_FLAG, makeDeviceInstance, type ExtraTrack, type SessionState } from '../types';
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
  micDevices: [],
  selectedMicId: '',
  micReady: false,
  setMicDevices: (micDevices) => set({ micDevices }),
  setSelectedMicId: (selectedMicId) => set({ selectedMicId }),
  setMicReady: (micReady) => set({ micReady }),
  selectedTrackId: 'active_take',
  // Every track starts with an empty device chain.
  trackDevices: {},
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

  selectedClip: null,
  setSelectedClip: (selectedClip) => set({ selectedClip }),
  replaceClipAudio: (laneId, audio) => set((state) => {
    if (laneId === 'backing' && state.backingTrack) {
      return { backingTrack: { ...state.backingTrack, url: audio.url, blob: audio.blob, durationMs: audio.durationMs } };
    }
    if (laneId === 'active_take' && state.activeTake) {
      return { activeTake: { ...state.activeTake, url: audio.url, blob: audio.blob, durationMs: audio.durationMs, downloaded: false } };
    }
    if (state.layers.some((l) => l.id === laneId)) {
      return { layers: state.layers.map((l) => (l.id === laneId ? { ...l, url: audio.url, blob: audio.blob, durationMs: audio.durationMs, downloaded: false } : l)) };
    }
    return {
      extraTracks: state.extraTracks.map((t) =>
        t.id === laneId && t.clip ? { ...t, clip: { ...t.clip, url: audio.url, blob: audio.blob, durationMs: audio.durationMs } } : t,
      ),
    };
  }),
  armedTrackId: 'active_take',
  setArmedTrackId: (armedTrackId) => set({ armedTrackId }),
  trackPans: {},
  setTrackPan: (trackId, pan) => set((state) => ({
    trackPans: { ...state.trackPans, [trackId]: Math.max(-1, Math.min(1, pan)) },
  })),

  setClipStart: (trackId, startMs) => set((state) => {
    const ms = Math.max(0, Math.round(startMs));
    if (trackId === 'backing') {
      return state.backingTrack
        ? { backingTrack: { ...state.backingTrack, startMs: ms } }
        : {};
    }
    if (trackId === 'active_take') {
      return state.activeTake
        ? { activeTake: { ...state.activeTake, transportStartMs: ms } }
        : {};
    }
    const layer = state.layers.find((l) => l.id === trackId);
    if (layer) {
      return {
        layers: state.layers.map((l) => (l.id === trackId ? { ...l, transportStartMs: ms } : l)),
      };
    }
    const track = state.extraTracks.find((t) => t.id === trackId);
    if (track?.clip) {
      return {
        extraTracks: state.extraTracks.map((t) =>
          t.id === trackId && t.clip ? { ...t, clip: { ...t.clip, startMs: ms } } : t,
        ),
      };
    }
    return {};
  }),

  extraTracks: [],

  removeExtraTrack: (trackId) => set((state) => {
    if (!state.extraTracks.some((t) => t.id === trackId)) return {};
    const { [trackId]: _removed, ...restDevices } = state.trackDevices;
    return {
      extraTracks: state.extraTracks.filter((t) => t.id !== trackId),
      trackDevices: restDevices,
      selectedTrackId: state.selectedTrackId === trackId ? 'active_take' : state.selectedTrackId,
    };
  }),

  // Empties a lane's clip. Backing, take and layer clips go away; an extra track keeps its (now empty) lane.
  clearClip: (trackId) => set((state) => {
    if (trackId === 'backing') return { backingTrack: undefined };
    if (trackId === 'active_take') return { activeTake: undefined };
    if (state.layers.some((l) => l.id === trackId)) {
      return { layers: state.layers.filter((l) => l.id !== trackId) };
    }
    return {
      extraTracks: state.extraTracks.map((t) => (t.id === trackId ? { ...t, clip: undefined } : t)),
    };
  }),

  clipboard: null,
  copyClip: (clip) => set({ clipboard: clip }),

  addTrack: (clip) => {
    const id = `track-${crypto.randomUUID()}`;
    set((state) => {
      // Tracks 1 and 2 are the built-in lanes, so new tracks start at 3.
      const name = `Track ${state.extraTracks.length + 3}`;
      const track: ExtraTrack = clip
        ? { id, name, clip: { id: crypto.randomUUID(), ...clip, startMs: 0 } }
        : { id, name };
      return {
        extraTracks: [...state.extraTracks, track],
        trackDevices: { ...state.trackDevices, [id]: [] },
      };
    });
    return id;
  },

  // Replaces whatever the track holds; a new recording lands here when the track is armed.
  setTrackClip: (trackId, clip) => set((state) => ({
    extraTracks: state.extraTracks.map((t) =>
      t.id === trackId
        ? { ...t, clip: { id: crypto.randomUUID(), ...clip, startMs: 0 } }
        : t,
    ),
  })),

  setExtraTrackDuration: (trackId, durationMs) => set((state) => ({
    extraTracks: state.extraTracks.map((t) =>
      t.id === trackId && t.clip && t.clip.durationMs !== durationMs
        ? { ...t, clip: { ...t.clip, durationMs } }
        : t,
    ),
  })),

  reorderDevice: (trackId, from, to) => set((state) => {
    const chain = state.trackDevices[trackId] ?? [];
    if (from === to || from < 0 || from >= chain.length) return {};
    const next = [...chain];
    const [moved] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(next.length, to)), 0, moved);
    return { trackDevices: { ...state.trackDevices, [trackId]: next } };
  }),

  setEqBand: (bandId, patch) => set((state) => ({
    fxSettings: {
      ...state.fxSettings,
      eqBands: state.fxSettings.eqBands.map((b) => (b.id === bandId ? { ...b, ...patch } : b)),
    },
  })),

  // Each call adds a new instance, so the same device can appear more than once.
  addDevice: (trackId, device) => set((state) => {
    const chain = state.trackDevices[trackId] ?? [];
    return {
      trackDevices: { ...state.trackDevices, [trackId]: [...chain, makeDeviceInstance(device)] },
      fxSettings: { ...state.fxSettings, [DEVICE_FLAG[device]]: true },
    };
  }),

  removeDevice: (trackId, uid) => set((state) => {
    const chain = state.trackDevices[trackId] ?? [];
    const removed = chain.find((d) => d.uid === uid);
    if (!removed) return {};
    const nextChain = chain.filter((d) => d.uid !== uid);
    // The effect stays on while any track still has an instance of it.
    const stillUsed = Object.entries(state.trackDevices).some(
      ([id, list]) => (id === trackId ? nextChain : list).some((d) => d.type === removed.type),
    );
    return {
      trackDevices: { ...state.trackDevices, [trackId]: nextChain },
      fxSettings: stillUsed
        ? state.fxSettings
        : { ...state.fxSettings, [DEVICE_FLAG[removed.type]]: false },
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
