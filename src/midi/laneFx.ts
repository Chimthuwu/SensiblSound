import type { DeviceId, FxSettings } from '../types';

// Audio effects after an instrument in the rack. They use the same settings as the microphone chain,
// so a Delay on a synth track sounds like the Delay on a vocal.

const AUDIO_FX: DeviceId[] = ['compressor', 'eq', 'delay', 'reverb'];

/** Devices of a rack that process the instrument's audio, in rack order and only the ones powered on. */
export function audioFxOf(devices: { uid: string; type: DeviceId }[], power: Record<string, boolean>): DeviceId[] {
  return devices.filter((d) => AUDIO_FX.includes(d.type) && power[d.uid] !== false).map((d) => d.type);
}

/** Changes whenever the nodes would need rebuilding (a device came or went, or one of its settings moved). */
export function audioFxKey(types: DeviceId[], fx: FxSettings): string {
  return JSON.stringify([
    types,
    types.includes('compressor') ? fx.compression : 0,
    types.includes('eq') ? fx.eqBands : 0,
    types.includes('delay') ? [fx.delayTime, fx.delayFeedback] : 0,
    types.includes('reverb') ? [fx.reverbDecay, fx.reverbWet] : 0,
  ]);
}

function impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.round(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
  }
  return buf;
}

/** Wires input -> effects -> output. Returns a function that tears the effects down. */
export function buildLaneFx(ctx: BaseAudioContext, input: AudioNode, output: AudioNode, types: DeviceId[], fx: FxSettings): () => void {
  const nodes: AudioNode[] = [];
  let prev: AudioNode = input;
  const add = <T extends AudioNode>(n: T) => { nodes.push(n); return n; };

  for (const type of types) {
    if (type === 'compressor') {
      const c = add(ctx.createDynamicsCompressor());
      c.threshold.value = -50 + (fx.compression / 100) * 30;
      c.knee.value = 35;
      c.ratio.value = 10;
      c.attack.value = 0.005;
      c.release.value = 0.15;
      prev.connect(c);
      prev = c;
    } else if (type === 'eq') {
      for (const band of fx.eqBands) {
        const f = add(ctx.createBiquadFilter());
        f.type = band.type === 'peak' ? 'peaking' : band.type;
        f.frequency.value = band.freq;
        f.gain.value = band.gain;
        f.Q.value = band.q;
        prev.connect(f);
        prev = f;
      }
    } else if (type === 'delay') {
      const sum = add(ctx.createGain());
      const delay = add(ctx.createDelay(1));
      delay.delayTime.value = fx.delayTime;
      const feedback = add(ctx.createGain());
      feedback.gain.value = Math.min(0.92, fx.delayFeedback / 100);
      const wet = add(ctx.createGain());
      wet.gain.value = 0.3;
      prev.connect(sum); // dry
      prev.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      wet.connect(sum);
      prev = sum;
    } else if (type === 'reverb') {
      const sum = add(ctx.createGain());
      const conv = add(ctx.createConvolver());
      conv.buffer = impulse(ctx, 0.4 + (fx.reverbDecay / 100) * 3);
      const wet = add(ctx.createGain());
      wet.gain.value = (fx.reverbWet / 100) * 0.7;
      prev.connect(sum);
      prev.connect(conv);
      conv.connect(wet);
      wet.connect(sum);
      prev = sum;
    }
  }
  prev.connect(output);
  return () => {
    try { input.disconnect(); } catch { /* nothing connected */ }
    for (const n of nodes) { try { n.disconnect(); } catch { /* already gone */ } }
    // Leave the lane audible: input goes straight to the output until the next build.
    input.connect(output);
  };
}
