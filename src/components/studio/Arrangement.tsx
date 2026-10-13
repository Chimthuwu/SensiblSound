import { useEffect, useMemo, useRef, useState } from 'react';
import { useSessionStore } from '../../stores/useSessionStore';

const BAR_W = 80;
const BEAT_W = BAR_W / 4;
const BARS = 16;
const TOTAL_W = BARS * BAR_W;

export interface ArrangementClip {
  id: string;
  name: string;
  /** 1-based bar where the clip starts. */
  startBar: number;
  /** Length in bars (supports fractional). */
  lenBars: number;
}

export interface ArrangementTrack {
  id: string;
  name: string;
  /** Optional secondary line for the track header, e.g. filename. */
  sub?: string;
  color: string;
  muted: boolean;
  soloed: boolean;
  volume: number;
  clips: ArrangementClip[];
}

const TRACKS: ArrangementTrack[] = [
  {
    id: 'backing',
    name: 'Backing Track',
    color: '#7c3aed',
    volume: 0.82,
    muted: false,
    soloed: false,
    clips: [
      {
        id: 'backing-clip-1',
        name: 'beat_final_v2',
        startBar: 1,
        lenBars: BARS,
      },
    ],
  },
  {
    id: 'vocal',
    name: 'Vocal Take 3',
    sub: 'Sensimilliea',
    color: '#a855f7',
    volume: 0.78,
    muted: false,
    soloed: false,
    clips: [
      { id: 'v-1', name: 'Verse 1', startBar: 3, lenBars: 3.6 },
      { id: 'v-2', name: 'Hook', startBar: 7, lenBars: 3.6 },
      { id: 'v-3', name: 'Verse 2', startBar: 11, lenBars: 3.6 },
    ],
  },
];

export function Arrangement() {
  const backingTrack = useSessionStore((s) => s.backingTrack);
  const activeTake = useSessionStore((s) => s.activeTake);
  const layers = useSessionStore((s) => s.layers);
  const isPlaying = useSessionStore((s) => s.isPlaying);

  const transportTimeMs = useSessionStore((s) => s.transportTimeMs);
  const bpm = useSessionStore((s) => s.bpm);


  const toggleMuteTrack = useSessionStore((s) => s.toggleMuteTrack);
  const toggleSoloTrack = useSessionStore((s) => s.toggleSoloTrack);

  const tColRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(
    TRACKS[1].clips[0]?.id ?? null,
  );


  const tracks: ArrangementTrack[] = useMemo(
    () =>
      TRACKS.map((t) => {
        if (t.id === 'backing') {
          return {
            ...t,
            name: backingTrack?.name ?? t.name,
            sub: backingTrack?.name ?? undefined,
          };
        }
        if (t.id === 'vocal') {
          return {
            ...t,
            name: activeTake
              ? `Vocal Take ${countTakes() + 1}`
              : 'Vocal Take 1',
            sub: activeTake ? 'Sensimilliea' : undefined,
          };
        }
        return t;
      }),
    [backingTrack?.name, activeTake],
  );

  function countTakes() {
    let n = 0;
    if (activeTake) n += 1;
    n += layers.length;
    return n;
  }

  const totalDurationMs =
    (backingTrack?.durationMs ?? (backingTrack?.blob ? 320_000 : 0)) ||
    (BARS * 4 * 60 * 1000) / bpm;

  const secPerBar = (60 / bpm) * 4;
  const totalSec = BARS * secPerBar;

  const progress = isPlaying ? progressRef.current : transportTimeMs / (totalDurationMs || 1);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTsRef.current = 0;
      return;
    }
    let raf: number;
    function tick(ts: number) {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      progressRef.current = Math.min(1, progressRef.current + dt / totalSec);
      if (tColRef.current) {
        const px = progressRef.current * TOTAL_W;
        const viewL = tColRef.current.scrollLeft;
        const viewR = viewL + tColRef.current.clientWidth;
        if (px > viewR - 120) tColRef.current.scrollLeft = px - 120;
        if (px < viewL) tColRef.current.scrollLeft = Math.max(0, px - 40);
      }
      raf = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      rafRef.current = null;
    };
  }, [isPlaying, totalSec]);


  const selectedTrackId = selectedClipId
    ? tracks.find((t) => t.clips.some((c) => c.id === selectedClipId))?.id ?? tracks[1].id
    : tracks[1].id;

  return (
    <section className="studio-card" aria-label="Arrangement">
      <div className="studio-card-head">
        <span className="studio-card-head-ic" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            <circle cx="9" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.9" fill="#16121d" />
            <circle cx="15" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.9" fill="#16121d" />
            <circle cx="7" cy="18" r="2.2" stroke="currentColor" strokeWidth="1.9" fill="#16121d" />
          </svg>
        </span>
        <h2 className="studio-card-head-title">Arrangement</h2>
        <span className="studio-tag">{tracks.length} track{tracks.length === 1 ? '' : 's'}</span>
        <div className="studio-head-spacer" />
        <div className="studio-head-right">
          <button className="studio-ghost-btn" type="button">
            ↺&nbsp; Record Again
          </button>
          <button className="studio-hero-btn" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3l8 4.5-8 4.5-8-4.5L12 3z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
              <path d="M4 12.5L12 17l8-4.5M4 16.5L12 21l8-4.5" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" opacity="0.6" />
            </svg>
            Keep as Layer
          </button>
          <button className="studio-exp-btn" type="button">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3v12M8 11l4 4 4-4M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            WAV
          </button>
          <button className="studio-exp-btn" type="button">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3v12M8 11l4 4 4-4M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            MP3
          </button>
        </div>
      </div>

      <div className="studio-daw">
        <div className="studio-row-heads">
          <div className="studio-corner">
            <span>Tracks</span>
            <span className="studio-corner-badge">{tracks.length}</span>
          </div>
          {tracks.map((t) => (
            <div
              key={t.id}
              className="studio-track-head"
              data-selected={String(t.id === selectedTrackId)}
              style={{ '--studio-track-color': t.color } as React.CSSProperties}
              onClick={() => setSelectedClipId(t.clips[0]?.id ?? null)}
            >
              <div className="studio-track-head-body">
                <div className="studio-track-head-top">
                  <span
                    className="studio-track-head-dot"
                    style={{ background: t.color }}
                  />
                  <div className="studio-track-head-name">
                    {t.name}
                    {t.sub ? <span className="studio-track-head-sub">{t.sub}</span> : null}
                  </div>
                  <div className="studio-msr-group">
                    <button
                      className="studio-msr"
                      data-state={t.muted ? 'm' : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMuteTrack(t.id);
                      }}
                      type="button"
                      title="Mute"
                    >
                      M
                    </button>
                    <button
                      className="studio-msr"
                      data-state={t.soloed ? 's' : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSoloTrack(t.id);
                      }}
                      type="button"
                      title="Solo"
                    >
                      S
                    </button>
                  </div>
                </div>
                <div className="studio-track-head-controls">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round((t.volume ?? 0.8) * 100)}
                    onChange={() => {
                      /* The mockup shows per-track volume in the header,
                         but the current store is mute/solo-centric. Keep this
                         visual-only for the skin pass. */
                    }}
                    aria-label={`${t.name} volume`}
                    readOnly
                  />
                  <div
                    className="studio-track-head-knob"
                    title="Pan"
                    aria-hidden="true"
                  />
                </div>
              </div>
              <div className="studio-track-head-meter">
                <span data-meter-fill style={{ height: '50%' }} />
              </div>
            </div>
          ))}
        </div>

        <div className="studio-timeline-col" ref={tColRef}>
          <div className="studio-timeline-inner" style={{ width: TOTAL_W }}>
            <div className="studio-ruler">
              <div
                className="studio-ruler-loop"
                style={{ left: 0, width: TOTAL_W }}
              />
              {Array.from({ length: BARS }).map((_, b) => {
                const x = b * BAR_W;
                return (
                  <div key={b} className="studio-tick" data-major="true" style={{ left: x }}>
                    <span className="studio-tick-label">{b + 1}</span>
                  </div>
                );
              })}
              {Array.from({ length: BARS }).flatMap((_, b) =>
                Array.from({ length: 3 }).map((_, k) => {
                  const x = b * BAR_W + (k + 1) * BEAT_W;
                  return (
                    <div
                      key={`beat-${b}-${k}`}
                      className="studio-tick"
                      data-beat="True"
                      style={{ left: x }}
                    />
                  );
                }),
              )}
            </div>

            <div className="studio-lanes">
              {tracks.map((t, i) => (
                <div
                  key={t.id}
                  className="studio-lane"
                  data-alt={String(i % 2 === 1)}
                  data-track={t.id}
                >
                  {t.clips.map((c) => {
                    const leftPx = (c.startBar - 1) * BAR_W;
                    const widthPx = c.lenBars * BAR_W;
                    const selected =
                      selectedClipId !== null && selectedClipId === c.id;
                    return (
                      <div
                        key={c.id}
                        className="studio-clip"
                        data-selected={String(selected)}
                        style={{
                          left: `${leftPx}px`,
                          width: `${widthPx}px`,
                          borderColor: `color-mix(in srgb, ${t.color} 58%, transparent)`,
                          background: `linear-gradient(180deg, color-mix(in srgb, ${t.color} 26%, #16141d), color-mix(in srgb, ${t.color} 12%, #131118))`,
                        }}
                        onClick={(_e) => {
                          _e.stopPropagation();
                          setSelectedClipId(c.id);
                        }}
                      >
                        <span className="studio-clip-name">{c.name}</span>
                        {/* Placeholder waveform canvas for the skin. Real audio is
                            rendered through the existing WaveSurfer-backed tracks below. */}
                        <canvas className="studio-clip-wave" aria-hidden="true" />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div
              className="studio-playhead"
              style={{ left: `${Math.min(1, progress) * TOTAL_W}px` }}
              aria-hidden="true"
            >
              <span className="studio-playhead-arrow" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
