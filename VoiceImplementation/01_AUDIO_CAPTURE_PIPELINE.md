# Cross-Platform Audio Capture Pipeline

## 1. Overview & Platform Challenges

To listen in real-time to a conversation, the system must capture **system audio output** (what other speakers on Zoom, Meet, YouTube, or phone calls are saying) as well as the **user's microphone input** (what the user is saying).

Capturing system audio is notoriously platform-dependent across operating systems:
- **Windows**: Modern Chromium/Electron provides built-in loopback audio capture via `desktopCapturer` and `navigator.mediaDevices.getDisplayMedia({ audio: true })`.
- **macOS**: Apple's security sandbox restricts loopback audio in WebRTC. A native CoreAudio capture helper daemon (`SystemAudioDump`) is required.
- **Linux**: Handled via PulseAudio / PipeWire monitor sinks in `navigator.mediaDevices.getDisplayMedia({ audio: true })`.

---

## 2. Operating System Capture Implementations

### A. Windows: Loopback Audio Capture

In Electron, system audio capture requires hooking into the Chromium display media request handler in the **Main Process**, and then requesting the stream in the **Renderer Process**.

#### 1. Main Process Hook (`window.js`):
```javascript
const { session, desktopCapturer } = require('electron');

// Intercept getDisplayMedia requests and supply the primary screen with loopback audio
session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
        desktopCapturer.getSources({ types: ['screen'] }).then(sources => {
            // 'loopback' enables capturing what is coming through the speakers
            callback({ video: sources[0], audio: 'loopback' });
        });
    },
    { useSystemPicker: false }
);
```

#### 2. Renderer Process Capture (`renderer.js`):
```javascript
const SAMPLE_RATE = 24000;

// Request the system audio stream
const mediaStream = await navigator.mediaDevices.getDisplayMedia({
    video: {
        frameRate: 1,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
    },
    audio: {
        sampleRate: SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
    },
});
```

---

### B. macOS: Native CoreAudio Daemon (`SystemAudioDump`)

Since macOS does not allow Chromium to tap into system loopback directly, a native CLI utility (`SystemAudioDump`) compiled against macOS `CoreAudio` / `ScreenCaptureKit` runs as a child process and streams raw PCM audio over `stdout`.

#### 1. Spawning the Daemon (`gemini.js`):
```javascript
const { spawn } = require('child_process');
const path = require('path');
const { app } = require('electron');

let systemAudioProc = null;

async function startMacOSAudioCapture(geminiSessionRef) {
    if (process.platform !== 'darwin') return false;

    // Clean up any stale processes first
    spawn('pkill', ['-f', 'SystemAudioDump'], { stdio: 'ignore' });

    let systemAudioPath = app.isPackaged
        ? path.join(process.resourcesPath, 'SystemAudioDump')
        : path.join(__dirname, '../assets', 'SystemAudioDump');

    systemAudioProc = spawn(systemAudioPath, [], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
    });

    const CHUNK_DURATION = 0.1; // 100ms
    const SAMPLE_RATE = 24000;
    const BYTES_PER_SAMPLE = 2; // 16-bit
    const CHANNELS = 2; // Stereo output from daemon
    const CHUNK_SIZE = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * CHUNK_DURATION; // 9600 bytes

    let audioBuffer = Buffer.alloc(0);

    systemAudioProc.stdout.on('data', data => {
        audioBuffer = Buffer.concat([audioBuffer, data]);

        while (audioBuffer.length >= CHUNK_SIZE) {
            const chunk = audioBuffer.slice(0, CHUNK_SIZE);
            audioBuffer = audioBuffer.slice(CHUNK_SIZE);

            // Convert Stereo to Mono (4800 bytes)
            const monoChunk = convertStereoToMono(chunk);

            // Send base64-encoded PCM chunk to Gemini / Groq / Local AI
            const base64Data = monoChunk.toString('base64');
            sendAudioToGemini(base64Data, geminiSessionRef);
        }

        // Prevent buffer overrun if consumer is slow
        const maxBufferSize = SAMPLE_RATE * BYTES_PER_SAMPLE * 1;
        if (audioBuffer.length > maxBufferSize) {
            audioBuffer = audioBuffer.slice(-maxBufferSize);
        }
    });

    return true;
}

function stopMacOSAudioCapture() {
    if (systemAudioProc) {
        systemAudioProc.kill('SIGTERM');
        systemAudioProc = null;
    }
}
```

#### 2. Downmixing Stereo to Mono (16-bit PCM):
```javascript
function convertStereoToMono(stereoBuffer) {
    const samples = stereoBuffer.length / 4; // 2 channels * 2 bytes = 4 bytes per sample pair
    const monoBuffer = Buffer.alloc(samples * 2);

    for (let i = 0; i < samples; i++) {
        // Read left channel (16-bit signed integer)
        const leftSample = stereoBuffer.readInt16LE(i * 4);
        monoBuffer.writeInt16LE(leftSample, i * 2);
    }

    return monoBuffer;
}
```

---

### C. Linux: WebRTC Loopback & Fallback

```javascript
try {
    mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 1, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: {
            sampleRate: 24000,
            channelCount: 1,
            echoCancellation: false, // Don't cancel system audio
            noiseSuppression: false,
            autoGainControl: false,
        },
    });
    setupLinuxSystemAudioProcessing();
} catch (systemAudioError) {
    // Fallback: Screen-only capture with explicit mic capture
    mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 1, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
    });
}
```

---

### D. User Microphone Capture (All Platforms)

When the user wants the AI to also listen to what they say into their microphone:

```javascript
async function startMicrophoneCapture() {
    const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            sampleRate: 24000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
        },
        video: false,
    });

    const micAudioContext = new AudioContext({ sampleRate: 24000 });
    const micSource = micAudioContext.createMediaStreamSource(micStream);
    const micProcessor = micAudioContext.createScriptProcessor(4096, 1, 1);

    let audioBuffer = [];
    const samplesPerChunk = 24000 * 0.1; // 2400 samples (0.1 sec)

    micProcessor.onaudioprocess = async e => {
        const inputData = e.inputBuffer.getChannelData(0); // Float32Array
        audioBuffer.push(...inputData);

        while (audioBuffer.length >= samplesPerChunk) {
            const chunk = audioBuffer.splice(0, samplesPerChunk);
            const pcmData16 = convertFloat32ToInt16(chunk);
            const base64Data = arrayBufferToBase64(pcmData16.buffer);

            // Send via IPC to main process
            await ipcRenderer.invoke('send-mic-audio-content', {
                data: base64Data,
                mimeType: 'audio/pcm;rate=24000',
            });
        }
    };

    micSource.connect(micProcessor);
    micProcessor.connect(micAudioContext.destination);
}
```

---

## 3. Web Audio Processing & Data Conversion

### Float32 to Int16 Linear PCM Conversion
Web Audio API's `ScriptProcessorNode` / `AudioWorklet` delivers audio samples as `Float32` in the range `[-1.0, 1.0]`. Gemini Live and Whisper require signed 16-bit integers (`Int16`, range `[-32768, 32767]`).

```javascript
function convertFloat32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        // Clamp to [-1, 1] to prevent integer overflow clipping
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
}
```

### Base64 Encoding Utility
```javascript
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
```

---

## 4. Audio Chunking & Timing Specifications

| Parameter | Value | Rationale |
|---|---|---|
| **Sample Rate** | `24,000 Hz` | Native input rate expected by Gemini Multimodal Live API. |
| **Bit Depth** | `16-bit` | Standard PCM format (`audio/pcm;rate=24000`). |
| **Channels** | `1 (Mono)` | Eliminates redundant channel bandwidth; AI models expect mono. |
| **Chunk Duration** | `0.1s (100ms)` | Optimal balance between network overhead and speech latency. |
| **Samples per Chunk** | `2,400 samples` | `24000 * 0.1 = 2400` |
| **Bytes per Chunk** | `4,800 bytes` | `2400 samples * 2 bytes = 4800` bytes |
| **ScriptProcessor Buffer**| `4096` | Prevents browser audio dropouts / glitching during heavy CPU loads. |

---

## 5. Standalone WAV Header Generator Utility

When saving debug audio or sending speech to Whisper endpoints, PCM must be wrapped with a valid 44-byte WAV header:

```javascript
function createWavHeader(dataSize, sampleRate = 24000, channels = 1, bitDepth = 16) {
    const byteRate = sampleRate * channels * (bitDepth / 8);
    const blockAlign = channels * (bitDepth / 8);
    const header = Buffer.alloc(44);

    // "RIFF" chunk
    header.write('RIFF', 0);
    header.writeUInt32LE(dataSize + 36, 4); // File size - 8
    header.write('WAVE', 8);

    // "fmt " sub-chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);          // Subchunk1Size (16 for PCM)
    header.writeUInt16LE(1, 20);           // AudioFormat (1 for PCM)
    header.writeUInt16LE(channels, 22);    // NumChannels
    header.writeUInt32LE(sampleRate, 24);  // SampleRate
    header.writeUInt32LE(byteRate, 28);    // ByteRate
    header.writeUInt16LE(blockAlign, 32);  // BlockAlign
    header.writeUInt16LE(bitDepth, 34);    // BitsPerSample

    // "data" sub-chunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return header;
}

function pcmToWav(pcmBuffer, sampleRate = 24000, channels = 1, bitDepth = 16) {
    const header = createWavHeader(pcmBuffer.length, sampleRate, channels, bitDepth);
    return Buffer.concat([header, pcmBuffer]);
}
```
