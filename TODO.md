# Sensible Soundlabs — Project TODO

Living notes + plan for the vocal-recording web DAW. Primary user is a
non-technical vocalist who found BandLab too confusing — every decision here
should be judged against "does this make her life simpler and her
recordings safer," not "is this a cool DAW feature."

Stack: React 19 + Vite + TypeScript, Zustand for state, WaveSurfer.js for
waveforms, Tailwind for styling. No backend exists yet (no Supabase, no API,
nothing in `.env`) — everything currently runs client-side only.

---

## 🚨 Critical — recordings can be lost, and nothing tells her that

This is the top priority. Right now the app *looks* like it's protecting her
recordings, but it isn't.

- [ ] **There is no download/export button anywhere in the UI.**
  Checked `VocalTrack.tsx`, `App.tsx`, and the layers list — a recorded take
  only ever exists as an in-memory `Blob` object URL
  ([useAudioRecorder.ts:108-111](src/hooks/useAudioRecorder.ts)). There is
  currently **no way for her to get a take out of the browser at all.**
  Closing the tab or refreshing loses it completely (nothing rehydrates
  `layers`/`activeTake` from storage on load).
- [ ] **"Cloud Sync" is fully fake.** `backupService.ts`'s
  `MockCloudProvider.upload()` just `setTimeout`s for 1.5s, randomly fails
  10% of the time, and returns a string like `cloud-url-<id>` that points
  to nothing ([backupService.ts:6-18](src/services/backupService.ts)). No
  network request is ever made. The header pill proudly says "Cloud Sync
  Ready" / "success" — that's a **false promise** to a user who was told
  her recordings are being backed up. `restore()` also just throws
  `"Not implemented for MVP"`, so even if upload were real, nothing could
  bring a take back.
- [ ] **The one real safety net (IndexedDB local backup) is currently a
  write-only black hole.** `localBackup.save()` does persist the blob to
  IndexedDB, which is good, but there is no UI that lists, restores, or
  exports what's in there. If she clears her browser data or switches
  devices, those recordings are unrecoverable even though technically they
  were "backed up."

### Fix plan
1. **Add a real download button, made obvious.** As soon as a take is
   recorded, show a prominent "⬇ DOWNLOAD THIS TAKE" call-to-action —
   not a small icon buried in a toolbar. Use `<a download>` on the take's
   blob URL (or File System Access API where supported) so it saves an
   actual `.webm`/`.wav` file to her computer. This should appear the
   moment recording stops, before she can do anything else, and stay
   visible/pinned until she's downloaded or explicitly dismisses it.
2. **Decide on a real cloud backend before claiming "cloud sync" in the
   UI.** Options: Supabase Storage (session already has Supabase MCP
   tooling available), S3/R2, or simplest — remove the cloud-sync
   messaging entirely until it's real, and lean on "Download" as the
   primary safety mechanism. Whatever we ship, the UI status must reflect
   what's actually true.
3. **Add a "Recordings" / take history panel** backed by IndexedDB reads
   (not just writes) so every take from the session — not just the
   currently active one — can be replayed and downloaded, even after a
   refresh.
4. **Auto-prompt download on risky moments**: before "Record Again"
   discards a take, before closing/refreshing the tab while an
   undownloaded take exists (`beforeunload` warning), and after any failed
   cloud upload.

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

1. Download button (make it unmissable) — stop data loss risk immediately.
   **Still the #1 open item — nothing below replaces this.**
2. Make backup status honest — either wire up real cloud storage or stop
   claiming one exists.
3. Recordings/history panel so nothing is silently lost between takes or
   across a refresh.
4. ~~Layers-as-timeline-tracks~~ — done, see Timeline section above.
5. Real (or removed) tempo detection so the grid can be trusted.

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
