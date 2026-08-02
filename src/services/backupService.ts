export interface BackupProvider {
  upload(blob: Blob, id: string): Promise<string>;
  restore(id: string): Promise<Blob>;
}

// Placeholder for a real cloud provider (e.g. Supabase Storage, R2, S3) —
// not wired to any actual backend yet. Its outcome intentionally does NOT
// drive `backupService.backupTake`'s return value or the UI's backup
// status: showing a fake "cloud" success/failure to the user would be a
// false promise about where their recording actually lives. Only the real
// local IndexedDB save below is reported.
export class MockCloudProvider implements BackupProvider {
  async upload(_blob: Blob, id: string): Promise<string> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Simulate rare network failure for robustness testing (10% chance)
    if (Math.random() < 0.1) {
      throw new Error("Simulated network failure");
    }
    
    return `cloud-url-${id}`;
  }
  
  async restore(_id: string): Promise<Blob> {
    throw new Error("Not implemented for MVP");
  }
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
  }
};

export const backupService = {
  provider: new MockCloudProvider(),

  // Returns whether the recording now has a real durable copy. That copy is
  // IndexedDB — there is no cloud backend yet, so the (still-mocked) cloud
  // upload runs best-effort in the background and is never allowed to flip
  // this result. Until a real cloud provider exists, downloading the take
  // to disk is the only way to get it off this device/browser.
  async backupTake(id: string, url: string): Promise<boolean> {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      await localBackup.save(id, blob);

      this.provider.upload(blob, id).catch((err) => {
        console.warn('Cloud backup unavailable (not yet implemented) — recording is still safe locally.', err);
      });

      return true;
    } catch (err) {
      console.error('Local backup failed — this recording only exists in memory until it is downloaded.', err);
      return false;
    }
  }
};
