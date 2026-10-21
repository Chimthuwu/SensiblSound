import { useEffect, useMemo, useRef, useState } from 'react';
import { useSessionStore } from '../../stores/useSessionStore';
import { DRUM_PADS, type MidiNote } from '../../types';
import { previewNote, releaseNote } from '../../midi/midiEngine';
import { liveNoteOff, liveNoteOn } from '../../midi/midiInput';

const STEP = 0.25; // beats: sixteenth notes
const CELL_W = 22;
const ROW_H = 16;
const LOW = 36; // C2
const HIGH = 84; // C6
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const isBlack = (p: number) => [1, 3, 6, 8, 10].includes(p % 12);
const noteName = (p: number) => `${NAMES[p % 12]}${Math.floor(p / 12) - 1}`;

// Computer keyboard as a two-row piano: Z..M is the lower octave, Q..P the upper.
const KEY_MAP: Record<string, number> = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23, KeyI: 24,
};
// Drum pads from the keyboard: A S D F G H J K for the eight pads.
const DRUM_KEYS: Record<string, number> = {
  KeyA: 36, KeyS: 37, KeyD: 38, KeyF: 39, KeyG: 40, KeyH: 41, KeyJ: 42, KeyK: 43,
};

/**
 * Edits the selected MIDI clip: a piano roll for synths, a step grid for the drum machine.
 * Click an empty cell to add a note, click a note to remove it, drag a note's right edge to resize.
 * Also turns the computer keyboard and any connected MIDI keyboard into live input for the selected track.
 */
export function MidiEditor() {
  const selectedClip = useSessionStore((s) => s.selectedClip);
  const midiClips = useSessionStore((s) => s.midiClips);
  const trackDevices = useSessionStore((s) => s.trackDevices);
  const setMidiNotes = useSessionStore((s) => s.setMidiNotes);
  const updateMidiClip = useSessionStore((s) => s.updateMidiClip);
  const addDevice = useSessionStore((s) => s.addDevice);
  const bpm = useSessionStore((s) => s.bpm);
  const transportTimeMs = useSessionStore((s) => s.transportTimeMs);
  const extraTracks = useSessionStore((s) => s.extraTracks);

  const clip = midiClips.find((c) => c.id === selectedClip?.clipId) ?? null;
  const laneId = clip?.laneId ?? '';
  const device = (trackDevices[laneId] ?? []).find((d) => d.type === 'synth' || d.type === 'drums');
  const kind = device?.type === 'drums' ? 'drums' : 'synth';
  const [resize, setResize] = useState<{ id: string; startX: number; len: number } | null>(null);
  const [octave, setOctave] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const laneName = extraTracks.find((t) => t.id === laneId)?.name
    ?? (laneId === 'backing' ? 'Backing Track' : laneId === 'active_take' ? 'Vocal Take' : 'Layer');

  const totalBeats = clip ? clip.bars * 4 : 0;
  const cols = Math.round(totalBeats / STEP);
  const rows = useMemo(() => {
    if (kind === 'drums') return [...DRUM_PADS].reverse().map((p) => p.pitch);
    return Array.from({ length: HIGH - LOW + 1 }, (_, i) => HIGH - i);
  }, [kind]);

  // Live input: computer keyboard and Web MIDI go to the selected clip's track.
  const liveRef = useRef({ laneId, kind, octave });
  liveRef.current = { laneId, kind, octave };
  useEffect(() => {
    const down = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      const { laneId: id, kind: k, octave: oct } = liveRef.current;
      if (!id || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const pitch = k === 'drums' ? DRUM_KEYS[e.code] : KEY_MAP[e.code] !== undefined ? 48 + oct * 12 + KEY_MAP[e.code] : undefined;
      if (pitch === undefined) return;
      down.add(e.code);
      liveNoteOn(pitch, 0.85, id);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const { laneId: id, kind: k, octave: oct } = liveRef.current;
      if (!down.delete(e.code) || !id || k !== 'synth') return;
      if (KEY_MAP[e.code] !== undefined) liveNoteOff(48 + oct * 12 + KEY_MAP[e.code], id);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  if (!clip) return null;

  const notesAt = (pitch: number, beat: number) =>
    clip.notes.find((n) => n.pitch === pitch && beat >= n.startBeat - 1e-6 && beat < n.startBeat + n.lenBeats - 1e-6);

  const toggle = (pitch: number, col: number) => {
    const beat = col * STEP;
    const hit = notesAt(pitch, beat);
    if (hit) {
      setMidiNotes(clip.id, clip.notes.filter((n) => n.id !== hit.id));
      return;
    }
    const note: MidiNote = { id: crypto.randomUUID(), pitch, startBeat: beat, lenBeats: kind === 'drums' ? STEP : 0.5, vel: 0.85 };
    setMidiNotes(clip.id, [...clip.notes, note]);
    previewNote(clip.laneId, pitch, 0.85);
  };

  const msPerBeat = 60_000 / bpm;
  const playBeat = (transportTimeMs - clip.startMs) / msPerBeat;
  const showPlayhead = playBeat >= 0 && playBeat <= totalBeats;
  const headerLabel = kind === 'drums' ? 'Drum steps' : 'Piano roll';

  return (
    <section className="studio-card studio-midi-editor" aria-label="MIDI editor">
      <div className="studio-card-head">
        <h2 className="studio-card-head-title">{headerLabel}</h2>
        <span className="studio-tag">{laneName}</span>
        <span className="studio-tag">{device ? (kind === 'drums' ? 'Drum Machine' : 'PsydeNote Lite') : 'No instrument'}</span>
        <div className="studio-head-spacer" />
        <div className="studio-head-right">
          {kind === 'synth' && (
            <>
              <button className="studio-mini-btn" type="button" onClick={() => setOctave((o) => Math.max(-2, o - 1))} title="Computer keyboard octave down">Oct −</button>
              <span className="studio-tag">Keys Z–M, Q–I · C{3 + octave}</span>
              <button className="studio-mini-btn" type="button" onClick={() => setOctave((o) => Math.min(3, o + 1))} title="Computer keyboard octave up">Oct +</button>
            </>
          )}
          {kind === 'drums' && <span className="studio-tag">Pads on A S D F G H J K</span>}
          <select
            className="studio-mini-btn"
            value={clip.bars}
            onChange={(e) => updateMidiClip(clip.id, { bars: Number(e.target.value) })}
            aria-label="Clip length"
            title="Clip length"
          >
            {[1, 2, 4, 8].map((b) => (
              <option key={b} value={b}>{b} bar{b === 1 ? '' : 's'}</option>
            ))}
          </select>
          <button className="studio-mini-btn" type="button" onClick={() => setMidiNotes(clip.id, [])} disabled={clip.notes.length === 0}>Clear</button>
        </div>
      </div>

      {!device && (
        <div className="studio-midi-warn">
          This track has no instrument, so the clip is silent.{' '}
          <button className="studio-mini-btn" type="button" onClick={() => addDevice(laneId, 'synth')}>Add PsydeNote Lite</button>{' '}
          <button className="studio-mini-btn" type="button" onClick={() => addDevice(laneId, 'drums')}>Add Drum Machine</button>
        </div>
      )}

      <div className="studio-roll-scroll">
        <div className="studio-roll" ref={gridRef} style={{ width: 64 + cols * CELL_W }}>
          {rows.map((pitch) => {
            const label = kind === 'drums' ? DRUM_PADS.find((p) => p.pitch === pitch)?.name ?? '' : noteName(pitch);
            return (
              <div key={pitch} className="studio-roll-row" data-black={String(kind === 'synth' && isBlack(pitch))} style={{ height: ROW_H }}>
                <button
                  className="studio-roll-key"
                  type="button"
                  data-black={String(kind === 'synth' && isBlack(pitch))}
                  onPointerDown={() => previewNote(laneId, pitch, 0.85, kind === 'synth')}
                  onPointerUp={() => releaseNote(laneId, pitch)}
                  onPointerLeave={() => releaseNote(laneId, pitch)}
                  title={label}
                >
                  {kind === 'drums' || pitch % 12 === 0 ? label : ''}
                </button>
                <div className="studio-roll-cells" style={{ width: cols * CELL_W }}>
                  {Array.from({ length: cols }).map((_, c) => (
                    <div
                      key={c}
                      className="studio-roll-cell"
                      data-beat={String(c % 4 === 0)}
                      data-bar={String(c % 16 === 0)}
                      style={{ width: CELL_W }}
                      onClick={() => toggle(pitch, c)}
                    />
                  ))}
                  {clip.notes.filter((n) => n.pitch === pitch).map((n) => {
                    const w = Math.max(CELL_W - 2, (resize?.id === n.id ? resize.len : n.lenBeats) / STEP * CELL_W - 2);
                    return (
                      <div
                        key={n.id}
                        className="studio-roll-note"
                        style={{ left: (n.startBeat / STEP) * CELL_W + 1, width: kind === 'drums' ? CELL_W - 2 : w, opacity: 0.55 + n.vel * 0.45 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMidiNotes(clip.id, clip.notes.filter((x) => x.id !== n.id));
                        }}
                      >
                        {kind === 'synth' && (
                          <span
                            className="studio-roll-grip"
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              e.currentTarget.setPointerCapture(e.pointerId);
                              setResize({ id: n.id, startX: e.clientX, len: n.lenBeats });
                            }}
                            onPointerMove={(e) => {
                              if (!resize || resize.id !== n.id) return;
                              const beats = n.lenBeats + ((e.clientX - resize.startX) / CELL_W) * STEP;
                              const snapped = Math.max(STEP, Math.round(beats / STEP) * STEP);
                              const room = totalBeats - n.startBeat;
                              setResize({ ...resize, len: Math.min(snapped, room) });
                            }}
                            onPointerUp={() => {
                              if (resize && resize.id === n.id) {
                                setMidiNotes(clip.id, clip.notes.map((x) => (x.id === n.id ? { ...x, lenBeats: resize.len } : x)));
                              }
                              setResize(null);
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {showPlayhead && <div className="studio-roll-playhead" style={{ left: 64 + (playBeat / STEP) * CELL_W }} />}
        </div>
      </div>
    </section>
  );
}
