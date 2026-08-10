import { useRef, useState, useEffect } from 'react';
import { FileAudio, Volume2, VolumeX, Trash2 } from 'lucide-react';
import { useSessionStore } from '../../stores/useSessionStore';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { TimeRuler } from './TimeRuler';

export function BackingTrack() {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { backingTrack, setBackingTrack, bpm, setBackingTrackDurationMs, mutedTracks, soloedTracks, toggleMuteTrack, toggleSoloTrack } = useSessionStore();
  const trackId = 'backing';
  const isGlobalMuted = mutedTracks.has(trackId);
  const isTrackSoloed = soloedTracks.has(trackId);
  const isAnyTrackSoloed = soloedTracks.size > 0;
  const forceMute = isGlobalMuted || (isAnyTrackSoloed && !isTrackSoloed);

  const { isReady, duration, volume, setVolume, isMuted, setIsMuted } = useAudioPlayer(containerRef, backingTrack?.url, { blob: backingTrack?.blob, forceMute });
  const [isDragging, setIsDragging] = useState(false);

  // Feed the decoded duration back into the store — the vocal-layer timeline
  // needs this to keep its own bar grid consistent with the backing track's.
  // Depend on backingTrack?.id (stable) rather than the object itself: the
  // setter below replaces that object with a new reference once durationMs
  // is written, which would otherwise re-trigger this effect forever.
  useEffect(() => {
    if (backingTrack && isReady && duration > 0) {
      setBackingTrackDurationMs(duration * 1000);
    }
  }, [backingTrack?.id, isReady, duration, setBackingTrackDurationMs]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.type === 'audio/mpeg' || file.type === 'audio/wav' || file.name.endsWith('.mp3') || file.name.endsWith('.wav'))) {
      const url = URL.createObjectURL(file);
      setBackingTrack({ id: crypto.randomUUID(), name: file.name, url, blob: file });
    }
    // Reset input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type === 'audio/mpeg' || file.type === 'audio/wav' || file.name.endsWith('.mp3') || file.name.endsWith('.wav'))) {
      const url = URL.createObjectURL(file);
      setBackingTrack({ id: crypto.randomUUID(), name: file.name, url, blob: file });
    }
  };

  return (
    <section className="bg-surface rounded-2xl flex flex-col md:flex-row shadow-xl shadow-black/40 border border-white/5 relative overflow-hidden group h-32">
      {/* Left Sidebar */}
      <div className="w-full md:w-64 p-3 md:p-4 flex flex-col justify-between border-b md:border-b-0 md:border-r border-white/10 bg-[#141416] shrink-0 z-20">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-zinc-300 flex items-center gap-2 tracking-wide font-sans truncate">
            <FileAudio size={14} className="text-primary shrink-0" />
            <span className="truncate">{backingTrack ? backingTrack.name : 'Backing Track'}</span>
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
          {backingTrack && (
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
          )}
          
          <div className="flex items-center gap-2">
            {!backingTrack ? (
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full text-[10px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.05] hover:border-white/[0.1] px-2 py-1 rounded transition-all cursor-pointer font-sans font-semibold text-zinc-300"
              >
                Import Audio
              </button>
            ) : (
              <button 
                onClick={() => setBackingTrack(undefined)}
                className="w-full text-[10px] bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-200 border border-red-500/20 px-2 py-1 rounded transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <Trash2 size={12} />
                Clear
              </button>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="audio/mpeg, audio/wav, .mp3, .wav" 
              className="hidden" 
            />
          </div>
        </div>
      </div>
      
      {/* Right Waveform */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex-1 relative overflow-hidden transition-all duration-300 ${

          isDragging 
            ? 'border-l-primary bg-primary/5 shadow-[inset_0_0_12px_rgba(168,85,247,0.15)]' 
            : 'hover:bg-black/20 shadow-[inset_0_2px_8px_rgba(0,0,0,0.3)] bg-[#1a1a1c]'
        }`}
      >
        {/* DAW Gridlines */}
        <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:calc(100%/16)_100%] z-0" />
        
        <div
          ref={containerRef}
          className="absolute inset-0 w-full h-full z-10"
          // Once the backing track is loaded, enable pointer events so clicks/drag
          // on the waveform seek the global transport (and dynamically disable
          // before loading so drag-and-drop import still works through this layer).
          style={{ opacity: backingTrack ? 1 : 0, pointerEvents: (backingTrack && isReady) ? 'auto' : 'none' }}
        />

        {/* Bar-numbered timeline ruler — sits above the wave on z-20, click-through
            via pointer-events-none. Numbered 1...N with every 4th bar bolded
            to make phrase boundaries visually obvious for pattern recognition. */}
        {backingTrack && isReady && (
          <TimeRuler bpm={bpm} duration={duration} />
        )}
        
        {!backingTrack && (
          <div className="text-zinc-400 text-sm flex flex-col items-center gap-2 pointer-events-none font-sans tracking-wide">
            <FileAudio size={28} className="text-primary/70 animate-pulse mb-1" />
            <span className="font-semibold text-zinc-200">Drag & drop your backing track here</span>
            <span className="text-xs text-zinc-500 font-sans">Supports high-quality MP3 and WAV files</span>
          </div>
        )}

        {backingTrack && !isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0b]/80 z-10 backdrop-blur-sm">
            <span className="text-xs text-primary animate-pulse font-bold tracking-wider">ANALYZING AUDIO...</span>
          </div>
        )}
      </div>
    </section>
  );
}
