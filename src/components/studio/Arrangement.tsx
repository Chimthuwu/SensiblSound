import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Activity } from 'lucide-react';
import { useSessionStore } from '../../stores/useSessionStore';
import { downloadBlobUrl, buildTakeFilename } from '../../utils/download';
import { SAMPLE_MIME, sampleClip } from '../../utils/samples';
import { transformClip } from '../../utils/clipTransform';
import { ClipWaveform } from './ClipWaveform';
import { useContextMenu, type MenuItem } from './ContextMenu';

const BAR_W = 80;
const BEAT_W = BAR_W / 4;
const MIN_BARS = 64;
const EXTRA_TRACK_COLORS = ['#38bdf8', '#34d399', '#fb7185', '#fbbf24', '#a3e635'];

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
  const trackPans = useSessionStore((s) => s.trackPans);
  const setTrackPan = useSessionStore((s) => s.setTrackPan);
  const armedTrackId = useSessionStore((s) => s.armedTrackId);
  const setArmedTrackId = useSessionStore((s) => s.setArmedTrackId);
  const selectedClip = useSessionStore((s) => s.selectedClip);
  const setSelectedClip = useSessionStore((s) => s.setSelectedClip);
  const replaceClipAudio = useSessionStore((s) => s.replaceClipAudio);
  const micDevices = useSessionStore((s) => s.micDevices);
  const selectedMicId = useSessionStore((s) => s.selectedMicId);
  const micReady = useSessionStore((s) => s.micReady);
  const isRecording = useSessionStore((s) => s.isRecording);
  const setSelectedMicId = useSessionStore((s) => s.setSelectedMicId);
  const markLayerDownloaded = useSessionStore((s) => s.markLayerDownloaded);
  const extraTracks = useSessionStore((s) => s.extraTracks);
  const addTrack = useSessionStore((s) => s.addTrack);
  const setTrackClip = useSessionStore((s) => s.setTrackClip);
  const [dropHover, setDropHover] = useState(false);
  const setClipStart = useSessionStore((s) => s.setClipStart);
  const openMenu = useContextMenu();
  const removeExtraTrack = useSessionStore((s) => s.removeExtraTrack);
  const clearClip = useSessionStore((s) => s.clearClip);
  const clipboard = useSessionStore((s) => s.clipboard);
  const copyClip = useSessionStore((s) => s.copyClip);
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
        name: 'Track 1',
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
        name: 'Track 2',
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

    extraTracks.forEach((t, i) => {
      result.push({
        id: t.id,
        name: t.name,
        color: EXTRA_TRACK_COLORS[i % EXTRA_TRACK_COLORS.length],
        clips: t.clip
          ? [{
              id: t.clip.id,
              name: t.clip.name,
              startBar: toBars(t.clip.startMs) + 1,
              lenBars: t.clip.durationMs ? toBars(t.clip.durationMs) : 4,
              source: { url: t.clip.url, blob: t.clip.blob },
            }]
          : [],
      });
    });

    return result;
  }, [backingTrack, activeTake, layers, extraTracks, msPerBar]);

  // The timeline is always long enough to scroll past the content, and grows
  // as the content or the playhead nears its end.
  const lastBar = Math.max(0, ...lanes.flatMap((l) => l.clips.map((c) => c.startBar - 1 + c.lenBars)));
  const bars = Math.max(MIN_BARS, Math.ceil(Math.max(lastBar, transportTimeMs / msPerBar)) + 16);
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

  const isAudioFile = (file: File) =>
    file.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aac|webm)$/i.test(file.name);
  const isLayerLane = (laneId: string) => layers.some((l) => l.id === laneId);
  const isEmptyExtraTrack = (laneId: string) => extraTracks.some((t) => t.id === laneId && !t.clip);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  const hasSample = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes(SAMPLE_MIME);

  /** A sample dragged from the browser: fills an empty track, or else creates a new one. */
  const dropSample = async (e: React.DragEvent, trackId: string | null) => {
    e.preventDefault();
    setDropHover(false);
    const id = e.dataTransfer.getData(SAMPLE_MIME);
    if (!id) return;
    const clip = await sampleClip(id);
    if (trackId) setTrackClip(trackId, clip);
    else addTrack(clip);
  };

  /** Dropped audio fills an empty new track, or else creates a new track. */
  const dropAudio = (e: React.DragEvent, trackId: string | null) => {
    e.preventDefault();
    setDropHover(false);
    const file = Array.from(e.dataTransfer.files).find(isAudioFile);
    if (!file) return;
    const clip = { name: file.name, url: URL.createObjectURL(file), blob: file };
    if (trackId) setTrackClip(trackId, clip);
    else addTrack(clip);
  };

  const isExtraTrack = (laneId: string) => extraTracks.some((t) => t.id === laneId);
  const laneOf = (laneId: string) => lanes.find((l) => l.id === laneId) ?? null;

  const confirmDeleteTake = () =>
    !activeTake || activeTake.downloaded
      ? true
      : window.confirm("This take hasn't been downloaded yet. Delete it anyway?");

  const copyLane = (laneId: string) => {
    const lane = laneOf(laneId);
    const clip = lane?.clips[0];
    if (!clip?.source) return;
    copyClip({
      name: clip.name,
      url: clip.source.url,
      blob: clip.source.blob,
      durationMs: clip.lenBars * msPerBar,
    });
  };

  const pasteAsNewTrack = (atMs: number) => {
    if (!clipboard) return;
    const id = addTrack({ name: clipboard.name, url: clipboard.url, blob: clipboard.blob });
    setClipStart(id, atMs);
  };

  const laneMenuItems = (laneId: string): MenuItem[] => {
    const lane = laneOf(laneId);
    const hasClip = !!lane && lane.clips.length > 0;
    const items: MenuItem[] = [
      {
        label: mutedTracks.has(laneId) ? 'Unmute' : 'Mute',
        checked: mutedTracks.has(laneId),
        onSelect: () => toggleMuteTrack(laneId),
      },
      { label: 'Solo', checked: soloedTracks.has(laneId), onSelect: () => toggleSoloTrack(laneId) },
      { kind: 'separator' },
      { label: 'Copy', disabled: !hasClip, onSelect: () => copyLane(laneId) },
    ];
    if (isExtraTrack(laneId)) {
      items.push({
        label: 'Delete track',
        danger: true,
        onSelect: () => {
          if (hasClip && !window.confirm(`Delete "${lane?.name}" and its clip?`)) return;
          removeExtraTrack(laneId);
        },
      });
    } else {
      items.push({
        label: 'Delete clip',
        danger: true,
        disabled: !hasClip,
        onSelect: () => {
          if (laneId === 'active_take' && !confirmDeleteTake()) return;
          clearClip(laneId);
        },
      });
    }
    if (clipboard) {
      items.push({ kind: 'separator' });
      items.push({ label: 'Paste as new track', onSelect: () => pasteAsNewTrack(transportTimeMs) });
    }
    return items;
  };

  const clipFor = (sel: { laneId: string; clipId: string }) =>
    laneOf(sel.laneId)?.clips.find((c) => c.id === sel.clipId) ?? null;

  const copyClipObj = (clip: Clip) => {
    if (!clip.source) return;
    copyClip({
      name: clip.name,
      url: clip.source.url,
      blob: clip.source.blob,
      durationMs: clip.lenBars * msPerBar,
    });
  };

  /** Deletes the selected clip; an extra track keeps its (now empty) lane. */
  const deleteSelectedClip = () => {
    if (!selectedClip) return;
    if (selectedClip.laneId === 'active_take' && !confirmDeleteTake()) return;
    clearClip(selectedClip.laneId);
    setSelectedClip(null);
  };

  /** Re-renders the selected clip's audio. The new audio replaces the old, keeping its place. */
  const transformSelected = async (opts: { reverse?: boolean; rate?: number }) => {
    if (!selectedClip) return;
    const clip = clipFor(selectedClip);
    if (!clip?.source) return;
    const blob = clip.source.blob ?? (await (await fetch(clip.source.url)).blob());
    const out = await transformClip(blob, opts);
    replaceClipAudio(selectedClip.laneId, {
      url: URL.createObjectURL(out.blob),
      blob: out.blob,
      durationMs: out.durationMs,
    });
  };

  // Keyboard: Delete removes the selected clip, Backspace reverses it, Ctrl+C/X/V copy/cut/paste,
  // Ctrl+B doubles its length. Typing in a field is left alone.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const sel = selectedClip;
    const clip = sel ? clipFor(sel) : null;
    if (e.key === 'Delete' && clip) {
      e.preventDefault();
      deleteSelectedClip();
      return;
    }
    if (e.key === 'Backspace' && clip) {
      e.preventDefault();
      void transformSelected({ reverse: true });
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'c' && clip && sel) {
      e.preventDefault();
      copyClipObj(clip);
    } else if (k === 'x' && clip && sel) {
      e.preventDefault();
      copyClipObj(clip);
      deleteSelectedClip();
    } else if (k === 'v' && clipboard) {
      e.preventDefault();
      pasteAsNewTrack(transportTimeMs);
    } else if (k === 'b' && clip) {
      e.preventDefault();
      void transformSelected({ rate: 0.5 });
    }
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const selectedLane = lanes.find((l) => l.id === selectedTrackId) ?? null;

  return (
    <section
      className="studio-card"
      aria-label="Arrangement"
      onDragOver={(e) => {
        if (hasSample(e)) e.preventDefault();
      }}
      onDrop={(e) => {
        // Drops already handled by a lane or the drop zone have called preventDefault.
        if (e.defaultPrevented) return;
        if (hasSample(e)) void dropSample(e, null);
      }}
      onContextMenu={(e) => {
        // Track and clip menus have already claimed the event; this is the fallback for the rest of the arranger.
        if (e.defaultPrevented) return;
        openMenu(e, [
          { label: 'Insert Audio Track', onSelect: () => addTrack() },
          ...(clipboard
            ? [{ label: 'Paste as New Track', onSelect: () => pasteAsNewTrack(transportTimeMs) }]
            : []),
        ]);
      }}
    >
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
              onContextMenu={(e) => openMenu(e, laneMenuItems(lane.id))}
            >
              <div className="studio-track-head-body">
                <div className="studio-track-head-top">
                  <span className="studio-track-head-dot" style={{ background: lane.color }} />
                  <div className="studio-track-head-name">
                    {lane.name}
                    {lane.sub ? <span className="studio-track-head-sub">{lane.sub}</span> : null}
                  </div>
                  {!isLayerLane(lane.id) && (
                    <button
                      className="studio-arm"
                      type="button"
                      data-armed={String(armedTrackId === lane.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setArmedTrackId(lane.id);
                      }}
                      title={armedTrackId === lane.id ? 'Armed: the record button writes to this track' : 'Arm this track for recording'}
                      aria-label={`Arm ${lane.name} for recording`}
                      aria-pressed={armedTrackId === lane.id}
                    />
                  )}
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
                  <span className="studio-slider-label">Vol</span>
                  <input
                    className="studio-vol"
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round((trackVolumes[lane.id] ?? 1) * 100)}
                    onChange={(e) => setTrackVolume(lane.id, Number(e.target.value) / 100)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`${lane.name} volume`}
                    title="Volume"
                  />
                  <span className="studio-slider-label">Pan</span>
                  <input
                    className="studio-pan"
                    type="range"
                    min={-100}
                    max={100}
                    value={Math.round((trackPans[lane.id] ?? 0) * 100)}
                    onChange={(e) => setTrackPan(lane.id, Number(e.target.value) / 100)}
                    onDoubleClick={() => setTrackPan(lane.id, 0)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`${lane.name} pan`}
                    title={`Pan ${Math.round((trackPans[lane.id] ?? 0) * 100)} (double-click to centre)`}
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
                  {armedTrackId === lane.id && !isLayerLane(lane.id) && (
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
                  {!isLayerLane(lane.id) && (
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
                  {isLayerLane(lane.id) && (
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
                  {isLayerLane(lane.id) && (
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
          <button
            className="studio-add-track"
            type="button"
            onClick={() => addTrack()}
            title="Add an empty audio track"
          >
            + Track
          </button>
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
                  onContextMenu={(e) => openMenu(e, laneMenuItems(lane.id))}
                  onDragOver={(e) => {
                    if (isEmptyExtraTrack(lane.id) && (hasFiles(e) || hasSample(e))) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    if (!isEmptyExtraTrack(lane.id)) return;
                    if (hasSample(e)) void dropSample(e, lane.id);
                    else dropAudio(e, lane.id);
                  }}
                >
                  {lane.clips.length === 0 && (
                    <span className="studio-lane-hint">
                      {lane.id === 'backing'
                        ? 'Import a backing track to start'
                        : lane.id === 'active_take'
                          ? 'Press record to capture a take'
                          : isEmptyExtraTrack(lane.id) ? 'Drop audio here' : ''}
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
                        data-selected={String(selectedClip?.clipId === c.id)}
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
                          setSelectedClip({ laneId: lane.id, clipId: c.id });
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

            {/* Lines up with the + Track button under the track headers. */}
            <div className="studio-add-spacer" aria-hidden="true" />

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

      <div
        className="studio-drop-zone"
        data-hover={String(dropHover)}
        onDragOver={(e) => {
          if (!hasFiles(e) && !hasSample(e)) return;
          e.preventDefault();
          setDropHover(true);
        }}
        onDragLeave={() => setDropHover(false)}
        onDrop={(e) => (hasSample(e) ? void dropSample(e, null) : dropAudio(e, null))}
        onContextMenu={(e) =>
          openMenu(e, [
            { label: 'Insert Audio Track', onSelect: () => addTrack() },
            ...(clipboard
              ? [{ label: 'Paste as new track', onSelect: () => pasteAsNewTrack(transportTimeMs) }]
              : []),
          ])
        }
      >
        <span>Drag &amp; drop audio here to create a new track</span>
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
