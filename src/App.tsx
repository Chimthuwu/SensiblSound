import { useEffect } from 'react';
import { useSessionStore } from './stores/useSessionStore';
import { Play, Square, Circle, Mic2, Settings, Activity, Share2, SkipBack } from 'lucide-react';
import { BackingTrack } from './components/tracks/BackingTrack';
import { VocalTrack } from './components/tracks/VocalTrack';
import { VocalFxRack } from './components/effects/VocalFxRack';
import { useMetronome } from './hooks/useMetronome';
import { useTempoDetector } from './hooks/useTempoDetector';
import { useTimer } from './hooks/useTimer';

// Transport scrubber max length (10 minutes). Hardcoded for the MVP; could
// later be derived from the longest loaded audio's duration.
const TRANSPORT_MAX_MS = 600_000;

function App() {
  const {
    isRecording, isPlaying, bpm, setBpm, backupStatus, cloudBackupStatus, setIsRecording, setIsPlaying,
    isMetronomeEnabled, setIsMetronomeEnabled, metronomeVolume, setMetronomeVolume,
    transportTimeMs, setTransportTimeMs, rewindTransport, activeTake, layers
  } = useSessionStore();

  // Initialize smart helpers
  useMetronome();
  const { showPrompt, detectedBpm, acceptDetectedBpm, dismissPrompt } = useTempoDetector();
  const { formattedTime } = useTimer();

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in inputs or select elements
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'SELECT' || activeTag === 'TEXTAREA') {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        setIsRecording(!isRecording);
      } else if (e.code === 'Home') {
        // Rewind transport to the start of the project.
        e.preventDefault();
        rewindTransport();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPlaying, isRecording, setIsPlaying, setIsRecording, rewindTransport]);

  // Warn before closing/refreshing the tab if there's a recording she
  // hasn't downloaded yet — this is currently the only durable copy of her
  // vocals (there is no real cloud backend), so losing it here means it's
  // gone. Browsers show their own generic confirmation text regardless of
  // what's set here; the handler's mere presence is what triggers it.
  useEffect(() => {
    const hasUndownloadedRecording = (activeTake && !activeTake.downloaded)
      || layers.some((layer) => !layer.downloaded);

    if (!hasUndownloadedRecording) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // required by some browsers to actually show the prompt
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [activeTake, layers]);

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
      <header className="h-16 border-b border-white/[0.04] flex items-center justify-between px-8 bg-background/80 backdrop-blur-md relative z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-sm">
            <Mic2 size={16} />
          </div>
          <h1 className="font-semibold text-base tracking-tight text-white font-sans">Sensible Soundlabs</h1>
        </div>
        
        <div className="flex items-center gap-4 text-xs font-medium">
          {/* Local (IndexedDB) save is the guarantee that matters most, so
              it stays fully visible (not dimmed) when it fails — that's the
              moment she most needs to notice. */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-white/[0.03] transition-all duration-300 ${
            backupStatus === 'failed' ? '' : 'opacity-60 hover:opacity-100'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${
              backupStatus === 'success' ? 'bg-emerald-500' :
              backupStatus === 'uploading' ? 'bg-amber-500 animate-pulse' :
              backupStatus === 'failed' ? 'bg-rose-500 animate-pulse' : 'bg-zinc-600'
            }`} />
            <span className={`font-sans tracking-wide ${backupStatus === 'failed' ? 'text-rose-400 font-semibold' : 'text-zinc-400'}`}>
              {backupStatus === 'idle' && 'Not Backed Up Yet'}
              {backupStatus === 'uploading' && 'Saving to This Device…'}
              {backupStatus === 'success' && 'Saved on This Device'}
              {backupStatus === 'failed' && 'Save Failed — Download Now!'}
            </span>
          </div>

          {/* Real Firebase Storage cloud backup, tracked independently of
              local save — a cloud failure isn't alarming on its own (local +
              download already cover her), so this one stays quietly dimmed
              even when it fails. */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-white/[0.03] opacity-60 hover:opacity-100 transition-all duration-300">
            <div className={`w-1.5 h-1.5 rounded-full ${
              cloudBackupStatus === 'success' ? 'bg-emerald-500' :
              cloudBackupStatus === 'uploading' ? 'bg-amber-500 animate-pulse' :
              cloudBackupStatus === 'failed' ? 'bg-rose-500' : 'bg-zinc-600'
            }`} />
            <span className="font-sans tracking-wide text-zinc-400">
              {cloudBackupStatus === 'idle' && 'Cloud Backup Ready'}
              {cloudBackupStatus === 'uploading' && 'Backing Up to Cloud…'}
              {cloudBackupStatus === 'success' && 'Backed Up to Cloud'}
              {cloudBackupStatus === 'failed' && 'Cloud Backup Unavailable'}
            </span>
          </div>

          <button className="text-xs bg-primary/10 hover:bg-primary/25 text-primary font-semibold px-4 py-1.5 rounded-lg transition-all duration-300 border border-primary/15 hover:border-primary/30 flex items-center gap-2 cursor-pointer">
            <Share2 size={13} />
            Share Project
          </button>
          <button className="p-2 hover:bg-white/[0.04] rounded-lg text-zinc-400 hover:text-white transition-all cursor-pointer border border-transparent hover:border-white/[0.05]">
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* Main Studio Area */}
      <main className="flex-1 flex flex-col p-8 gap-6 max-w-6xl mx-auto w-full relative z-10">
        <BackingTrack />
        
        {/* Clean hardware-like visual connector divider */}
        <div className="flex items-center gap-4 px-2 my-1">
          <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          <div className="text-[10px] uppercase font-bold tracking-[0.2em] text-zinc-600 font-sans">Signal Flow</div>
          <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        </div>

        <VocalTrack />
        <VocalFxRack />
      </main>

      {/* Transport Controls (Bottom Bar) */}
      <footer className="h-24 border-t border-white/[0.04] bg-[#0c0c0e]/95 backdrop-blur-md flex items-center justify-between px-12 relative z-20">
        
        {/* Left Side: BPM & Metronome */}
        <div className="flex items-center gap-6 w-1/3">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Tempo</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <input 
                  type="number" 
                  value={bpm}
                  onChange={(e) => setBpm(Number(e.target.value) || 120)}
                  className="w-16 bg-transparent text-2xl font-bold font-mono text-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase font-mono">BPM</span>
              </div>
            </div>
            
            <div className="h-8 w-[1px] bg-white/[0.08]" />
            
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsMetronomeEnabled(!isMetronomeEnabled)}
                  className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded transition-all duration-300 cursor-pointer ${
                    isMetronomeEnabled ? 'bg-primary/20 text-primary border border-primary/25' : 'bg-white/[0.02] border border-white/[0.05] text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  CLICK
                </button>
                <input 
                  type="range" 
                  min="0" max="1" step="0.01" 
                  value={metronomeVolume}
                  onChange={(e) => setMetronomeVolume(parseFloat(e.target.value))}
                  className="w-20 accent-primary opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Center: Core Transport Controls */}
        <div className="flex items-center justify-center gap-4 w-1/3">
          <button
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer border bg-white/[0.03] text-zinc-300 border-white/[0.05] hover:bg-white/[0.08] hover:border-white/[0.1] hover:scale-105"
            onClick={rewindTransport}
            title="Rewind to start (Home)"
          >
            <SkipBack size={16} fill="currentColor" />
          </button>

          <button
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer border ${
              isPlaying
                ? 'bg-primary text-white border-primary shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                : 'bg-white/[0.03] text-zinc-300 border-white/[0.05] hover:bg-white/[0.08] hover:border-white/[0.1] hover:scale-105'
            }`}
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Square size={16} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
          </button>

          <button
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer border ${
              isRecording
                ? 'bg-red-500 text-white border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.55)] scale-105 hover:bg-red-600'
                : 'bg-zinc-900 text-red-500 border-red-500/25 hover:border-red-500/60 hover:bg-zinc-800 shadow-[0_0_15px_rgba(239,68,68,0.05)] hover:scale-105'
            }`}
            onClick={() => setIsRecording(!isRecording)}
            title={isRecording ? 'Stop Recording (R)' : 'Record (R)'}
          >
             {isRecording ? <Square size={18} fill="currentColor" /> : <Circle size={22} fill="currentColor" />}
          </button>
        </div>

        {/* Right Side: Transport Scrub + Hardware Timecode */}
        <div className="flex flex-col items-end gap-1.5 w-1/3">
          <div className="flex items-center gap-3 mr-1">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Transport</span>
            <input
              type="range"
              min="0"
              max={TRANSPORT_MAX_MS}
              step={50}
              value={Math.min(transportTimeMs, TRANSPORT_MAX_MS)}
              onChange={(e) => setTransportTimeMs(parseInt(e.target.value, 10))}
              className="w-56 accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
              title="Scrub transport position"
            />
          </div>
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mr-1">Timecode</span>
          <div className="text-3xl md:text-4xl font-bold font-mono tracking-widest text-primary drop-shadow-[0_0_8px_rgba(168,85,247,0.15)] selection:bg-transparent select-none mt-0.5">
            {formattedTime}
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
