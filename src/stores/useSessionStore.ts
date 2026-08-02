import { create } from 'zustand';
import type { SessionState } from '../types';

export const useSessionStore = create<SessionState>((set) => ({
  bpm: 120,
  backingTrack: {
    id: 'default-backing-track',
    name: 'example.mp3',
    url: '/example.mp3'
  },
  activeTake: undefined,
  layers: [],
  isRecording: false,
  isPlaying: false,
  isMetronomeEnabled: false,
  metronomeVolume: 0.5,
  backupStatus: 'idle',
  isMonitoring: true,
  fxEnabled: true,
  transportTimeMs: 0,
  fxSettings: {
    autotuneEnabled: true,
    compressorEnabled: true,
    eqEnabled: true,
    delayEnabled: true,
    reverbEnabled: true,
    autotuneKey: 'C',
    autotuneScale: 'Major',
    autotuneSpeed: 50,
    compression: 40,
    doubleEnabled: false,
    doubleWidth: 70,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
    delayFeedback: 30,
    delayTime: 0.35,
    reverbWet: 25,
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
}));
