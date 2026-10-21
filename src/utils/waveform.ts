// Peak data for drawing clip waveforms. Each clip is decoded once and its
// peaks are cached by id, so re-renders and drags don't decode again.

const BUCKETS = 2048;

const cache = new Map<string, Promise<Float32Array>>();

/**
 * Max absolute amplitude (0..1) per bucket, from the first channel.
 * Decodes with an OfflineAudioContext, which needs no live audio output.
 */
export function getClipPeaks(key: string, source: { url: string; blob?: Blob }): Promise<Float32Array> {
  const cached = cache.get(key);
  if (cached) return cached;

  const pending = (async () => {
    const data = source.blob
      ? await source.blob.arrayBuffer()
      : await (await fetch(source.url)).arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const buffer = await ctx.decodeAudioData(data);
    const samples = buffer.getChannelData(0);
    const perBucket = Math.max(1, Math.ceil(samples.length / BUCKETS));
    const peaks = new Float32Array(BUCKETS);
    for (let b = 0; b < BUCKETS; b++) {
      const start = b * perBucket;
      const end = Math.min(samples.length, start + perBucket);
      let max = 0;
      for (let i = start; i < end; i++) {
        const v = Math.abs(samples[i]);
        if (v > max) max = v;
      }
      peaks[b] = max;
    }
    return peaks;
  })();

  cache.set(key, pending);
  // Don't keep failures around, so a later render can retry.
  pending.catch(() => cache.delete(key));
  return pending;
}
