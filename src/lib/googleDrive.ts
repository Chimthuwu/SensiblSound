// Google Drive backup lives in HER OWN Google account, unlike the Firebase
// bucket (which is the app's project). That difference is the whole point of
// this file: it's the copy she owns outright and can open in drive.google.com
// even if this app disappears.
//
// Auth is Google Identity Services' token flow — the only OAuth flow that is
// safe from a static, backend-less site, because it never needs a client
// secret. The tradeoff is that access tokens are short-lived (~1h) and there
// is no refresh token, so we re-acquire silently on demand (see getToken).

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// drive.file is deliberately the narrowest useful scope: this app can only
// ever see and touch files it created itself. It cannot read the rest of her
// Drive, which is what makes granting it a low-stakes decision for her.
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const FOLDER_NAME = 'Sensible Soundlabs';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
// Remembers that she has granted consent before, so a later visit can
// re-acquire a token silently instead of making her click Connect again.
// Only a boolean — no token is ever persisted to disk.
const CONSENT_KEY = 'sensibleSoundlabs.driveConnected';

export const isDriveConfigured = !!CLIENT_ID;

// Minimal shape of the bits of the GIS global we actually call.
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type?: string }) => void;
          }): TokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

let accessToken: string | null = null;
let tokenExpiresAt = 0;
let tokenClient: TokenClient | null = null;
let gisLoadPromise: Promise<void> | null = null;
let pendingAuth: {
  resolve: (token: string) => void;
  reject: (err: Error) => void;
} | null = null;

// Loaded on first use rather than via a <script> tag in index.html, so
// visitors who never touch Drive don't pay for Google's SDK on every load.
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisLoadPromise = null; // let a later attempt retry after e.g. a dropped connection
      reject(new Error('Could not load Google sign-in.'));
    };
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

async function ensureTokenClient(): Promise<TokenClient> {
  if (tokenClient) return tokenClient;
  if (!CLIENT_ID) throw new Error('Google Drive is not configured.');

  await loadGis();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google sign-in failed to initialise.');

  // GIS hands results to a single callback rather than resolving a promise,
  // so `pendingAuth` bridges that back to whichever getToken() call is
  // currently waiting.
  tokenClient = oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (response) => {
      const waiting = pendingAuth;
      pendingAuth = null;
      if (!waiting) return;

      if (response.error || !response.access_token) {
        waiting.reject(new Error(response.error || 'Google sign-in was not completed.'));
        return;
      }

      accessToken = response.access_token;
      // 60s of slack so we never send a token that expires mid-upload.
      tokenExpiresAt = Date.now() + ((response.expires_in ?? 3600) - 60) * 1000;
      try {
        localStorage.setItem(CONSENT_KEY, 'true');
      } catch {
        // A blocked localStorage only costs her the silent reconnect on the
        // next visit; this session's Drive backups still work.
      }
      waiting.resolve(accessToken);
    },
    error_callback: (error) => {
      const waiting = pendingAuth;
      pendingAuth = null;
      waiting?.reject(new Error(error.type || 'Google sign-in was dismissed.'));
    },
  });

  return tokenClient;
}

// `interactive: false` attempts a silent grant — it succeeds only when she
// has consented before and still has a live Google session, which is the
// case we want on a returning visit. Uploads always use the silent path so
// a background backup can never make a popup appear out of nowhere; only the
// Connect button asks interactively.
function getToken(interactive: boolean): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt) {
    return Promise.resolve(accessToken);
  }

  return ensureTokenClient().then((client) => new Promise<string>((resolve, reject) => {
    if (pendingAuth) {
      reject(new Error('A Google sign-in is already in progress.'));
      return;
    }
    pendingAuth = { resolve, reject };
    try {
      client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    } catch (err) {
      pendingAuth = null;
      reject(err instanceof Error ? err : new Error('Google sign-in failed.'));
    }
  }));
}

export const googleDrive = {
  // True once we hold a usable token this session. Drives the UI badge.
  isConnected(): boolean {
    return !!accessToken && Date.now() < tokenExpiresAt;
  },

  // Whether she has ever granted consent, so the UI can show "reconnecting"
  // rather than "not connected" on a fresh page load.
  hasGrantedBefore(): boolean {
    if (!isDriveConfigured) return false;
    try {
      return localStorage.getItem(CONSENT_KEY) === 'true';
    } catch {
      return false;
    }
  },

  // Explicit, user-gesture-driven connect (the Connect button).
  async connect(): Promise<void> {
    await getToken(true);
  },

  // Best-effort silent reconnect on app start. Never throws — a failure here
  // just means the badge stays on "not connected" until she clicks Connect.
  async reconnectSilently(): Promise<boolean> {
    if (!isDriveConfigured || !googleDrive.hasGrantedBefore()) return false;
    try {
      await getToken(false);
      return true;
    } catch {
      return false;
    }
  },

  disconnect(): void {
    const token = accessToken;
    accessToken = null;
    tokenExpiresAt = 0;
    try {
      localStorage.removeItem(CONSENT_KEY);
    } catch {
      // Nothing to do — the in-memory token is already cleared, which is
      // what actually stops further uploads this session.
    }
    // Revoking tells Google to drop the grant too, so "Disconnect" means what
    // she'd expect rather than just forgetting the token locally.
    if (token) window.google?.accounts?.oauth2?.revoke(token);
  },

  // Authenticated fetch against the Drive REST API. Uploads use the silent
  // token path so a backup never triggers an unexpected popup mid-session.
  async authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await getToken(false);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { ...init, headers });

    // A 401 here means the token died earlier than advertised; drop it so
    // the next attempt re-acquires instead of retrying a dead credential.
    if (response.status === 401) {
      accessToken = null;
      tokenExpiresAt = 0;
    }
    return response;
  },
};

// Resolves the "Sensible Soundlabs" folder in her Drive, creating it the
// first time. Cached per session so routine uploads cost one request, not
// three. Under drive.file this search only ever sees our own folder, never
// an unrelated folder of hers that happens to share the name.
let folderIdPromise: Promise<string> | null = null;

export function ensureBackupFolder(): Promise<string> {
  if (folderIdPromise) return folderIdPromise;

  folderIdPromise = (async () => {
    const query = encodeURIComponent(
      `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`
    );
    const found = await googleDrive.authedFetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1`
    );
    if (found.ok) {
      const data = await found.json();
      if (data.files?.length) return data.files[0].id as string;
    }

    const created = await googleDrive.authedFetch(
      'https://www.googleapis.com/drive/v3/files?fields=id',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
      }
    );
    if (!created.ok) {
      throw new Error(`Could not create the Drive folder (${created.status}).`);
    }
    return (await created.json()).id as string;
  })();

  // Don't cache a failure — a transient network error shouldn't disable
  // Drive backup for the rest of the session.
  folderIdPromise.catch(() => {
    folderIdPromise = null;
  });

  return folderIdPromise;
}
