import { useEffect, useRef, useState } from 'react';
import { AudioWaveform, HardDrive, Magnet, Palette, Settings, Share2, SlidersVertical } from 'lucide-react';
import { useContextMenu } from './ContextMenu';
import { connectMidi } from '../../midi/midiInput';
import { useSessionStore } from '../../stores/useSessionStore';
import { googleDrive } from '../../lib/googleDrive';

const HUE_KEY = 'studio-hue'; // the old hue-only setting, still read so nobody loses their colour
const THEME_KEY = 'studio-theme';

interface Theme { hue: number; saturation: number; contrast: number }
const DEFAULT_THEME: Theme = { hue: 0, saturation: 100, contrast: 100 };

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

function readTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw) {
      const t = JSON.parse(raw) as Partial<Theme>;
      return { hue: clamp(t.hue, 0, 360, 0), saturation: clamp(t.saturation, 40, 200, 100), contrast: clamp(t.contrast, 70, 140, 100) };
    }
    const legacy = localStorage.getItem(HUE_KEY);
    if (legacy !== null) return { ...DEFAULT_THEME, hue: clamp(legacy, 0, 360, 0) };
  } catch {
    // Storage can be blocked; the theme still works for this visit.
  }
  return DEFAULT_THEME;
}

/** The Theme button: opens a small panel with hue, saturation and contrast for the whole app. Saved per browser. */
function ThemeMenu() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = document.documentElement.style;
    el.setProperty('--hue-shift', `${theme.hue}deg`);
    el.setProperty('--theme-sat', String(theme.saturation / 100));
    el.setProperty('--theme-contrast', String(theme.contrast / 100));
    try {
      localStorage.setItem(THEME_KEY, JSON.stringify(theme));
    } catch {
      // see readTheme
    }
  }, [theme]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const set = (patch: Partial<Theme>) => setTheme((t) => ({ ...t, ...patch }));
  const changed = theme.hue !== 0 || theme.saturation !== 100 || theme.contrast !== 100;

  return (
    <div className="studio-theme" ref={rootRef}>
      <button
        className="studio-theme-btn"
        type="button"
        data-changed={String(changed)}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        title="Change the app's colours"
      >
        <Palette size={14} aria-hidden="true" />
        <span>Theme</span>
        <span className="studio-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="studio-theme-pop" role="dialog" aria-label="Theme">
          <ThemeRow label="Hue" value={theme.hue} min={0} max={360} unit="°" onChange={(hue) => set({ hue })} />
          <ThemeRow label="Saturation" value={theme.saturation} min={40} max={200} unit="%" onChange={(saturation) => set({ saturation })} />
          <ThemeRow label="Contrast" value={theme.contrast} min={70} max={140} unit="%" onChange={(contrast) => set({ contrast })} />
          <button className="studio-mini-btn" type="button" disabled={!changed} onClick={() => setTheme(DEFAULT_THEME)}>
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

function ThemeRow({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="studio-theme-row" data-kind={label.toLowerCase()}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} onDoubleClick={() => onChange(label === 'Hue' ? 0 : 100)} aria-label={label} title="Double-click to reset" />
      <output>{value}{unit}</output>
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

/** Magnet + waveform: when on, audio that drops in is warped to the project tempo (transients snap to the beat grid). */
function WarpButton() {
  const autoWarp = useSessionStore((s) => s.autoWarp);
  const setAutoWarp = useSessionStore((s) => s.setAutoWarp);
  const busy = useSessionStore((s) => s.warpBusy > 0);
  const noAsk = useSessionStore((s) => s.warpPromptDisabled);
  const setNoAsk = useSessionStore((s) => s.setWarpPromptDisabled);
  const openMenu = useContextMenu();
  return (
    <button
      className="studio-warp-btn"
      type="button"
      data-on={String(autoWarp)}
      data-busy={String(busy)}
      aria-pressed={autoWarp}
      onClick={() => setAutoWarp(!autoWarp)}
      onContextMenu={(e) =>
        openMenu(e, [
          { label: 'Auto-warp new audio', checked: autoWarp, onSelect: () => setAutoWarp(!autoWarp) },
          { label: "Don't ask me about warping when it's off", checked: noAsk, onSelect: () => setNoAsk(!noAsk) },
        ])
      }
      title={
        autoWarp
          ? 'Auto-warp is ON: new audio is stretched and snapped to the project tempo. Click to turn off.'
          : 'Auto-warp is OFF: new audio drops in as it is (you will be asked). Click to turn on.'
      }
    >
      <Magnet size={14} aria-hidden="true" />
      <AudioWaveform size={14} aria-hidden="true" />
      <span>{busy ? 'Warping…' : 'Warp'}</span>
    </button>
  );
}

/** Shows the connected MIDI controller, lets you pick one, and lights up when notes arrive. */
function MidiPill() {
  const status = useSessionStore((s) => s.midiStatus);
  const inputs = useSessionStore((s) => s.midiInputs);
  const chosen = useSessionStore((s) => s.midiInputId);
  const setChosen = useSessionStore((s) => s.setMidiInputId);
  const activity = useSessionStore((s) => s.midiActivity);
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (!activity) return;
    setLit(true);
    const t = window.setTimeout(() => setLit(false), 140);
    return () => window.clearTimeout(t);
  }, [activity]);

  if (status === 'unsupported') {
    return <div className="studio-midi-pill" data-state="off" title="This browser has no Web MIDI. Use Chrome or Edge, or the desktop app."><span className="studio-status-dot" /><span>MIDI unavailable</span></div>;
  }
  if (status === 'denied') {
    return <div className="studio-midi-pill" data-state="off" title="MIDI access was blocked. Allow it in the site settings, then reload."><span className="studio-status-dot" /><span>MIDI blocked</span></div>;
  }
  if (status === 'idle') {
    return (
      <button className="studio-midi-pill" data-state="off" type="button" onClick={() => void connectMidi()} title="Connect a MIDI keyboard or pad controller">
        <span className="studio-status-dot" /><span>Connect MIDI</span>
      </button>
    );
  }
  return (
    <div className="studio-midi-pill" data-state={inputs.length ? 'ok' : 'off'} data-lit={String(lit)} title={inputs.length ? 'Notes from this controller play and record on the selected instrument track' : 'No MIDI controller found. Plug one in.'}>
      <span className="studio-status-dot" />
      {inputs.length === 0 ? (
        <span>No MIDI device</span>
      ) : (
        <select value={chosen} onChange={(e) => setChosen(e.target.value)} aria-label="MIDI input">
          {inputs.length > 1 && <option value="all">All MIDI inputs</option>}
          {inputs.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

/** Switches the centre panel between the arrangement and the mixer. */
function MixerToggle() {
  const mode = useSessionStore((s) => s.viewMode);
  const setMode = useSessionStore((s) => s.setViewMode);
  return (
    <button
      className="studio-warp-btn"
      type="button"
      data-on={String(mode === 'mixer')}
      aria-pressed={mode === 'mixer'}
      onClick={() => setMode(mode === 'mixer' ? 'arrange' : 'mixer')}
      title={mode === 'mixer' ? 'Back to the arrangement' : 'Show the mixer'}
    >
      <SlidersVertical size={14} aria-hidden="true" />
      <span>Mixer</span>
    </button>
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
      <MixerToggle />
      <WarpButton />
      <MidiPill />
      <ThemeMenu />

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
