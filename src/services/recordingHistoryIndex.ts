import type { RecordingMeta } from '../types';

const STORAGE_KEY = 'sensibleSoundlabs.recordingsHistory';
// Generous cap so ordinary sessions never hit it; prevents unbounded growth
// over many sessions in the same browser.
const MAX_HISTORY = 100;

// Small, synchronous, localStorage-backed list of every recording ever
// made in this browser — the audio itself lives in IndexedDB/Firebase
// (keyed by the same id), this is just the "what exists" index so the
// Recordings panel can list history immediately on load, before any
// blob has been fetched.
export const recordingHistoryIndex = {
  list(): RecordingMeta[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  add(entry: RecordingMeta): RecordingMeta[] {
    const next = [entry, ...recordingHistoryIndex.list()].slice(0, MAX_HISTORY);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      console.error('Could not persist recordings history index — the recording itself is still backed up.', err);
    }
    return next;
  },
};
