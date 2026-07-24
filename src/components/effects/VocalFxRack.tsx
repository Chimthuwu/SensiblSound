import { useEffect, useRef } from 'react';
import { useSessionStore } from '../../stores/useSessionStore';
import { Sliders, Music, Disc, Zap, Flame } from 'lucide-react';

// Small toggle button used in module headers to turn individual FX on/off
function FxToggleButton({ enabled, onClick, label }: { enabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded transition-all duration-300 cursor-pointer border select-none ${
        enabled
          ? 'bg-primary/20 text-primary border-primary/30 hover:bg-primary/30'
          : 'bg-white/[0.02] text-zinc-500 border-white/[0.05] hover:text-zinc-300 hover:bg-white/[0.05]'
      }`}
      title={enabled ? `${label} is on — click to disable` : `${label} is off — click to enable`}
    >
      {label}
    </button>
  );
}

export function VocalFxRack() {
  const { fxEnabled, setFxEnabled, fxSettings, setFxSettings } = useSessionStore();
  const eqCanvasRef = useRef<HTMLCanvasElement>(null);
  const activeDragRef = useRef<'low' | 'mid' | 'high' | null>(null);

  const logMin = Math.log10(20);
  const logMax = Math.log10(20000);

  const getX = (freq: number, width: number) => {
    return ((Math.log10(freq) - logMin) / (logMax - logMin)) * width;
  };

  const getDbFromY = (y: number, height: number) => {
    const db = (0.5 - y / height) * 24;
    return Math.max(-12, Math.min(12, Math.round(db)));
  };

  const getYFromDb = (db: number, height: number) => {
    return height / 2 - (db / 24) * height;
  };

  // Combined state for the EQ module (drives canvas color & drag ability)
  const eqActive = fxEnabled && fxSettings.eqEnabled;

  // Draw the Parametric EQ Curve on Canvas
  useEffect(() => {
    const canvas = eqCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Clear background
    ctx.fillStyle = '#0b0b0d';
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;

    // Vertical freq grids (logarithmic representation)
    const freqs = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
    freqs.forEach(f => {
      const x = getX(f, width);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Label text
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.font = '8px monospace';
      const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
      ctx.fillText(label, x + 3, height - 6);
    });

    // Horizontal dB grids (-12dB to +12dB)
    const dbs = [-12, -6, 0, 6, 12];
    dbs.forEach(db => {
      const y = getYFromDb(db, height);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.font = '8px monospace';
      ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 6, y - 2);
    });

    // Draw Response Curve
    ctx.beginPath();
    ctx.strokeStyle = eqActive ? '#a855f7' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.shadowBlur = eqActive ? 8 : 0;
    ctx.shadowColor = 'rgba(168, 85, 247, 0.4)';

    for (let x = 0; x < width; x++) {
      const pct = x / width;
      const freq = Math.pow(10, logMin + pct * (logMax - logMin));

      const lowResponse = fxSettings.eqLow / (1 + Math.pow(freq / 150, 2));

      const midGain = fxSettings.eqMid;
      const f0 = 1200;
      const Q = 1.2;
      const w0 = freq / f0;
      const midResponse = midGain / (1 + Math.pow((w0 * w0 - 1) / (w0 / Q), 2));

      const highResponse = fxSettings.eqHigh / (1 + Math.pow(4000 / freq, 2));

      const totalDb = lowResponse + midResponse + highResponse;
      const y = getYFromDb(totalDb, height);

      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw three interactive nodes
    const dots = [
      { id: 'low', freq: 150, gain: fxSettings.eqLow, color: '#3b82f6', label: 'BASS' },
      { id: 'mid', freq: 1200, gain: fxSettings.eqMid, color: '#a855f7', label: 'MID' },
      { id: 'high', freq: 4000, gain: fxSettings.eqHigh, color: '#ec4899', label: 'AIR' },
    ];

    dots.forEach(dot => {
      const dotX = getX(dot.freq, width);
      const dotY = getYFromDb(dot.gain, height);

      // Node glow
      ctx.beginPath();
      ctx.fillStyle = dot.color;
      ctx.globalAlpha = eqActive ? 0.25 : 0.05;
      ctx.arc(dotX, dotY, 8, 0, 2 * Math.PI);
      ctx.fill();

      // Core dot
      ctx.beginPath();
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = eqActive ? '#ffffff' : '#3f3f46';
      ctx.strokeStyle = dot.color;
      ctx.lineWidth = 2;
      ctx.arc(dotX, dotY, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Node text label
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '7px monospace';
      ctx.fillText(dot.label, dotX - 10, dotY - 9);
    });
  }, [eqActive, fxSettings.eqLow, fxSettings.eqMid, fxSettings.eqHigh]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!eqActive) return;
    const canvas = eqCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const width = rect.width;
    const height = rect.height;

    const xLow = getX(150, width);
    const yLow = getYFromDb(fxSettings.eqLow, height);

    const xMid = getX(1200, width);
    const yMid = getYFromDb(fxSettings.eqMid, height);

    const xHigh = getX(4000, width);
    const yHigh = getYFromDb(fxSettings.eqHigh, height);

    const distLow = Math.hypot(x - xLow, y - yLow);
    const distMid = Math.hypot(x - xMid, y - yMid);
    const distHigh = Math.hypot(x - xHigh, y - yHigh);

    const threshold = 20;
    if (distLow < threshold && distLow <= distMid && distLow <= distHigh) {
      activeDragRef.current = 'low';
    } else if (distMid < threshold && distMid <= distLow && distMid <= distHigh) {
      activeDragRef.current = 'mid';
    } else if (distHigh < threshold && distHigh <= distLow && distHigh <= distMid) {
      activeDragRef.current = 'high';
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeDragRef.current || !eqActive) return;
    const canvas = eqCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    const newDb = getDbFromY(y, height);

    if (activeDragRef.current === 'low') {
      setFxSettings({ eqLow: newDb });
    } else if (activeDragRef.current === 'mid') {
      setFxSettings({ eqMid: newDb });
    } else if (activeDragRef.current === 'high') {
      setFxSettings({ eqHigh: newDb });
    }
  };

  const handleMouseUp = () => {
    activeDragRef.current = null;
  };

  const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const scales = ['Major', 'Minor', 'Chromatic'];

  return (
    <section className="bg-surface rounded-2xl p-4 flex flex-col gap-4 shadow-lg shadow-black/35 border border-white/[0.02]">
      {/* Compact FX Header */}
      <div className="flex items-center justify-between border-b border-white/[0.04] pb-3">
        <div className="flex items-center gap-2.5">
          <Sliders size={14} className="text-primary" />
          <h2 className="text-xs font-bold text-white tracking-wide uppercase font-sans">Vocal FX Rack</h2>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-bold text-zinc-400 uppercase tracking-wider bg-black/45 px-3 py-1 rounded-lg border border-white/[0.03]">
          <input
            type="checkbox"
            checked={fxEnabled}
            onChange={() => setFxEnabled(!fxEnabled)}
            className="accent-primary w-3.5 h-3.5 rounded border-white/10 cursor-pointer"
          />
          <span>Enable Effects</span>
        </label>
      </div>

      {/* Grid - Compact Layout */}
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 transition-all duration-300 ${fxEnabled ? 'opacity-100' : 'opacity-35 pointer-events-none'}`}>

        {/* Module 1: Autotune & Doubler */}
        <div className="bg-black/20 rounded-xl p-3 border border-white/[0.02] flex flex-col gap-3">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center justify-between gap-2 font-sans border-b border-white/[0.02] pb-1">
            <span className="flex items-center gap-1.5">
              <Music size={11} className="text-primary" /> Tuning & Doubler
            </span>
            <div className="flex items-center gap-1">
              <FxToggleButton
                enabled={fxSettings.autotuneEnabled}
                onClick={() => setFxSettings({ autotuneEnabled: !fxSettings.autotuneEnabled })}
                label="Tune"
              />
              <FxToggleButton
                enabled={fxSettings.doubleEnabled}
                onClick={() => setFxSettings({ doubleEnabled: !fxSettings.doubleEnabled })}
                label="Doub"
              />
            </div>
          </div>

          {/* Autotune sub-section: gates on autotuneEnabled */}
          <div className={`flex flex-col gap-2.5 transition-opacity duration-300 ${(fxEnabled && fxSettings.autotuneEnabled) ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div className="flex gap-2">
              <select
                value={fxSettings.autotuneKey}
                onChange={(e) => setFxSettings({ autotuneKey: e.target.value })}
                className="flex-1 bg-black/45 border border-white/10 rounded-lg p-1.5 text-xs text-zinc-300 font-sans cursor-pointer outline-none"
              >
                {keys.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <select
                value={fxSettings.autotuneScale}
                onChange={(e) => setFxSettings({ autotuneScale: e.target.value })}
                className="flex-1 bg-black/45 border border-white/10 rounded-lg p-1.5 text-xs text-zinc-300 font-sans cursor-pointer outline-none"
              >
                {scales.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <div className="flex justify-between text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">
                <span>Retune Speed</span>
                <span className="font-mono text-primary font-bold">{fxSettings.autotuneSpeed}ms</span>
              </div>
              <input
                type="range"
                min="0" max="100"
                value={fxSettings.autotuneSpeed}
                onChange={(e) => setFxSettings({ autotuneSpeed: parseInt(e.target.value) })}
                className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
              />
            </div>
          </div>

          {/* Doubler sub-section: gates on doubleEnabled */}
          <div className={`border-t border-white/[0.02] pt-2 flex flex-col gap-2 transition-opacity duration-300 ${(fxEnabled && fxSettings.doubleEnabled) ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div className="flex justify-between text-[9px] text-zinc-500 font-bold uppercase tracking-wider">
              <span>Stereo Width</span>
              <span className="font-mono text-zinc-400 font-semibold">{fxSettings.doubleWidth}%</span>
            </div>
            <input
              type="range"
              min="0" max="100"
              value={fxSettings.doubleWidth}
              onChange={(e) => setFxSettings({ doubleWidth: parseInt(e.target.value) })}
              className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
            />
          </div>
        </div>

        {/* Module 2: Compressor */}
        <div className="bg-black/20 rounded-xl p-3 border border-white/[0.02] flex flex-col gap-3">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center justify-between gap-2 font-sans border-b border-white/[0.02] pb-1">
            <span className="flex items-center gap-1.5">
              <Zap size={11} className="text-primary" /> Dynamics
            </span>
            <FxToggleButton
              enabled={fxSettings.compressorEnabled}
              onClick={() => setFxSettings({ compressorEnabled: !fxSettings.compressorEnabled })}
              label="Comp"
            />
          </div>
          <div className={`flex flex-col gap-3 justify-center h-full pb-1 transition-opacity duration-300 ${(fxEnabled && fxSettings.compressorEnabled) ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div>
              <div className="flex justify-between text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">
                <span>Vocal Compressor</span>
                <span className="font-mono text-primary font-bold">{fxSettings.compression}%</span>
              </div>
              <input
                type="range"
                min="0" max="100"
                value={fxSettings.compression}
                onChange={(e) => setFxSettings({ compression: parseInt(e.target.value) })}
                className="w-full accent-primary cursor-pointer h-1.5 bg-zinc-800 rounded-lg appearance-none"
              />
            </div>
          </div>
        </div>

        {/* Module 3: Parametric EQ (Visual Drag Only) */}
        <div className="bg-black/20 rounded-xl p-3 border border-white/[0.02] flex flex-col gap-3 lg:col-span-2">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center justify-between gap-2 font-sans border-b border-white/[0.02] pb-1">
            <span className="flex items-center gap-1.5">
              <Disc size={11} className="text-primary" /> Parametric EQ
              <span className="text-[9px] text-zinc-500 font-mono ml-1">Drag points to edit</span>
            </span>
            <FxToggleButton
              enabled={fxSettings.eqEnabled}
              onClick={() => setFxSettings({ eqEnabled: !fxSettings.eqEnabled })}
              label="EQ"
            />
          </div>
          <div className={`h-28 relative rounded-lg border border-white/[0.03] overflow-hidden transition-opacity duration-300 ${(fxEnabled && fxSettings.eqEnabled) ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <canvas
              ref={eqCanvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="w-full h-full cursor-ns-resize"
            />
          </div>
        </div>

        {/* Module 4: Delay & Reverb */}
        <div className="bg-black/20 rounded-xl p-3 border border-white/[0.02] flex flex-col gap-3">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center justify-between gap-2 font-sans border-b border-white/[0.02] pb-1">
            <span className="flex items-center gap-1.5">
              <Flame size={11} className="text-primary" /> Space & Echo
            </span>
            <div className="flex items-center gap-1">
              <FxToggleButton
                enabled={fxSettings.delayEnabled}
                onClick={() => setFxSettings({ delayEnabled: !fxSettings.delayEnabled })}
                label="Delay"
              />
              <FxToggleButton
                enabled={fxSettings.reverbEnabled}
                onClick={() => setFxSettings({ reverbEnabled: !fxSettings.reverbEnabled })}
                label="Verb"
              />
            </div>
          </div>

          {/* Delay sub-section: gates on delayEnabled */}
          <div className={`flex flex-col gap-2.5 transition-opacity duration-300 ${(fxEnabled && fxSettings.delayEnabled) ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div>
              <div className="flex justify-between text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">
                <span>Delay Feedback</span>
                <span className="font-mono text-zinc-400 font-semibold">{fxSettings.delayFeedback}%</span>
              </div>
              <input
                type="range"
                min="0" max="90"
                value={fxSettings.delayFeedback}
                onChange={(e) => setFxSettings({ delayFeedback: parseInt(e.target.value) })}
                className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
              />
            </div>
            <div>
              <div className="flex justify-between text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">
                <span>Delay Time</span>
                <span className="font-mono text-zinc-400 font-semibold">{fxSettings.delayTime.toFixed(2)}s</span>
              </div>
              <input
                type="range"
                min="10" max="100"
                value={fxSettings.delayTime * 100}
                onChange={(e) => setFxSettings({ delayTime: parseFloat(e.target.value) / 100 })}
                className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
              />
            </div>
          </div>

          {/* Reverb sub-section: gates on reverbEnabled */}
          <div className={`flex flex-col gap-2.5 transition-opacity duration-300 ${(fxEnabled && fxSettings.reverbEnabled) ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div>
              <div className="flex justify-between text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">
                <span>Reverb Space</span>
                <span className="font-mono text-zinc-400 font-semibold">{fxSettings.reverbWet}%</span>
              </div>
              <input
                type="range"
                min="0" max="100"
                value={fxSettings.reverbWet}
                onChange={(e) => setFxSettings({ reverbWet: parseInt(e.target.value) })}
                className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
              />
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
