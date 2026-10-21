import type { SessionState } from '../types';

export interface LaneInfo {
  id: string;
  name: string;
  color: string;
  /** 'instrument' when the track's rack holds a synth or drum machine. */
  kind: 'audio' | 'instrument';
}

const EXTRA_TRACK_COLORS = ['#38bdf8', '#34d399', '#fb7185', '#fbbf24', '#a3e635'];

/** Every track in the order the arrangement shows it. The mixer uses this so both views agree. */
export function laneInfos(s: Pick<SessionState, 'layers' | 'extraTracks' | 'trackOrder' | 'trackDevices'>): LaneInfo[] {
  const isInstrument = (id: string) => (s.trackDevices[id] ?? []).some((d) => d.type === 'synth' || d.type === 'drums');
  const lanes: Omit<LaneInfo, 'kind'>[] = [
    { id: 'backing', name: 'Track 1', color: '#7c3aed' },
    { id: 'active_take', name: 'Track 2', color: '#a855f7' },
    ...s.layers.map((l, i) => ({ id: l.id, name: `Layer ${i + 1}`, color: '#c084fc' })),
    ...s.extraTracks.map((t, i) => ({ id: t.id, name: t.name, color: EXTRA_TRACK_COLORS[i % EXTRA_TRACK_COLORS.length] })),
  ];
  const index = (id: string) => {
    const i = s.trackOrder.indexOf(id);
    return i === -1 ? 1_000_000 + lanes.findIndex((l) => l.id === id) : i;
  };
  return [...lanes].sort((a, b) => index(a.id) - index(b.id)).map((l) => ({ ...l, kind: isInstrument(l.id) ? 'instrument' : 'audio' }));
}
