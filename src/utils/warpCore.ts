// Auto-warp core: finds transients, fits a beat grid, snaps the transients to the project grid
// and time-stretches the audio between them (pitch stays put). Pure functions on Float32Arrays,
// so it can be tested without a browser.

export interface Onset {
  /** Seconds. */
  t: number;
  /** Relative strength, 0..1. */
  s: number;
}

export interface WarpMarker {
  /** Where the transient sits in the source, seconds. */
  src: number;
  /** Where it lands after warping, seconds. */
  dst: number;
}

export interface WarpPlan {
  sourceBpm: number;
  markers: WarpMarker[];
  /** Length of the warped audio in seconds. */
  outSeconds: number;
  /** 0..1: how well the audio fits a steady grid. Low means "not really rhythmic". */
  confidence: number;
}

/** Smallest peak novelty (log-energy jump) that counts as a real hit. */
const MIN_PEAK = 0.6;
const HOP = 512;
const FRAME = 1024;

/** Transient detection: spectral-flux-like novelty from a pre-emphasised, log-compressed energy envelope. */
export function detectOnsets(mono: Float32Array, sampleRate: number): { onsets: Onset[]; novelty: Float32Array; hopSeconds: number; peak: number } {
  const frames = Math.max(0, Math.floor((mono.length - FRAME) / HOP));
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const base = f * HOP;
    for (let i = 1; i < FRAME; i++) {
      const d = mono[base + i] - 0.97 * mono[base + i - 1]; // pre-emphasis: favours the click of a hit over the body
      sum += d * d;
    }
    energy[f] = Math.log1p(200 * Math.sqrt(sum / FRAME));
  }
  const novelty = new Float32Array(frames);
  for (let f = 1; f < frames; f++) novelty[f] = Math.max(0, energy[f] - energy[f - 1]);

  // Adaptive threshold: a hit must stand out from its local surroundings.
  const half = 21;
  const picks: Onset[] = [];
  let maxN = 1e-9;
  for (let f = 0; f < frames; f++) maxN = Math.max(maxN, novelty[f]);
  const minGap = Math.round(0.07 / (HOP / sampleRate));
  let last = -minGap;
  for (let f = 2; f < frames - 2; f++) {
    const v = novelty[f];
    if (v < novelty[f - 1] || v <= novelty[f + 1] || v < 0.08 * maxN) continue;
    let mean = 0, n = 0;
    for (let k = Math.max(0, f - half); k <= Math.min(frames - 1, f + half); k++) { mean += novelty[k]; n++; }
    mean /= n;
    if (v < mean * 1.6 + 0.02 * maxN) continue;
    if (f - last < minGap) {
      // Too close to the previous hit: keep the stronger of the two.
      const prev = picks[picks.length - 1];
      if (prev && v > prev.s * maxN) { prev.t = (f * HOP + FRAME * 0.25) / sampleRate; prev.s = v / maxN; last = f; }
      continue;
    }
    picks.push({ t: (f * HOP + FRAME * 0.25) / sampleRate, s: v / maxN });
    last = f;
  }
  return { onsets: picks, novelty, hopSeconds: HOP / sampleRate, peak: maxN };
}

/** Tempo by autocorrelation of the novelty curve, folded to the octave closest to the project tempo. */
export function estimateTempo(novelty: Float32Array, hopSeconds: number, projectBpm: number): number {
  const minLag = Math.floor(60 / 200 / hopSeconds);
  const maxLag = Math.ceil(60 / 60 / hopSeconds);
  let bestLag = minLag, best = -Infinity;
  const n = novelty.length;
  for (let lag = minLag; lag <= Math.min(maxLag, n - 2); lag++) {
    let acc = 0;
    for (let i = lag; i < n; i++) acc += novelty[i] * novelty[i - lag];
    acc /= n - lag;
    // Gentle prior towards musical tempos near the project's, so 60 and 120 don't tie.
    const bpm = 60 / (lag * hopSeconds);
    const prior = Math.exp(-Math.pow(Math.log2(bpm / projectBpm), 2) / 1.2);
    const score = acc * (0.6 + 0.4 * prior);
    if (score > best) { best = score; bestLag = lag; }
  }
  let bpm = 60 / (bestLag * hopSeconds);
  while (bpm / projectBpm > 1.45) bpm /= 2;
  while (bpm / projectBpm < 0.7) bpm *= 2;
  return bpm;
}

/** Fits tempo and phase of a sixteenth-note grid to the onsets. */
export function fitGrid(onsets: Onset[], bpm0: number): { bpm: number; phase: number; confidence: number } {
  if (onsets.length < 3) return { bpm: bpm0, phase: onsets[0]?.t ?? 0, confidence: 0 };
  const totalStrength = onsets.reduce((a, o) => a + o.s, 0);
  let best = { bpm: bpm0, phase: 0, score: -1 };
  for (let k = -16; k <= 16; k++) {
    const bpm = bpm0 * (1 + k * 0.0025);
    const unit = 60 / bpm / 4;
    for (let p = 0; p < unit * 4; p += 0.004) {
      let score = 0;
      for (const o of onsets) {
        const r = (o.t - p) / unit;
        const e = Math.abs(r - Math.round(r)) * unit;
        score += o.s * Math.exp(-Math.pow(e / 0.022, 2));
      }
      if (score > best.score) best = { bpm, phase: p, score };
    }
  }
  return { bpm: best.bpm, phase: best.phase, confidence: Math.min(1, best.score / totalStrength) };
}

/** Snaps every transient to the project's grid. Returns the markers and the warped length. */
export function planWarp(mono: Float32Array, sampleRate: number, projectBpm: number): WarpPlan | null {
  const duration = mono.length / sampleRate;
  const { onsets, novelty, hopSeconds, peak } = detectOnsets(mono, sampleRate);
  // Hiss and room tone have no real hits: the loudest jump in energy must be clearly audible.
  if (onsets.length < 4 || peak < MIN_PEAK) return null;
  const tempo = estimateTempo(novelty, hopSeconds, projectBpm);
  const fit = fitGrid(onsets, tempo);
  if (fit.confidence < 0.35) return null;

  const srcUnit = 60 / fit.bpm / 4;
  const dstUnit = 60 / projectBpm / 4;
  const ratio = dstUnit / srcUnit; // output seconds per source second

  // Each transient goes to its nearest sixteenth; two on the same slot keep the stronger.
  const slots = new Map<number, Onset>();
  for (const o of onsets) {
    const n = Math.round((o.t - fit.phase) / srcUnit);
    const cur = slots.get(n);
    if (!cur || o.s > cur.s) slots.set(n, o);
  }
  const ordered = [...slots.entries()].sort((a, b) => a[0] - b[0]);
  const markers: WarpMarker[] = ordered.map(([n, o]) => ({ src: o.t, dst: n * dstUnit }));

  // Anchors at the very start and end keep the ratio constant outside the first and last transient.
  const first = markers[0];
  const lastM = markers[markers.length - 1];
  const dst0 = first.dst - first.src * ratio;
  const beat = dstUnit * 4;
  const shift = Math.ceil(-dst0 / beat) * beat; // whole beats only, so the grid stays aligned
  const all: WarpMarker[] = [
    { src: 0, dst: dst0 + shift },
    ...markers.map((m) => ({ src: m.src, dst: m.dst + shift })),
    { src: duration, dst: lastM.dst + shift + (duration - lastM.src) * ratio },
  ];
  // Strictly increasing on both axes, or the time map can't be inverted.
  const clean: WarpMarker[] = [all[0]];
  for (const m of all.slice(1)) {
    const p = clean[clean.length - 1];
    if (m.src > p.src + 0.005 && m.dst > p.dst + 0.005) clean.push(m);
  }
  const end = clean[clean.length - 1];
  if (clean.length < 3) return null;
  return { sourceBpm: fit.bpm, markers: clean, outSeconds: end.dst, confidence: fit.confidence };
}

/** Output time -> source time, by linear interpolation between markers. */
export function sourceTimeAt(markers: WarpMarker[], dst: number): number {
  let lo = 0, hi = markers.length - 1;
  if (dst <= markers[0].dst) {
    const a = markers[0], b = markers[1];
    return a.src + (dst - a.dst) * ((b.src - a.src) / (b.dst - a.dst));
  }
  if (dst >= markers[hi].dst) {
    const a = markers[hi - 1], b = markers[hi];
    return b.src + (dst - b.dst) * ((b.src - a.src) / (b.dst - a.dst));
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (markers[mid].dst <= dst) lo = mid; else hi = mid;
  }
  const a = markers[lo], b = markers[hi];
  return a.src + ((dst - a.dst) / (b.dst - a.dst)) * (b.src - a.src);
}

const N = 1024;
const HS = 256;
const SEARCH = 256;

/**
 * Time-varying WSOLA: stretches or squeezes every part of the audio by the amount the marker map asks,
 * without changing pitch. Phase-aligns each overlapping frame by cross-correlation.
 * Frame offsets are chosen on the mono mix and reused for every channel, so stereo stays coherent.
 */
export function warpChannels(channels: Float32Array[], sampleRate: number, markers: WarpMarker[], outSeconds: number): Float32Array[] {
  const outLen = Math.max(1, Math.round(outSeconds * sampleRate));
  const inLen = channels[0].length;
  const mono = new Float32Array(inLen);
  for (const ch of channels) for (let i = 0; i < inLen; i++) mono[i] += ch[i] / channels.length;

  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  const frames = Math.ceil(outLen / HS) + 3;
  const starts = new Int32Array(frames);
  let prev = 0;
  const DEC = 4;
  for (let k = 0; k < frames; k++) {
    const o = k * HS;
    const nominal = Math.round(sourceTimeAt(markers, o / sampleRate) * sampleRate) - N / 2;
    if (k === 0) { starts[0] = nominal; prev = nominal; continue; }
    // What the previous frame would have played next; the new frame should line up with it.
    const target = prev + HS;
    let bestD = 0, bestC = -Infinity;
    for (let d = -SEARCH; d <= SEARCH; d += 2) {
      const cand = nominal + d;
      let c = 0, e = 1e-9;
      for (let i = 0; i < N; i += DEC) {
        const a = mono[cand + i] ?? 0;
        const b = mono[target + i] ?? 0;
        c += a * b;
        e += a * a;
      }
      const score = c / Math.sqrt(e);
      if (score > bestC) { bestC = score; bestD = d; }
    }
    starts[k] = nominal + bestD;
    prev = starts[k];
  }

  return channels.map((src) => {
    const out = new Float32Array(outLen);
    const norm = new Float32Array(outLen);
    for (let k = 0; k < frames; k++) {
      const o = k * HS - N / 2 + HS * 2; // centre the first frames inside the output
      const s = starts[k];
      for (let i = 0; i < N; i++) {
        const oi = o + i;
        if (oi < 0 || oi >= outLen) continue;
        const v = src[s + i] ?? 0;
        out[oi] += v * win[i];
        norm[oi] += win[i];
      }
    }
    for (let i = 0; i < outLen; i++) if (norm[i] > 1e-3) out[i] /= norm[i];
    return out;
  });
}
