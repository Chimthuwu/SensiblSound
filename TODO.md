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

- [x] MIDI (2026-10-21, commit ba39e3d, local, not pushed): every track is a hybrid. MIDI clips sit on any lane next to audio clips; a clip only sounds when the track rack holds an instrument (**PsydeNote Lite** synth or **Drum Machine**, both rack devices). Piano roll + 16th-step drum grid editor, QWERTY and Web MIDI live input, separate right-click menus for audio and MIDI clips, + Synth / + Drums buttons. Headless test: notes schedule on play (synth 8 osc for 4 notes, drums fire). Not heard by ear.
- [x] Auto-warp (2026-10-21): magnet+waveform button in the top bar. On: audio that drops in is warped to the project BPM (transients detected, snapped to the sixteenth grid, time-stretched with WSOLA, pitch kept; src/utils/warpCore.ts + warp.ts + warpActions.ts). Off: audio drops in as is and a prompt offers to warp, with "Don't ask me this again" (right-click the button to bring it back). Clip menu has Warp to project BPM. Tested with a synthetic 100 BPM loop (99.9 detected, grid error under 8 ms) and in a headless browser. Not yet: visible warp markers on the clip, editing markers by hand, re-warp when the project BPM changes (warps are baked in at drop time).
- [x] External MIDI controllers + MIDI recording (2026-10-21): Web MIDI, pill in the top bar (Connect MIDI / device picker / activity light). Notes play the selected instrument track, sustain pedal, mod wheel/CC74 sweeps the synth filter, GM and pad-bank drum notes map onto the 8 pads. Arm an instrument track and hit record (R) to capture played notes (quantised to 32nds) into a MIDI clip; the mic stays off on instrument tracks. Needs Chrome/Edge (Electron build may need a MIDI permission handler). Tested with a fake controller in headless Chromium, not with real hardware.
- [x] Mixer view + master bus (2026-10-21): Mixer button in the top bar swaps the arrangement for Bitwig-style channel strips (device chips, pan, fader with dB scale and live L/R meters with peak hold and clip light, M/S/arm, track number) plus a master strip. All tracks (audio and MIDI) now feed a master bus with a soft clipper (src/utils/audioBus.ts). Theme button replaces the hue slider (hue, saturation, contrast). Not yet: sends/returns, input/output routing, strip reorder by drag, meter ballistics tuned by ear.
- [x] Note FX (2026-10-21): Bitwig-style MIDI effects in the device rack: Arpeggiator, Chord, Transpose, Note Filter, Note Echo, Scale, Randomize (src/midi/noteFx.ts, pure and tested: 18 checks). The rack always flows MIDI FX -> instrument -> audio FX (stage labels, devices can only move within their stage). Note FX apply to clip playback and to live playing (controller/keyboard); recording stores the notes as played. Audio FX after an instrument (Dynamics, EQ, Delay, Reverb) now really process the track (src/midi/laneFx.ts); they share the global FX settings, like the mic chain. Not yet: Note Repeat/Latch, per-instance audio FX settings, MIDI FX on audio clips.
- [x] Hybrid tracks UI (2026-10-21): one kind of track. + Synth/+ Drums are gone; the rack decides what plays. Double-click empty lane space (or right-click > Add MIDI clip here) on ANY track for a MIDI clip; audio drops onto the same track. Playback no longer stops when one audio clip ends (useTimer stops after the last clip of any kind). Track header height is a shared var (--lane-h) so an armed track is never clipped. Volume (teal) and pan (amber, bipolar, centre tick) sliders without text labels. Pop-up menus follow the theme. MIDI editor can pop out into its own window (Pop out / Dock). MIDI out: Record source (played / MIDI FX output), Bake FX to new track, Export .mid.
- [x] Modulators + automation (2026-10-21): a sine-wave Mod button in the top bar drops down the global modulator section: LFOs (sine/triangle/saw/square/random, free or tempo-synced) and ADSR envelopes (gated by playback or by notes), each with a live scope and mapping list. Right-click any knob/slider (track volume and pan, master, every synth and drum knob, mixer faders) to Automate it or Modulate it with an LFO/envelope. Automation tab has a breakpoint editor that follows the timeline. Synth/drum parameters are sampled at note start; volume/pan/master move continuously. src/mod/ (modCore is pure and tested: 23 checks).
- [x] Rack: the Enable Effects master is gone; every device has a power button; click selects, Ctrl+A selects all, one power click switches the whole selection. A powered-off instrument/MIDI FX/audio FX does nothing.
- [x] Loop: drag on the ruler or empty lane space to highlight time (Esc clears, a plain click moves the playhead from the ruler); Ctrl+L loops the highlight (or the selected clip; with nothing selected it toggles the loop); loop button in the transport bar.
- [x] R only arms recording (record button pulses); Play/Space starts the transport and records if armed.
- [x] Layout: the app is exactly one window tall (the theme filter on #root made fixed elements position against #root, which pushed the transport bar below the fold). Transport bar always visible; the main column scrolls inside.
- [x] Themed dropdowns (components/studio/Select.tsx) replace every native select so lists follow the theme; right-click menus no longer close on a focus-induced scroll.
- [ ] MIDI next: velocity editing, note drag/move, multiple clips on one lane overlap rules, MIDI in mixdown export, project save, per-instance instrument settings (same open item as per-instance FX), PsydeNote Lite presets from PsydeNote proper.
- [ ] Sampler track type.
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
