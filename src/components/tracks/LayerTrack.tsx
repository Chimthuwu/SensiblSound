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
  const trackId = layer.id;
  const isGlobalMuted = useSessionStore(state => state.mutedTracks).has(trackId);
  const isTrackSoloed = useSessionStore(state => state.soloedTracks).has(trackId);
  const isAnyTrackSoloed = useSessionStore(state => state.soloedTracks).size > 0;
  const forceMute = isGlobalMuted || (isAnyTrackSoloed && !isTrackSoloed);
  const { toggleMuteTrack, toggleSoloTrack } = useSessionStore();

  const { isReady, duration, volume, setVolume, isMuted, setIsMuted } = useAudioPlayer(
    containerRef,
    layer.url,
    { startOffsetMs: layer.transportStartMs, interactive: true, forceMute }
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

  const handleDownload = async (format: 'wav' | 'mp3' = 'wav') => {
    let downloadUrl = layer.url;
    let mimeType = layer.mimeType;
    let extension = undefined;
    
    if (format === 'mp3') {
      try {
        const { convertBlobToAudioBuffer, encodeMp3 } = await import('../../utils/audioEncoding');
        let blobToConvert = layer.blob;
        if (!blobToConvert) {
          blobToConvert = await (await fetch(layer.url)).blob();
        }
        const audioBuffer = await convertBlobToAudioBuffer(blobToConvert);
        const mp3Blob = encodeMp3(audioBuffer);
        downloadUrl = URL.createObjectURL(mp3Blob);
        mimeType = 'audio/mp3';
        extension = 'mp3';
      } catch (e) {
        console.error("Failed to convert to mp3", e);
        return;
      }
    }

    downloadBlobUrl(downloadUrl, buildTakeFilename(layer.timestamp, `vocal-layer-${index + 1}`, mimeType, extension));
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
    <div className="bg-surface rounded-xl flex flex-col md:flex-row shadow-lg shadow-black/20 border border-white/5 relative overflow-hidden group h-28">
      {/* Left Sidebar */}
      <div className="w-full md:w-64 p-3 flex flex-col justify-between border-b md:border-b-0 md:border-r border-white/10 bg-[#141416] shrink-0 z-20">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-zinc-300 flex items-center gap-2 tracking-wide font-sans truncate">
            <span className="truncate">Layer {index + 1}</span>
          </h2>
          
          {/* Mute / Solo */}
          <div className="flex items-center gap-1 shrink-0">
            <button 
              onClick={() => toggleMuteTrack(trackId)} 
              className={`w-6 h-6 flex items-center justify-center rounded font-bold text-[9px] transition-colors cursor-pointer ${isGlobalMuted ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-black/30 text-zinc-400 border border-white/5 hover:text-white'}`}
              title="Mute Track"
            >
              M
            </button>
            <button 
              onClick={() => toggleSoloTrack(trackId)} 
              className={`w-6 h-6 flex items-center justify-center rounded font-bold text-[9px] transition-colors cursor-pointer ${isTrackSoloed ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-black/30 text-zinc-400 border border-white/5 hover:text-white'}`}
              title="Solo Track"
            >
              S
            </button>
          </div>
        </div>

        {/* Volume & Controls */}
        <div className="flex flex-col gap-2 mt-2">
          <div className="flex items-center gap-2 text-zinc-400 bg-black/40 px-2 py-1 rounded-md border border-white/[0.03]">
            <button onClick={() => setIsMuted(!isMuted)} className="hover:text-white transition-colors cursor-pointer shrink-0">
              {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
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
              className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-full appearance-none"
            />
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleDownload('wav')}
              className={`flex-1 text-[10px] px-2 py-1 rounded border transition-colors flex items-center justify-center gap-1 cursor-pointer font-sans font-semibold ${
                layer.downloaded 
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30' 
                  : 'bg-white/[0.04] text-zinc-400 border-white/[0.05] hover:text-white hover:bg-white/[0.08]'
              }`}
              title={layer.downloaded ? 'Downloaded (WAV)' : 'Download this layer as WAV'}
            >
              {layer.downloaded ? <Check size={12} /> : <Download size={12} />}
              WAV
            </button>
            <button
              onClick={() => handleDownload('mp3')}
              className="flex-1 text-[10px] px-2 py-1 rounded border border-white/[0.05] bg-[#141416] text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors flex items-center justify-center gap-1 cursor-pointer font-sans font-semibold"
              title="Download this layer as MP3"
            >
              <Download size={12} />
              MP3
            </button>
            <button
              onClick={handleRemove}
              className="text-[10px] bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-200 border border-red-500/20 px-2 py-1 rounded transition-colors flex items-center justify-center cursor-pointer"
              title="Discard layer"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 relative bg-black/40 overflow-hidden border-l border-white/[0.05] hover:bg-black/20 transition-all duration-300">
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
    </div>
  );
}
