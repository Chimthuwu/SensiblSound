import { useRef, useState } from 'react';
import { FileAudio, Volume2, VolumeX, Trash2 } from 'lucide-react';
import { useSessionStore } from '../../stores/useSessionStore';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { TimeRuler } from './TimeRuler';

export function BackingTrack() {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { backingTrack, setBackingTrack, bpm } = useSessionStore();
  const { isReady, duration, volume, setVolume, isMuted, setIsMuted } = useAudioPlayer(containerRef, backingTrack?.url);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.type === 'audio/mpeg' || file.type === 'audio/wav' || file.name.endsWith('.mp3') || file.name.endsWith('.wav'))) {
      const url = URL.createObjectURL(file);
      setBackingTrack({ id: crypto.randomUUID(), name: file.name, url });
    }
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
      setBackingTrack({ id: crypto.randomUUID(), name: file.name, url });
    }
  };

  return (
    <section className="bg-surface rounded-2xl p-5 flex flex-col gap-5 shadow-xl shadow-black/40">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-400 flex items-center gap-2 tracking-wide font-sans uppercase">
          <FileAudio size={16} className="text-primary" />
          Backing Track {backingTrack ? `— ${backingTrack.name}` : ''}
        </h2>
        <div className="flex items-center gap-4">
          {backingTrack && (
            <div className="flex items-center gap-3 text-zinc-400 bg-black/30 px-3 py-1.5 rounded-lg border border-white/[0.03]">
              <button onClick={() => setIsMuted(!isMuted)} className="hover:text-white transition-colors cursor-pointer">
                {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
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
                className="w-20 accent-primary cursor-pointer"
              />
            </div>
          )}
          {backingTrack && (
            <button 
              onClick={() => setBackingTrack(undefined)}
              className="text-xs bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-200 border border-red-500/20 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 size={13} />
              Clear
            </button>
          )}
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="text-xs bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.05] hover:border-white/[0.1] px-4 py-1.5 rounded-lg transition-all cursor-pointer font-sans font-semibold text-zinc-200"
          >
            {backingTrack ? 'Replace Audio' : 'Import Audio'}
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="audio/mpeg, audio/wav, .mp3, .wav" 
            className="hidden" 
          />
        </div>
      </div>
      
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`h-28 bg-black/50 rounded-xl border relative overflow-hidden flex items-center justify-center transition-all duration-300 ${
          isDragging 
            ? 'border-primary bg-primary/5 shadow-[inset_0_0_12px_rgba(168,85,247,0.15)]' 
            : 'border-dashed border-white/10 hover:border-primary/30 hover:bg-black/60 shadow-[inset_0_2px_8px_rgba(0,0,0,0.3)]'
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
