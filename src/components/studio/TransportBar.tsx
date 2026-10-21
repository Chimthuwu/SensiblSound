import { useSessionStore } from '../../stores/useSessionStore';

export function TransportBar() {
  const bpm = useSessionStore((s) => s.bpm);
  const setBpm = useSessionStore((s) => s.setBpm);
  const isPlaying = useSessionStore((s) => s.isPlaying);
  const isRecording = useSessionStore((s) => s.isRecording);
  const transportTimeMs = useSessionStore((s) => s.transportTimeMs);
  const isMetronomeEnabled = useSessionStore((s) => s.isMetronomeEnabled);
  const metronomeVolume = useSessionStore((s) => s.metronomeVolume);
  const setIsMetronomeEnabled = useSessionStore((s) => s.setIsMetronomeEnabled);
  const setMetronomeVolume = useSessionStore((s) => s.setMetronomeVolume);
  const togglePlay = useSessionStore((s) => s.togglePlay);
  const recordArmed = useSessionStore((s) => s.recordArmed);
  const toggleRecordArm = useSessionStore((s) => s.toggleRecordArm);
  const rewindTransport = useSessionStore((s) => s.rewindTransport);
  const loop = useSessionStore((s) => s.loop);
  const timeSelection = useSessionStore((s) => s.timeSelection);

  const totalSec = (transportTimeMs ?? 0) / 1000;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const c = Math.floor((totalSec % 1) * 100);

  const timecode = [
    String(m).padStart(2, '0'),
    ':',
    String(s).padStart(2, '0'),
    ':',
    String(c).padStart(2, '0'),
  ].join('');

  return (
    <footer className="studio-transport">
      <div className="studio-tp-side">
        <div className="studio-tempo">
          <span className="studio-tp-label">Tempo</span>
          <span className="studio-tempo-value">
            <input
              type="number"
              className="studio-tempo-input"
              min={20}
              max={300}
              step={1}
              value={bpm}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 20 && v <= 300) setBpm(v);
              }}
              aria-label="Tempo in BPM"
            />
            <span>BPM</span>
          </span>
        </div>
        <div className="studio-click-ctl">
          <span className="studio-tp-label">Click</span>
          <div className="studio-click-row">
            <button
              className="studio-click-btn"
              data-on={String(isMetronomeEnabled)}
              onClick={() => setIsMetronomeEnabled(!isMetronomeEnabled)}
              type="button"
            >
              {isMetronomeEnabled ? 'ON' : 'OFF'}
            </button>
            <input
              type="range"
              className="studio-click-slider"
              min={0}
              max={100}
              value={Math.round((metronomeVolume ?? 0.5) * 100)}
              onChange={(e) => setMetronomeVolume(parseFloat(e.target.value) / 100)}
            />
          </div>
        </div>
      </div>

      <div className="studio-tp-center">
        <button
          className="studio-tp-btn"
          onClick={() => rewindTransport()}
          title="Return to start (Home)"
          type="button"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M6 5h2.2v14H6zM20 5v14l-10-7z" />
          </svg>
        </button>
        <button
          className={`studio-tp-btn ${isPlaying ? 'studio-tp-btn-primary' : ''}`}
          onClick={() => togglePlay()}
          title="Play / Stop (Space)"
          type="button"
          aria-label={isPlaying ? 'Stop' : 'Play'}
        >
          {isPlaying ? (
            <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" />
              <rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 5v14l12-7z" fill="currentColor" />
            </svg>
          )}
        </button>
        <button
          className="studio-tp-rec"
          data-recording={String(isRecording)}
          data-armed={String(recordArmed)}
          onClick={() => toggleRecordArm()}
          title={recordArmed ? 'Recording is armed: press Play to record (R to disarm)' : 'Arm recording (R). Play then starts recording'}
          type="button"
          aria-pressed={recordArmed}
          aria-label={recordArmed ? 'Disarm recording' : 'Arm recording'}
        >
          <span data-rec-indicator></span>
        </button>
      </div>

      <div className="studio-tp-side" data-align="end">
        <button
          className="studio-tp-btn studio-loop-btn"
          type="button"
          data-on={String(!!loop?.enabled)}
          aria-pressed={!!loop?.enabled}
          onClick={() => {
            const st = useSessionStore.getState();
            if (st.loop) st.toggleLoop();
            else if (st.timeSelection) st.setLoop({ ...st.timeSelection, enabled: true });
            else st.showToast('Drag across the timeline to highlight a section, then press Ctrl+L to loop it.');
          }}
          title={loop ? (loop.enabled ? 'Looping. Click to switch the loop off (Ctrl+L)' : 'Loop is off. Click to switch it on (Ctrl+L)') : timeSelection ? 'Loop the highlighted time (Ctrl+L)' : 'Highlight a section of the timeline, then Ctrl+L'}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M17 2l3 3-3 3M7 22l-3-3 3-3M4 12V10a4 4 0 014-4h12M20 12v2a4 4 0 01-4 4H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="studio-tc-wrap">
          <span className="studio-tp-label">Timecode</span>
          <span className="studio-timecode">{timecode}</span>
        </div>
      </div>
    </footer>
  );
}
