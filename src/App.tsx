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
import { MidiEditor } from './components/studio/MidiEditor';
import { WarpUI } from './components/studio/WarpUI';
import { Mixer } from './components/studio/Mixer';
import { ModDrawer } from './components/studio/ModDrawer';
import { laneInstrument, startMidiEngine } from './midi/midiEngine';
import { startMidiInput } from './midi/midiInput';
import { insertTrack } from './utils/tracks';
import { startModEngine } from './mod/modEngine';

/** True while the computer keyboard plays notes: a MIDI clip on a synth track is selected. */
function pianoKeysLive(): boolean {
  const s = useSessionStore.getState();
  const clip = s.selectedClip && s.midiClips.find((c) => c.id === s.selectedClip!.clipId);
  return !!clip && laneInstrument(clip.laneId)?.kind === 'synth';
}

function App() {
  const viewMode = useSessionStore((s) => s.viewMode);
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

  // MIDI playback scheduler: follows the transport.
  useEffect(() => startMidiEngine(), []);
  // Modulators and automation: the clock that moves modulated parameters.
  useEffect(() => startModEngine(), []);

  // External MIDI controllers: notes play the selected instrument and record while a track is armed.
  useEffect(() => startMidiInput(), []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const st = useSessionStore.getState();
      // F5 toggles the browser and F8 the mixer, even while typing (and F5 never reloads the page).
      if (e.code === 'F5' || e.code === 'F8') {
        e.preventDefault();
        if (e.code === 'F5') st.toggleBrowser();
        else st.setViewMode(st.viewMode === 'mixer' ? 'arrange' : 'mixer');
        return;
      }
      // Don't trigger if user is typing in inputs or select elements
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'SELECT' || activeTag === 'TEXTAREA') {
        return;
      }

      // Ctrl+T (or Alt+T) inserts a track below the selected one. A plain browser tab keeps Ctrl+T for itself, so Alt+T always works.
      if ((e.ctrlKey || e.metaKey || e.altKey) && !e.shiftKey && e.code === 'KeyT') {
        e.preventDefault();
        insertTrack(true);
        return;
      }

      // B and M: browser and mixer. While a synth clip is being edited those two are piano keys, so there only F5 and F8 work.
      if ((e.code === 'KeyB' || e.code === 'KeyM') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !pianoKeysLive()) {
        e.preventDefault();
        if (e.code === 'KeyB') st.toggleBrowser();
        else st.setViewMode(st.viewMode === 'mixer' ? 'arrange' : 'mixer');
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        useSessionStore.getState().togglePlay();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        // R only arms recording; Play starts the transport (and records, when armed).
        useSessionStore.getState().toggleRecordArm();
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
    <div className="h-full bg-background text-zinc-200 flex flex-col font-sans">
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
      <ModDrawer />
      <WarpUI />

      {/* Headless: mounts the mic/recording engine and transport-synced
          playback for the backing track, active take and layers. */}
      <AudioEngine />

      <div className="studio-shell">
      <main className="studio">
        {viewMode === 'mixer' ? <Mixer /> : <Arrangement />}
        <MidiEditor />
        <FXRack />
      </main>
      <SampleBrowser />
      </div>

      <TransportBar />
    </div>
  );
}

export default App;
