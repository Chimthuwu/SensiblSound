import { encodeWav } from './audioEncoding';
import { planWarp, warpChannels } from './warpCore';

export interface WarpOutcome {
  blob: Blob;
  durationMs: number;
  fromBpm: number;
  toBpm: number;
}

export type WarpFailure = 'short' | 'no-beat';

// Hits and one-shots have no tempo to follow.
const MIN_SECONDS = 1.5;

/**
 * Warps audio to the project tempo: transients become warp markers, snap to the beat grid,
 * and the audio between them is time-stretched. Returns why it couldn't, if it couldn't.
 */
export async function warpAudioToBpm(blob: Blob, projectBpm: number): Promise<WarpOutcome | WarpFailure> {
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  if (decoded.duration < MIN_SECONDS) return 'short';

  const channels = Array.from({ length: decoded.numberOfChannels }, (_, c) => decoded.getChannelData(c));
  const mono = new Float32Array(decoded.length);
  for (const ch of channels) for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / channels.length;

  const plan = planWarp(mono, decoded.sampleRate, projectBpm);
  if (!plan) return 'no-beat';

  // Already on tempo: nothing to gain from re-rendering (and no quality lost).
  if (Math.abs(plan.sourceBpm - projectBpm) < 0.15) {
    const maxShift = plan.markers.reduce((m, k) => Math.max(m, Math.abs(k.dst - k.src)), 0);
    if (maxShift < 0.012) return { blob, durationMs: decoded.duration * 1000, fromBpm: plan.sourceBpm, toBpm: projectBpm };
  }

  const warped = warpChannels(channels, decoded.sampleRate, plan.markers, plan.outSeconds);
  const out = new AudioBuffer({ length: warped[0].length, numberOfChannels: warped.length, sampleRate: decoded.sampleRate });
  warped.forEach((data, c) => out.copyToChannel(data as Float32Array<ArrayBuffer>, c));
  return { blob: encodeWav(out), durationMs: out.duration * 1000, fromBpm: plan.sourceBpm, toBpm: projectBpm };
}
