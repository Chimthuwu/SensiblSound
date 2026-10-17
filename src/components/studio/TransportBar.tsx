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
  const setIsPlaying = useSessionStore((s) => s.setIsPlaying);
  const setIsRecording = useSessionStore((s) => s.setIsRecording);
  const rewindTransport = useSessionStore((s) => s.rewindTransport);

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
          onClick={() => setIsPlaying(!isPlaying)}
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
          onClick={() => setIsRecording(!isRecording)}
          title="Record (R)"
          type="button"
          aria-label={isRecording ? 'Stop recording' : 'Record'}
        >
          <span data-rec-indicator></span>
        </button>
      </div>

      <div className="studio-tp-side" data-align="end">
        <div className="studio-tc-wrap">
          <span className="studio-tp-label">Timecode</span>
          <span className="studio-timecode">{timecode}</span>
        </div>
      </div>
    </footer>
  );
}
