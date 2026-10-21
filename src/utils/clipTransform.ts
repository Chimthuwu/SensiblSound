// Offline audio transforms for clips: reverse, and playback-rate changes
// (rate 0.5 makes a clip twice as long, one octave lower).

import { encodeWav } from './audioEncoding';

export async function transformClip(
  blob: Blob,
  opts: { reverse?: boolean; rate?: number },
): Promise<{ blob: Blob; durationMs: number }> {
  const rate = opts.rate ?? 1;
  const decodeCtx = new OfflineAudioContext(1, 1, 44100);
  const decoded = await decodeCtx.decodeAudioData(await blob.arrayBuffer());

  // Playing the buffer at `rate` gives a clip of length / rate.
  const outLength = Math.max(1, Math.round(decoded.length / rate));
  const out = new OfflineAudioContext(decoded.numberOfChannels, outLength, decoded.sampleRate);
  const src = out.createBufferSource();
  src.buffer = decoded;
  src.playbackRate.value = rate;
  src.connect(out.destination);
  src.start();
  const rendered = await out.startRendering();

  if (opts.reverse) {
    for (let c = 0; c < rendered.numberOfChannels; c++) rendered.getChannelData(c).reverse();
  }
  return { blob: encodeWav(rendered), durationMs: rendered.duration * 1000 };
}
