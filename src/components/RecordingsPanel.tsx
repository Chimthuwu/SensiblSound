import { useState } from 'react';
import { X, Download, Plus, Check, History, Loader2 } from 'lucide-react';
import { useSessionStore } from '../stores/useSessionStore';
import { backupService } from '../services/backupService';
import { downloadBlobUrl, buildTakeFilename } from '../utils/download';
import type { RecordingMeta } from '../types';

interface RecordingsPanelProps {
  onClose: () => void;
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

interface RecordingRowProps {
  entry: RecordingMeta;
  index: number;
  alreadyInLayers: boolean;
}

function RecordingRow({ entry, index, alreadyInLayers }: RecordingRowProps) {
  const addLayer = useSessionStore((s) => s.addLayer);
  const [busy, setBusy] = useState<'download-wav' | 'download-mp3' | 'add' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(alreadyInLayers);

  const withBlob = async (action: 'download-wav' | 'download-mp3' | 'add') => {
    setBusy(action);
    setError(null);
    try {
      const blob = await backupService.getRecordingBlob(entry.id);
      
      if (action.startsWith('download')) {
        const isMp3 = action === 'download-mp3';
        let downloadUrl = URL.createObjectURL(blob);
        let mimeType = entry.mimeType;
        let extension = undefined;

        if (isMp3) {
          try {
            const { convertBlobToAudioBuffer, encodeMp3 } = await import('../utils/audioEncoding');
            const audioBuffer = await convertBlobToAudioBuffer(blob);
            const mp3Blob = encodeMp3(audioBuffer);
            downloadUrl = URL.createObjectURL(mp3Blob);
            mimeType = 'audio/mp3';
            extension = 'mp3';
          } catch (e) {
            console.error("Failed to convert to mp3", e);
            throw new Error("Failed to encode MP3");
          }
        }
        
        downloadBlobUrl(downloadUrl, buildTakeFilename(entry.timestamp, `recording-${index + 1}`, mimeType, extension));
      } else {
        const url = URL.createObjectURL(blob);
        addLayer({ id: entry.id, url, blob, timestamp: entry.timestamp, transportStartMs: entry.transportStartMs, mimeType: entry.mimeType });
        setAdded(true);
      }
    } catch (err) {
      console.error('Could not recover this recording — neither local nor cloud backup had it.', err);
      setError("Couldn't find this recording — it may have been cleared from this browser.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 bg-black/30 border border-white/5 rounded-lg px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-zinc-200 font-medium">{formatTimestamp(entry.timestamp)}</span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => withBlob('download-wav')}
            disabled={busy !== null}
            className="text-xs bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.05] px-3 py-1.5 rounded-md transition-all cursor-pointer font-semibold text-zinc-200 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-wait"
            title="Download as WAV"
          >
            {busy === 'download-wav' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            WAV
          </button>
          <button
            onClick={() => withBlob('download-mp3')}
            disabled={busy !== null}
            className="text-xs bg-[#141416] hover:bg-[#1f1f22] border border-white/10 px-3 py-1.5 rounded-md transition-all cursor-pointer font-semibold text-zinc-300 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-wait"
            title="Download as MP3"
          >
            {busy === 'download-mp3' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            MP3
          </button>
          <button
            onClick={() => withBlob('add')}
            disabled={busy !== null || added}
            className={`text-xs px-3 py-1.5 rounded-md transition-all cursor-pointer font-semibold flex items-center gap-1.5 disabled:cursor-default ${
              added
                ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30'
                : 'bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary disabled:opacity-50'
            }`}
          >
            {busy === 'add' ? <Loader2 size={13} className="animate-spin" /> : added ? <Check size={13} /> : <Plus size={13} />}
            {added ? 'In Layers' : 'Add as Layer'}
          </button>
        </div>
      </div>
      {error && <span className="text-xs text-rose-400">{error}</span>}
    </div>
  );
}

export function RecordingsPanel({ onClose }: RecordingsPanelProps) {
  const recordingsHistory = useSessionStore((s) => s.recordingsHistory);
  const layers = useSessionStore((s) => s.layers);
  const layerIds = new Set(layers.map((l) => l.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface border border-white/10 rounded-xl p-6 shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-primary">
            <History size={20} />
            <h2 className="text-lg font-semibold text-white">Recordings</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white p-1 cursor-pointer transition-colors" title="Close">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-zinc-500 -mt-2">
          Every take you've recorded in this browser — even ones you discarded or that
          got lost in a refresh. Nothing here is ever silently gone.
        </p>

        <div className="flex flex-col gap-2 overflow-y-auto -mx-1 px-1">
          {recordingsHistory.length === 0 ? (
            <div className="text-sm text-zinc-500 text-center py-8">
              Nothing recorded yet — once you record a take, it'll show up here.
            </div>
          ) : (
            recordingsHistory.map((entry, index) => (
              <RecordingRow key={entry.id} entry={entry} index={index} alreadyInLayers={layerIds.has(entry.id)} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
