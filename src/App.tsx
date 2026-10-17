import { useEffect } from 'react';
import { useSessionStore } from './stores/useSessionStore';
import { googleDrive } from './lib/googleDrive';


import { useMetronome } from './hooks/useMetronome';
import { useTempoDetector } from './hooks/useTempoDetector';
import { useTimer } from './hooks/useTimer';

import { Arrangement } from './components/studio/Arrangement';
import { AudioEngine } from './components/studio/AudioEngine';
import { FXRack } from './components/studio/FXRack';
import { TopBar } from './components/studio/TopBar';
import { TransportBar } from './components/studio/TransportBar';
import { SampleBrowser } from './components/studio/SampleBrowser';

function App() {
  const {
    isRecording, isPlaying, setIsRecording, setIsPlaying,
    rewindTransport, activeTake, layers,
    driveConnection, setDriveConnection
  } = useSessionStore();
  useEffect(() => {
    if (driveConnection === 'unavailable') return;
    googleDrive.reconnectSilently().then((connected) => {
      setDriveConnection(connected ? 'connected' : 'disconnected');
    });
  }, [driveConnection, setDriveConnection]);

  // Initialize smart helpers
  useMetronome();
  const { showPrompt, detectedBpm, acceptDetectedBpm, dismissPrompt } = useTempoDetector();
  // Drives transportTimeMs while playing/recording. Without it the playhead,
  // timecode and recording start offsets never move.
  useTimer();

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

      <TopBar />

      {/* Headless: mounts the mic/recording engine and transport-synced
          playback for the backing track, active take and layers. */}
      <AudioEngine />

      <div className="studio-shell">
      <main className="studio">
        <Arrangement />
        <FXRack />
      </main>
      <SampleBrowser />
      </div>

      <TransportBar />
    </div>
  );
}

export default App;
