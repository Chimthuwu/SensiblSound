import { useRef, useEffect } from 'react';
import { Mic2, Volume2, VolumeX, Activity, Download, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSessionStore } from '../../stores/useSessionStore';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { TimeRuler } from './TimeRuler';
import { LayerTrack } from './LayerTrack';
import { Playhead } from './Playhead';
import { getLayerTimelineDurationMs } from '../../utils/timeline';
import { downloadBlobUrl, buildTakeFilename } from '../../utils/download';

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
    let lastClipTime = 0;

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
        let hasClipped = false;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * rect.height) / 2;

          if (dataArray[i] <= 1 || dataArray[i] >= 254) {
            hasClipped = true;
          }

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        ctx.lineTo(rect.width, rect.height / 2);
        ctx.stroke();

        // Manage clip indicator timing
        if (hasClipped) {
          lastClipTime = Date.now();
        }

        // Draw red CLIP warning if clipped in the last 1.5s
        if (Date.now() - lastClipTime < 1500) {
          ctx.save();
          ctx.fillStyle = '#ef4444';
          ctx.shadowBlur = 10;
          ctx.shadowColor = 'rgba(239, 68, 68, 0.8)';
          ctx.font = 'bold 9px monospace';
          ctx.fillText('CLIP', rect.width - 40, 20);
          
          // Draw clip circle
          ctx.beginPath();
          ctx.arc(rect.width - 48, 17, 3, 0, 2 * Math.PI);
          ctx.fill();
          ctx.restore();
        }
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
  const {
    isRecording, activeTake, setActiveTake, layers, addLayer, removeLayer,
    isMonitoring, setIsMonitoring, fxEnabled, fxSettings, bpm, setActiveTakeDurationMs,
    markActiveTakeDownloaded
  } = useSessionStore();
  const layersTimelineDurationMs = useSessionStore(getLayerTimelineDurationMs);
  const { devices, selectedDeviceId, setSelectedDeviceId, isReady: micReady, stream } = useAudioRecorder();

  // Manage Real-time Microphone Monitoring FX Loop
  // Each FX is gated by its own per-effect toggle so that disabled FX
  // are completely bypassed (the corresponding node is never created).
  useEffect(() => {
    if (!isMonitoring || !stream) return;

    let audioCtx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;

    // All nodes default to null. We only assign a node when its FX toggle is on,
    // and the cleanup function below safely no-ops on null references.
    let compressor: DynamicsCompressorNode | null = null;
    let lowShelf: BiquadFilterNode | null = null;
    let midPeaking: BiquadFilterNode | null = null;
    let highShelf: BiquadFilterNode | null = null;
    let waveshaper: WaveShaperNode | null = null;

    let pitchShifter: DelayNode | null = null;
    let pitchModLFO: OscillatorNode | null = null;
    let pitchModGain: GainNode | null = null;

    let doubleDelay: DelayNode | null = null;
    let leftPanner: StereoPannerNode | null = null;
    let rightPanner: StereoPannerNode | null = null;
    let doubleGain: GainNode | null = null;

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
        // Use a `prev` pointer so each disabled module is bypassed automatically:
        // if a node is not created, prev simply flows past it to the next stage.
        let prev: AudioNode = source;

        // 1. Dynamics Compressor — gated by compressorEnabled
        if (fxSettings.compressorEnabled) {
          compressor = audioCtx.createDynamicsCompressor();
          compressor.threshold.value = -50 + (fxSettings.compression / 100) * 30;
          compressor.knee.value = 35;
          compressor.ratio.value = 10;
          compressor.attack.value = 0.005;
          compressor.release.value = 0.15;
          prev.connect(compressor);
          prev = compressor;
        }

        // 2. Parametric EQ (Low, Mid, High) — gated by eqEnabled
        if (fxSettings.eqEnabled) {
          lowShelf = audioCtx.createBiquadFilter();
          lowShelf.type = 'lowshelf';
          lowShelf.frequency.value = 150;
          lowShelf.gain.value = fxSettings.eqLow;

          midPeaking = audioCtx.createBiquadFilter();
          midPeaking.type = 'peaking';
          midPeaking.frequency.value = 1200;
          midPeaking.Q.value = 1.2;
          midPeaking.gain.value = fxSettings.eqMid;

          highShelf = audioCtx.createBiquadFilter();
          highShelf.type = 'highshelf';
          highShelf.frequency.value = 4000;
          highShelf.gain.value = fxSettings.eqHigh;

          prev.connect(lowShelf);
          lowShelf.connect(midPeaking);
          midPeaking.connect(highShelf);
          prev = highShelf;
        }

        // 3. Autotune (saturation + pitch-shift LFO delay) — gated by autotuneEnabled
        if (fxSettings.autotuneEnabled) {
          // Saturation (Waveshaper) bundled with the autotune chain
          waveshaper = audioCtx.createWaveShaper();
          const makeDistortionCurve = (amount: number) => {
            const k = typeof amount === 'number' ? amount : 15;
            const n_samples = 44100;
            const curve = new Float32Array(n_samples);
            const deg = Math.PI / 180;
            for (let i = 0; i < n_samples; ++i) {
              const x = (i * 2) / n_samples - 1;
              curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
            }
            return curve;
          };
          waveshaper.curve = makeDistortionCurve(10);
          waveshaper.oversample = '4x';

          // Pitch shifter + LFO for vibrato/correction modulation
          pitchShifter = audioCtx.createDelay(0.1);
          pitchShifter.delayTime.value = 0.005; // 5ms delay

          pitchModLFO = audioCtx.createOscillator();
          pitchModLFO.frequency.value = 7.5;

          pitchModGain = audioCtx.createGain();
          // Speed determines depth of pitch modulation correction
          pitchModGain.gain.value = (fxSettings.autotuneSpeed / 100) * 0.0012;

          pitchModLFO.connect(pitchModGain);
          pitchModGain.connect(pitchShifter.delayTime);
          pitchModLFO.start();

          prev.connect(waveshaper);
          waveshaper.connect(pitchShifter);
          prev = pitchShifter;
        }

        // 4. Output stage — created once. The doubler splits above into
        //    left/dry-pan and right/delay-pan outputGain mixes.
        outputGain = audioCtx.createGain();
        outputGain.gain.value = 0.9;

        if (fxSettings.doubleEnabled) {
          doubleGain = audioCtx.createGain();
          doubleGain.gain.value = 0.85;

          leftPanner = audioCtx.createStereoPanner();
          leftPanner.pan.value = -0.5 * (fxSettings.doubleWidth / 100);

          rightPanner = audioCtx.createStereoPanner();
          rightPanner.pan.value = 0.5 * (fxSettings.doubleWidth / 100);

          doubleDelay = audioCtx.createDelay(0.1);
          doubleDelay.delayTime.value = 0.022; // 22ms Haas delay

          // Route Left (Direct)
          prev.connect(leftPanner);
          leftPanner.connect(outputGain);

          // Route Right (Delayed & Panned)
          prev.connect(doubleDelay);
          doubleDelay.connect(rightPanner);
          rightPanner.connect(doubleGain);
          doubleGain.connect(outputGain);
        } else {
          // Direct mono path
          prev.connect(outputGain);
        }

        // 5. Delay Echo — gated by delayEnabled
        if (fxSettings.delayEnabled) {
          delayNode = audioCtx.createDelay(1.0);
          delayNode.delayTime.value = fxSettings.delayTime;

          delayFeedbackGain = audioCtx.createGain();
          delayFeedbackGain.gain.value = fxSettings.delayFeedback / 100;

          delayNode.connect(delayFeedbackGain);
          delayFeedbackGain.connect(delayNode); // feedback loop

          delayWetGain = audioCtx.createGain();
          delayWetGain.gain.value = 0.25;

          outputGain.connect(delayNode);
          delayNode.connect(delayWetGain);
          delayWetGain.connect(audioCtx.destination);
        }

        // 6. Reverb Space — gated by reverbEnabled
        if (fxSettings.reverbEnabled) {
          reverbDelay = audioCtx.createDelay(0.2);
          reverbDelay.delayTime.value = 0.045;

          reverbFeedback = audioCtx.createGain();
          reverbFeedback.gain.value = fxSettings.reverbWet / 150;
          reverbDelay.connect(reverbFeedback);
          reverbFeedback.connect(reverbDelay);

          reverbWetGain = audioCtx.createGain();
          reverbWetGain.gain.value = (fxSettings.reverbWet / 100) * 0.35;

          outputGain.connect(reverbDelay);
          reverbDelay.connect(reverbWetGain);
          reverbWetGain.connect(audioCtx.destination);
        }

        // Always-on dry/panned output from outputGain
        outputGain.connect(audioCtx.destination);
      } else {
        source.connect(audioCtx.destination);
      }
    } catch (e) {
      console.error('Failed to setup monitoring audio routing:', e);
    }

    return () => {
      // All nodes are null when not created; safe no-op via null checks.
      if (source) source.disconnect();
      if (compressor) compressor.disconnect();
      if (lowShelf) lowShelf.disconnect();
      if (midPeaking) midPeaking.disconnect();
      if (highShelf) highShelf.disconnect();
      if (waveshaper) waveshaper.disconnect();
      if (pitchShifter) pitchShifter.disconnect();
      if (pitchModLFO) {
        try { pitchModLFO.stop(); } catch(e) {}
        pitchModLFO.disconnect();
      }
      if (pitchModGain) pitchModGain.disconnect();
      if (doubleDelay) doubleDelay.disconnect();
      if (leftPanner) leftPanner.disconnect();
      if (rightPanner) rightPanner.disconnect();
      if (doubleGain) doubleGain.disconnect();
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
  // Vocal takes are offset-aware: they lock to their recorded project-time offset
  // (set in useAudioRecorder.startRecording) and ignore clicks (interactive: false)
  // so the user can't accidentally move the vocal waveform out of sync.
  const { isReady, duration, volume, setVolume, isMuted, setIsMuted } = useAudioPlayer(
    containerRef,
    activeTake?.url,
    { startOffsetMs: activeTake?.transportStartMs ?? 0, interactive: false, blob: activeTake?.blob }
  );

  // Depend on activeTake?.id (stable) rather than the object itself — the
  // setter replaces that object with a new reference once durationMs is
  // written, which would otherwise re-trigger this effect forever.
  useEffect(() => {
    if (activeTake && isReady && duration > 0) {
      setActiveTakeDurationMs(duration * 1000);
    }
  }, [activeTake?.id, isReady, duration, setActiveTakeDurationMs]);

  const handleDownloadActiveTake = () => {
    if (!activeTake) return;
    downloadBlobUrl(activeTake.url, buildTakeFilename(activeTake.timestamp, 'vocal-take', activeTake.mimeType));
    markActiveTakeDownloaded();
  };

  const handleRecordAgain = () => {
    const message = activeTake && !activeTake.downloaded
      ? "This take hasn't been downloaded yet — discarding it now means it's gone for good. Discard and record again?"
      : 'Discard current take and record again?';
    if (window.confirm(message)) {
      setActiveTake(undefined);
    }
  };

  return (
    <section className="bg-surface rounded-2xl p-5 flex flex-col gap-5 shadow-xl shadow-black/40 relative overflow-hidden">
      {isRecording && (
        <motion.div 
          className="absolute inset-0 bg-primary/5 pointer-events-none"
          animate={{ opacity: [0.2, 0.4, 0.2] }}
          transition={{ repeat: Infinity, duration: 2 }}
        />
      )}
      
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between relative z-10 gap-4">
        <h2 className="text-sm font-bold text-primary flex items-center gap-2 tracking-wide font-sans uppercase">
          <Mic2 size={16} />
          Vocal Take
        </h2>
        
        <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full md:w-auto">
          {activeTake && !isRecording && (
            <div className="flex items-center gap-3 text-zinc-400 bg-black/30 px-3 py-1.5 rounded-lg border border-white/[0.03] flex-1 md:flex-none justify-center">
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
                className="w-full md:w-20 accent-primary cursor-pointer"
              />
            </div>
          )}
          
          <button
            onClick={() => setIsMonitoring(!isMonitoring)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer font-sans font-semibold flex-1 md:flex-none ${
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
            className="text-xs w-full md:w-auto bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-zinc-300 outline-none focus:border-primary/50 transition-all cursor-pointer font-sans flex-1 md:flex-none"
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
        
        {/* Bar-numbered DAW grid, bpm-synced to the take's own decoded length —
            same TimeRuler the backing track uses, so bar numbers here mean the
            same thing they do there. Falls back to a plain grid while
            recording live or before duration is known, since bar math needs
            a real duration to be meaningful. */}
        {activeTake && !isRecording && duration > 0 ? (
          <TimeRuler bpm={bpm} duration={duration} />
        ) : (
          <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:calc(100%/16)_100%] z-0" />
        )}

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
        <div className="flex flex-col gap-3 border-t border-white/5 pt-4">
          {/* Unmissable download CTA — this is the main defense against losing
              a recording (there is currently no other durable copy anywhere).
              Pulses with a glow until she's actually downloaded it. */}
          <motion.button
            onClick={handleDownloadActiveTake}
            animate={activeTake.downloaded ? {} : {
              boxShadow: [
                '0 0 0px rgba(16,185,129,0)',
                '0 0 22px rgba(16,185,129,0.6)',
                '0 0 0px rgba(16,185,129,0)',
              ],
            }}
            transition={{ repeat: activeTake.downloaded ? 0 : Infinity, duration: 1.8 }}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-bold text-sm tracking-wide transition-colors cursor-pointer ${
              activeTake.downloaded
                ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-950/60'
                : 'bg-emerald-500 hover:bg-emerald-400 text-black border border-emerald-400'
            }`}
            title="Save this recording as a file on your device"
          >
            {activeTake.downloaded ? (
              <><Check size={16} /> Downloaded — saved to your device</>
            ) : (
              <><Download size={18} /> Download This Take Now</>
            )}
          </motion.button>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleRecordAgain}
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
        </div>
      )}

      {/* Layers Timeline — stacked DAW-style tracks. All rows share one
          bpm-synced grid and one playhead (Playhead.tsx) so multiple kept
          takes visually line up with each other and with the beat, and each
          row now actually plays back (layers previously had no audio engine
          wired up at all — they were silent list entries). */}
      {layers.length > 0 && (
        <div className="border-t border-white/5 pt-4 flex flex-col gap-3">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Layers ({layers.length}/5)</h3>
          <div className="relative flex flex-col gap-2.5 pt-4 pb-1">
            <TimeRuler bpm={bpm} duration={layersTimelineDurationMs / 1000} />
            <Playhead totalDurationMs={layersTimelineDurationMs} />
            {layers.map((layer, index) => (
              <LayerTrack
                key={layer.id}
                layer={layer}
                index={index}
                totalDurationMs={layersTimelineDurationMs}
                onRemove={removeLayer}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
