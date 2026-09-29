# Cadence

**[Play Cadence in your browser](https://irf97.github.io/Cadence/)** — a one-camera musical instrument for your hands and forearms. Click **Start camera & sound**, allow camera access, and choose a playstyle. No calibration or account is needed.

## Playstyles

- **Body percussion (browser):** tap your hands together up/down, or lightly tap four zones along the opposite inner forearm. Choose drums, jazz piano chords with bass, classical piano + strings, do–re–mi, or a tap-driven song. Eight on-screen pads let you try the sounds without a camera.
- **Phalanges:** two regions per finger: the tip and the combined lower two segments. Hold thumb contact to sustain.
- **Finger combinations:** every five-finger pattern—including the fist—has its own note. Both hands play together. Hide a hand or pause to silence.
- **Conductor:** five wide lanes, a visible preparation/strike threshold, and notes triggered by downward strokes.
- **Air keys:** the circle at your pinch selects pitch. Open, pinch the finger pads, hold, and release.
- **Orchestra journey:** a scored, untimed game through all four instruments. Either one or both hands can complete it.

### Body percussion

Prop up the phone or webcam facing you and include both elbows and hands in the picture. Present your forearms toward the camera. Zones run **wrist → elbow** on each arm. Use light taps; separate between contacts to rearm. **Playing guide & sensitivity** adjusts the estimated contact distance. This mode uses the local Pose Landmarker instead of running both hand and body models. The original four playstyles still use the hand model; switching between them and body percussion restarts tracking.

| Sound | Forearm zones | Hands together |
| --- | --- | --- |
| Drums | Hi-hat, snare, tom, kick on either arm | Upward moving hand: kick; downward: snare |
| Jazz | Cmaj7, Dm7, Em7, Fmaj7 / G7, Am7, Bø7, Cmaj7, each with bass | Height selects the chord |
| Classical | C-major scale, piano + synthesized strings | Height selects pitch |
| Do–re–mi | Left: Do Re Mi Fa; right: Sol La Si Do | Height selects pitch |
| Play a song | Every tap advances the next note/chord | Same; you set the rhythm |

**Ode to Joy** is included as a public-domain melody. To play **He's a Pirate**, import a MIDI melody file in **Play a song → Import MIDI**, then choose its melody track. No recording or transcription of that theme is bundled. Format 0/1 MIDI files up to 4 MB are read locally; channel 10 percussion is excluded, simultaneous note-ons form chords, and note-off/timing data do not drive playback. Each accepted tap advances one group, using a short fixed release; this is a rhythm-controlled melody player, not a score-following or full MIDI sequencer. Rewind and optional looping are available. Imports are kept in memory for the current page session only.

Contact is inferred from 2D camera geometry, **not measured**. Overlapping limbs, foreshortening, concealed hands and poor lighting can cause misses or false taps. The camera cannot establish actual touch, inner-versus-outer arm orientation, or impact force. Expression follows estimated approach speed. A separation gate, confidence checks, cooldown and dropout reset suppress repeated and reacquisition hits. Real-user boxing/forearm recognition and end-to-end latency still need device trials. Wired audio is preferable when timing matters.

This addition is browser-only; the Windows runtime retains the original four playstyles.

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

Run `npm test` (Node 20+) for browser control tests. Tests cover mappings, intentional note edges, dropout handling, forearm zones, song advancement and bounded MIDI parsing. Automated tests and camera-startup checks do not establish recognition accuracy for every user's hands.

## Credits

Piano samples: **Salamander Grand Piano**, Alexander Holm, **CC BY 3.0**, distributed by [Tone.js audio](https://github.com/Tonejs/audio/tree/master/salamander). Original attribution and recording details are in [`docs/samples/README`](docs/samples/README).

Tracking: [Google MediaPipe](https://github.com/google-ai-edge/mediapipe), Apache 2.0. The browser includes Tasks Vision **0.10.14**, its SIMD/non-SIMD WASM runtime, Google's hand-landmarker float16 model version 1, and the [Pose Landmarker Lite float16 model version 1](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task). All models are served as local site assets. See [`docs/vendor/LICENSE`](docs/vendor/LICENSE). Native dependencies are pinned in `requirements-app.txt`. Drums are synthesized with Web Audio; no drum recordings are required.

Project context: the [University of Twente FIT Interactive Coaching System](https://github.com/utwente-interaction-lab/FIT-Interactive-Coaching-System) coursework. This musical interaction prototype is not a validated rehabilitation treatment.
