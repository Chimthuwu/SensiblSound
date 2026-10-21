import { useSessionStore } from '../stores/useSessionStore';
import { warpAudioToBpm } from './warp';

/** The audio behind a lane's clip, if it has one. */
async function laneBlob(laneId: string): Promise<Blob | null> {
  const s = useSessionStore.getState();
  const src =
    laneId === 'backing' ? s.backingTrack
    : laneId === 'active_take' ? s.activeTake
    : s.layers.find((l) => l.id === laneId) ?? s.extraTracks.find((t) => t.id === laneId)?.clip;
  if (!src) return null;
  if (src.blob) return src.blob;
  try {
    return await (await fetch(src.url)).blob();
  } catch {
    return null;
  }
}

/**
 * Warps a lane's audio to the project tempo and swaps it in, keeping the clip where it is.
 * `manual` is a deliberate request, so failures are explained; an automatic warp stays quiet about clips it skips.
 */
export async function warpLane(laneId: string, opts: { manual?: boolean } = {}): Promise<void> {
  const s = useSessionStore.getState();
  const blob = await laneBlob(laneId);
  if (!blob) return;
  s.setWarpBusy(1);
  try {
    const result = await warpAudioToBpm(blob, s.bpm);
    if (typeof result === 'string') {
      if (opts.manual) {
        s.showToast(result === 'short' ? 'Too short to warp: hits and one-shots have no tempo.' : "Couldn't find a steady beat in this audio.");
      }
      return;
    }
    if (result.blob !== blob) {
      useSessionStore.getState().replaceClipAudio(laneId, {
        url: URL.createObjectURL(result.blob),
        blob: result.blob,
        durationMs: result.durationMs,
      });
    }
    const from = Math.round(result.fromBpm * 10) / 10;
    s.showToast(Math.abs(result.fromBpm - result.toBpm) < 0.15 ? 'Already on the beat.' : `Warped ${from} → ${result.toBpm} BPM`);
  } catch (err) {
    console.warn('Warp failed', err);
    if (opts.manual) s.showToast("Couldn't warp this audio.");
  } finally {
    useSessionStore.getState().setWarpBusy(-1);
  }
}

/**
 * Call right after audio lands on a lane. Auto-warp on: warp it. Off: the audio stays as it is,
 * and a prompt offers to warp it (unless the user said not to ask again).
 */
export function onAudioAdded(laneId: string, name: string): void {
  const s = useSessionStore.getState();
  if (s.autoWarp) void warpLane(laneId);
  else if (!s.warpPromptDisabled) s.setWarpPrompt({ laneId, name });
}
