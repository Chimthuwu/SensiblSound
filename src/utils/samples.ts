// Built-in sample library. Each sample is synthesised in the browser, so there
// are no audio files to ship or license. Imported files join the same registry.

import { encodeWav } from './audioEncoding';

import analogDrumLoops from '../data/analogDrumLoops.json';

export type SampleCategory = 'Drums' | 'Bass' | 'Synth' | 'FX' | 'Loops' | 'Imported';

// Packs hosted on archive.org. Files are streamed from there; nothing is copied into the repo.
interface RemotePack {
  packId: string;
  title: string;
  creator: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  files: { name: string; url: string }[];
}
export const REMOTE_PACKS: RemotePack[] = [analogDrumLoops as RemotePack];

const remoteUrls = new Map<string, string>();
const remoteInfo: SampleInfo[] = [];
for (const pack of REMOTE_PACKS) {
  for (const f of pack.files) {
    const id = `loop:${pack.packId}:${f.name}`;
    remoteUrls.set(id, f.url);
    remoteInfo.push({ id, name: `${pack.title} · ${f.name}`, category: 'Loops', durationMs: 0 });
  }
}

export interface SampleInfo {
  id: string;
  name: string;
  category: SampleCategory;
  durationMs: number;
  /** Tempo of the sample, when known. Snapped previews need it. */
  bpm?: number;
}

const SR = 44100;

/** Drag-and-drop type carrying a sample id from the browser to the arranger. */
export const SAMPLE_MIME = 'application/x-sample-id';

// Deterministic noise, so a sample sounds the same every time it's rendered.
function noiseGen(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

function render(durSec: number, fn: (t: number, i: number) => number): AudioBuffer {
  const length = Math.max(1, Math.round(durSec * SR));
  const buffer = new AudioBuffer({ length, numberOfChannels: 1, sampleRate: SR });
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.max(-1, Math.min(1, fn(i / SR, i)));
  return buffer;
}

const TWO_PI = Math.PI * 2;

type Gen = { id: string; name: string; category: SampleCategory; dur: number; make: () => AudioBuffer };

const GENERATORS: Gen[] = [
  {
    id: 'kick-808', name: 'Kick 808', category: 'Drums', dur: 0.6,
    make: () => {
      let ph = 0;
      return render(0.6, (t) => {
        const f = 45 + 120 * Math.exp(-t * 30);
        ph += (TWO_PI * f) / SR;
        return Math.sin(ph) * Math.exp(-t * 7) * 0.9;
      });
    },
  },
  {
    id: 'kick-punch', name: 'Kick Punch', category: 'Drums', dur: 0.35,
    make: () => {
      let ph = 0;
      return render(0.35, (t) => {
        const f = 60 + 200 * Math.exp(-t * 60);
        ph += (TWO_PI * f) / SR;
        return Math.tanh(Math.sin(ph) * 2.2) * Math.exp(-t * 12);
      });
    },
  },
  {
    id: 'snare-tight', name: 'Snare Tight', category: 'Drums', dur: 0.3,
    make: () => {
      const n = noiseGen(7);
      return render(0.3, (t) => n() * Math.exp(-t * 18) * 0.5 + Math.sin(TWO_PI * 190 * t) * Math.exp(-t * 25) * 0.6);
    },
  },
  {
    id: 'clap', name: 'Clap', category: 'Drums', dur: 0.3,
    make: () => {
      const n = noiseGen(11);
      return render(0.3, (t) => {
        // Three short bursts, then a longer tail.
        const bursts = [0, 0.011, 0.023].reduce((acc, start) => acc + (t >= start ? Math.exp(-(t - start) * 90) : 0), 0);
        return n() * (bursts * 0.7 + Math.exp(-t * 14) * 0.35);
      });
    },
  },
  {
    id: 'hat-closed', name: 'Hat Closed', category: 'Drums', dur: 0.12,
    make: () => {
      const n = noiseGen(3);
      let prev = 0;
      return render(0.12, (t) => {
        const x = n();
        const hp = x - prev;
        prev = x;
        return hp * Math.exp(-t * 60) * 0.5;
      });
    },
  },
  {
    id: 'hat-open', name: 'Hat Open', category: 'Drums', dur: 0.5,
    make: () => {
      const n = noiseGen(5);
      let prev = 0;
      return render(0.5, (t) => {
        const x = n();
        const hp = x - prev;
        prev = x;
        return hp * Math.exp(-t * 8) * 0.45;
      });
    },
  },
  {
    id: 'bass-pluck', name: 'Bass Pluck A1', category: 'Bass', dur: 0.8,
    make: () => {
      const f = 55;
      return render(0.8, (t) => {
        let v = 0;
        for (let k = 1; k <= 8; k++) v += Math.sin(TWO_PI * f * k * t) / k;
        return v * Math.exp(-t * 4) * 0.6;
      });
    },
  },
  {
    id: 'sub-sine', name: 'Sub Sine 50 Hz', category: 'Bass', dur: 1,
    make: () => render(1, (t) => Math.sin(TWO_PI * 50 * t) * Math.min(1, t * 20) * Math.exp(-t * 1.5) * 0.8),
  },
  {
    id: 'pad-warm', name: 'Pad Warm A', category: 'Synth', dur: 2.5,
    make: () =>
      render(2.5, (t) => {
        const env = Math.min(1, t * 1.5) * Math.min(1, (2.5 - t) * 2);
        const v =
          Math.sin(TWO_PI * 220 * t) +
          Math.sin(TWO_PI * 220.7 * t) * 0.8 +
          Math.sin(TWO_PI * 329.6 * t) * 0.5;
        return (v / 2.3) * env * 0.5;
      }),
  },
  {
    id: 'lead-blip', name: 'Lead Blip', category: 'Synth', dur: 0.4,
    make: () =>
      render(0.4, (t) => {
        const sq = Math.sign(Math.sin(TWO_PI * 660 * t));
        return sq * Math.exp(-t * 9) * 0.35;
      }),
  },
  {
    id: 'riser', name: 'Riser', category: 'FX', dur: 2,
    make: () => {
      const n = noiseGen(9);
      let lp = 0;
      return render(2, (t) => {
        lp += (n() - lp) * (0.02 + t * 0.05);
        return lp * (t / 2) * 1.6;
      });
    },
  },
  {
    id: 'impact', name: 'Impact', category: 'FX', dur: 1.5,
    make: () => {
      const n = noiseGen(13);
      return render(1.5, (t) => (n() * 0.5 + Math.sin(TWO_PI * 48 * t) * 0.8) * Math.exp(-t * 3.5) * 0.9);
    },
  },
];

export const SAMPLE_LIBRARY: SampleInfo[] = GENERATORS.map((g) => ({
  id: g.id,
  name: g.name,
  category: g.category,
  durationMs: g.dur * 1000,
}));

/** Archive.org loops, listed from the pack manifest. Duration is unknown until loaded (0). */
export const REMOTE_SAMPLES: SampleInfo[] = remoteInfo;

/**
 * A URL the browser can play straight away. Archive loops stream from archive.org;
 * everything else is rendered to a blob first.
 */
export async function getSampleUrl(id: string): Promise<string> {
  const remote = remoteUrls.get(id);
  if (remote) return remote;
  return URL.createObjectURL(await getSampleBlob(id));
}

const blobCache = new Map<string, Promise<Blob>>();
const imported = new Map<string, { info: SampleInfo; blob: Blob }>();

/** Adds a user's audio file to the browser for this session. Returns its id. */
export function registerImportedSample(file: File, durationMs: number): SampleInfo {
  const id = `import-${crypto.randomUUID()}`;
  const info: SampleInfo = { id, name: file.name, category: 'Imported', durationMs };
  imported.set(id, { info, blob: file });
  return info;
}

export function importedSamples(): SampleInfo[] {
  return [...imported.values()].map((v) => v.info);
}

/** The sample as a WAV blob. Built-ins are rendered once and cached. */
export function getSampleBlob(id: string): Promise<Blob> {
  const cached = blobCache.get(id);
  if (cached) return cached;
  const imp = imported.get(id);
  if (imp) return Promise.resolve(imp.blob);
  const remote = remoteUrls.get(id);
  if (remote) {
    // Fetched once when first dragged or inserted; previews stream instead.
    const pending = fetch(remote).then((r) => {
      if (!r.ok) throw new Error(`Download failed (${r.status})`);
      return r.blob();
    });
    blobCache.set(id, pending);
    pending.catch(() => blobCache.delete(id));
    return pending;
  }
  const gen = GENERATORS.find((g) => g.id === id);
  if (!gen) return Promise.reject(new Error(`Unknown sample ${id}`));
  const pending = Promise.resolve(encodeWav(gen.make()));
  blobCache.set(id, pending);
  return pending;
}

/** A clip ready for addTrack / setTrackClip. */
export async function sampleClip(id: string): Promise<{ name: string; url: string; blob: Blob }> {
  const info =
    SAMPLE_LIBRARY.find((s) => s.id === id) ??
    REMOTE_SAMPLES.find((s) => s.id === id) ??
    imported.get(id)?.info;
  const blob = await getSampleBlob(id);
  return { name: info?.name ?? 'Sample', url: URL.createObjectURL(blob), blob };
}
