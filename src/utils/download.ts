// Triggers a real browser file-save for a blob: object URL. Anchor-click
// download works directly on same-origin blob URLs — no fetch needed.
export function downloadBlobUrl(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mp3': 'mp3'
};

function extensionFor(mimeType?: string): string {
  if (!mimeType) return 'webm';
  const base = mimeType.split(';')[0].trim();
  return EXTENSION_BY_MIME[base] ?? 'webm';
}

// e.g. buildTakeFilename(1712345678901, 'vocal-take', 'audio/webm;codecs=opus')
//   -> "vocal-take-2024-04-05-1421.webm"
export function buildTakeFilename(timestamp: number, label: string, mimeType?: string, extensionOverride?: string): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  const ext = extensionOverride || extensionFor(mimeType);
  return `${label}-${stamp}.${ext}`;
}
