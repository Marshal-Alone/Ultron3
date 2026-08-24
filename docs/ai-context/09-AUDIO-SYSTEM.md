# Audio System Architecture

This document details how Ultron3 intercepts, processes, and transmits audio to the AI engines, bypassing normal OS protections for system audio capture.

## Capture Mechanisms by OS

Audio capture is highly platform-dependent in Electron. Ultron3 uses different strategies depending on the host OS, managed primarily in `src/utils/renderer.js` (`startCapture`).

### 1. Windows
- **System Audio**: Captured natively using the `getDisplayMedia` API with `{ audio: true }`. This creates a loopback of the system's output.
- **Processing**: The loopback stream is fed into a Web Audio API `AudioContext`. An `AudioWorklet` (or `ScriptProcessorNode`) slices it into 100ms chunks, converts it, and sends it via IPC (`send-audio-content`).

### 2. macOS (The `SystemAudioDump` Hack)
macOS strictly forbids apps from capturing system audio without a kernel extension (like BlackHole) or specialized screen recording permissions that don't easily allow loopback.
- **Solution**: Ultron3 relies on an external compiled Swift binary located at `src/bin/SystemAudioDump` (for ARM64/Intel).
- **Behavior**: The Main Process (`startMacOSAudioCapture` in `gemini.js`) spawns this binary as a child process. The binary captures the raw PCM audio from the macOS CoreAudio framework and pipes it to stdout. The Node.js process reads this stdout stream, buffers it, and forwards it to Gemini.
- **Renderer Audio**: On macOS, the renderer's `getDisplayMedia` request is explicitly set to `{ audio: false }` to avoid conflict.

### 3. Linux
- Similar to Windows, attempts to use `getDisplayMedia` for system audio. If it fails (common on Wayland), it falls back to microphone-only or fails silently.

## Audio Processing Pipeline

Regardless of the source, audio must be formatted correctly for the Gemini Live API.

### `src/audioUtils.js`
This file contains the low-level DSP (Digital Signal Processing) functions.

1. **Conversion**: 
   - `convertFloat32ToInt16`: Converts the [-1.0, 1.0] Float32 arrays from the Web Audio API to standard 16-bit PCM ([-32768, 32767]).
   - `convertStereoToMono`: Downmixes stereo streams to mono (required by Gemini).
   - `resample24kTo16k`: Linear interpolation to downsample 24kHz audio to 16kHz.

2. **Voice Activity Detection (VAD)**:
   - Contains a custom `VadResampler` class.
   - Computes RMS (Root Mean Square) energy of the audio chunks.
   - Identifies speech boundaries (speech start vs. silence frames) to avoid sending empty noise or to trigger auto-answering when the user stops speaking.

## Data Flow (End-to-End)
1. **Source**: Browser `AudioContext` (Win/Lin) OR `SystemAudioDump` stdout (Mac).
2. **Chunking**: Buffered into small arrays.
3. **Format**: Converted to 16-bit Mono PCM.
4. **Encoding**: Base64 Encoded (`arrayBufferToBase64`).
5. **Transport (Renderer -> Main)**: IPC message `send-mic-audio-content` or `send-audio-content`.
6. **Transport (Main -> AI)**: `geminiSessionRef.current.sendRealtimeInput({ mediaChunks: [...] })`.
