import { useEffect, useState } from 'react';
import { HardDrive, Settings, Share2 } from 'lucide-react';
import { useSessionStore } from '../../stores/useSessionStore';
import { googleDrive } from '../../lib/googleDrive';

const HUE_KEY = 'studio-hue';

function readHue(): number {
  try {
    const v = Number(localStorage.getItem(HUE_KEY));
    return Number.isFinite(v) ? Math.min(360, Math.max(0, v)) : 0;
  } catch {
    return 0;
  }
}

/** Shifts the whole app's colour hue. Saved per browser. */
function HueSlider() {
  const [hue, setHue] = useState(readHue);

  useEffect(() => {
    document.documentElement.style.setProperty('--hue-shift', `${hue}deg`);
    try {
      localStorage.setItem(HUE_KEY, String(hue));
    } catch {
      // Storage can be blocked; the slider still works for this visit.
    }
  }, [hue]);

  return (
    <label className="studio-hue" title="Shift the app's colours">
      <span>Hue</span>
      <input
        type="range"
        min={0}
        max={360}
        step={1}
        value={hue}
        onChange={(e) => setHue(Number(e.target.value))}
        aria-label="Hue"
      />
    </label>
  );
}

function StatusPill({ state, label }: { state: 'ok' | 'cloud' | 'off'; label: string }) {
  return (
    <div className="studio-status" data-state={state}>
      <span className="studio-status-dot" />
      <span>{label}</span>
    </div>
  );
}

export function TopBar() {
  const backupStatus = useSessionStore((s) => s.backupStatus);
  const cloudBackupStatus = useSessionStore((s) => s.cloudBackupStatus);
  const driveConnection = useSessionStore((s) => s.driveConnection);
  const driveBackupStatus = useSessionStore((s) => s.driveBackupStatus);
  const setDriveConnection = useSessionStore((s) => s.setDriveConnection);
  const isDriveConfigured = useSessionStore((s) => s.driveConnection !== 'unavailable');

  const localPill = backupStatus === 'success' ? 'ok' : backupStatus === 'failed' ? 'off' : 'ok';
  const cloudPill =
    cloudBackupStatus === 'success'
      ? 'cloud'
      : cloudBackupStatus === 'failed'
        ? 'off'
        : 'cloud';
  const drivePill =
    driveConnection === 'unavailable' ? 'off' : driveBackupStatus === 'success' ? 'ok' : 'off';

  const handleDriveConnect = async () => {
    try {
      await googleDrive.connect();
      setDriveConnection('connected');
    } catch (err) {
      console.warn('Google Drive connection failed', err);
    }
  };

  return (
    <header className="studio-topbar">
      <div className="studio-brand">
        <span className="studio-brand-mark" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 3v10.5a3.5 3.5 0 11-2.5-3.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="18" cy="6" r="2.4" fill="currentColor" opacity="0.85" />
          </svg>
        </span>
        <span>For SENSIMILLIEA 💜</span>
      </div>

      <div className="studio-top-spacer" />
      <HueSlider />

      <StatusPill state={localPill} label="Saved on This Device" />
      <StatusPill state={cloudPill} label="Backed Up to Cloud" />
      <StatusPill
        state={drivePill}
        label={
          driveConnection === 'unavailable'
            ? 'Connect Drive'
            : driveConnection === 'connected'
              ? 'Saved to Drive'
              : 'Connect Drive'
        }
      />

      <div className="studio-download-group">
        <a
          className="studio-download-btn"
          href="https://github.com/Chimthuwu/SensiblSound/releases/download/v1.0.0/Sensi.Soundlabs.Setup.0.0.0.exe"
          target="_blank"
          rel="noopener noreferrer"
        >
          Desktop DL
        </a>
        <a
          className="studio-download-btn"
          href="https://github.com/Chimthuwu/SensiblSound/releases/download/v1.0.0/SENSI-SOUNDLABS-ANDROID.apk"
          target="_blank"
          rel="noopener noreferrer"
        >
          Android APK DL
        </a>
      </div>

      <button
        className="studio-share-btn"
        type="button"
        aria-label="Share project"
      >
        <Share2 width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M12 3v13M8 7l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </Share2>
        Share Project
      </button>

      <button
        className="studio-icon-btn"
        type="button"
        aria-label="Settings"
      >
        <Settings width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M19.4 15a1.6 1.6 0 00.33 1.77l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.6 1.6 0 00-1.77-.33 1.6 1.6 0 00-1 1.47V21a2 2 0 11-4 0v-.1A1.6 1.6 0 008.6 19.4a1.6 1.6 0 00-1.77.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.6 1.6 0 004.6 15a1.6 1.6 0 00-1.47-1H3a2 2 0 110-4h.1A1.6 1.6 0 004.6 8.6a1.6 1.6 0 00-.33-1.77l-.06-.06a2 2 0 112.83-2.83l.06.06A1.6 1.6 0 008.6 4.6h.07A1.6 1.6 0 0010 3.13V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.47 1.6 1.6 0 001.77-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.6 1.6 0 0019.4 8.6v.07a1.6 1.6 0 001.47 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </Settings>
      </button>

      {isDriveConfigured && driveConnection !== 'connected' && (
        <button
          className="studio-share-btn"
          style={{
            background: 'linear-gradient(145deg, #3b82f6, #1d4ed8)',
            boxShadow: '0 3px 14px rgba(59, 130, 246, 0.4)',
          }}
          onClick={handleDriveConnect}
          type="button"
        >
          <HardDrive width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 7l-8-4-8 4m16 0v10l-8 4-8-4V7m0 0v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </HardDrive>
          Connect Drive
        </button>
      )}
    </header>
  );
}
