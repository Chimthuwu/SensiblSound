# SensiblSound — TODO

Browser vocal-recording DAW (React + Vite + Web Audio). Live: https://sounds-sensible.pages.dev/ (repo: `Chimthuwu/sensible-sound`).

## Status (2026-10-16)

- Studio skin is the main UI. Open as **PR #1** (`feat/studio-skin`).
- Arrangement is driven by real session state: backing track, active take, layers.
- Per-track volume sliders, mute/solo, and per-track device chains (add/remove) are in.
- Devices rack sits at the bottom, above the transport.
- Four-band parametric EQ (shelf / peak / peak / shelf) with a real curve. Local commit `6a4ea34`, not pushed yet.
- Build passes (`npm run build`). **Nothing has been tested with a real microphone or with file import yet.**

## Now

- [ ] Manual test pass: import a backing track, record a take, monitor, playback, mute/solo, volume, Keep as Layer, Record Again, WAV/MP3 export, EQ drag, device add/remove.
- [x] Push `6a4ea34` (EQ) and the device-chain commits to `feat/studio-skin` (pushed with PR #1).
- [x] Microphone selector in the Vocal Take header (device list and selection now live in the store).
- [ ] Per-track effects: route each track through its own device chain. Today the effect graph is global and only affects mic recording.
- [x] Clip waveforms in the arrangement (decoded peaks, cached per clip; untested with real audio).
- [x] Per-layer download (Save button on each layer).
- [ ] Real compressor ratio control (the Ratio knob was removed because it did nothing).

## Next

- [ ] Appearance popover from the gear icon, with the hue slider. Apply the hue to the whole page so context menus follow it.
- [ ] Transport: set the play start position (click the ruler), and a loop bracket. Ctrl+L sets the loop from a time selection or a selected clip.
- [ ] Keyboard navigation: arrow keys move through tracks and clips; Shift+arrows extends a clip selection; cut, copy and paste work on the selection.
- [ ] Warp modes (Repitch, Stretch, Elastique-style via SoundTouch or Rubber Band, Raw). Global button and per-clip choice; clips visibly change length.
- [x] Clip keyboard: Delete removes, Backspace reverses, Ctrl+C/X/V copy/cut/paste, Ctrl+B doubles the length (pitch drops an octave).
- [x] Editable tempo in the transport.

- [ ] Expanded EQ view: a button opens a larger editor for detailed band work.
- [x] Audio input on every track: record arm on each track; the input is still one shared microphone, so per-track input needs per-track recording.
- [ ] Bulk import of loop packs from archive.org search results (check each item's licence before importing).
- [ ] Sample browser: Plugins tab (placeholder for now).

- [ ] Per-instance device settings: copies of a device (for example two Delays) currently share one set of settings and one audio node.

- [ ] Add and remove EQ bands (up to 8).
- [x] Add new tracks: "+ Track" button under TRACKS, and drag & drop audio onto the empty area to create a track.
- [x] Drag and drop audio onto the arrangement (creates a track or fills an empty one).
- [ ] Wire the metronome and tempo controls to the transport and arrangement grid.
- [ ] Undo / redo for edits (mute, solo, volume, devices, EQ, clip moves).
- [ ] Project save/load: restore the arrangement from IndexedDB.
- [ ] Timeline zoom and horizontal scrolling for long arrangements.
- [ ] Delete the old `src/components/tracks/` UI once nothing needs it for reference.

## Later (toward a full web DAW)

- [ ] Track types beyond vocals: audio, instrument (MIDI), and sampler.
- [ ] Device chain engine on AudioWorklet, so effects are real per-track DSP.
- [ ] Full mixdown export of the arrangement (not just the active take).
- [ ] Automation lanes for volume, pan and effect parameters.
- [ ] Punch-in recording and multi-take comping.
- [ ] Cloud sync and sharing (Drive / Firebase backends already exist in the code).

## Open questions

- Delete the old `sensiblsound.pages.dev` Cloudflare project now that `sounds-sensible` is live?
- Set the GitHub repo homepage to the live URL?
- Should the backing track get its own device chain? That needs per-track routing first.
- Merge PR #1 once the manual test pass is done?
- Ratio: do we want a real compressor ratio, or remove the Dynamics module's ratio entirely?

## Handoff notes

- Branch `feat/studio-skin` is the working branch; `main` is the old UI.
- `src/components/studio/` is the live UI. `src/components/tracks/*` is the old UI and nothing imports it any more. `effects/` (old VocalFxRack) was removed.
- Headless Edge screenshots work for layout checks (`msedge --headless=new --screenshot`). Mic and file import do not.
