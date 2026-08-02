# Sensible Soundlabs — Project TODO

Living notes + plan for the vocal-recording web DAW. Primary user is a
non-technical vocalist who found BandLab too confusing — every decision here
should be judged against "does this make her life simpler and her
recordings safer," not "is this a cool DAW feature."

Stack: React 19 + Vite + TypeScript, Zustand for state, WaveSurfer.js for
waveforms, Tailwind for styling. Backend: Firebase (project `sensible-soundlabs`)
— anonymous Auth + Storage for real cloud backup of recordings. Config lives
in `.env` (gitignored; `.env.example` documents the required keys — Firebase
web API keys aren't secret, security comes from Storage rules, not key
secrecy).

---

## 🚨 Critical — recordings can be lost, and nothing tells her that

**Status: core fix shipped.** The app no longer lies about backup, and she
now has a real, unmissable way to save a recording:

- [utils/download.ts](src/utils/download.ts) (NEW) — real browser file-save
  via `<a download>` on the take's blob URL, with a sensible filename
  (`vocal-take-2024-04-06-1421.webm`, extension derived from the actual
  recorder `mimeType`, now tracked on `VocalTake`/`VocalLayer`).
- **Unmissable download CTA**
  ([VocalTrack.tsx](src/components/tracks/VocalTrack.tsx)) — a full-width,
  pulsing green "Download This Take Now" button appears the instant
  recording stops, above/before "Record Again" and "Keep as Layer". Stops
  pulsing and switches to a calm "Downloaded ✓" state once she's saved it.
  Every kept layer ([LayerTrack.tsx](src/components/tracks/LayerTrack.tsx))
  now has its own download button too, so nothing is only downloadable
  once.
- **Discarding an undownloaded take now warns explicitly** — "Record
  Again" and layer "Discard" both show a stronger confirm message
  ("...discarding it now means it's gone for good") when the
  take/layer hasn't been downloaded yet, instead of the old generic prompt.
- **`beforeunload` warning** ([App.tsx](src/App.tsx)) — closing or
  refreshing the tab while any undownloaded take/layer exists now triggers
  the browser's native "leave site?" confirmation.
- **"Cloud Sync" no longer lies.** `backupService.backupTake` now reports
  success/failure based only on the real IndexedDB save — the mocked
  cloud upload runs best-effort in the background and can no longer flip a
  successful local save into a false "failed" status (it was doing exactly
  that: a random 10% fake-network coin-flip was overriding a real,
  successful local save). The header pill dropped all "Cloud Sync"
  language — it now says "Saved on This Device" / "Save Failed — Download
  Now!" / etc., and stays fully visible (not dimmed) on failure.
  See [backupService.ts](src/services/backupService.ts).
- Verified in-browser: download fires with correct filename for both
  active take and layers, `downloaded` flag flips correctly, the
  `beforeunload` listener attaches/detaches exactly when it should, all
  four status-pill states render with honest wording, and the
  discard-warning blocks discarding when cancelled. No console errors.

**Update: real cloud backend wired up (Firebase).** Created the
`sensible-soundlabs` Firebase project — Storage + Anonymous Auth (no login
screen for her; she's signed in invisibly so uploads can be scoped to her
own session). New files:
- [lib/firebase.ts](src/lib/firebase.ts) — app init + `ensureAnonymousAuth()`.
- [services/firebaseStorageProvider.ts](src/services/firebaseStorageProvider.ts)
  — real `upload()`/`restore()` against `recordings/{uid}/{id}`, replacing
  the deleted `MockCloudProvider`.
- `backupService.backupTake()` now returns `{ localSaved, cloudSaved }`
  independently — local (IndexedDB) and cloud (Firebase) are both real now,
  tracked and reported separately via `backupStatus` / `cloudBackupStatus`.
  The header shows two honest pills: "Saved on This Device" (local, the
  one that matters most, stays visible on failure) and "Backed Up to
  Cloud" (cloud, stays quietly dimmed even on failure since local+download
  already cover her — a cloud hiccup isn't an emergency).

⚠️ **Not yet fully live — one manual step left:**
- [ ] **The Storage bucket hasn't been provisioned yet.** Verified directly
  against the real project via Node (the sandboxed browser preview has no
  outbound internet, so this couldn't be checked from there): anonymous
  sign-in works fine, but the Storage bucket itself 404s. Registering the
  web app in the console does *not* auto-create the bucket — go to
  **Build → Storage → "Get started"** in the Firebase console to actually
  provision it, then cloud backup will start working immediately (no code
  changes needed — `backupService` already fails gracefully to
  `cloudSaved: false` in the meantime, so nothing is broken, cloud backup
  is just silently unavailable until this is done).
- [ ] **Storage security rules need to be pasted in.** Default production
  rules deny everything. Once Storage is enabled, go to Storage → Rules in
  the console and paste:
  ```
  rules_version = '2';
  service firebase.storage {
    match /b/{bucket}/o {
      match /recordings/{uid}/{fileId} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
  ```
  This scopes each anonymous session to only read/write its own
  `recordings/{uid}/` folder — publish the rule, then re-test.
- [ ] **No "Recordings" / take history panel yet.** `FirebaseStorageProvider.restore()`
  is implemented and ready to use, and IndexedDB reliably holds a local
  copy too — but nothing in the UI reads either back yet, so there's still
  no way to recover a take after a page refresh wipes the in-memory
  session. This is the natural next step now that both backends can
  actually restore something.
- [ ] Consider auto-downloading (or at least auto-prompting) right when
  recording stops, rather than waiting for her to notice the button —
  the current CTA is prominent but still requires her to act.

---

## 🎛️ Timeline — make it read like a real DAW grid

**Status: first pass shipped.** Layers are now real stacked timeline tracks:

- [LayerTrack.tsx](src/components/tracks/LayerTrack.tsx) (NEW) — one row
  per kept layer, with real audio playback wired up via `useAudioPlayer`
  (previously layers had **no audio engine at all** — they were silent
  list entries with just a name and a discard button). Each row has its
  own mute + volume controls now, matching the backing track / active
  take.
- [Playhead.tsx](src/components/tracks/Playhead.tsx) (NEW) — a single
  vertical line spanning all layer rows, driven directly by
  `transportTimeMs`, so the whole stack has one shared moving reference
  point instead of relying on each track's own WaveSurfer cursor.
- [utils/timeline.ts](src/utils/timeline.ts) (NEW) —
  `getLayerTimelineDurationMs` computes one shared horizontal scale from
  the backing track's length + every layer's own `transportStartMs` +
  `durationMs`, so a layer recorded 8 bars in visually sits 8 bars in,
  correctly scaled/positioned relative to its neighbors and the song.
  Each track's real decoded duration is now tracked in the store
  (`AudioFile`/`VocalTake`/`VocalLayer.durationMs`, populated by
  `setBackingTrackDurationMs` / `setActiveTakeDurationMs` /
  `setLayerDurationMs`) — this didn't exist before, so layout math had
  nothing to work from.
- `VocalTrack`'s layers section now renders `TimeRuler` (the same
  bpm-synced bar ruler the backing track uses) once, shared across the
  whole stack, instead of no grid at all.
- The active-take preview box also swapped its fake CSS gridline pattern
  for the real `TimeRuler`, synced to that take's own decoded duration.
- Verified in-browser (via dev server + injected test layers, since the
  sandboxed preview has no real mic access): position math, playhead
  tracking, mute toggling, and duration reporting all confirmed correct
  with no console errors or render loops.

Still open:
- [ ] **Tempo detection is fake.** `useTempoDetector.ts` doesn't analyze
  audio — it waits 2s and returns `Math.random() * 80 + 80`
  ([useTempoDetector.ts:18-19](src/hooks/useTempoDetector.ts)). Right now
  it's actively risky: if she accepts a bogus "detected" BPM, every
  gridline on the timeline becomes wrong. Either implement real detection
  (e.g. onset/tempo analysis library) or remove the prompt and let BPM
  stay manual/tap-tempo only until it's real.
- [ ] **No zoom/scroll on the timeline** — everything is squeezed into a
  fixed-width container. Needed once songs run a few minutes and/or she
  has several layers stacked — bars will get too thin to read.
- [ ] **Backing track and layers still live in visually separate cards.**
  They share the same bpm math (so bar 8 means the same thing in both),
  but there's no single continuous view showing the backing track
  waveform pixel-aligned against her vocal layers. A true merged
  multi-track view (one canvas, backing track as the top row) is the
  natural next step if this still doesn't feel "DAW enough" once she's
  tried it — deliberately deferred for now since it's a bigger structural
  change and doubling up backing-track playback instances risked audio
  bugs for this pass.
- [ ] Per-layer solo (mute-all-but-this) would help her A/B compare takes
  faster than mute-each-one-manually.

---

## Other things noticed during review (lower priority / just notes)

- Session state (recording, layers, FX settings) lives only in memory —
  a page refresh mid-session loses everything currently in
  `useSessionStore`, independent of the download issue above. Worth a
  session-persistence pass (e.g. `zustand/persist` + IndexedDB) once
  download/backup is solid.
- `layers` is hard-capped at 5 ([useSessionStore.ts:47-50](src/stores/useSessionStore.ts))
  with silent drop of the oldest — confirm that's actually the intended
  UX limit and not just an MVP placeholder; a non-technical user losing a
  layer with no warning is the same trust problem as the download issue.
- FX rack (`VocalFxRack.tsx`, 455 lines — autotune, compressor, EQ,
  doubler, delay, reverb) is genuinely built out and works off real Web
  Audio nodes, not mocked. Good foundation; not reviewed in depth yet.
- "Share Project" button in the header ([App.tsx:107-110](src/App.tsx))
  is currently a no-op — no `onClick`. Flag for later; don't want it
  visible/clickable if it does nothing.
- Mic monitoring, metronome, clip warning light, and keyboard shortcuts
  (Space/R/Home) all appear to be real, working functionality — good
  building blocks already in place, and generally intuitive for a
  non-technical user.

---

## Priority order for next session

1. ~~Download button (make it unmissable)~~ — done, see Critical section above.
2. ~~Make backup status honest~~ — done, see Critical section above.
3. **Finish the Firebase setup** — enable Storage in the console (Build →
   Storage → Get started) and paste in the security rules above. Two
   clicks + one paste, then cloud backup goes fully live.
4. Recordings/history panel + session persistence (survive a refresh) —
   both backends can restore a take now (`localBackup` + `FirebaseStorageProvider.restore()`),
   nothing in the UI uses either yet.
5. ~~Layers-as-timeline-tracks~~ — done, see Timeline section above.
6. Real (or removed) tempo detection so the grid can be trusted.

---

## Gotcha for future store changes

When adding a new `set*DurationMs`-style setter that replaces a nested
object (`backingTrack`, `activeTake`, a `layers` entry) with a new
reference: **guard it to no-op when the value is unchanged.** A component
effect that depends on that object and calls the setter on every render
will loop forever otherwise — hit this exact bug wiring up
`setBackingTrackDurationMs`/`setActiveTakeDurationMs`/`setLayerDurationMs`
(see the equality checks in [useSessionStore.ts](src/stores/useSessionStore.ts)).
Depending on the object's stable `id` instead of the object itself in the
effect's dependency array is the other half of the fix.
