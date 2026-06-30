import { useSessionStore } from './stores/useSessionStore';
import { Play, Square, Circle, Mic2, Settings, Activity } from 'lucide-react';
import { BackingTrack } from './components/tracks/BackingTrack';
import { VocalTrack } from './components/tracks/VocalTrack';
import { useMetronome } from './hooks/useMetronome';
import { useTempoDetector } from './hooks/useTempoDetector';

function App() {
  const { 
    isRecording, isPlaying, bpm, setBpm, backupStatus, setIsRecording, setIsPlaying,
    isMetronomeEnabled, setIsMetronomeEnabled, metronomeVolume, setMetronomeVolume
  } = useSessionStore();
  
  // Initialize smart helpers
  useMetronome();
  const { showPrompt, detectedBpm, acceptDetectedBpm, dismissPrompt } = useTempoDetector();

  return (
    <div className="min-h-screen bg-background text-zinc-200 flex flex-col font-sans">
      {/* Tempo Detection Prompt Modal */}
      {showPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-white/10 rounded-xl p-6 shadow-2xl max-w-md w-full flex flex-col gap-4">
            <div className="flex items-center gap-3 text-primary">
              <Activity size={24} />
              <h2 className="text-lg font-semibold text-white">Tempo Detected</h2>
            </div>
            <p className="text-zinc-400 text-sm">
              This audio appears to be approximately <strong className="text-white">{detectedBpm} BPM</strong>.
            </p>
            <p className="text-zinc-400 text-sm">Would you like to:</p>
            <div className="flex flex-col gap-2 mt-2">
              <button 
                onClick={acceptDetectedBpm}
                className="bg-primary hover:bg-primary/80 text-white font-medium py-2 rounded-md transition-colors"
              >
                Use detected BPM
              </button>
              <button 
                onClick={dismissPrompt}
                className="bg-white/5 hover:bg-white/10 text-white font-medium py-2 rounded-md transition-colors"
              >
                Enter BPM manually
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header / Navigation */}
      <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-surface/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
            <Mic2 size={18} />
          </div>
          <h1 className="font-semibold text-lg tracking-tight">Sensible Soundlabs</h1>
        </div>
        
        <div className="flex items-center gap-4 text-sm font-medium">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface border border-white/5">
            <div className={`w-2 h-2 rounded-full ${
              backupStatus === 'success' ? 'bg-green-500' :
              backupStatus === 'uploading' ? 'bg-yellow-500' :
              backupStatus === 'failed' ? 'bg-red-500' : 'bg-zinc-600'
            }`} />
            <span className="capitalize text-zinc-400">
              {backupStatus === 'idle' ? 'Cloud Sync Ready' : backupStatus}
            </span>
          </div>
          <button className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <Settings size={18} className="text-zinc-400" />
          </button>
        </div>
      </header>

      {/* Main Studio Area */}
      <main className="flex-1 flex flex-col p-6 gap-6 max-w-6xl mx-auto w-full relative z-10">
        <BackingTrack />
        <VocalTrack />
      </main>

      {/* Transport Controls (Bottom Bar) */}
      <footer className="h-20 border-t border-white/5 bg-surface/90 backdrop-blur-md flex items-center justify-center gap-6 px-6 relative z-20">
        
        {/* BPM & Metronome */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-black/30 px-3 py-1.5 rounded-md border border-white/5">
            <input 
              type="number" 
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value) || 120)}
              className="w-12 bg-transparent text-sm font-mono text-zinc-300 outline-none"
            />
            <span className="text-xs text-zinc-500 font-mono">BPM</span>
          </div>
          
          <div className="flex items-center gap-2 border-l border-white/10 pl-4">
            <button 
              onClick={() => setIsMetronomeEnabled(!isMetronomeEnabled)}
              className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${
                isMetronomeEnabled ? 'bg-primary/20 text-primary' : 'bg-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              CLICK
            </button>
            <input 
              type="range" 
              min="0" max="1" step="0.01" 
              value={metronomeVolume}
              onChange={(e) => setMetronomeVolume(parseFloat(e.target.value))}
              className="w-16 accent-primary opacity-50 hover:opacity-100 transition-opacity"
            />
          </div>
        </div>

        {/* Core Transport */}
        <div className="flex items-center gap-4 border-l border-r border-white/10 px-8">
          <button 
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isPlaying ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white/5 text-zinc-300 hover:bg-white/10'}`}
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? <Square size={20} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-1" />}
          </button>
          
          <button 
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isRecording 
                ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:bg-red-600' 
                : 'bg-zinc-800 text-red-500 hover:bg-zinc-700 border-2 border-zinc-700 hover:border-red-500/50'
            }`}
            onClick={() => setIsRecording(!isRecording)}
          >
             {isRecording ? <Square size={20} fill="currentColor" /> : <Circle size={20} fill="currentColor" />}
          </button>
        </div>

        <div className="w-24 text-center">
          <span className="text-xs text-zinc-500">00:00:00</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
