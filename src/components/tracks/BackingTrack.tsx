import { useRef, useState } from 'react';
import { FileAudio, Volume2, VolumeX } from 'lucide-react';
import { useSessionStore } from '../../stores/useSessionStore';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';

export function BackingTrack() {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { backingTrack, setBackingTrack } = useSessionStore();
  const { isReady, volume, setVolume, isMuted, setIsMuted } = useAudioPlayer(containerRef, backingTrack?.url);
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
    <section className="bg-surface border border-white/5 rounded-xl p-4 flex flex-col gap-4 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-400 flex items-center gap-2">
          <FileAudio size={16} />
          Backing Track {backingTrack ? `- ${backingTrack.name}` : ''}
        </h2>
        <div className="flex items-center gap-4">
          {backingTrack && (
            <div className="flex items-center gap-2 text-zinc-400">
              <button onClick={() => setIsMuted(!isMuted)} className="hover:text-white transition-colors">
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
                className="w-20 accent-primary"
              />
            </div>
          )}
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="text-xs bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-md transition-colors"
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
        className={`h-24 bg-black/40 rounded-lg border relative overflow-hidden flex items-center justify-center transition-colors ${
          isDragging ? 'border-primary/80 bg-primary/10' : 'border-white/5 hover:border-primary/30'
        }`}
      >
        <div 
          ref={containerRef} 
          className="absolute inset-0 w-full h-full"
          style={{ opacity: backingTrack ? 1 : 0, pointerEvents: 'none' }}
        />
        
        {!backingTrack && (
          <div className="text-zinc-600 text-sm flex flex-col items-center gap-2 pointer-events-none">
            <FileAudio size={24} className="opacity-50" />
            <span>Drag and drop an MP3 or WAV here</span>
          </div>
        )}

        {backingTrack && !isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10 backdrop-blur-sm">
            <span className="text-xs text-primary animate-pulse font-medium">Analyzing audio...</span>
          </div>
        )}
      </div>
    </section>
  );
}
