import { useEffect, useRef } from 'react';
import { useSessionStore } from '../../stores/useSessionStore';
import { Sliders, Music, Disc, Zap, Flame } from 'lucide-react';

export function VocalFxRack() {
  const { fxEnabled, setFxEnabled, fxSettings, setFxSettings } = useSessionStore();
  const eqCanvasRef = useRef<HTMLCanvasElement>(null);

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
    ctx.fillStyle = '#0f0f11';
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    
    // Vertical freq grids (logarithmic representation)
    const freqs = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
    freqs.forEach(f => {
      const logMin = Math.log10(20);
      const logMax = Math.log10(20000);
      const x = ((Math.log10(f) - logMin) / (logMax - logMin)) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      
      // Label text
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.font = '7px sans-serif';
      const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
      ctx.fillText(label, x + 3, height - 6);
    });

    // Horizontal dB grids (-15dB to +15dB)
    const dbs = [-12, -6, 0, 6, 12];
    dbs.forEach(db => {
      const y = height / 2 - (db / 24) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.font = '7px sans-serif';
      ctx.fillText(`${db > 0 ? '+' : ''}${db}dB`, 6, y - 2);
    });

    // Draw Response Curve
    ctx.beginPath();
    ctx.strokeStyle = fxEnabled ? '#a855f7' : 'rgba(255,255,255,0.2)'; // purple or gray
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = fxEnabled ? 6 : 0;
    ctx.shadowColor = 'rgba(168, 85, 247, 0.5)';

    const logMin = Math.log10(20);
    const logMax = Math.log10(20000);

    for (let x = 0; x < width; x++) {
      // Convert x pixel coordinate back to logarithmic frequency
      const pct = x / width;
      const freq = Math.pow(10, logMin + pct * (logMax - logMin));

      // Calculate simple filter responses
      // 1. Low Shelf (f0 = 150Hz)
      const lowResponse = fxSettings.eqLow / (1 + Math.pow(freq / 150, 2));
      
      // Peaking Mid (f0 = 1200Hz, Q = 1.2)
      const midGain = fxSettings.eqMid;
      const f0 = 1200;
      const Q = 1.2;
      const w0 = freq / f0;
      const midResponse = midGain / (1 + Math.pow((w0 * w0 - 1) / (w0 / Q), 2));

      // 3. High Shelf (f0 = 4000Hz)
      const highResponse = fxSettings.eqHigh / (1 + Math.pow(4000 / freq, 2));

      const totalDb = lowResponse + midResponse + highResponse;
      const y = height / 2 - (totalDb / 24) * height; // scale DB to Y axis

      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0; // reset
  }, [fxEnabled, fxSettings.eqLow, fxSettings.eqMid, fxSettings.eqHigh]);

  const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const scales = ['Major', 'Minor', 'Chromatic'];

  return (
    <section className="bg-surface rounded-2xl p-6 flex flex-col gap-6 shadow-xl shadow-black/40 border border-white/[0.02] mt-6">
      {/* FX Header */}
      <div className="flex items-center justify-between border-b border-white/[0.04] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-sm">
            <Sliders size={16} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide uppercase font-sans">Vocal FX Processor</h2>
            <p className="text-[10px] text-zinc-500 font-medium">Professional studio effects chain</p>
          </div>
        </div>
        
        <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-bold text-zinc-400 uppercase tracking-wider bg-black/40 px-4 py-2 rounded-lg border border-white/[0.03]">
          <input 
            type="checkbox" 
            checked={fxEnabled} 
            onChange={() => setFxEnabled(!fxEnabled)}
            className="accent-primary w-4 h-4 rounded border-white/10 cursor-pointer"
          />
          <span>Enable Effects Rack</span>
        </label>
      </div>

      {/* FX Grid */}
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 transition-all duration-300 ${fxEnabled ? 'opacity-100' : 'opacity-35 pointer-events-none'}`}>
        
        {/* Module 1: Autotune & Doubler */}
        <div className="bg-black/20 rounded-xl p-4 border border-white/[0.03] flex flex-col gap-4">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2 border-b border-white/[0.02] pb-2 font-sans">
            <Music size={13} className="text-primary" />
            Autotune & Doubler
          </h3>
          
          <div className="flex flex-col gap-3">
            <div>
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Key & Scale</span>
              <div className="flex gap-2">
                <select 
                  value={fxSettings.autotuneKey}
                  onChange={(e) => setFxSettings({ autotuneKey: e.target.value })}
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg p-1.5 text-xs text-zinc-300 font-sans cursor-pointer outline-none"
                >
                  {keys.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <select 
                  value={fxSettings.autotuneScale}
                  onChange={(e) => setFxSettings({ autotuneScale: e.target.value })}
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg p-1.5 text-xs text-zinc-300 font-sans cursor-pointer outline-none"
                >
                  {scales.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">
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

            <div className="border-t border-white/[0.02] pt-3 flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                <input 
                  type="checkbox" 
                  checked={fxSettings.doubleEnabled} 
                  onChange={(e) => setFxSettings({ doubleEnabled: e.target.checked })}
                  className="accent-primary w-3.5 h-3.5 rounded border-white/10 cursor-pointer"
                />
                <span>Double Vocal (Stereo)</span>
              </label>
              
              <div className={fxSettings.doubleEnabled ? 'opacity-100' : 'opacity-35 pointer-events-none'}>
                <input 
                  type="range" 
                  min="0" max="100" 
                  value={fxSettings.doubleWidth}
                  onChange={(e) => setFxSettings({ doubleWidth: parseInt(e.target.value) })}
                  className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Module 2: Compressor */}
        <div className="bg-black/20 rounded-xl p-4 border border-white/[0.03] flex flex-col gap-4">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2 border-b border-white/[0.02] pb-2 font-sans">
            <Zap size={13} className="text-primary" />
            Dynamics (Compressor)
          </h3>
          
          <div className="flex flex-col gap-4 justify-center h-full pb-2">
            <div>
              <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">
                <span>Vocal Compression</span>
                <span className="font-mono text-primary font-bold">{fxSettings.compression}%</span>
              </div>
              <input 
                type="range" 
                min="0" max="100" 
                value={fxSettings.compression}
                onChange={(e) => setFxSettings({ compression: parseInt(e.target.value) })}
                className="w-full accent-primary cursor-pointer h-1.5 bg-zinc-800 rounded-lg appearance-none"
              />
              <span className="text-[9px] text-zinc-500 mt-1 block">Smooths out peak volume dynamics</span>
            </div>

            <div className="bg-black/40 rounded-lg p-3 border border-white/[0.02] text-[10px] text-zinc-400">
              <span className="font-bold text-zinc-300 block mb-1">Studio Compressor Config:</span>
              Threshold: -35dB • Ratio: 4:1 • Makeup Gain: auto-calculated
            </div>
          </div>
        </div>

        {/* Module 3: Parametric EQ */}
        <div className="bg-black/20 rounded-xl p-4 border border-white/[0.03] flex flex-col gap-4 lg:col-span-2">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center justify-between border-b border-white/[0.02] pb-2 font-sans">
            <span className="flex items-center gap-2">
              <Disc size={13} className="text-primary" />
              Parametric EQ (Visualizer)
            </span>
            <span className="text-[9px] text-zinc-500 font-mono">20Hz - 20kHz</span>
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Visualizer Display */}
            <div className="lg:col-span-3 h-28 relative rounded-xl border border-white/[0.03] overflow-hidden">
              <canvas ref={eqCanvasRef} className="w-full h-full" />
            </div>

            {/* Sliders */}
            <div className="lg:col-span-2 flex flex-col gap-3 justify-center">
              <div>
                <div className="flex justify-between text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">
                  <span>Low Shelf (Bass)</span>
                  <span className="font-mono text-zinc-300">{fxSettings.eqLow > 0 ? '+' : ''}{fxSettings.eqLow}dB</span>
                </div>
                <input 
                  type="range" 
                  min="-12" max="12" 
                  value={fxSettings.eqLow}
                  onChange={(e) => setFxSettings({ eqLow: parseInt(e.target.value) })}
                  className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
                />
              </div>

              <div>
                <div className="flex justify-between text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">
                  <span>Mid Peaking (Voice)</span>
                  <span className="font-mono text-zinc-300">{fxSettings.eqMid > 0 ? '+' : ''}{fxSettings.eqMid}dB</span>
                </div>
                <input 
                  type="range" 
                  min="-12" max="12" 
                  value={fxSettings.eqMid}
                  onChange={(e) => setFxSettings({ eqMid: parseInt(e.target.value) })}
                  className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
                />
              </div>

              <div>
                <div className="flex justify-between text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">
                  <span>High Shelf (Air)</span>
                  <span className="font-mono text-zinc-300">{fxSettings.eqHigh > 0 ? '+' : ''}{fxSettings.eqHigh}dB</span>
                </div>
                <input 
                  type="range" 
                  min="-12" max="12" 
                  value={fxSettings.eqHigh}
                  onChange={(e) => setFxSettings({ eqHigh: parseInt(e.target.value) })}
                  className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Module 4: Delay & Reverb (Grouped) */}
        <div className="bg-black/20 rounded-xl p-4 border border-white/[0.03] flex flex-col gap-4 lg:col-span-4">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2 border-b border-white/[0.02] pb-2 font-sans">
            <Flame size={13} className="text-primary" />
            Time Effects (Echo Delay & Reverb Space)
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Delay Feedback</span>
              <input 
                type="range" 
                min="0" max="90" 
                value={fxSettings.delayFeedback}
                onChange={(e) => setFxSettings({ delayFeedback: parseInt(e.target.value) })}
                className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
              />
              <span className="text-[10px] font-mono text-zinc-400 text-right">{fxSettings.delayFeedback}% feedback</span>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Delay Time</span>
              <input 
                type="range" 
                min="10" max="100" 
                value={fxSettings.delayTime * 100}
                onChange={(e) => setFxSettings({ delayTime: parseFloat(e.target.value) / 100 })}
                className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
              />
              <span className="text-[10px] font-mono text-zinc-400 text-right">{fxSettings.delayTime.toFixed(2)}s duration</span>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Reverb Space Decay</span>
              <input 
                type="range" 
                min="0" max="100" 
                value={fxSettings.reverbWet}
                onChange={(e) => setFxSettings({ reverbWet: parseInt(e.target.value) })}
                className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
              />
              <span className="text-[10px] font-mono text-zinc-400 text-right">{fxSettings.reverbWet}% wet</span>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
