import { useEffect, useMemo, useRef } from 'react';
import { useSessionStore } from '../../stores/useSessionStore';
import { laneInfos, type LaneInfo } from '../../utils/lanes';
import { readLevel } from '../../utils/audioBus';
import { panFill } from '../../utils/sliderFill';
import { buildParamMenu } from '../../mod/paramMenu';
import { useContextMenu } from './ContextMenu';
import { useIsDriven } from '../../mod/useModLive';
import type { DeviceId } from '../../types';

const DEVICE_SHORT: Record<DeviceId, string> = {
  autotune: 'Autotune', doubler: 'Doubler', compressor: 'Dynamics', eq: 'EQ', delay: 'Delay', reverb: 'Reverb',
  synth: 'PsydeNote Lite', drums: 'Drum Machine',
  arp: 'Arpeggiator', chord: 'Chord', transpose: 'Transpose', noteFilter: 'Note Filter', echo: 'Note Echo', scale: 'Scale', randomize: 'Randomize',
};

// Fader law: the fader position is the cube root of the gain, so the useful range (-30 dB to 0 dB) gets most of the travel.
const toPos = (gain: number) => Math.cbrt(Math.max(0, gain));
const toGain = (pos: number) => pos * pos * pos;
const toDb = (gain: number) => (gain <= 0.0001 ? -Infinity : 20 * Math.log10(gain));
const fmtDb = (gain: number) => { const d = toDb(gain); return d === -Infinity ? '-inf' : `${d > -0.05 ? '0.0' : d.toFixed(1)}`; };
const SCALE = [0, -6, -12, -24, -48];
// Meter: -60 dB..0 dB across the bar.
const meterFrac = (peak: number) => (peak <= 0.001 ? 0 : Math.max(0, Math.min(1, (20 * Math.log10(peak) + 60) / 60)));

interface MeterRefs { l: HTMLDivElement | null; r: HTMLDivElement | null; hold: HTMLDivElement | null; clip: HTMLDivElement | null }

function Strip({
  id, name, color, kind, number, master, meters,
}: {
  id: string; name: string; color: string; kind: 'audio' | 'instrument'; number?: number; master?: boolean;
  meters: React.MutableRefObject<Map<string, MeterRefs>>;
}) {
  const volume = useSessionStore((s) => (master ? s.masterVolume : (s.trackVolumes[id] ?? 1)));
  const pan = useSessionStore((s) => s.trackPans[id] ?? 0);
  const muted = useSessionStore((s) => s.mutedTracks.has(id));
  const soloed = useSessionStore((s) => s.soloedTracks.has(id));
  const disabled = useSessionStore((s) => s.disabledTracks.has(id));
  const armed = useSessionStore((s) => s.armedTrackId === id);
  const selected = useSessionStore((s) => s.selectedTrackId === id);
  const devices = useSessionStore((s) => s.trackDevices[id]);
  const isLayer = useSessionStore((s) => s.layers.some((l) => l.id === id));
  const setMaster = useSessionStore((s) => s.setMasterVolume);
  const setTrackVolume = useSessionStore((s) => s.setTrackVolume);
  const setVolume = (v: number) => (master ? setMaster(v) : setTrackVolume(id, v));
  const setPan = useSessionStore((s) => s.setTrackPan);
  const toggleMute = useSessionStore((s) => s.toggleMuteTrack);
  const toggleSolo = useSessionStore((s) => s.toggleSoloTrack);
  const setArmed = useSessionStore((s) => s.setArmedTrackId);
  const select = useSessionStore((s) => s.setSelectedTrackId);

  const openMenu = useContextMenu();
  const volId = master ? 'master:vol' : `track:${id}:vol`;
  const panId = `track:${id}:pan`;
  const volDriven = useIsDriven(volId);
  const panDriven = useIsDriven(panId);
  const refs = useRef<MeterRefs>({ l: null, r: null, hold: null, clip: null });
  useEffect(() => {
    meters.current.set(id, refs.current);
    return () => { meters.current.delete(id); };
  }, [id, meters]);

  return (
    <div
      className="mx-strip"
      data-master={String(!!master)}
      data-selected={String(selected && !master)}
      data-dim={String(disabled)}
      style={{ '--mx-color': color } as React.CSSProperties}
      onClick={() => { if (!master) select(id); }}
    >
      <div className="mx-head" title={name}>
        <span className="mx-kind" aria-hidden="true">{master ? '◉' : kind === 'instrument' ? '♪' : '∿'}</span>
        <span className="mx-name">{name}</span>
      </div>

      <div className="mx-devices">
        {master ? <span className="mx-chip" data-empty="true">Main output</span>
          : (devices ?? []).length === 0 ? <span className="mx-chip" data-empty="true">No devices</span>
          : devices!.map((d) => (
            <span key={d.uid} className="mx-chip" data-instrument={String(d.type === 'synth' || d.type === 'drums')}>{DEVICE_SHORT[d.type]}</span>
          ))}
      </div>

      <div className="mx-pan">
        {master ? <span className="mx-pan-val">&nbsp;</span> : (
          <>
            <input
              type="range" min={-100} max={100} value={Math.round(pan * 100)}
              onChange={(e) => setPan(id, Number(e.target.value) / 100)}
              onDoubleClick={() => setPan(id, 0)}
              onClick={(e) => e.stopPropagation()}
              style={{ background: panFill(pan) }}
              data-driven={String(panDriven)}
              onContextMenu={(e) => { e.stopPropagation(); openMenu(e, buildParamMenu(panId)); }}
              aria-label={`${name} pan`} title="Pan (double-click to centre)"
            />
            <span className="mx-pan-val">{Math.abs(pan) < 0.02 ? 'C' : pan < 0 ? `${Math.round(-pan * 100)}L` : `${Math.round(pan * 100)}R`}</span>
          </>
        )}
      </div>

      <div className="mx-fader-area">
        <div className="mx-scale" aria-hidden="true">
          {SCALE.map((db) => (
            <span key={db} style={{ bottom: `${toPos(Math.pow(10, db / 20)) * 100}%` }}>{db === 0 ? '0' : db}</span>
          ))}
        </div>
        <input
          className="mx-fader" type="range" min={0} max={1000} value={Math.round(toPos(volume) * 1000)}
          onChange={(e) => setVolume(toGain(Number(e.target.value) / 1000))}
          onDoubleClick={() => setVolume(1)}
          onClick={(e) => e.stopPropagation()}
          data-driven={String(volDriven)}
          onContextMenu={(e) => { e.stopPropagation(); openMenu(e, buildParamMenu(volId)); }}
          aria-label={`${name} volume`} title="Volume (double-click for 0 dB, right-click to automate or modulate)"
        />
        <div className="mx-meter" aria-hidden="true">
          {(['l', 'r'] as const).map((ch) => (
            <div key={ch} className="mx-meter-bar">
              <div className="mx-meter-cover" ref={(el) => { refs.current[ch] = el; }} />
            </div>
          ))}
          <div className="mx-meter-hold" ref={(el) => { refs.current.hold = el; }} />
          <div className="mx-meter-clip" ref={(el) => { refs.current.clip = el; }} />
        </div>
      </div>

      <div className="mx-db" title="Volume in dB">{fmtDb(volume)} <small>dB</small></div>

      <div className="mx-btns">
        {master ? null : (
          <>
            <button type="button" className="mx-btn" data-on={String(muted)} data-kind="m" onClick={(e) => { e.stopPropagation(); toggleMute(id); }} title="Mute">M</button>
            <button type="button" className="mx-btn" data-on={String(soloed)} data-kind="s" onClick={(e) => { e.stopPropagation(); toggleSolo(id); }} title="Solo">S</button>
            {!isLayer && (
              <button type="button" className="mx-btn" data-on={String(armed)} data-kind="r" onClick={(e) => { e.stopPropagation(); setArmed(id); }} title={armed ? 'Armed for recording' : 'Arm for recording'} aria-pressed={armed}>●</button>
            )}
          </>
        )}
      </div>
      <div className="mx-foot">{master ? 'M' : number}</div>
    </div>
  );
}

/** Bitwig-style mixer: one channel strip per track (devices, pan, fader with live meters, mute/solo/arm) and a master strip. */
export function Mixer() {
  const layers = useSessionStore((s) => s.layers);
  const extraTracks = useSessionStore((s) => s.extraTracks);
  const trackOrder = useSessionStore((s) => s.trackOrder);
  const trackDevices = useSessionStore((s) => s.trackDevices);
  const lanes: LaneInfo[] = useMemo(() => laneInfos({ layers, extraTracks, trackOrder, trackDevices }), [layers, extraTracks, trackOrder, trackDevices]);
  const meters = useRef<Map<string, MeterRefs>>(new Map());

  // One animation loop drives every meter straight on the DOM, so metering never re-renders React.
  useEffect(() => {
    const state = new Map<string, { l: number; r: number; hold: number; holdAt: number; clipAt: number }>();
    let raf = 0;
    const tick = (now: number) => {
      for (const [id, el] of meters.current) {
        const lv = readLevel(id);
        const st = state.get(id) ?? { l: 0, r: 0, hold: 0, holdAt: 0, clipAt: 0 };
        // Instant attack, smooth fall.
        st.l = Math.max(meterFrac(lv.l), st.l * 0.9);
        st.r = Math.max(meterFrac(lv.r), st.r * 0.9);
        const top = Math.max(st.l, st.r);
        if (top >= st.hold || now - st.holdAt > 900) { st.hold = Math.max(top, st.hold * 0.97); if (top >= st.hold) st.holdAt = now; }
        if (Math.max(lv.l, lv.r) >= 0.999) st.clipAt = now;
        state.set(id, st);
        if (el.l) el.l.style.transform = `scaleY(${1 - st.l})`;
        if (el.r) el.r.style.transform = `scaleY(${1 - st.r})`;
        if (el.hold) el.hold.style.bottom = `${st.hold * 100}%`;
        if (el.clip) el.clip.dataset.on = String(now - st.clipAt < 1500);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="studio-card studio-mixer" aria-label="Mixer">
      <div className="studio-card-head">
        <h2 className="studio-card-head-title">Mixer</h2>
        <span className="studio-tag">{lanes.length} track{lanes.length === 1 ? '' : 's'}</span>
        <div className="studio-head-spacer" />
        <span className="studio-tag">Double-click a fader for 0 dB</span>
      </div>
      <div className="mx-board">
        <div className="mx-strips">
          {lanes.map((l, i) => (
            <Strip key={l.id} id={l.id} name={l.name} color={l.color} kind={l.kind} number={i + 1} meters={meters} />
          ))}
        </div>
        <Strip id="master" name="Master" color="#e4e4e7" kind="audio" master meters={meters} />
      </div>
    </section>
  );
}
