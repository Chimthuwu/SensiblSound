// Slider colours: volume is teal and fills from the left; pan is amber and fills outward from the centre
// (it is bipolar, so the fill shows which way and how far it leans).
export const VOL_COLOR = '#2dd4bf';
export const PAN_COLOR = '#fbbf24';
/** The knobs' own colour. */
export const KNOB_COLOR = '#b06bff';

/** The colour of the control a parameter id belongs to: teal volume sliders, amber pan sliders, purple knobs. */
export function paramColor(paramId: string): string {
  if (paramId.endsWith(':vol')) return VOL_COLOR;
  if (paramId.endsWith(':pan')) return PAN_COLOR;
  return KNOB_COLOR;
}
const TRACK = '#2a2535';

/** Background for a 0..1 volume slider. */
export function volumeFill(value01: number): string {
  const v = Math.round(Math.max(0, Math.min(1, value01)) * 100);
  return `linear-gradient(90deg, ${VOL_COLOR} 0 ${v}%, ${TRACK} ${v}% 100%)`;
}

/** Background for a -1..1 pan slider: a centre tick, and amber between the centre and the thumb. */
export function panFill(pan: number): string {
  const pos = Math.round((Math.max(-1, Math.min(1, pan)) + 1) * 50);
  const lo = Math.min(pos, 50), hi = Math.max(pos, 50);
  const tick = 'linear-gradient(90deg, transparent calc(50% - 1px), rgba(255,255,255,0.55) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px))';
  return `${tick}, linear-gradient(90deg, ${TRACK} 0 ${lo}%, ${PAN_COLOR} ${lo}% ${hi}%, ${TRACK} ${hi}% 100%)`;
}
