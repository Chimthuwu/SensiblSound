import { useEffect, useRef } from 'react';
import { useSessionStore } from '../../stores/useSessionStore';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';

/**
 * Headless playback element for the studio skin.
 *
 * WaveSurfer needs a real container, but the new chrome draws its own
 * arrangement lanes, so the container is parked off-screen at 1px and the
 * player is driven non-interactively. `useAudioPlayer` already owns the
 * transport sync (play/pause windowing + offset-aware seeking), so we get
 * sample-accurate positioning for free and only use its decoded duration.
 */
function HeadlessPlayer({
  url,
  blob,
  startOffsetMs = 0,
  forceMute,
  volume,
  pan,
  onDuration,
}: {
  url?: string;
  blob?: Blob;
  startOffsetMs?: number;
  forceMute?: boolean;
  volume?: number;
  pan?: number;
  onDuration?: (ms: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isReady, duration } = useAudioPlayer(containerRef, url, {
    blob,
    startOffsetMs,
    interactive: false,
    forceMute,
    volume,
    pan,
  });

  // Keep the callback in a ref so an unstable identity (e.g. an inline arrow
  // for a layer) can't re-trigger the duration effect on every render.
  const onDurationRef = useRef(onDuration);
  useEffect(() => {
    onDurationRef.current = onDuration;
  });

  useEffect(() => {
    if (isReady && duration > 0) {
      onDurationRef.current?.(duration * 1000);
    }
  }, [isReady, duration]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        overflow: 'hidden',
        opacity: 0,
        pointerEvents: 'none',
      }}
    />
  );
}

/**
 * Mounts the whole audio path without rendering any controls.
 *
 * `useAudioRecorder` is the audio engine: it owns the mic stream, the FX
 * graph and the MediaRecorder, and reacts to `isRecording` from the store —
 * so mounting it here is enough to make the transport's record button work.
 * The players below restore transport-synced playback of the backing track,
 * the active take and any layered takes.
 */
export function AudioEngine() {
  useAudioRecorder();

  const backingTrack = useSessionStore((s) => s.backingTrack);
  const activeTake = useSessionStore((s) => s.activeTake);
  const layers = useSessionStore((s) => s.layers);
  const mutedTracks = useSessionStore((s) => s.mutedTracks);
  const trackVolumes = useSessionStore((s) => s.trackVolumes);
  const trackPans = useSessionStore((s) => s.trackPans);
  const extraTracks = useSessionStore((s) => s.extraTracks);
  const setExtraTrackDuration = useSessionStore((s) => s.setExtraTrackDuration);
  const soloedTracks = useSessionStore((s) => s.soloedTracks);
  const setBackingTrackDurationMs = useSessionStore((s) => s.setBackingTrackDurationMs);
  const setActiveTakeDurationMs = useSessionStore((s) => s.setActiveTakeDurationMs);
  const setLayerDurationMs = useSessionStore((s) => s.setLayerDurationMs);

  // Mirror the mute/solo logic the arrangement track headers expose.
  const anySoloed = soloedTracks.size > 0;
  const isSilenced = (trackId: string) =>
    mutedTracks.has(trackId) || (anySoloed && !soloedTracks.has(trackId));

  return (
    <div aria-hidden="true" style={{ position: 'relative', width: 0, height: 0 }}>
      {backingTrack && (
        <HeadlessPlayer
          url={backingTrack.url}
          blob={backingTrack.blob}
          startOffsetMs={backingTrack.startMs ?? 0}
          forceMute={isSilenced('backing')}
          volume={trackVolumes['backing'] ?? 1}
          pan={trackPans['backing'] ?? 0}
          onDuration={setBackingTrackDurationMs}
        />
      )}

      {activeTake && (
        <HeadlessPlayer
          url={activeTake.url}
          blob={activeTake.blob}
          startOffsetMs={activeTake.transportStartMs}
          forceMute={isSilenced('active_take')}
          volume={trackVolumes['active_take'] ?? 1}
          pan={trackPans['active_take'] ?? 0}
          onDuration={setActiveTakeDurationMs}
        />
      )}

      {extraTracks.map((t) =>
        t.clip ? (
          <HeadlessPlayer
            key={t.clip.id}
            url={t.clip.url}
            blob={t.clip.blob}
            startOffsetMs={t.clip.startMs}
            forceMute={isSilenced(t.id)}
            volume={trackVolumes[t.id] ?? 1}
            pan={trackPans[t.id] ?? 0}
            onDuration={(ms) => setExtraTrackDuration(t.id, ms)}
          />
        ) : null,
      )}

      {layers.map((layer) => (
        <HeadlessPlayer
          key={layer.id}
          url={layer.url}
          blob={layer.blob}
          startOffsetMs={layer.transportStartMs}
          forceMute={isSilenced(layer.id)}
          volume={trackVolumes[layer.id] ?? 1}
          pan={trackPans[layer.id] ?? 0}
          onDuration={(ms) => setLayerDurationMs(layer.id, ms)}
        />
      ))}
    </div>
  );
}
