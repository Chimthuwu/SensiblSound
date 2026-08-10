# SensiblSound 🎙️

A modern, browser-based vocal recording DAW designed for simplicity and speed. SensiblSound provides a classic two-track setup (Backing Track + Vocal Track) with a professional horizontal timeline interface, allowing vocalists and producers to sketch ideas, record takes, and apply high-quality DSP effects directly in the browser or on Android.

## Features ✨

* **Professional DAW Layout:** Side-by-side horizontal timeline with dedicated mixer sidebars for Mute, Solo, and Volume control.
* **Live Audio Effects (FX):** Built-in Web Audio API effects including Reverb, Delay, and Compression. Effects are "baked-in" to the recording for zero-latency processing.
* **Real-time Oscilloscope:** Visual feedback while monitoring or recording your microphone input.
* **Takes & Layers Management:** Record a take, listen back, and easily promote it to a Layer. Stack multiple vocal layers to build harmonies.
* **Cross-Platform:** Available as a web application, a standalone Windows executable (`.exe`), and an Android app (`.apk`).
* **Offline Ready:** Download your stems and layers directly to your device.

## Getting Started 🚀

### Web Development
1. Clone the repository: `git clone https://github.com/Chimthuwu/SensiblSound.git`
2. Install dependencies: `npm install`
3. Start the development server: `npm run dev`

### Building for Windows
Run the electron-builder script to package a standalone Windows executable:
```bash
npm run build
npm run tauri build
```
*(Check your local `package.json` and Tauri/Electron config for specific commands)*

### Building for Android
The Android app is powered by Capacitor. You will need Java 21 installed to compile the APK.
```bash
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

## How to Use 🎛️

1. **Load a Beat:** Click on the Backing Track area to upload your instrumental (`.mp3`, `.wav`).
2. **Monitor:** Click the "Monitor" button on the Vocal Track to hear your microphone input with effects applied. (Wear headphones to avoid feedback!)
3. **Record:** Hit the red "Record Live" button to capture your vocal take.
4. **Layer:** If you like the take, click "Keep as Layer" to move it down to the layers stack. You can then record another take over it!
5. **Save:** Download individual layers or your backing track directly using the download buttons.

## Tech Stack 🛠️

* **Frontend:** React, TypeScript, Vite, Tailwind CSS
* **Audio Engine:** Web Audio API, WaveSurfer.js
* **Mobile / Desktop:** Capacitor, Android SDK

## License 📄
MIT License
