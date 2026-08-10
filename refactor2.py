import re

with open('src/components/tracks/VocalTrack.tsx', 'r') as f:
    vocal_track = f.read()

# Extract effect using regex
match = re.search(r'  // Manage Real-time Microphone Monitoring FX Loop.*?  \}, \[isMonitoring, stream, fxEnabled, fxSettings\]\);\n', vocal_track, re.DOTALL)
if not match:
    print("Could not find effect")
    exit(1)

effect_code = match.group(0)

# Remove effect from VocalTrack.tsx
new_vocal_track = vocal_track.replace(effect_code, '')
with open('src/components/tracks/VocalTrack.tsx', 'w') as f:
    f.write(new_vocal_track)

modified_effect = effect_code.replace(
    '  useEffect(() => {\n    if (!isMonitoring || !stream) return;\n',
    '  const processedStreamRef = useRef<MediaStream | null>(null);\n\n  // Manage Real-time Microphone Monitoring FX Loop AND Recording FX processing\n  useEffect(() => {\n    if (!stream) return;\n'
)

modified_effect = modified_effect.replace(
    '    let outputGain: GainNode | null = null;\n',
    '    let outputGain: GainNode | null = null;\n    let streamDestination: MediaStreamAudioDestinationNode | null = null;\n'
)

modified_effect = modified_effect.replace(
    '      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();\n      source = audioCtx.createMediaStreamSource(stream);\n',
    '      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();\n      source = audioCtx.createMediaStreamSource(stream);\n      streamDestination = audioCtx.createMediaStreamDestination();\n      processedStreamRef.current = streamDestination.stream;\n'
)

modified_effect = modified_effect.replace(
    '        // Always-on dry/panned output from outputGain\n        outputGain.connect(audioCtx.destination);\n      } else {\n        source.connect(audioCtx.destination);\n      }\n',
    '        // Always-on output to recording destination\n        outputGain.connect(streamDestination);\n        // And optionally to speakers for monitoring\n        if (isMonitoring) {\n          outputGain.connect(audioCtx.destination);\n        }\n      } else {\n        source.connect(streamDestination);\n        if (isMonitoring) {\n          source.connect(audioCtx.destination);\n        }\n      }\n'
)

modified_effect = modified_effect.replace(
    '      if (outputGain) outputGain.disconnect();\n      if (audioCtx && audioCtx.state !== \'closed\') audioCtx.close();\n',
    '      if (outputGain) outputGain.disconnect();\n      if (streamDestination) streamDestination.disconnect();\n      if (audioCtx && audioCtx.state !== \'closed\') audioCtx.close();\n      processedStreamRef.current = null;\n'
)

with open('src/hooks/useAudioRecorder.ts', 'r') as f:
    use_audio_recorder = f.read()

new_use_audio_recorder = use_audio_recorder.replace(
    '  const { isRecording, setIsRecording, setActiveTake, setIsPlaying, backingTrack } = useSessionStore();',
    '  const { isRecording, setIsRecording, setActiveTake, setIsPlaying, backingTrack, isMonitoring, fxEnabled, fxSettings } = useSessionStore();'
)

new_use_audio_recorder = new_use_audio_recorder.replace(
    '  // Handle Recording State Changes',
    modified_effect + '\n  // Handle Recording State Changes'
)

new_use_audio_recorder = new_use_audio_recorder.replace(
    '      mediaRecorder.current = new MediaRecorder(stream, options);',
    '      mediaRecorder.current = new MediaRecorder(processedStreamRef.current || stream, options);'
)

with open('src/hooks/useAudioRecorder.ts', 'w') as f:
    f.write(new_use_audio_recorder)

print("Done")
