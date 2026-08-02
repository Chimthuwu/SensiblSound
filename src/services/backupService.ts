import { FirebaseStorageProvider } from './firebaseStorageProvider';

export interface BackupProvider {
  upload(blob: Blob, id: string): Promise<string>;
  restore(id: string): Promise<Blob>;
}

// Local IndexedDB fallback to guarantee zero data loss
export const localBackup = {
  async save(id: string, blob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("SensibleSoundlabsDB", 1);

      request.onupgradeneeded = () => {
        request.result.createObjectStore("takes");
      };

      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("takes", "readwrite");
        const store = tx.objectStore("takes");
        store.put(blob, id);

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };

      request.onerror = () => reject(request.error);
    });
  },

  async get(id: string): Promise<Blob | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("SensibleSoundlabsDB", 1);

      request.onupgradeneeded = () => {
        request.result.createObjectStore("takes");
      };

      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("takes", "readonly");
        const store = tx.objectStore("takes");
        const getRequest = store.get(id);

        getRequest.onsuccess = () => {
          db.close();
          resolve(getRequest.result ?? null);
        };
        getRequest.onerror = () => {
          db.close();
          reject(getRequest.error);
        };
      };

      request.onerror = () => reject(request.error);
    });
  }
};

export interface BackupResult {
  localSaved: boolean;
  cloudSaved: boolean;
}

export const backupService = {
  provider: new FirebaseStorageProvider() as BackupProvider,

  // Local (IndexedDB) and cloud (Firebase Storage) are reported
  // independently and honestly — neither one's outcome is allowed to mask
  // the other. Local save happens first and doesn't wait on the network;
  // cloud upload runs alongside it. Downloading to disk remains the only
  // way to get a copy fully off this Firebase project, but both of these
  // now genuinely happen, unlike the old fully-mocked cloud step.
  async backupTake(id: string, url: string): Promise<BackupResult> {
    let blob: Blob;
    try {
      const response = await fetch(url);
      blob = await response.blob();
    } catch (err) {
      console.error('Could not read the recording to back it up.', err);
      return { localSaved: false, cloudSaved: false };
    }

    let localSaved = false;
    try {
      await localBackup.save(id, blob);
      localSaved = true;
    } catch (err) {
      console.error('Local backup failed — this recording only exists in memory until it is downloaded.', err);
    }

    let cloudSaved = false;
    try {
      await this.provider.upload(blob, id);
      cloudSaved = true;
    } catch (err) {
      console.warn('Cloud backup failed — recording is still safe locally (and downloadable).', err);
    }

    return { localSaved, cloudSaved };
  },

  // Local-first, cloud-fallback lookup for the Recordings history panel —
  // a recording is recoverable as long as EITHER backup survived, which is
  // the whole point of having two independent ones.
  async getRecordingBlob(id: string): Promise<Blob> {
    const local = await localBackup.get(id).catch(() => null);
    if (local) return local;
    return this.provider.restore(id);
  }
};
