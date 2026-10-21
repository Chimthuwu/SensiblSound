// Standard MIDI File writer (format 0, one track). Pure, so it can be tested without a browser.

export interface SmfNote {
  pitch: number;
  startBeat: number;
  lenBeats: number;
  /** 0..1 */
  vel: number;
}

const PPQ = 480;

const vlq = (n: number): number[] => {
  let v = Math.max(0, Math.round(n));
  const out = [v & 0x7f];
  while ((v >>= 7) > 0) out.unshift((v & 0x7f) | 0x80);
  return out;
};
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const text = (s: string) => Array.from(new TextEncoder().encode(s));

/** Encodes notes as a .mid file. Drum tracks go on channel 10, as General MIDI expects. */
export function encodeMidiFile(notes: SmfNote[], bpm: number, opts: { drums?: boolean; name?: string } = {}): Uint8Array {
  const channel = opts.drums ? 9 : 0;
  const events: { tick: number; order: number; bytes: number[] }[] = [];
  for (const n of notes) {
    const pitch = Math.min(127, Math.max(0, Math.round(n.pitch)));
    const on = Math.round(n.startBeat * PPQ);
    const off = Math.max(on + 1, Math.round((n.startBeat + n.lenBeats) * PPQ));
    const vel = Math.min(127, Math.max(1, Math.round(n.vel * 127)));
    events.push({ tick: on, order: 1, bytes: [0x90 | channel, pitch, vel] });
    events.push({ tick: off, order: 0, bytes: [0x80 | channel, pitch, 0] }); // offs sort before ons at the same tick
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const track: number[] = [];
  const name = text(opts.name ?? 'SensiblSound');
  track.push(0, 0xff, 0x03, ...vlq(name.length), ...name);
  const mpqn = Math.round(60_000_000 / Math.max(20, Math.min(400, bpm)));
  track.push(0, 0xff, 0x51, 0x03, (mpqn >>> 16) & 255, (mpqn >>> 8) & 255, mpqn & 255);
  track.push(0, 0xff, 0x58, 0x04, 4, 2, 24, 8); // 4/4
  let last = 0;
  for (const e of events) {
    track.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  track.push(0, 0xff, 0x2f, 0x00);

  const header = [...text('MThd'), ...u32(6), 0, 0, 0, 1, (PPQ >>> 8) & 255, PPQ & 255];
  return new Uint8Array([...header, ...text('MTrk'), ...u32(track.length), ...track]);
}
