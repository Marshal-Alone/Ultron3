# 100% Offline Local Voice Stack: Whisper.cpp + LLaMA.cpp + VAD

## 1. Overview & Offline Architecture

For situations requiring **absolute privacy**, **zero internet dependency**, or **no third-party API costs**, the system implements a native, embedded local AI pipeline using:
1. **Real-Time Voice Activity Detection (VAD)**: Continuously evaluates energy levels (RMS) to detect speech onset and conclusion.
2. **Audio Resampling Engine**: Resamples audio from 24,000 Hz to 16,000 Hz in real-time.
3. **`whisper.cpp` Server**: High-performance C++ speech-to-text inference running locally.
4. **`llama.cpp` Server**: Local GGUF LLM running with GPU/CPU acceleration.

```
[24kHz Mono PCM Audio Stream]
             │
             ▼
┌───────────────────────────────┐
│     Audio Resampler Engine    │  resample24kTo16k()
│      (24kHz ──► 16kHz)        │
└────────────┬──────────────────┘
             │ 16kHz PCM
             ▼
┌───────────────────────────────┐
│ Voice Activity Detector (VAD) │  calculateRms() & Frame State Machine
│    (Energy / Silence Gating)  │
└────────────┬──────────────────┘
             │ Speech segment complete (WAV Buffer)
             ▼
┌───────────────────────────────┐
│     Local Whisper Server      │  POST http://127.0.0.1:{port}/inference
│        (whisper.cpp)          │
└────────────┬──────────────────┘
             │ Transcribed Text
             ▼
┌───────────────────────────────┐
│       Local LLaMA Server      │  POST http://127.0.0.1:{port}/v1/chat/completions
│          (llama.cpp)          │  (SSE Streaming Output)
└────────────┬──────────────────┘
             │ Streaming Tokens
             ▼
┌───────────────────────────────┐
│          Renderer UI          │
└───────────────────────────────┘
```

---

## 2. Audio Resampling & Voice Activity Detection (VAD)

### A. Linear Interpolation Resampler (24kHz to 16kHz)
Whisper models strictly require 16,000 Hz single-channel audio. The resampler downsamples 24kHz to 16kHz on the fly:

```javascript
let resampleRemainder = Buffer.alloc(0);

function resample24kTo16k(inputBuffer) {
    const combined = Buffer.concat([resampleRemainder, inputBuffer]);
    const inputSamples = Math.floor(combined.length / 2);
    // Ratio 16k / 24k = 2 / 3
    const outputSamples = Math.floor((inputSamples * 2) / 3);
    const outputBuffer = Buffer.alloc(outputSamples * 2);

    for (let i = 0; i < outputSamples; i++) {
        const sourcePosition = (i * 3) / 2;
        const sourceIndex = Math.floor(sourcePosition);
        const fraction = sourcePosition - sourceIndex;
        
        const firstSample = combined.readInt16LE(sourceIndex * 2);
        const secondSample = sourceIndex + 1 < inputSamples 
            ? combined.readInt16LE((sourceIndex + 1) * 2) 
            : firstSample;
            
        const interpolated = Math.round(firstSample + fraction * (secondSample - firstSample));
        outputBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, interpolated)), i * 2);
    }

    const consumedInputSamples = Math.ceil((outputSamples * 3) / 2);
    const remainderStart = consumedInputSamples * 2;
    resampleRemainder = remainderStart < combined.length 
        ? combined.slice(remainderStart) 
        : Buffer.alloc(0);

    return outputBuffer;
}
```

### B. Energy / RMS Calculation
```javascript
function calculateRms(pcm16Buffer) {
    const samples = pcm16Buffer.length / 2;
    if (samples === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i < samples; i++) {
        const sample = pcm16Buffer.readInt16LE(i * 2) / 32768;
        sumSquares += sample * sample;
    }

    return Math.sqrt(sumSquares / samples);
}
```

### C. VAD State Machine
```javascript
const VAD_MODES = {
    NORMAL:          { energyThreshold: 0.010, speechFramesRequired: 3, silenceFramesRequired: 30 },
    AGGRESSIVE:      { energyThreshold: 0.015, speechFramesRequired: 2, silenceFramesRequired: 20 },
    VERY_AGGRESSIVE: { energyThreshold: 0.020, speechFramesRequired: 2, silenceFramesRequired: 15 },
};

let vadConfig = VAD_MODES.VERY_AGGRESSIVE;
let isSpeaking = false;
let speechBuffers = [];
let silenceFrameCount = 0;
let speechFrameCount = 0;

function processVad(pcm16kBuffer) {
    const rms = calculateRms(pcm16kBuffer);
    const isVoice = rms > vadConfig.energyThreshold;

    if (isVoice) {
        speechFrameCount += 1;
        silenceFrameCount = 0;

        if (!isSpeaking && speechFrameCount >= vadConfig.speechFramesRequired) {
            isSpeaking = true;
            speechBuffers = [];
            console.log('[LocalAI] Speech detected (RMS:', rms.toFixed(4), ')');
            sendToRenderer('update-status', 'Listening... (speech detected)');
        }
    } else {
        silenceFrameCount += 1;
        speechFrameCount = 0;

        if (isSpeaking && silenceFrameCount >= vadConfig.silenceFramesRequired) {
            isSpeaking = false;
            const audioData = Buffer.concat(speechBuffers);
            speechBuffers = [];
            console.log('[LocalAI] Speech ended. Total bytes:', audioData.length);
            sendToRenderer('update-status', 'Transcribing...');
            
            // Dispatch to Whisper
            handleSpeechEnd(audioData);
            return;
        }
    }

    if (isSpeaking) {
        speechBuffers.push(Buffer.from(pcm16kBuffer));
    }
}
```

---

## 3. Native Whisper Inference (`whisper.cpp`)

When speech ends, the audio buffer is packed into a standard 16kHz WAV file and sent to the local Whisper HTTP endpoint:

```javascript
function createWavBuffer(pcm16Buffer) {
    const header = Buffer.alloc(44);
    const byteRate = 16000 * 2; // 16kHz * 16-bit Mono

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm16Buffer.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);      // PCM
    header.writeUInt16LE(1, 22);      // Mono
    header.writeUInt32LE(16000, 24);  // 16kHz
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(2, 32);      // Block align
    header.writeUInt16LE(16, 34);     // Bits per sample
    header.write('data', 36);
    header.writeUInt32LE(pcm16Buffer.length, 40);

    return Buffer.concat([header, pcm16Buffer]);
}

async function transcribeAudio(pcm16kBuffer, whisperBaseUrl) {
    const wavBuffer = createWavBuffer(pcm16kBuffer);
    const formData = new FormData();
    formData.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'speech.wav');
    formData.append('response_format', 'json');
    formData.append('temperature', '0.0');
    formData.append('language', 'en');

    const response = await fetch(`${whisperBaseUrl}/inference`, {
        method: 'POST',
        body: formData,
    });

    const result = await response.json();
    return result.text?.trim() || '';
}
```

---

## 4. Native LLaMA Server Inference (`llama.cpp`)

Once transcribed, the text is passed to the local `llama-server` process exposing an OpenAI-compatible `/v1/chat/completions` endpoint:

```javascript
async function requestLlama(messages, llamaBaseUrl, onToken) {
    const response = await fetch(`${llamaBaseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'local',
            messages,
            stream: true,
            max_tokens: 2048,
        }),
    });

    const decoder = new TextDecoder();
    let pendingText = '';
    let fullText = '';

    for await (const chunk of response.body) {
        pendingText += decoder.decode(chunk, { stream: true });
        const lines = pendingText.split('\n');
        pendingText = lines.pop() || '';

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') continue;

            const event = JSON.parse(data);
            const token = event.choices?.[0]?.delta?.content || '';
            if (token) {
                fullText += token;
                onToken(fullText);
            }
        }
    }

    return fullText;
}
```

---

## 5. Server Lifecycle & Dynamic Port Allocation

```javascript
const net = require('net');
const { spawn } = require('child_process');

// Find an ephemeral free port dynamically
async function getAvailablePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(() => resolve(address.port));
        });
    });
}

function startNativeServer({ executablePath, serverArguments, name }) {
    const childProcess = spawn(executablePath, serverArguments, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });

    childProcess.stdout.on('data', data => console.log(`[${name}] ${data}`));
    childProcess.stderr.on('data', data => console.error(`[${name}] ${data}`));
    return childProcess;
}
```
