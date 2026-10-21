import { create } from 'zustand';
import type { SessionState, TrackGroup } from '../types';
import { recordingHistoryIndex } from '../services/recordingHistoryIndex';
import { isDriveConfigured } from '../lib/googleDrive';

const GROUP_COLORS = ['#a855f7', '#22d3ee', '#f59e0b', '#34d399', '#f472b6'];

// A group needs at least two members to mean anything.
const pruneGroups = (groups: TrackGroup[]) => groups.filter((g) => g.trackIds.length >= 2);

// Grouped tracks act as one: expand an id to its whole group.
const withGroupMates = (groups: TrackGroup[], id: string) =>
  groups.find((g) => g.trackIds.includes(id))?.trackIds ?? [id];

let groupCounter = 0;

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
  selectedTracks: new Set(),
  trackHeights: {},
  groups: [],
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
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
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
    layers: state.layers.filter((layer) => layer.id !== id),
    selectedTracks: new Set([...state.selectedTracks].filter((t) => t !== id)),
    groups: pruneGroups(state.groups.map((g) => ({ ...g, trackIds: g.trackIds.filter((t) => t !== id) }))),
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
    const turnOn = !newMuted.has(trackId);
    withGroupMates(state.groups, trackId).forEach((t) => (turnOn ? newMuted.add(t) : newMuted.delete(t)));
    return { mutedTracks: newMuted };
  }),

  toggleSoloTrack: (trackId) => set((state) => {
    const newSoloed = new Set(state.soloedTracks);
    const turnOn = !newSoloed.has(trackId);
    withGroupMates(state.groups, trackId).forEach((t) => (turnOn ? newSoloed.add(t) : newSoloed.delete(t)));
    return { soloedTracks: newSoloed };
  }),

  selectTrack: (trackId, additive) => set((state) => {
    const mates = withGroupMates(state.groups, trackId);
    if (!additive) return { selectedTracks: new Set(mates) };
    const next = new Set(state.selectedTracks);
    const turnOn = !next.has(trackId);
    mates.forEach((t) => (turnOn ? next.add(t) : next.delete(t)));
    return { selectedTracks: next };
  }),

  selectAllTracks: (trackIds) => set({ selectedTracks: new Set(trackIds) }),

  clearSelection: () => set((state) => (state.selectedTracks.size ? { selectedTracks: new Set() } : {})),

  setTrackHeights: (trackIds, height) => set((state) => {
    const trackHeights = { ...state.trackHeights };
    trackIds.forEach((t) => { trackHeights[t] = height; });
    return { trackHeights };
  }),

  groupSelected: () => set((state) => {
    const members = [...state.selectedTracks];
    if (members.length < 2) return {};
    const rest = state.groups.map((g) => ({ ...g, trackIds: g.trackIds.filter((t) => !state.selectedTracks.has(t)) }));
    groupCounter += 1;
    const group: TrackGroup = {
      id: crypto.randomUUID(),
      name: `Group ${groupCounter}`,
      color: GROUP_COLORS[(groupCounter - 1) % GROUP_COLORS.length],
      trackIds: members,
    };
    return { groups: [...pruneGroups(rest), group] };
  }),

  ungroupSelected: () => set((state) => ({
    groups: state.groups.filter((g) => !g.trackIds.some((t) => state.selectedTracks.has(t))),
  })),
}));
