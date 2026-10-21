import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { ClipWaveform } from './ClipWaveform';
import { useSessionStore } from '../../stores/useSessionStore';
import { useContextMenu, type MenuItem } from './ContextMenu';
import {
  REMOTE_PACKS,
  REMOTE_SAMPLES,
  SAMPLE_LIBRARY,
  SAMPLE_MIME,
  getSampleUrl,
  importedSamples,
  registerImportedSample,
  sampleClip,
  type SampleCategory,
  type SampleInfo,
} from '../../utils/samples';

const BROWSER_COLLAPSED_KEY = 'studio-browser-collapsed';
const PREVIEW_SNAP_KEY = 'studio-preview-snap';

const CATEGORY_ORDER: SampleCategory[] = ['Drums', 'Bass', 'Synth', 'FX', 'Loops', 'Imported'];

/**
 * A row's waveform. It loads only once the row scrolls into view, so opening the
 * browser doesn't fetch every loop up front.
 */
function SampleWave({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.round(el.clientWidth));
    const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth)));
    ro.observe(el);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        void getSampleUrl(id).then(setUrl).catch(() => setUrl(null));
      },
      { rootMargin: '120px' },
    );
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, [id]);

  return (
    <div ref={ref} className="studio-sample-wave">
      {url && width > 0 && <ClipWaveform cacheKey={id} source={{ url }} color="#a855f7" width={width} />}
    </div>
  );
}

// One preview at a time, shared by every row.
let previewAudio: HTMLAudioElement | null = null;
function stopPreview() {
  if (previewAudio) {
    previewAudio.pause();
    previewAudio = null;
  }
}

function formatMs(ms: number): string {
  if (ms <= 0) return '';
  return ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s` : `${Math.round(ms)}ms`;
}

function audioDurationMs(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => {
      resolve(Number.isFinite(a.duration) ? a.duration * 1000 : 0);
      URL.revokeObjectURL(url);
    };
    a.onerror = () => {
      resolve(0);
      URL.revokeObjectURL(url);
    };
    a.src = url;
  });
}

/** Right-hand browser: samples to drag into the arranger, and (later) plugins. */
export function SampleBrowser() {
  const openMenu = useContextMenu();
  const addTrack = useSessionStore((s) => s.addTrack);
  const projectBpm = useSessionStore((s) => s.bpm);
  // Snapped previews play at the project tempo; off plays the sample as recorded.
  const [snapPreview, setSnapPreview] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PREVIEW_SNAP_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleSnap = () => {
    setSnapPreview((on) => {
      const next = !on;
      try {
        localStorage.setItem(PREVIEW_SNAP_KEY, next ? '1' : '0');
      } catch {
        // Storage may be blocked; the choice still applies for this visit.
      }
      return next;
    });
  };
  const [tab, setTab] = useState<'samples' | 'plugins'>('samples');
  const [query, setQuery] = useState('');
  const [imports, setImports] = useState<SampleInfo[]>(() => importedSamples());
  const [previewId, setPreviewId] = useState<string | null>(null);
  // Collapsed frees the room for the arranger. Remembered per browser.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(BROWSER_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(BROWSER_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // Storage may be blocked; the toggle still works for this visit.
      }
      return next;
    });
  };
  const fileRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const everything = [...SAMPLE_LIBRARY, ...REMOTE_SAMPLES, ...imports];
  const shown = everything.filter(
    (s) => !q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q),
  );
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: shown.filter((s) => s.category === category),
  })).filter((g) => g.items.length > 0);

  const togglePreview = async (id: string) => {
    if (previewId === id) {
      stopPreview();
      setPreviewId(null);
      return;
    }
    stopPreview();
    // Streams from archive.org for loops, so previews start without a full download.
    const audio = new Audio(await getSampleUrl(id));
    const info = [...SAMPLE_LIBRARY, ...REMOTE_SAMPLES, ...importedSamples()].find((x) => x.id === id);
    // Snapped: play at project tempo / sample tempo. No known tempo means normal speed.
    audio.playbackRate = snapPreview && info?.bpm ? projectBpm / info.bpm : 1;
    previewAudio = audio;
    setPreviewId(id);
    audio.onended = () => setPreviewId((current) => (current === id ? null : current));
    await audio.play().catch(() => setPreviewId(null));
  };

  const insertAsTrack = async (id: string) => {
    const clip = await sampleClip(id);
    addTrack(clip);
  };

  const onDragStart = (e: DragEvent<HTMLDivElement>, id: string) => {
    e.dataTransfer.setData(SAMPLE_MIME, id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aac|webm)$/i.test(f.name));
    for (const file of files) {
      const ms = await audioDurationMs(file);
      registerImportedSample(file, ms);
    }
    setImports(importedSamples());
    e.target.value = '';
  };

  const menuFor = (s: SampleInfo): MenuItem[] => [
    { label: previewId === s.id ? 'Stop preview' : 'Preview', onSelect: () => void togglePreview(s.id) },
    { label: 'Insert as new track', onSelect: () => void insertAsTrack(s.id) },
  ];

  return (
    <aside className="studio-browser" aria-label="Browser" data-collapsed={String(collapsed)}>
      <button
        type="button"
        className="studio-browser-toggle"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Show sample browser' : 'Hide sample browser'}
        title={collapsed ? 'Show browser' : 'Hide browser to make room'}
      >
        {collapsed ? '‹' : '›'}
      </button>
      {collapsed ? (
        <span className="studio-browser-vlabel">Browser</span>
      ) : (
        <>
      <div className="studio-browser-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'samples'}
          className="studio-browser-tab"
          onClick={() => setTab('samples')}
        >
          Samples
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'plugins'}
          className="studio-browser-tab"
          onClick={() => setTab('plugins')}
        >
          Plugins
        </button>
      </div>

      {tab === 'samples' ? (
        <>
          <div className="studio-browser-tools">
            <input
              type="search"
              className="studio-browser-search"
              placeholder="Search samples"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search samples"
            />
            <button
              type="button"
              className="studio-mini-btn"
              data-on={String(snapPreview)}
              aria-pressed={snapPreview}
              onClick={toggleSnap}
              title="Play previews at the project tempo (samples without a known tempo play normally)"
            >
              Snap
            </button>
            <button type="button" className="studio-mini-btn" onClick={() => fileRef.current?.click()}>
              Import
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              multiple
              onChange={onImport}
              style={{ display: 'none' }}
              aria-label="Import samples"
            />
          </div>

          <div className="studio-browser-list">
            {groups.map((g) => (
              <div key={g.category} className="studio-browser-group">
                <div className="studio-browser-cat">{g.category}</div>
                {g.items.map((s) => (
                  <div
                    key={s.id}
                    className="studio-sample"
                    draggable
                    data-playing={String(previewId === s.id)}
                    onDragStart={(e) => onDragStart(e, s.id)}
                    onDoubleClick={() => void insertAsTrack(s.id)}
                    onContextMenu={(e) => openMenu(e, menuFor(s))}
                    title="Drag into the arranger, double-click to insert, right-click for more"
                  >
                    <button
                      type="button"
                      className="studio-sample-play"
                      aria-label={previewId === s.id ? `Stop ${s.name}` : `Preview ${s.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void togglePreview(s.id);
                      }}
                    >
                      {previewId === s.id ? '■' : '▶'}
                    </button>
                    <span className="studio-sample-name">{s.name}</span>
                    <span className="studio-sample-dur">{formatMs(s.durationMs)}</span>
                    <SampleWave id={s.id} />
                  </div>
                ))}
              </div>
            ))}
            {groups.length === 0 && <div className="studio-browser-empty">No samples match “{query}”.</div>}
          </div>

          {REMOTE_PACKS.map((pack) => (
            <div key={pack.packId} className="studio-browser-credit">
              {pack.title} by {pack.creator} · <a href={pack.licenseUrl} target="_blank" rel="noreferrer">{pack.license}</a> ·{' '}
              <a href={pack.sourceUrl} target="_blank" rel="noreferrer">source</a>
            </div>
          ))}
        </>
      ) : (
        <div className="studio-browser-empty">
          Plugins are coming. This tab will list instruments and effects you can drop onto tracks.
        </div>
      )}
        </>
      )}
    </aside>
  );
}
