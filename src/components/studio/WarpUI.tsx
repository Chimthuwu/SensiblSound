import { useEffect, useState } from 'react';
import { Magnet } from 'lucide-react';
import { useSessionStore } from '../../stores/useSessionStore';
import { warpLane } from '../../utils/warpActions';

/** The warp prompt (shown when auto-warp is off) and the short status toast. */
export function WarpUI() {
  const prompt = useSessionStore((s) => s.warpPrompt);
  const setPrompt = useSessionStore((s) => s.setWarpPrompt);
  const bpm = useSessionStore((s) => s.bpm);
  const setNoAsk = useSessionStore((s) => s.setWarpPromptDisabled);
  const toast = useSessionStore((s) => s.toast);
  const [dontAsk, setDontAsk] = useState(false);
  const [visibleToast, setVisibleToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    setVisibleToast(toast.text);
    const t = window.setTimeout(() => setVisibleToast(null), 3800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const close = (warp: boolean) => {
    if (!prompt) return;
    if (dontAsk) setNoAsk(true);
    const laneId = prompt.laneId;
    setPrompt(null);
    setDontAsk(false);
    if (warp) void warpLane(laneId, { manual: true });
  };

  return (
    <>
      {prompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-label="Warp audio">
          <div className="bg-surface border border-white/10 rounded-xl p-6 shadow-2xl max-w-md w-full flex flex-col gap-4">
            <div className="flex items-center gap-3 text-primary">
              <Magnet size={18} aria-hidden="true" />
              <h2 className="text-lg font-semibold text-white">Warp to the project tempo?</h2>
            </div>
            <p className="text-zinc-400 text-sm">
              <strong className="text-white">{prompt.name}</strong> was added as it is. Warping finds its transients and snaps them to the
              beat grid at <strong className="text-white">{bpm} BPM</strong>, stretching the audio without changing its pitch.
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={() => close(true)} className="bg-primary hover:bg-primary/80 text-white font-medium py-2 rounded-md transition-colors">
                Warp it
              </button>
              <button onClick={() => close(false)} className="bg-white/5 hover:bg-white/10 text-white font-medium py-2 rounded-md transition-colors">
                Keep it as it is
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
              <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
              Don't ask me this again
            </label>
            <p className="text-[11px] text-zinc-500">
              Turn on the magnet button at the top to warp every new clip automatically. Right-click that button to bring this question back.
            </p>
          </div>
        </div>
      )}
      {visibleToast && <div className="studio-toast" role="status">{visibleToast}</div>}
    </>
  );
}
