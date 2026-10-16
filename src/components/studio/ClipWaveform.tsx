import { useEffect, useRef, useState } from 'react';
import { getClipPeaks } from '../../utils/waveform';

interface ClipWaveformProps {
  cacheKey: string;
  source: { url: string; blob?: Blob };
  color: string;
  /** Pixel width of the clip; the waveform is resampled to fit. */
  width: number;
}

/** Draws a clip's peaks as a centred waveform. Renders nothing until decoded. */
export function ClipWaveform({ cacheKey, source, color, width }: ClipWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);

  useEffect(() => {
    let alive = true;
    getClipPeaks(cacheKey, source)
      .then((p) => {
        if (alive) setPeaks(p);
      })
      .catch((err) => console.warn('Waveform decode failed', err));
    return () => {
      alive = false;
    };
    // `source` is a fresh object each render; the url and key identify it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, source.url]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const h = canvas.clientHeight;
    if (h === 0) return;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, h);
    ctx.fillStyle = color;

    const mid = h / 2;
    const maxAmp = mid - 4;
    const n = peaks.length;
    for (let x = 0; x < width; x++) {
      // Each pixel covers a range of buckets; take the loudest one in it.
      const from = Math.floor((x / width) * n);
      const to = Math.max(from + 1, Math.floor(((x + 1) / width) * n));
      let peak = 0;
      for (let b = from; b < to && b < n; b++) {
        if (peaks[b] > peak) peak = peaks[b];
      }
      const amp = Math.max(1, peak * maxAmp);
      ctx.fillRect(x, mid - amp, 1, amp * 2);
    }
  }, [peaks, width, color]);

  return <canvas ref={canvasRef} className="studio-clip-wave" aria-hidden="true" />;
}
