# PsydeFX 🎛️

**Making tracks on the side.**

**🔴 Live app: [psyde-fx.pages.dev](https://psyde-fx.pages.dev/)**

PsydeFX is a DAW that runs in your browser. Record vocals, drop in audio, play instruments, and build tracks without installing anything.

## What it does

* **Audio and MIDI on every track.** Each track holds audio clips and MIDI clips side by side. The device rack decides what plays: MIDI FX, then an instrument, then audio FX.
* **Instruments.** PsydeNote Lite, a two-oscillator FM synth with presets, and an eight-pad drum machine. Both are synthesised in the browser.
* **Note FX.** Arpeggiator, Chord, Transpose, Note Filter, Note Echo, Scale and Randomize, in front of any instrument.
* **Piano roll and step grid,** with MIDI recording from a computer keyboard or an external controller, bake-to-track and .mid export.
* **Modulators and automation.** LFOs and envelopes you can map to any knob or slider, and automation lanes under each track.
* **Auto-warp.** Drop in audio and it is stretched and snapped to the project tempo, pitch intact.
* **Mixer view** with live meters and a master bus, a loop you can set by highlighting time (Ctrl+L), and recording on several armed tracks at once.
* **Live vocal tools.** Autotune, doubler, compressor, parametric EQ, delay and reverb, with monitoring.

## Shortcuts

| Key | Action |
|---|---|
| Space | Play / stop |
| R | Arm recording (Play then records) |
| Ctrl+L | Loop the highlighted time |
| Ctrl+T or Alt+T | Insert a track |
| F5 or B | Show / hide the browser |
| F8 or M | Show / hide the mixer |

## Run it

```bash
npm install
npm run dev
```

Open the printed URL. `npm run build` makes the static site in `dist/`.

## Built with

React, TypeScript, Vite, Zustand and the Web Audio and Web MIDI APIs. Hosted on Cloudflare Pages.

## History

PsydeFX grew out of SensiblSound ([Sensible Soundlabs, made for Sensimilliea 💜](https://github.com/Chimthuwu/SensiblSound)), a simple vocal-recording DAW.
