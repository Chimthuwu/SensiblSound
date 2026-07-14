import { useRef, useEffect, useState } from 'react';
import { Mic2, Volume2, VolumeX, Activity, Sliders } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSessionStore } from '../../stores/useSessionStore';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';

interface RealtimeWaveformProps {
  stream: MediaStream;
}

function RealtimeWaveform({ stream }: RealtimeWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!stream) return;

    let audioCtx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let animationId: number;

    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const draw = () => {
        if (!analyser || !ctx) return;
        animationId = requestAnimationFrame(draw);

        analyser.getByteTimeDomainData(dataArray);

        // Dark background matching the theme
        ctx.fillStyle = 'rgba(10, 10, 11, 0.35)';
        ctx.fillRect(0, 0, rect.width, rect.height);

        // Draw center line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, rect.height / 2);
        ctx.lineTo(rect.width, rect.height / 2);
        ctx.stroke();

        // Draw waveform
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#a855f7'; // Neon purple
        ctx.shadowBlur = 6;
        ctx.shadowColor = 'rgba(168, 85, 247, 0.6)';
        ctx.beginPath();

        const sliceWidth = rect.width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * rect.height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        ctx.lineTo(rect.width, rect.height / 2);
        ctx.stroke();
      };

      draw();
    } catch (e) {
      console.error('Failed to initialize Web Audio Analyser:', e);
    }

    return () => {
      cancelAnimationFrame(animationId);
      if (source) source.disconnect();
      if (analyser) analyser.disconnect();
      if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
    };
  }, [stream]);

  return <canvas ref={canvasRef} className="w-full h-full absolute inset-0 rounded-xl" />;
}

export function VocalTrack() {
  const { isRecording, activeTake, setActiveTake, layers, addLayer, removeLayer } = useSessionStore();
  const { devices, selectedDeviceId, setSelectedDeviceId, isReady: micReady, stream } = useAudioRecorder();
  
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [fxEnabled, setFxEnabled] = useState(true);
  const [fxSettings, setFxSettings] = useState({
    compression: 40,
    eqWarmth: 3,
    eqClarity: 5,
    delayTime: 0.35,
    delayFeedback: 30,
    saturation: 15,
    reverbWet: 25,
  });

  // Manage Real-time Microphone Monitoring FX Loop
  useEffect(() => {
    if (!isMonitoring || !stream) return;

    let audioCtx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    
    // Nodes
    let compressor: DynamicsCompressorNode | null = null;
    let lowShelf: BiquadFilterNode | null = null;
    let highShelf: BiquadFilterNode | null = null;
    let waveshaper: WaveShaperNode | null = null;
    let delayNode: DelayNode | null = null;
    let delayFeedbackGain: GainNode | null = null;
    let delayWetGain: GainNode | null = null;
    let reverbDelay: DelayNode | null = null;
    let reverbFeedback: GainNode | null = null;
    let reverbWetGain: GainNode | null = null;
    let outputGain: GainNode | null = null;

    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      source = audioCtx.createMediaStreamSource(stream);

      if (fxEnabled) {
        // Dynamics Compressor
        compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.value = -50 + (fxSettings.compression / 100) * 30;
        compressor.knee.value = 35;
        compressor.ratio.value = 10;
        compressor.attack.value = 0.005;
        compressor.release.value = 0.15;

        // EQ
        lowShelf = audioCtx.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 220;
        lowShelf.gain.value = fxSettings.eqWarmth;

        highShelf = audioCtx.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 3200;
        highShelf.gain.value = fxSettings.eqClarity;

        // Saturation
        waveshaper = audioCtx.createWaveShaper();
        const makeDistortionCurve = (amount: number) => {
          const k = typeof amount === 'number' ? amount : 50;
          const n_samples = 44100;
          const curve = new Float32Array(n_samples);
          const deg = Math.PI / 180;
          for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2) / n_samples - 1;
            curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
          }
          return curve;
        };
        waveshaper.curve = makeDistortionCurve(fxSettings.saturation);
        waveshaper.oversample = '4x';

        // Delay
        delayNode = audioCtx.createDelay(1.0);
        delayNode.delayTime.value = fxSettings.delayTime;
        
        delayFeedbackGain = audioCtx.createGain();
        delayFeedbackGain.gain.value = fxSettings.delayFeedback / 100;

        delayNode.connect(delayFeedbackGain);
        delayFeedbackGain.connect(delayNode);

        delayWetGain = audioCtx.createGain();
        delayWetGain.gain.value = 0.25;

        // Reverb (Comb-feedback slap back simulation)
        reverbDelay = audioCtx.createDelay(0.2);
        reverbDelay.delayTime.value = 0.045;

        reverbFeedback = audioCtx.createGain();
        reverbFeedback.gain.value = fxSettings.reverbWet / 150;
        reverbDelay.connect(reverbFeedback);
        reverbFeedback.connect(reverbDelay);

        reverbWetGain = audioCtx.createGain();
        reverbWetGain.gain.value = (fxSettings.reverbWet / 100) * 0.35;

        outputGain = audioCtx.createGain();
        outputGain.gain.value = 0.9;

        // Connect graph
        source.connect(compressor);
        compressor.connect(lowShelf);
        lowShelf.connect(highShelf);
        highShelf.connect(waveshaper);
        
        waveshaper.connect(outputGain);

        waveshaper.connect(delayNode);
        delayNode.connect(delayWetGain);
        delayWetGain.connect(outputGain);

        waveshaper.connect(reverbDelay);
        reverbDelay.connect(reverbWetGain);
        reverbWetGain.connect(outputGain);

        outputGain.connect(audioCtx.destination);
      } else {
        source.connect(audioCtx.destination);
      }
    } catch (e) {
      console.error('Failed to setup monitoring audio routing:', e);
    }

    return () => {
      if (source) source.disconnect();
      if (compressor) compressor.disconnect();
      if (lowShelf) lowShelf.disconnect();
      if (highShelf) highShelf.disconnect();
      if (waveshaper) waveshaper.disconnect();
      if (delayNode) delayNode.disconnect();
      if (delayFeedbackGain) delayFeedbackGain.disconnect();
      if (delayWetGain) delayWetGain.disconnect();
      if (reverbDelay) reverbDelay.disconnect();
      if (reverbFeedback) reverbFeedback.disconnect();
      if (reverbWetGain) reverbWetGain.disconnect();
      if (outputGain) outputGain.disconnect();
      if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
    };
  }, [isMonitoring, stream, fxEnabled, fxSettings]);

  const containerRef = useRef<HTMLDivElement>(null);
  const { isReady, volume, setVolume, isMuted, setIsMuted } = useAudioPlayer(containerRef, activeTake?.url);

  return (
    <section className="bg-surface rounded-2xl p-5 flex flex-col gap-5 shadow-xl shadow-black/40 relative overflow-hidden">
      {isRecording && (
        <motion.div 
          className="absolute inset-0 bg-primary/5 pointer-events-none"
          animate={{ opacity: [0.2, 0.4, 0.2] }}
          transition={{ repeat: Infinity, duration: 2 }}
        />
      )}
      
      <div className="flex items-center justify-between relative z-10">
        <h2 className="text-sm font-bold text-primary flex items-center gap-2 tracking-wide font-sans uppercase">
          <Mic2 size={16} />
          Vocal Take
        </h2>
        
        <div className="flex items-center gap-3">
          {activeTake && !isRecording && (
            <div className="flex items-center gap-3 text-zinc-400 bg-black/30 px-3 py-1.5 rounded-lg border border-white/[0.03]">
              <button onClick={() => setIsMuted(!isMuted)} className="hover:text-primary transition-colors cursor-pointer">
                {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  setIsMuted(false);
                  setVolume(parseFloat(e.target.value));
                }}
                className="w-20 accent-primary cursor-pointer"
              />
            </div>
          )}
          
          <button
            onClick={() => setIsMonitoring(!isMonitoring)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-all duration-300 flex items-center gap-1.5 cursor-pointer font-sans font-semibold ${
              isMonitoring 
                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30' 
                : 'bg-white/[0.04] text-zinc-400 border-white/[0.05] hover:text-white hover:bg-white/[0.08]'
            }`}
            title="Listen to your mic input in real-time with FX applied"
          >
            <Activity size={14} className={isMonitoring ? 'animate-pulse' : ''} />
            {isMonitoring ? 'Monitoring ON' : 'Monitor Mic'}
          </button>

          <select 
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            disabled={isRecording || !micReady}
            className="text-xs bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-zinc-300 outline-none focus:border-primary/50 transition-all cursor-pointer font-sans"
          >
            {!micReady && <option value="">Requesting mic access...</option>}
            {devices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      <div className={`h-32 rounded-xl border relative overflow-hidden flex items-center justify-center transition-all duration-300 ${
        isRecording 
          ? 'bg-primary/5 border-primary shadow-[0_0_15px_rgba(168,85,247,0.1)]' 
          : 'bg-black/50 border-white/[0.05] hover:border-primary/20 shadow-[inset_0_2px_8px_rgba(0,0,0,0.3)]'
      }`}>
        
        {/* DAW Gridlines */}
        <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:calc(100%/16)_100%] z-0" />

        {/* WaveSurfer Container (Only visible when we have a take and not recording) */}
        <div 
          ref={containerRef} 
          className="absolute inset-0 w-full h-full z-10"
          style={{ opacity: (activeTake && !isRecording) ? 1 : 0, pointerEvents: 'none' }}
        />

        {/* Loading state for wavesurfer */}
        {activeTake && !isRecording && !isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0b]/80 z-10 backdrop-blur-sm">
             <span className="text-xs text-primary animate-pulse font-bold tracking-wider">RENDERING TAKE...</span>
          </div>
        )}

        {/* Live Recording State */}
        {isRecording && (
          <>
            {stream && <RealtimeWaveform stream={stream} />}
            <div className="text-primary text-sm z-10 flex flex-col items-center gap-3 bg-black/40 px-4 py-3 rounded-xl border border-white/[0.03] backdrop-blur-md">
               <motion.div 
                 className="w-3.5 h-3.5 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444]"
                 animate={{ scale: [1, 1.4, 1], opacity: [1, 0.4, 1] }}
                 transition={{ repeat: Infinity, duration: 1 }}
               />
               <span className="font-bold tracking-wider animate-pulse uppercase text-[10px]">RECORDING LIVE</span>
            </div>
          </>
        )}

        {/* Idle State */}
        {!activeTake && !isRecording && (
          <div className="text-zinc-400 text-sm flex items-center gap-2 pointer-events-none font-sans tracking-wide select-none">
            <Mic2 size={18} className="text-zinc-600 animate-pulse" />
            <span className="font-semibold text-zinc-500">Ready to record vocals</span>
          </div>
        )}
      </div>

      {/* Take Management Controls */}
      {activeTake && !isRecording && (
        <div className="flex items-center justify-end gap-3 border-t border-white/5 pt-4">
          <button 
            onClick={() => {
              if (window.confirm("Discard current take and record again?")) {
                setActiveTake(undefined);
              }
            }}
            className="text-xs text-zinc-400 hover:text-white px-4 py-2 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
          >
            Record Again
          </button>
          <button 
            onClick={() => {
              addLayer(activeTake);
              setActiveTake(undefined);
            }}
            className="text-xs bg-primary hover:bg-primary/80 text-white font-medium px-4 py-2 rounded-md transition-colors cursor-pointer"
          >
            Keep as Layer
          </button>
        </div>
      )}

      {/* Layers Display */}
      {layers.length > 0 && (
        <div className="border-t border-white/5 pt-4 space-y-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Layers ({layers.length}/5)</h3>
          <div className="flex flex-col gap-2">
            {layers.map((layer, index) => (
              <div key={layer.id} className="flex items-center justify-between bg-black/30 border border-white/5 rounded-md px-3 py-2">
                <span className="text-xs text-zinc-400">Layer {index + 1}</span>
                <button 
                  onClick={() => removeLayer(layer.id)}
                  className="text-xs text-red-500 hover:text-red-400 p-1 cursor-pointer"
                >
                  Discard
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vocal FX Rack */}
      <div className="border-t border-white/[0.04] pt-4 mt-2">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2 font-sans">
            <Sliders size={13} className="text-primary" />
            Vocal FX Rack
          </h3>
          <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
            <input 
              type="checkbox" 
              checked={fxEnabled} 
              onChange={() => setFxEnabled(!fxEnabled)}
              className="accent-primary w-3.5 h-3.5 rounded border-white/10"
            />
            <span>Enable FX Rack</span>
          </label>
        </div>
        
        <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 transition-all duration-300 ${fxEnabled ? 'opacity-100' : 'opacity-35 pointer-events-none'}`}>
          {/* Compression */}
          <div className="bg-black/30 rounded-xl p-3 border border-white/[0.02] flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Compressor</span>
            <input 
              type="range" 
              min="0" max="100" 
              value={fxSettings.compression}
              onChange={(e) => setFxSettings({ ...fxSettings, compression: parseInt(e.target.value) })}
              className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
            />
            <span className="text-[10px] font-mono text-zinc-400 text-right">{fxSettings.compression}%</span>
          </div>

          {/* Saturation */}
          <div className="bg-black/30 rounded-xl p-3 border border-white/[0.02] flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Saturation</span>
            <input 
              type="range" 
              min="0" max="100" 
              value={fxSettings.saturation}
              onChange={(e) => setFxSettings({ ...fxSettings, saturation: parseInt(e.target.value) })}
              className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
            />
            <span className="text-[10px] font-mono text-zinc-400 text-right">{fxSettings.saturation}%</span>
          </div>

          {/* EQ Warmth */}
          <div className="bg-black/30 rounded-xl p-3 border border-white/[0.02] flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Warmth (Low)</span>
            <input 
              type="range" 
              min="-12" max="12" 
              value={fxSettings.eqWarmth}
              onChange={(e) => setFxSettings({ ...fxSettings, eqWarmth: parseInt(e.target.value) })}
              className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
            />
            <span className="text-[10px] font-mono text-zinc-400 text-right">{fxSettings.eqWarmth} dB</span>
          </div>

          {/* EQ Clarity */}
          <div className="bg-black/30 rounded-xl p-3 border border-white/[0.02] flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Clarity (High)</span>
            <input 
              type="range" 
              min="-12" max="12" 
              value={fxSettings.eqClarity}
              onChange={(e) => setFxSettings({ ...fxSettings, eqClarity: parseInt(e.target.value) })}
              className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
            />
            <span className="text-[10px] font-mono text-zinc-400 text-right">{fxSettings.eqClarity} dB</span>
          </div>

          {/* Delay Feedback */}
          <div className="bg-black/30 rounded-xl p-3 border border-white/[0.02] flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Delay Feedback</span>
            <input 
              type="range" 
              min="0" max="90" 
              value={fxSettings.delayFeedback}
              onChange={(e) => setFxSettings({ ...fxSettings, delayFeedback: parseInt(e.target.value) })}
              className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
            />
            <span className="text-[10px] font-mono text-zinc-400 text-right">{fxSettings.delayFeedback}%</span>
          </div>

          {/* Delay Time */}
          <div className="bg-black/30 rounded-xl p-3 border border-white/[0.02] flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Delay Time</span>
            <input 
              type="range" 
              min="10" max="100" 
              value={fxSettings.delayTime * 100}
              onChange={(e) => setFxSettings({ ...fxSettings, delayTime: parseFloat(e.target.value) / 100 })}
              className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
            />
            <span className="text-[10px] font-mono text-zinc-400 text-right">{fxSettings.delayTime.toFixed(2)}s</span>
          </div>

          {/* Reverb */}
          <div className="bg-black/30 rounded-xl p-3 border border-white/[0.02] flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Reverb Space</span>
            <input 
              type="range" 
              min="0" max="100" 
              value={fxSettings.reverbWet}
              onChange={(e) => setFxSettings({ ...fxSettings, reverbWet: parseInt(e.target.value) })}
              className="w-full accent-primary cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
            />
            <span className="text-[10px] font-mono text-zinc-400 text-right">{fxSettings.reverbWet}%</span>
          </div>
        </div>
      </div>
    </section>
  );
}
