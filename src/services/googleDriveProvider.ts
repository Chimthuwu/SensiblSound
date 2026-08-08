import { googleDrive, ensureBackupFolder, isDriveConfigured } from '../lib/googleDrive';
import type { BackupProvider } from './backupService';

// Takes land in her own Drive under "Sensible Soundlabs", named by the same
// id the other two backups use so a recording can be found in any of them.
// The extension is derived from the actual recorded container (webm or ogg,
// depending on what her browser supports) so the file plays on a double
// click in Drive rather than downloading as an unknown blob.
function fileNameFor(id: string, blobType: string): string {
  const ext = blobType.includes('ogg') ? 'ogg' : 'webm';
  return `${id}.${ext}`;
}

export class GoogleDriveProvider implements BackupProvider {
  // Resumable rather than multipart: a five-minute take at 256kbps is
  // roughly 10MB, past the point where Google recommends a single-shot
  // upload, and this way a large take doesn't fail wholesale on a hiccup.
  async upload(blob: Blob, id: string): Promise<string> {
    if (!isDriveConfigured) {
      throw new Error('Google Drive is not configured.');
    }
    const contentType = blob.type || 'audio/webm';
    const folderId = await ensureBackupFolder();

    const session = await googleDrive.authedFetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': contentType,
          'X-Upload-Content-Length': String(blob.size),
        },
        body: JSON.stringify({
          name: fileNameFor(id, contentType),
          parents: [folderId],
        }),
      }
    );
    if (!session.ok) {
      throw new Error(`Drive upload could not start (${session.status}).`);
    }

    const uploadUrl = session.headers.get('Location');
    if (!uploadUrl) {
      throw new Error('Drive did not return an upload URL.');
    }

    // The session URL carries its own authorisation, so this PUT is a plain
    // fetch — attaching the bearer token here would be redundant.
    const upload = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
    });
    if (!upload.ok) {
      throw new Error(`Drive upload failed (${upload.status}).`);
    }

    return (await upload.json()).id as string;
  }

  async restore(id: string): Promise<Blob> {
    if (!isDriveConfigured) {
      throw new Error('Google Drive is not configured.');
    }
    const folderId = await ensureBackupFolder();
    // Matched on `name contains id` rather than an exact name so a take
    // recorded in a browser that produced .ogg is still found from one that
    // records .webm.
    const query = encodeURIComponent(
      `'${folderId}' in parents and name contains '${id}' and trashed=false`
    );
    const found = await googleDrive.authedFetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1`
    );
    if (!found.ok) {
      throw new Error(`Could not search Drive (${found.status}).`);
    }
    const data = await found.json();
    if (!data.files?.length) {
      throw new Error('That recording is not in Drive.');
    }

    const file = await googleDrive.authedFetch(
      `https://www.googleapis.com/drive/v3/files/${data.files[0].id}?alt=media`
    );
    if (!file.ok) {
      throw new Error(`Could not download from Drive (${file.status}).`);
    }
    return file.blob();
  }
}
