import { useState, useEffect, useRef } from 'react';
import { useSessionStore } from '../stores/useSessionStore';
import { backupService } from '../services/backupService';

export function useAudioRecorder() {
  const { isRecording, setIsRecording, setActiveTake, setIsPlaying, backingTrack, isMonitoring, fxEnabled, fxSettings } = useSessionStore();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isReady, setIsReady] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  // Enumerate devices on mount and request permission
  useEffect(() => {
    async function getDevices() {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true }); // Request permission first
        tempStream.getTracks().forEach(track => track.stop()); // Stop temporary track immediately
        
        const devs = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devs.filter(d => d.kind === 'audioinput');
        setDevices(audioInputs);
        if (audioInputs.length > 0) {
          setSelectedDeviceId(audioInputs[0].deviceId);
        }
        setIsReady(true);
      } catch (err) {
        console.error("Microphone access denied or error:", err);
        setIsReady(false);
      }
    }
    getDevices();
  }, []);

  // Manage persistent stream for active selected device
  useEffect(() => {
    if (!selectedDeviceId) return;

    let activeStream: MediaStream | null = null;

    async function setupStream() {
      try {
        // Raw quality constraints (no echo cancellation or noise suppression for recording)
        const audioConstraints = { 
          deviceId: { exact: selectedDeviceId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        };
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints
        });
        activeStream = mediaStream;
        setStream(mediaStream);
      } catch (err) {
        console.error("Failed to get audio stream for device:", err);
      }
    }

    setupStream();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [selectedDeviceId]);

  // Manage Real-time Microphone Monitoring FX Loop
  // Each FX is gated by its own per-effect toggle so that disabled FX
  // are completely bypassed (the corresponding node is never created).
  const processedStreamRef = useRef<MediaStream | null>(null);

  // Manage Real-time Microphone Monitoring FX Loop AND Recording FX processing
  useEffect(() => {
    if (!stream) return;

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
    let streamDestination: MediaStreamAudioDestinationNode | null = null;

    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      source = audioCtx.createMediaStreamSource(stream);
      streamDestination = audioCtx.createMediaStreamDestination();
      processedStreamRef.current = streamDestination.stream;

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

        // Always-on output to recording destination
        outputGain.connect(streamDestination);
        // And optionally to speakers for monitoring
        if (isMonitoring) {
          outputGain.connect(audioCtx.destination);
        }
      } else {
        source.connect(streamDestination);
        if (isMonitoring) {
          source.connect(audioCtx.destination);
        }
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
      if (streamDestination) streamDestination.disconnect();
      if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
      processedStreamRef.current = null;
    };
  }, [isMonitoring, stream, fxEnabled, fxSettings]);

  // Handle Recording State Changes
  useEffect(() => {
    if (isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  }, [isRecording]);

  const startRecording = async () => {
    if (!stream) {
      console.error("No active mic stream to record from");
      setIsRecording(false);
      return;
    }
    audioChunks.current = [];
    try {
      // Capture transport position at the moment recording begins — this stamps
      // the take with its project-time offset so playback always lines up with
      // where the vocal was recorded against the backing track.
      const transportStartMs = useSessionStore.getState().transportTimeMs;

      // Determine best container type and use a high bitrate for maximum fidelity
      let options = { audioBitsPerSecond: 256000 } as MediaRecorderOptions;
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        options.mimeType = 'audio/ogg;codecs=opus';
      }

      mediaRecorder.current = new MediaRecorder(processedStreamRef.current || stream, options);
      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };

      mediaRecorder.current.onstop = async () => {
        const mimeType = mediaRecorder.current?.mimeType || 'audio/webm';
        const blob = new Blob(audioChunks.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const id = crypto.randomUUID();
        setActiveTake({ id, url, blob, timestamp: Date.now(), transportStartMs, mimeType });

        // Trigger Backup Process — local (IndexedDB), cloud (Firebase
        // Storage) and Google Drive are independent, all real, and reported
        // honestly. Drive only shows "uploading" when it's actually
        // connected, so an unconnected Drive never flickers a status it
        // isn't going to deliver on.
        const driveConnected = useSessionStore.getState().driveConnection === 'connected';
        useSessionStore.getState().setBackupStatus('uploading');
        useSessionStore.getState().setCloudBackupStatus('uploading');
        if (driveConnected) useSessionStore.getState().setDriveBackupStatus('uploading');

        const { localSaved, cloudSaved, drive } = await backupService.backupTake(id, url);
        useSessionStore.getState().setBackupStatus(localSaved ? 'success' : 'failed');
        useSessionStore.getState().setCloudBackupStatus(cloudSaved ? 'success' : 'failed');
        useSessionStore.getState().setDriveBackupStatus(
          drive === 'saved' ? 'success' : drive === 'failed' ? 'failed' : 'skipped'
        );

        // Only add to the recoverable-history list if a durable copy
        // actually exists somewhere — an entry that no backup ever
        // reaches would just be a dead link in the Recordings panel later.
        // This runs regardless of what she does next (Keep as Layer /
        // Record Again / just closing the tab), so a discarded take is
        // still recoverable from the Recordings panel.
        if (localSaved || cloudSaved || drive === 'saved') {
          useSessionStore.getState().addRecordingHistoryEntry({ id, timestamp: Date.now(), transportStartMs, mimeType });
        }
      };
      
      mediaRecorder.current.start(1000); // chunk every second
      
      // Auto-play backing track if it exists
      if (backingTrack) {
        setIsPlaying(true);
      }
    } catch (err) {
      console.error("Failed to start recording:", err);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop();
      setIsPlaying(false); // Stop backing track playback too
    }
  };

  return { 
    devices, 
    selectedDeviceId, 
    setSelectedDeviceId,
    isReady,
    stream
  };
}
