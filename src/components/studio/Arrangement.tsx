import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Activity } from 'lucide-react';
import { useSessionStore } from '../../stores/useSessionStore';
import { downloadBlobUrl, buildTakeFilename } from '../../utils/download';
import { ClipWaveform } from './ClipWaveform';

const BAR_W = 80;
const BEAT_W = BAR_W / 4;
const MIN_BARS = 16;

interface Clip {
  id: string;
  name: string;
  /** 1-based bar where the clip starts. */
  startBar: number;
  /** Length in bars (supports fractional). */
  lenBars: number;
  /** Audio behind the clip, used for its waveform. */
  source?: { url: string; blob?: Blob };
}

interface ClipDrag {
  laneId: string;
  clipId: string;
  startX: number;
  origBar: number;
  deltaBars: number;
}

// Clips snap to quarter bars (one beat at 4/4).
const SNAP_BARS = 0.25;

interface Lane {
  /** Matches the id the audio engine uses for mute/solo. */
  id: string;
  name: string;
  sub?: string;
  color: string;
  clips: Clip[];
}

export function Arrangement() {
  const backingTrack = useSessionStore((s) => s.backingTrack);
  const activeTake = useSessionStore((s) => s.activeTake);
  const layers = useSessionStore((s) => s.layers);
  const bpm = useSessionStore((s) => s.bpm);
  const isPlaying = useSessionStore((s) => s.isPlaying);
  const transportTimeMs = useSessionStore((s) => s.transportTimeMs);
  const isMonitoring = useSessionStore((s) => s.isMonitoring);
  const mutedTracks = useSessionStore((s) => s.mutedTracks);
  const soloedTracks = useSessionStore((s) => s.soloedTracks);
  const trackVolumes = useSessionStore((s) => s.trackVolumes);
  const micDevices = useSessionStore((s) => s.micDevices);
  const selectedMicId = useSessionStore((s) => s.selectedMicId);
  const micReady = useSessionStore((s) => s.micReady);
  const isRecording = useSessionStore((s) => s.isRecording);
  const setSelectedMicId = useSessionStore((s) => s.setSelectedMicId);
  const markLayerDownloaded = useSessionStore((s) => s.markLayerDownloaded);
  const setClipStart = useSessionStore((s) => s.setClipStart);
  const [drag, setDrag] = useState<ClipDrag | null>(null);
  const setTrackVolume = useSessionStore((s) => s.setTrackVolume);

  const setBackingTrack = useSessionStore((s) => s.setBackingTrack);
  const setActiveTake = useSessionStore((s) => s.setActiveTake);
  const addLayer = useSessionStore((s) => s.addLayer);
  const removeLayer = useSessionStore((s) => s.removeLayer);
  const setIsMonitoring = useSessionStore((s) => s.setIsMonitoring);
  const toggleMuteTrack = useSessionStore((s) => s.toggleMuteTrack);
  const toggleSoloTrack = useSessionStore((s) => s.toggleSoloTrack);
  const markActiveTakeDownloaded = useSessionStore((s) => s.markActiveTakeDownloaded);

  const tColRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const selectedTrackId = useSessionStore((s) => s.selectedTrackId);
  const setSelectedTrackId = useSessionStore((s) => s.setSelectedTrackId);

  const msPerBar = (60_000 / bpm) * 4;

  const lanes: Lane[] = useMemo(() => {
    const toBars = (ms: number) => ms / msPerBar;
    const takeClip = (
      id: string,
      name: string,
      startMs: number,
      durationMs: number | undefined,
      source: { url: string; blob?: Blob },
    ): Clip => ({
      id,
      name,
      startBar: toBars(startMs) + 1,
      lenBars: durationMs ? toBars(durationMs) : 1,
      source,
    });

    const result: Lane[] = [
      {
        id: 'backing',
        name: backingTrack?.name ?? 'Backing Track',
        color: '#7c3aed',
        clips: backingTrack
          ? [{
              id: backingTrack.id,
              name: backingTrack.name,
              startBar: toBars(backingTrack.startMs ?? 0) + 1,
              lenBars: backingTrack.durationMs ? toBars(backingTrack.durationMs) : 4,
              source: { url: backingTrack.url, blob: backingTrack.blob },
            }]
          : [],
      },
      {
        id: 'active_take',
        name: 'Vocal Take',
        sub: activeTake ? 'Current take' : undefined,
        color: '#a855f7',
        clips: activeTake
          ? [takeClip(activeTake.id, 'Take', activeTake.transportStartMs, activeTake.durationMs, { url: activeTake.url, blob: activeTake.blob })]
          : [],
      },
    ];

    layers.forEach((layer, i) => {
      result.push({
        id: layer.id,
        name: `Layer ${i + 1}`,
        color: '#c084fc',
        clips: [takeClip(layer.id, `Layer ${i + 1}`, layer.transportStartMs, layer.durationMs, { url: layer.url, blob: layer.blob })],
      });
    });

    return result;
  }, [backingTrack, activeTake, layers, msPerBar]);

  const lastBar = Math.max(0, ...lanes.flatMap((l) => l.clips.map((c) => c.startBar - 1 + c.lenBars)));
  const bars = Math.max(MIN_BARS, Math.ceil(lastBar) + 4);
  const totalW = bars * BAR_W;
  const totalMs = bars * msPerBar;
  const progress = Math.min(1, transportTimeMs / totalMs);

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = tColRef.current;
    if (!el || !isPlaying) return;
    const px = progress * totalW;
    const viewL = el.scrollLeft;
    const viewR = viewL + el.clientWidth;
    if (px > viewR - 120) el.scrollLeft = px - 120;
    if (px < viewL) el.scrollLeft = Math.max(0, px - 40);
  }, [progress, isPlaying, totalW]);

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBackingTrack({ id: crypto.randomUUID(), name: file.name, url: URL.createObjectURL(file), blob: file });
    }
    // Reset so the same file can be picked again.
    e.target.value = '';
  };

  const handleRecordAgain = () => {
    if (!activeTake) return;
    const message = activeTake.downloaded
      ? 'Discard current take and record again?'
      : "This take hasn't been downloaded yet — discarding it now means it's gone for good. Discard and record again?";
    if (window.confirm(message)) setActiveTake(undefined);
  };

  const handleKeepAsLayer = () => {
    if (!activeTake) return;
    addLayer(activeTake);
    setActiveTake(undefined);
  };

  const handleExport = async (format: 'wav' | 'mp3') => {
    if (!activeTake) return;
    let downloadUrl = activeTake.url;
    let mimeType = activeTake.mimeType;
    let extension: string | undefined;
    try {
      if (format === 'mp3') {
        const { convertBlobToAudioBuffer, encodeMp3 } = await import('../../utils/audioEncoding');
        const blob = activeTake.blob ?? (await (await fetch(activeTake.url)).blob());
        const mp3 = encodeMp3(await convertBlobToAudioBuffer(blob));
        downloadUrl = URL.createObjectURL(mp3);
        mimeType = 'audio/mp3';
        extension = 'mp3';
      }
      downloadBlobUrl(downloadUrl, buildTakeFilename(activeTake.timestamp, 'vocal-take', mimeType, extension));
      markActiveTakeDownloaded();
    } catch (err) {
      console.error('Export failed', err);
    }
  };

  const downloadLayer = (layerId: string) => {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer) return;
    downloadBlobUrl(layer.url, buildTakeFilename(layer.timestamp, 'vocal-layer', layer.mimeType));
    markLayerDownloaded(layer.id);
  };

  const selectedLane = lanes.find((l) => l.id === selectedTrackId) ?? null;

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
        <span className="studio-tag">{lanes.length} track{lanes.length === 1 ? '' : 's'}</span>
        <div className="studio-head-spacer" />
        <div className="studio-head-right">
          <button
            className="studio-ghost-btn"
            type="button"
            onClick={handleRecordAgain}
            disabled={!activeTake}
          >
            ↺&nbsp; Record Again
          </button>
          <button
            className="studio-hero-btn"
            type="button"
            onClick={handleKeepAsLayer}
            disabled={!activeTake}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3l8 4.5-8 4.5-8-4.5L12 3z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
              <path d="M4 12.5L12 17l8-4.5M4 16.5L12 21l8-4.5" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" opacity="0.6" />
            </svg>
            Keep as Layer
          </button>
          <button
            className="studio-exp-btn"
            type="button"
            onClick={() => handleExport('wav')}
            disabled={!activeTake}
            title="Download the current take as WAV"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3v12M8 11l4 4 4-4M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            WAV
          </button>
          <button
            className="studio-exp-btn"
            type="button"
            onClick={() => handleExport('mp3')}
            disabled={!activeTake}
            title="Download the current take as MP3"
          >
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
            <span className="studio-corner-badge">{lanes.length}</span>
          </div>
          {lanes.map((lane) => (
            <div
              key={lane.id}
              className="studio-track-head"
              data-selected={String(lane.id === selectedLane?.id)}
              style={{ '--studio-track-color': lane.color } as React.CSSProperties}
              onClick={() => setSelectedTrackId(lane.id)}
            >
              <div className="studio-track-head-body">
                <div className="studio-track-head-top">
                  <span className="studio-track-head-dot" style={{ background: lane.color }} />
                  <div className="studio-track-head-name">
                    {lane.name}
                    {lane.sub ? <span className="studio-track-head-sub">{lane.sub}</span> : null}
                  </div>
                  <div className="studio-msr-group">
                    <button
                      className="studio-msr"
                      data-state={mutedTracks.has(lane.id) ? 'm' : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMuteTrack(lane.id);
                      }}
                      type="button"
                      title="Mute"
                    >
                      M
                    </button>
                    <button
                      className="studio-msr"
                      data-state={soloedTracks.has(lane.id) ? 's' : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSoloTrack(lane.id);
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
                    value={Math.round((trackVolumes[lane.id] ?? 1) * 100)}
                    onChange={(e) => setTrackVolume(lane.id, Number(e.target.value) / 100)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`${lane.name} volume`}
                    title="Volume"
                  />
                  {lane.id === 'backing' && (
                    <>
                      <button
                        className="studio-mini-btn"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          importRef.current?.click();
                        }}
                      >
                        {backingTrack ? 'Replace' : 'Import audio'}
                      </button>
                      {backingTrack && (
                        <button
                          className="studio-mini-btn"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBackingTrack(undefined);
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </>
                  )}
                  {lane.id === 'active_take' && (
                    <button
                      className="studio-mini-btn"
                      type="button"
                      data-on={String(isMonitoring)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMonitoring(!isMonitoring);
                      }}
                      title={isMonitoring ? 'Monitoring: hearing your mic with FX (click to stop)' : 'Monitor: hear your mic with FX'}
                      aria-label={isMonitoring ? 'Stop monitoring' : 'Start monitoring'}
                      aria-pressed={isMonitoring}
                    >
                      <Activity size={12} className={isMonitoring ? 'animate-pulse' : undefined} />
                      {/* Icon only: the mic picker needs the width. */}
                    </button>
                  )}
                  {lane.id === 'active_take' && (
                    <select
                      className="studio-mini-btn"
                      value={selectedMicId}
                      disabled={isRecording || !micReady}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setSelectedMicId(e.target.value)}
                      aria-label="Microphone"
                      title="Microphone input"
                      style={{ maxWidth: '100%' }}
                    >
                      {!micReady && <option value="">No microphone</option>}
                      {micDevices.map((d, i) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Microphone ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  )}
                  {lane.id !== 'backing' && lane.id !== 'active_take' && (
                    <button
                      className="studio-mini-btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadLayer(lane.id);
                      }}
                      title="Download this layer as WAV/WebM"
                    >
                      Save
                    </button>
                  )}
                  {lane.id !== 'backing' && lane.id !== 'active_take' && (
                    <button
                      className="studio-mini-btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeLayer(lane.id);
                      }}
                      title="Delete this layer"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="studio-timeline-col" ref={tColRef}>
          {/* At least as wide as the panel, so the grid fills the empty space to the right. */}
          <div className="studio-timeline-inner" style={{ width: totalW, minWidth: '100%' }}>
            <div className="studio-ruler">
              <div className="studio-ruler-loop" style={{ left: 0, width: totalW }} />
              {Array.from({ length: bars }).map((_, b) => (
                <div key={b} className="studio-tick" data-major="true" style={{ left: b * BAR_W }}>
                  <span className="studio-tick-label">{b + 1}</span>
                </div>
              ))}
              {Array.from({ length: bars }).flatMap((_, b) =>
                Array.from({ length: 3 }).map((_, k) => (
                  <div
                    key={`beat-${b}-${k}`}
                    className="studio-tick"
                    data-beat="True"
                    style={{ left: b * BAR_W + (k + 1) * BEAT_W }}
                  />
                )),
              )}
            </div>

            <div className="studio-lanes">
              {lanes.map((lane, i) => (
                <div
                  key={lane.id}
                  className="studio-lane"
                  data-alt={String(i % 2 === 1)}
                  data-track={lane.id}
                  data-muted={String(mutedTracks.has(lane.id))}
                >
                  {lane.clips.length === 0 && (
                    <span className="studio-lane-hint">
                      {lane.id === 'backing'
                        ? 'Import a backing track to start'
                        : lane.id === 'active_take'
                          ? 'Press record to capture a take'
                          : ''}
                    </span>
                  )}
                  {lane.clips.map((c) => {
                    const dragging = drag?.clipId === c.id;
                    const startBar = c.startBar + (dragging ? drag.deltaBars : 0);
                    const widthPx = c.lenBars * BAR_W;
                    return (
                      <div
                        key={c.id}
                        className="studio-clip"
                        data-selected={String(selectedTrackId === lane.id)}
                        data-dragging={String(dragging)}
                        style={{
                          left: `${(startBar - 1) * BAR_W}px`,
                          width: `${widthPx}px`,
                          borderColor: `color-mix(in srgb, ${lane.color} 58%, transparent)`,
                          background: `linear-gradient(180deg, color-mix(in srgb, ${lane.color} 26%, #16141d), color-mix(in srgb, ${lane.color} 12%, #131118))`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTrackId(lane.id);
                        }}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.currentTarget.setPointerCapture(e.pointerId);
                          setDrag({
                            laneId: lane.id,
                            clipId: c.id,
                            startX: e.clientX,
                            origBar: c.startBar,
                            deltaBars: 0,
                          });
                        }}
                        onPointerMove={(e) => {
                          if (!drag || drag.clipId !== c.id) return;
                          const raw = (e.clientX - drag.startX) / BAR_W;
                          const snapped = Math.round(raw / SNAP_BARS) * SNAP_BARS;
                          // Never move a clip before the start of the timeline.
                          const deltaBars = Math.max(1 - drag.origBar, snapped);
                          if (deltaBars !== drag.deltaBars) setDrag({ ...drag, deltaBars });
                        }}
                        onPointerUp={(e) => {
                          if (!drag || drag.clipId !== c.id) return;
                          e.currentTarget.releasePointerCapture(e.pointerId);
                          if (drag.deltaBars !== 0) {
                            const newStartMs = (drag.origBar - 1 + drag.deltaBars) * msPerBar;
                            setClipStart(drag.laneId, newStartMs);
                          }
                          setDrag(null);
                        }}
                        onPointerCancel={() => setDrag(null)}
                      >
                        {c.source && (
                          <ClipWaveform
                            cacheKey={c.id}
                            source={c.source}
                            color={lane.color}
                            width={Math.round(widthPx)}
                          />
                        )}
                        <span className="studio-clip-name">{c.name}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div
              className="studio-playhead"
              style={{ left: `${progress * totalW}px` }}
              aria-hidden="true"
            >
              <span className="studio-playhead-arrow" />
            </div>
          </div>
        </div>
      </div>

      <input
        ref={importRef}
        type="file"
        accept="audio/mpeg, audio/wav, .mp3, .wav"
        onChange={handleImport}
        style={{ display: 'none' }}
        aria-label="Import backing track"
      />
    </section>
  );
}
