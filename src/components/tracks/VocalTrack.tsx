import { useRef } from 'react';
import { Mic2, Volume2, VolumeX } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSessionStore } from '../../stores/useSessionStore';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';

export function VocalTrack() {
  const { isRecording, activeTake, setActiveTake, layers, addLayer, removeLayer } = useSessionStore();
  const { devices, selectedDeviceId, setSelectedDeviceId, isReady: micReady } = useAudioRecorder();
  
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
        
        <div className="flex items-center gap-4">
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
        
        {/* WaveSurfer Container (Only visible when we have a take and not recording) */}
        <div 
          ref={containerRef} 
          className="absolute inset-0 w-full h-full"
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
          <div className="text-primary text-sm z-10 flex flex-col items-center gap-3">
             <motion.div 
               className="w-3.5 h-3.5 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444]"
               animate={{ scale: [1, 1.4, 1], opacity: [1, 0.4, 1] }}
               transition={{ repeat: Infinity, duration: 1 }}
             />
             <span className="font-bold tracking-wider animate-pulse uppercase text-xs">RECORDING...</span>
          </div>
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
        <div className="flex items-center justify-end gap-3 mt-2 border-t border-white/5 pt-4">
          <button 
            onClick={() => {
              if (window.confirm("Discard current take and record again?")) {
                setActiveTake(undefined);
              }
            }}
            className="text-xs text-zinc-400 hover:text-white px-4 py-2 rounded-md hover:bg-white/5 transition-colors"
          >
            Record Again
          </button>
          <button 
            onClick={() => {
              addLayer(activeTake);
              setActiveTake(undefined);
            }}
            className="text-xs bg-primary hover:bg-primary/80 text-white font-medium px-4 py-2 rounded-md transition-colors"
          >
            Keep as Layer
          </button>
        </div>
      )}

      {/* Layers Display */}
      {layers.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Layers ({layers.length}/5)</h3>
          <div className="flex flex-col gap-2">
            {layers.map((layer, index) => (
              <div key={layer.id} className="flex items-center justify-between bg-black/30 border border-white/5 rounded-md px-3 py-2">
                <span className="text-xs text-zinc-400">Layer {index + 1}</span>
                <button 
                  onClick={() => removeLayer(layer.id)}
                  className="text-xs text-red-500 hover:text-red-400 p-1"
                >
                  Discard
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
