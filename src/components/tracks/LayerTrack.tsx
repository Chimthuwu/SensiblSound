import { useEffect, useRef } from 'react';
import { Volume2, VolumeX, Trash2, Download, Check } from 'lucide-react';
import type { VocalLayer } from '../../types';
import { useSessionStore } from '../../stores/useSessionStore';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { downloadBlobUrl, buildTakeFilename } from '../../utils/download';

interface LayerTrackProps {
  layer: VocalLayer;
  index: number;
  totalDurationMs: number;
  onRemove: (id: string) => void;
}

// A single row in the vocal-layer timeline. Kept layers previously had no
// audio engine at all (just a name in a list) — this wires up real,
// offset-aware playback via useAudioPlayer (same mechanism the active take
// uses) and positions/scales the resulting waveform against the shared
// timeline width so it visually lines up with its neighbors and the grid.
export function LayerTrack({ layer, index, totalDurationMs, onRemove }: LayerTrackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const setLayerDurationMs = useSessionStore((s) => s.setLayerDurationMs);
  const markLayerDownloaded = useSessionStore((s) => s.markLayerDownloaded);

  const { isReady, duration, volume, setVolume, isMuted, setIsMuted } = useAudioPlayer(
    containerRef,
    layer.url,
    { startOffsetMs: layer.transportStartMs, interactive: false }
  );

  useEffect(() => {
    if (isReady && duration > 0) {
      setLayerDurationMs(layer.id, duration * 1000);
    }
  }, [isReady, duration, layer.id, setLayerDurationMs]);

  const leftPercent = totalDurationMs > 0 ? (layer.transportStartMs / totalDurationMs) * 100 : 0;
  const knownWidthPercent = totalDurationMs > 0 && duration > 0
    ? (duration * 1000 / totalDurationMs) * 100
    : 0;
  // Before duration is known, fill the remaining lane so the row isn't a
  // zero-width sliver — it snaps to the real size once WaveSurfer decodes.
  const widthPercent = Math.max(0, Math.min(100 - leftPercent, knownWidthPercent || (100 - leftPercent)));

  const handleDownload = () => {
    downloadBlobUrl(layer.url, buildTakeFilename(layer.timestamp, `vocal-layer-${index + 1}`, layer.mimeType));
    markLayerDownloaded(layer.id);
  };

  const handleRemove = () => {
    const message = layer.downloaded
      ? `Discard Layer ${index + 1}?`
      : `Layer ${index + 1} hasn't been downloaded yet — discarding it now means it's gone for good. Discard anyway?`;
    if (window.confirm(message)) {
      onRemove(layer.id);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0 flex flex-col gap-1">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider truncate">
          Layer {index + 1}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="text-zinc-500 hover:text-primary transition-colors cursor-pointer"
            title={isMuted ? 'Unmute layer' : 'Mute layer'}
          >
            {isMuted || volume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setIsMuted(false);
              setVolume(parseFloat(e.target.value));
            }}
            className="w-12 accent-primary cursor-pointer h-1"
          />
        </div>
      </div>

      <div className="flex-1 relative h-11 bg-black/40 rounded-md overflow-hidden border border-white/[0.05]">
        <div
          ref={containerRef}
          className="absolute top-0 bottom-0"
          style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, opacity: isReady ? 1 : 0.3 }}
        />
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[9px] text-zinc-600 font-semibold tracking-wider animate-pulse">LOADING</span>
          </div>
        )}
      </div>

      <button
        onClick={handleDownload}
        className={`p-1.5 shrink-0 cursor-pointer transition-colors ${
          layer.downloaded ? 'text-emerald-500 hover:text-emerald-400' : 'text-zinc-500 hover:text-emerald-400'
        }`}
        title={layer.downloaded ? 'Downloaded — click to save again' : 'Download this layer'}
      >
        {layer.downloaded ? <Check size={13} /> : <Download size={13} />}
      </button>

      <button
        onClick={handleRemove}
        className="text-zinc-500 hover:text-red-400 p-1.5 shrink-0 cursor-pointer transition-colors"
        title="Discard layer"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
