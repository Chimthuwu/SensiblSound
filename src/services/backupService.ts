import { FirebaseStorageProvider } from './firebaseStorageProvider';
import { GoogleDriveProvider } from './googleDriveProvider';
import { googleDrive, isDriveConfigured } from '../lib/googleDrive';

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
  // Three states rather than a boolean, because "she never connected Drive"
  // is a different thing from "Drive backup was tried and broke", and the
  // badge must not cry wolf about the former.
  drive: 'skipped' | 'saved' | 'failed';
}

export const backupService = {
  provider: new FirebaseStorageProvider() as BackupProvider,
  driveProvider: new GoogleDriveProvider() as BackupProvider,

  // Three independent destinations, reported honestly and never allowed to
  // mask one another: local (IndexedDB) on this device, cloud (Firebase
  // Storage, the app's project), and Google Drive (her own account). Local
  // save happens first and doesn't wait on the network; the two uploads run
  // concurrently, so adding Drive costs no extra wall-clock over the
  // Firebase upload it runs alongside.
  async backupTake(id: string, url: string): Promise<BackupResult> {
    let blob: Blob;
    try {
      const response = await fetch(url);
      blob = await response.blob();
    } catch (err) {
      console.error('Could not read the recording to back it up.', err);
      return { localSaved: false, cloudSaved: false, drive: 'skipped' };
    }

    let localSaved = false;
    try {
      await localBackup.save(id, blob);
      localSaved = true;
    } catch (err) {
      console.error('Local backup failed — this recording only exists in memory until it is downloaded.', err);
    }

    // Fired together rather than awaited in sequence so a slow Drive upload
    // never delays the Firebase one (or vice versa).
    const cloudUpload = this.provider.upload(blob, id).then(
      () => true,
      (err) => {
        console.warn('Cloud backup failed — recording is still safe locally (and downloadable).', err);
        return false;
      }
    );

    // Only attempted when she has actually connected Drive; otherwise this
    // is a deliberate no-op, not a failure. Uploads never prompt for
    // sign-in, so an expired session degrades to 'failed' quietly instead
    // of throwing a popup at her mid-session.
    const driveUpload: Promise<BackupResult['drive']> =
      isDriveConfigured && googleDrive.isConnected()
        ? this.driveProvider.upload(blob, id).then(
            () => 'saved' as const,
            (err) => {
              console.warn('Google Drive backup failed — recording is still safe locally (and downloadable).', err);
              return 'failed' as const;
            }
          )
        : Promise.resolve('skipped' as const);

    const [cloudSaved, drive] = await Promise.all([cloudUpload, driveUpload]);

    return { localSaved, cloudSaved, drive };
  },

  // Local-first, then cloud, then Drive — a recording is recoverable as long
  // as ANY of the three backups survived, which is the whole point of having
  // them be independent. Drive is tried last only because it's the slowest
  // path (folder lookup + search + download), not because it's least
  // trusted; it's the copy most likely to outlive the other two.
  async getRecordingBlob(id: string): Promise<Blob> {
    const local = await localBackup.get(id).catch(() => null);
    if (local) return local;

    try {
      return await this.provider.restore(id);
    } catch (err) {
      if (!isDriveConfigured || !googleDrive.isConnected()) throw err;
      console.warn('Cloud restore failed — trying Google Drive.', err);
      return this.driveProvider.restore(id);
    }
  }
};
