import { initializeApp } from 'firebase/app';
import { getStorage } from 'firebase/storage';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const hasFirebaseConfig = !!firebaseConfig.apiKey;

export const firebaseApp = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
export const storage = hasFirebaseConfig ? getStorage(firebaseApp!) : null;
export const auth = hasFirebaseConfig ? getAuth(firebaseApp!) : null;

let anonymousAuthPromise: Promise<string> | null = null;

// Signs her in anonymously (no login UI, no account for her to manage) and
// resolves once we have a stable uid to scope Storage paths/rules to.
// Cached so repeated calls (one per take backed up) reuse the same
// in-flight/resolved sign-in instead of racing multiple sign-ins.
export function ensureAnonymousAuth(): Promise<string> {
  if (!auth) {
    return Promise.reject(new Error("Firebase is not configured"));
  }
  if (anonymousAuthPromise) return anonymousAuthPromise;

  anonymousAuthPromise = new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          unsubscribe();
          resolve(user.uid);
        } else {
          signInAnonymously(auth).catch((err) => {
            unsubscribe();
            reject(err);
          });
        }
      },
      (err) => {
        unsubscribe();
        reject(err);
      }
    );
  });

  return anonymousAuthPromise;
}
