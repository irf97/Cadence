# Cadence

**[Play Cadence in your browser](https://irf97.github.io/Cadence/)** — a one-camera, two-hand musical instrument. Click **Start camera & sound**, allow camera access, and choose an instrument. No calibration or account is needed.

## Playstyles

- **Phalanges:** two regions per finger: the tip and the combined lower two segments. Hold thumb contact to sustain.
- **Finger combinations:** every five-finger pattern—including the fist—has its own note. Both hands play together. Hide a hand or pause to silence.
- **Conductor:** five wide lanes, a visible preparation/strike threshold, and notes triggered by downward strokes.
- **Air keys:** the circle at your pinch selects pitch. Open, pinch the finger pads, hold, and release.
- **Orchestra journey:** a scored, untimed game through all four instruments. Either one or both hands can complete it.

## Download for Windows

**[Download the Windows source package](https://github.com/irf97/Cadence/archive/refs/heads/main.zip)** for the **lower-latency native option**. Extract the ZIP, install **Python 3.11 (64-bit)**, run **Setup Windows App.cmd** once, then run **Start Windows App.cmd**.

This is a downloadable Python/Qt app, not a standalone installer. Setup downloads its Python dependencies; the piano samples are included. The native version uses a direct WASAPI audio stream and raw camera frames, avoiding browser audio scheduling and frame transfer. It is the recommended option for latency-sensitive playing. Actual end-to-end latency depends on your camera, computer and audio device; a controlled browser/native comparison has not established a universal speed difference. Wired audio is preferable to Bluetooth when timing matters.

Close other camera applications before opening the Windows version. Only one Cadence Windows window can own its camera. Use **Details** to select a camera; **Start / retry camera** reconnects it. Local logs are written under `artifacts/` and are excluded from Git.

## Browser requirements and privacy

Use a recent Chrome or Edge browser with camera permission on the HTTPS Pages site. The initial download includes the MediaPipe model and WebAssembly runtime; allow time for **Loading hand tracking** on a slow connection. **Test sound** can be used without camera access. The browser needs an explicit click before starting audio and video.

Tracking and audio run on your device. Camera frames are passed to a local browser worker, not uploaded; no video/audio recordings are saved. Site assets are served by GitHub Pages. The shipped model, runtime and samples are local site assets rather than third-party runtime requests. Contact and depth remain camera estimates: hidden/overlapping fingers can still produce missed or unintended notes.

## Run the browser app locally

From the repository directory, run `python -m http.server 8000`, then open **http://localhost:8000/docs/**. Do not open `index.html` as a file: camera access, modules and model loading require an HTTP origin. No Python server is used on GitHub Pages.

`docs/` contains the playable static site. The root Python files contain only the latest native runtime; calibration experiments, personal profiles, old servers, virtual environments and recordings are excluded. Browser and native gesture logic are separate implementations of the same mappings; small timing and model-version differences are possible.

## Checks

Run `npm test` (Node 20+) for browser control tests. Tests cover mappings, intentional note edges, dropout handling and pitch selection. Automated tests and camera-startup checks do not establish recognition accuracy for every user's hands.

## Credits

Piano samples: **Salamander Grand Piano**, Alexander Holm, **CC BY 3.0**, distributed by [Tone.js audio](https://github.com/Tonejs/audio/tree/master/salamander). Original attribution and recording details are in [`docs/samples/README`](docs/samples/README).

Tracking: [Google MediaPipe](https://github.com/google-ai-edge/mediapipe), Apache 2.0. The browser includes Tasks Vision **0.10.14**, its SIMD/non-SIMD WASM runtime, and Google's hand-landmarker float16 model version 1. See [`docs/vendor/LICENSE`](docs/vendor/LICENSE). Native dependencies are pinned in `requirements-app.txt`.

Project context: the [University of Twente FIT Interactive Coaching System](https://github.com/utwente-interaction-lab/FIT-Interactive-Coaching-System) coursework. This musical interaction prototype is not a validated rehabilitation treatment.
