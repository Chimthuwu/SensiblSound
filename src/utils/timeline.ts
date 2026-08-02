import type { SessionState } from '../types';

// Floor so the layer timeline still draws a usable grid before any layer
// has finished decoding (avoids a jarring 0-width flash on first render).
export const MIN_LAYER_TIMELINE_MS = 15_000;

// Shared horizontal scale for the stacked vocal-layer timeline: every layer's
// waveform is positioned/sized as a percentage of this value, so a layer
// recorded 8 bars in visually sits 8 bars in relative to its neighbors.
// Also anchored to the backing track's full length (once known) so a short
// layer near the start of a long song still reads as "near the start"
// instead of stretching to fill the row on its own.
export function getLayerTimelineDurationMs(
  state: Pick<SessionState, 'layers' | 'backingTrack'>
): number {
  const furthestLayerEndMs = state.layers.reduce(
    (max, layer) => Math.max(max, layer.transportStartMs + (layer.durationMs ?? 0)),
    0
  );
  return Math.max(MIN_LAYER_TIMELINE_MS, furthestLayerEndMs, state.backingTrack?.durationMs ?? 0);
}
