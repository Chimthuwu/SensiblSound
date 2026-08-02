import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, ensureAnonymousAuth } from '../lib/firebase';
import type { BackupProvider } from './backupService';

// Real cloud backend: recordings live under recordings/{uid}/{id}, scoped
// to her anonymous auth session via Storage security rules (see
// TODO.md — the rules aren't deployable from here and must be pasted into
// the Firebase console by hand).
export class FirebaseStorageProvider implements BackupProvider {
  async upload(blob: Blob, id: string): Promise<string> {
    if (!storage) {
      throw new Error("Firebase storage is not configured");
    }
    const uid = await ensureAnonymousAuth();
    const storageRef = ref(storage, `recordings/${uid}/${id}`);
    await uploadBytes(storageRef, blob, { contentType: blob.type || 'audio/webm' });
    return getDownloadURL(storageRef);
  }

  async restore(id: string): Promise<Blob> {
    if (!storage) {
      throw new Error("Firebase storage is not configured");
    }
    const uid = await ensureAnonymousAuth();
    const storageRef = ref(storage, `recordings/${uid}/${id}`);
    const url = await getDownloadURL(storageRef);
    const response = await fetch(url);
    return response.blob();
  }
}
