import { useState, useEffect, useRef } from 'react';
import { useSessionStore } from '../stores/useSessionStore';
import { backupService } from '../services/backupService';

export function useAudioRecorder() {
  const { isRecording, setIsRecording, setActiveTake, setIsPlaying, backingTrack, isMonitoring, fxEnabled, fxSettings } = useSessionStore();
  // Device list, selection and readiness live in the store so any component
  // (e.g. the arrangement's mic picker) can read and change them.
  const devices = useSessionStore((s) => s.micDevices);
  const selectedDeviceId = useSessionStore((s) => s.selectedMicId);
  const setSelectedDeviceId = useSessionStore((s) => s.setSelectedMicId);
  const setMicDevices = useSessionStore((s) => s.setMicDevices);
  const setMicReady = useSessionStore((s) => s.setMicReady);
  const isReady = useSessionStore((s) => s.micReady);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  // DEBUG: log every mutation to processedStreamRef
  // const _prBefore = useRef<MediaStream | null>(null);
  // useLayoutEffect(() => {
  //   if (processedStreamRef.current !== _prBefore.current) {
  //     console.log('[useAudioRecorder] processedStreamRef changed to', processedStreamRef.current?.id || null);
  //     _prBefore.current = processedStreamRef.current;
  //   }
  // });

  // Enumerate devices on mount and request permission
  useEffect(() => {
    async function getDevices() {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true }); // Request permission first
        tempStream.getTracks().forEach(track => track.stop()); // Stop temporary track immediately

        const devs = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devs.filter(d => d.kind === 'audioinput');
        setMicDevices(audioInputs);
        if (audioInputs.length > 0) {
          setSelectedDeviceId(audioInputs[0].deviceId);
        }
        setMicReady(true);
      } catch (err) {
        console.error("Microphone access denied or error:", err);
        setMicReady(false);
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
    let eqFilters: BiquadFilterNode[] = [];
    let waveshaper: WaveShaperNode | null = null;

    let pitchShifter: DelayNode | null = null;
    // For pitch detection
    let analyser: AnalyserNode | null = null;
    let dataArray: Float32Array<ArrayBuffer> | null = null;
    let rafID: number | null = null;
    // Pitch tracking
    let pitchBuffer: number[] = [];
    const PITCH_BUFFER_SIZE = 5;
    let targetDelayTime: number = 0.005; // Base delay time
    let currentDelayTime: number = 0.005;
    const SMOOTHING_FACTOR = 0.1; // For smoothing delay changes

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
    let inputGainNode: GainNode | null = null;

    // Helper functions for pitch detection and scale generation
    function noteNameToFrequency(noteName: string, octave: number): number {
      // A4 = 440Hz
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const index = noteNames.indexOf(noteName);
      if (index === -1) return 440; // Default to A4

      // Calculate semitones from A4
      const semitonesFromA4 = (octave - 4) * 12 + (index - 9); // A is index 9
      return 440 * Math.pow(2, semitonesFromA4 / 12);
    }

    function getScaleFrequencies(key: string, scale: string, minOctave: number = 3, maxOctave: number = 5): number[] {
      const notes = {
        'Major': [0, 2, 4, 5, 7, 9, 11], // C D E F G A B
        'Minor': [0, 2, 3, 5, 7, 8, 10], // C D Eb F G Ab Bb
        'Chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] // All semitones
      };

      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const keyIndex = noteNames.indexOf(key);
      if (keyIndex === -1) return [440]; // Default to A4 if key not found

      const frequencies: number[] = [];
      const scaleIntervals = notes[scale] || notes['Major'];

      for (let octave = minOctave; octave <= maxOctave; octave++) {
        for (const interval of scaleIntervals) {
          const noteIndex = (keyIndex + interval) % 12;
          const noteName = noteNames[noteIndex];
          const octaveAdjustment = Math.floor((keyIndex + interval) / 12);
          const frequency = noteNameToFrequency(noteName, octave + octaveAdjustment);
          frequencies.push(frequency);
        }
      }

      return frequencies.sort((a, b) => a - b);
    }

    function detectPitch(audioData: Float32Array, sampleRate: number): number {
      // Autocorrelation pitch detection
      const bufferSize = audioData.length;
      let maxVal = -Infinity;
      let maxIndex = -1;

      // Limit the search to reasonable pitch ranges for voice (80-500 Hz)
      const minDelay = Math.floor(sampleRate / 500); // 500 Hz
      const maxDelay = Math.floor(sampleRate / 80);   // 80 Hz

      for (let delay = minDelay; delay < maxDelay; delay++) {
        let sum = 0;
        for (let i = 0; i < bufferSize - delay; i++) {
          sum += audioData[i] * audioData[i + delay];
        }
        if (sum > maxVal) {
          maxVal = sum;
          maxIndex = delay;
        }
      }

      if (maxIndex > 0) {
        return sampleRate / maxIndex;
      }
      return -1; // No pitch detected
    }

    function smoothDelayTime(newTarget: number, current: number, smoothing: number): number {
      return current + (newTarget - current) * smoothing;
    }

    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      source = audioCtx.createMediaStreamSource(stream);
      streamDestination = audioCtx.createMediaStreamDestination();
      processedStreamRef.current = streamDestination.stream;

      // Apply Input Gain (always on, even if fxEnabled is false)
      inputGainNode = audioCtx.createGain();
      inputGainNode.gain.value = (fxSettings.micGain ?? 100) / 100;
      source.connect(inputGainNode);

      if (fxEnabled) {
        // Use a `prev` pointer so each disabled module is bypassed automatically:
        // if a node is not created, prev simply flows past it to the next stage.
        let prev: AudioNode = inputGainNode;

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

        // 2. Parametric EQ — one biquad per band, in order. Gated by eqEnabled.
        if (fxSettings.eqEnabled) {
          eqFilters = fxSettings.eqBands.map((band) => {
            const filter = audioCtx.createBiquadFilter();
            filter.type = band.type === 'peak' ? 'peaking' : band.type;
            filter.frequency.value = band.freq;
            filter.gain.value = band.gain;
            filter.Q.value = band.q;
            return filter;
          });
          for (const filter of eqFilters) {
            prev.connect(filter);
            prev = filter;
          }
        }

        // 3. Autotune (saturation + pitch-shift) — gated by autotuneEnabled
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

          // Pitch shifter (delay-based)
          pitchShifter = audioCtx.createDelay(0.1);
          const desiredSemitones = fxSettings.formantShift + fxSettings.pitchShiftSemitones;
          const baseDelayTimeDesired = 0.005 * Math.pow(2, -desiredSemitones / 12);
          pitchShifter.delayTime.value = baseDelayTimeDesired;
          targetDelayTime = baseDelayTimeDesired;
          currentDelayTime = baseDelayTimeDesired;
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 2048;
          const bufferLength = analyser.frequencyBinCount;
          dataArray = new Float32Array(bufferLength);

          // Connect the chain: prev -> waveshaper -> pitchShifter -> prev
          prev.connect(waveshaper);
          waveshaper.connect(pitchShifter);
          prev = pitchShifter;

          // Tap off for pitch detection (before pitch shifter to get clean signal)
          // We'll tap after waveshaper but before pitch shifter
          const tapPoint = audioCtx.createGain();
          tapPoint.gain.value = 0.5; // Reduce level to avoid clipping
          waveshaper.connect(tapPoint);
          tapPoint.connect(analyser);

          // Start pitch detection loop
          function detectPitchLoop() {
            if (!analyser || !dataArray) return;

            analyser.getFloatTimeDomainData(dataArray);
            const pitch = detectPitch(dataArray!, audioCtx.sampleRate);

            if (pitch > 0) {
              // Add to pitch buffer for smoothing
              pitchBuffer.push(pitch);
              if (pitchBuffer.length > PITCH_BUFFER_SIZE) {
                pitchBuffer.shift();
              }

              // Calculate average pitch from buffer
              const avgPitch = pitchBuffer.reduce((sum, p) => sum + p, 0) / pitchBuffer.length;

              // Get target scale frequencies
              const scaleFreqs = getScaleFrequencies(fxSettings.autotuneKey, fxSettings.autotuneScale);

              // Find closest target frequency
              let closestFreq = scaleFreqs[0];
              let minDist = Math.abs(avgPitch - closestFreq);

              for (let i = 1; i < scaleFreqs.length; i++) {
                const dist = Math.abs(avgPitch - scaleFreqs[i]);
                if (dist < minDist) {
                  minDist = dist;
                  closestFreq = scaleFreqs[i];
                }
              }

              // Calculate pitch shift ratio
              if (avgPitch > 0) {
                // Compute the base delay time for the desired formant and pitch shift
                const desiredSemitones = fxSettings.formantShift + fxSettings.pitchShiftSemitones;
                const baseDelayTimeDesired = 0.005 * Math.pow(2, -desiredSemitones / 12);
                // Compute the target delay time for autotune correction: baseDelayTimeDesired * (avgPitch / closestFreq)
                let newDelayTime = baseDelayTimeDesired * (avgPitch / closestFreq);

                // Clamp to reasonable range (2ms to 20ms)
                newDelayTime = Math.max(0.002, Math.min(0.020, newDelayTime));

                // Smooth the delay time to avoid artifacts
                targetDelayTime = newDelayTime;
                currentDelayTime = smoothDelayTime(targetDelayTime, currentDelayTime, SMOOTHING_FACTOR);

                if (pitchShifter) {
                  pitchShifter.delayTime.value = currentDelayTime;
                }
              }
            }
            rafID = requestAnimationFrame(detectPitchLoop);
          }

          detectPitchLoop();
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

        // 6. Reverb — gated by reverbEnabled
        if (fxSettings.reverbEnabled) {
          reverbDelay = audioCtx.createDelay(1.5);
          reverbDelay.delayTime.value = 0.4;

          // Decay = comb feedback. Kept below 1 so the loop always decays;
          // 0 gives a single 400 ms slap, 100 a long tail.
          reverbFeedback = audioCtx.createGain();
          reverbFeedback.gain.value = (fxSettings.reverbDecay / 100) * 0.9;

          reverbWetGain = audioCtx.createGain();
          reverbWetGain.gain.value = (fxSettings.reverbWet / 100) * 0.35;

          outputGain.connect(reverbDelay);
          reverbDelay.connect(reverbFeedback);
          reverbFeedback.connect(reverbDelay);
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
        inputGainNode.connect(streamDestination);
        if (isMonitoring) {
          inputGainNode.connect(audioCtx.destination);
        }
      }
    } catch (e) {
      console.error('Failed to setup monitoring audio routing:', e);
    }

    return () => {
      // Cancel animation frame if it exists
      if (rafID !== null) {
        cancelAnimationFrame(rafID);
        rafID = null;
      }

      // All nodes are null when not created; safe no-op via null checks.
      if (source) source.disconnect();
      if (inputGainNode) inputGainNode.disconnect();
      if (compressor) compressor.disconnect();
      for (const filter of eqFilters) filter.disconnect();
      if (waveshaper) waveshaper.disconnect();
      if (pitchShifter) pitchShifter.disconnect();
      if (analyser) analyser.disconnect();
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
  }, [isMonitoring, stream, fxEnabled, fxSettings, fxSettings.autotuneKey, fxSettings.autotuneScale, fxSettings.formantShift, fxSettings.pitchShiftSemitones]);

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
      console.error('No active mic stream to record from');
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
      mediaRecorder.current.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };

      mediaRecorder.current.onstop = async () => {
        const mimeType = mediaRecorder.current?.mimeType || 'audio/webm';
        const webmBlob = new Blob(audioChunks.current, { type: mimeType });

        let finalBlob = webmBlob;
        let finalMimeType = mimeType;

        try {
          // Convert WebM to WAV dynamically
          const { convertBlobToAudioBuffer, encodeWav } = await import('../utils/audioEncoding');
          const audioBuffer = await convertBlobToAudioBuffer(webmBlob);
          finalBlob = encodeWav(audioBuffer);
          finalMimeType = 'audio/wav';
        } catch (e) {
          console.error("Failed to convert webm to wav:", e);
        }

        const url = URL.createObjectURL(finalBlob);
        const id = crypto.randomUUID();
        // Route the take to whichever track is armed. Tracks 1 and 2 keep their own slots.
        const { armedTrackId, setBackingTrack, setTrackClip } = useSessionStore.getState();
        if (armedTrackId === 'backing') {
          setBackingTrack({ id, name: `Recording ${new Date().toLocaleTimeString()}`, url, blob: finalBlob, startMs: 0 });
        } else if (armedTrackId === 'active_take' || !armedTrackId) {
          setActiveTake({ id, url, blob: finalBlob, timestamp: Date.now(), transportStartMs, mimeType: finalMimeType });
        } else {
          setTrackClip(armedTrackId, { name: `Recording ${new Date().toLocaleTimeString()}`, url, blob: finalBlob });
        }

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
