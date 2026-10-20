import { DRUM_PADS, type DrumParams, type SynthParams } from '../types';

export const midiToHz = (pitch: number) => 440 * Math.pow(2, (pitch - 69) / 12);

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: BaseAudioContext): AudioBuffer {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/**
 * One synth note: osc1 + detuned osc2 (+ optional FM modulator) -> low-pass filter -> ADSR amp -> out.
 * `dur` is how long the key is held, in seconds; the release tail follows. Returns a stop function for held notes.
 */
export function playSynthNote(
  ctx: BaseAudioContext,
  out: AudioNode,
  p: SynthParams,
  pitch: number,
  vel: number,
  when: number,
  dur: number | null,
): (at?: number) => void {
  const f = midiToHz(pitch);
  const amp = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = p.resonance;
  filter.connect(amp);
  amp.connect(out);

  const peak = Math.max(0.0001, vel * p.volume * 0.35);
  const a = Math.max(0.002, p.attack);
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.linearRampToValueAtTime(peak, when + a);
  amp.gain.setTargetAtTime(Math.max(0.0001, peak * p.sustain), when + a, Math.max(0.01, p.decay / 3));

  // Filter envelope: opens `filterEnv` octaves above the cutoff, then settles back.
  const top = Math.min(18000, p.cutoff * Math.pow(2, p.filterEnv));
  filter.frequency.setValueAtTime(Math.min(top, p.cutoff), when);
  filter.frequency.linearRampToValueAtTime(top, when + a);
  filter.frequency.setTargetAtTime(p.cutoff, when + a, Math.max(0.02, p.decay / 3));

  const oscs: OscillatorNode[] = [];
  const o1 = ctx.createOscillator();
  o1.type = p.wave;
  o1.frequency.value = f;
  const g1 = ctx.createGain();
  g1.gain.value = 1;
  o1.connect(g1).connect(filter);
  oscs.push(o1);

  if (p.mix2 > 0.01) {
    const o2 = ctx.createOscillator();
    o2.type = p.wave2;
    o2.frequency.value = f;
    o2.detune.value = p.detune;
    const g2 = ctx.createGain();
    g2.gain.value = p.mix2;
    o2.connect(g2).connect(filter);
    oscs.push(o2);
  }

  if (p.fm > 0.01) {
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = f * p.fmRatio;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(f * p.fm * 4, when);
    // FM brightness fades with the note, like a struck tone.
    depth.gain.setTargetAtTime(f * p.fm * 0.6, when + a, Math.max(0.05, p.decay));
    mod.connect(depth);
    for (const o of oscs) depth.connect(o.frequency);
    oscs.push(mod);
  }

  for (const o of oscs) o.start(when);

  let ended = false;
  const stop = (at = ctx.currentTime) => {
    if (ended) return;
    ended = true;
    const t = Math.max(at, when + a);
    amp.gain.cancelScheduledValues(t);
    amp.gain.setValueAtTime(Math.max(0.0001, amp.gain.value || peak * p.sustain), t);
    amp.gain.setTargetAtTime(0.0001, t, Math.max(0.01, p.release / 4));
    const end = t + p.release * 1.6 + 0.1;
    for (const o of oscs) o.stop(end);
    oscs[0].onended = () => { amp.disconnect(); filter.disconnect(); };
  };
  if (dur !== null) stop(when + Math.max(0.02, dur));
  return stop;
}

function noiseVoice(ctx: BaseAudioContext, out: AudioNode, when: number, opts: {
  type: BiquadFilterType; freq: number; q?: number; peak: number; decay: number; hold?: number;
}) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = opts.type;
  f.frequency.value = opts.freq;
  f.Q.value = opts.q ?? 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(opts.peak, when);
  g.gain.setTargetAtTime(0.0001, when + (opts.hold ?? 0), opts.decay / 3);
  src.connect(f).connect(g).connect(out);
  src.start(when, Math.random());
  src.stop(when + (opts.hold ?? 0) + opts.decay * 2.2);
}

function toneVoice(ctx: BaseAudioContext, out: AudioNode, when: number, opts: {
  from: number; to: number; sweep: number; peak: number; decay: number; type?: OscillatorType;
}) {
  const o = ctx.createOscillator();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(opts.from, when);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), when + opts.sweep);
  const g = ctx.createGain();
  g.gain.setValueAtTime(opts.peak, when);
  g.gain.setTargetAtTime(0.0001, when + 0.005, opts.decay / 3);
  o.connect(g).connect(out);
  o.start(when);
  o.stop(when + opts.decay * 2.2 + 0.05);
}

/** Synthesised drum kit: no samples. `pitch` picks the pad (36..43). */
export function playDrum(ctx: BaseAudioContext, out: AudioNode, p: DrumParams, pitch: number, vel: number, when: number) {
  const pad = DRUM_PADS.find((x) => x.pitch === pitch);
  if (!pad) return;
  const t = Math.pow(2, p.tune / 12);
  const d = p.decay;
  const v = vel * p.volume;
  const g = ctx.createGain();
  g.gain.value = v;
  g.connect(out);
  switch (pad.id) {
    case 'kick':
      toneVoice(ctx, g, when, { from: 160 * t, to: 42 * t, sweep: 0.12 * d, peak: 1.1, decay: 0.38 * d });
      noiseVoice(ctx, g, when, { type: 'lowpass', freq: 900, peak: 0.25, decay: 0.02 });
      break;
    case 'snare':
      toneVoice(ctx, g, when, { from: 220 * t, to: 150 * t, sweep: 0.06, peak: 0.55, decay: 0.12 * d, type: 'triangle' });
      noiseVoice(ctx, g, when, { type: 'highpass', freq: 1800 * t, peak: 0.7, decay: 0.2 * d });
      break;
    case 'clap':
      for (let i = 0; i < 3; i++) noiseVoice(ctx, g, when + i * 0.011, { type: 'bandpass', freq: 1500 * t, q: 1.2, peak: 0.6, decay: 0.03 });
      noiseVoice(ctx, g, when + 0.033, { type: 'bandpass', freq: 1400 * t, q: 1, peak: 0.55, decay: 0.2 * d });
      break;
    case 'hatC':
      noiseVoice(ctx, g, when, { type: 'highpass', freq: 7000 * t, q: 0.5, peak: 0.5, decay: 0.05 * d });
      break;
    case 'hatO':
      noiseVoice(ctx, g, when, { type: 'highpass', freq: 6500 * t, q: 0.5, peak: 0.45, decay: 0.3 * d });
      break;
    case 'tomL':
      toneVoice(ctx, g, when, { from: 130 * t, to: 80 * t, sweep: 0.15, peak: 0.9, decay: 0.3 * d });
      break;
    case 'tomH':
      toneVoice(ctx, g, when, { from: 220 * t, to: 140 * t, sweep: 0.12, peak: 0.85, decay: 0.25 * d });
      break;
    case 'crash':
      noiseVoice(ctx, g, when, { type: 'highpass', freq: 4500 * t, q: 0.4, peak: 0.5, decay: 1.1 * d });
      break;
  }
}
