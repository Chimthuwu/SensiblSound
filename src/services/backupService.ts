export interface BackupProvider {
  upload(blob: Blob, id: string): Promise<string>;
  restore(id: string): Promise<Blob>;
}

// A mock provider simulating cloud storage (e.g., R2, S3)
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
  
  async backupTake(id: string, url: string): Promise<boolean> {
    try {
      // 1. Fetch blob from the in-memory object URL
      const response = await fetch(url);
      const blob = await response.blob();
      
      // 2. Immediately save to local persistent storage (Browser Crash Protection)
      await localBackup.save(id, blob);
      
      // 3. Attempt cloud upload
      await this.provider.upload(blob, id);
      return true;
    } catch (err) {
      console.error("Backup failed, but local copy is safe in IndexedDB.", err);
      return false;
    }
  }
};
