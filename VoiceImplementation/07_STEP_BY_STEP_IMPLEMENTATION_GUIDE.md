# Step-by-Step Implementation Guide & AI Execution Prompt

## 1. How to Use this Guide in Another Project

Give this `VoiceImplementation/` folder to any AI coding assistant (or follow it as a human engineer) along with the prompt in Section 4 below.

---

## 2. Implementation Milestones & Verification Checklist

### Milestone 1: Audio Capture Engine
- [ ] Install Electron dependencies and set up `session.defaultSession.setDisplayMediaRequestHandler` in `main.js`.
- [ ] Implement `audioCapture.js` in Renderer with `AudioContext({ sampleRate: 24000 })` and `ScriptProcessorNode(4096, 1, 1)`.
- [ ] Implement `convertFloat32ToInt16()` and 0.1s chunk slicing (2400 samples / 4800 bytes).
- [ ] Add microphone capture fallback via `navigator.mediaDevices.getUserMedia()`.
- [ ] *Verification*: Verify audio chunks are streaming over IPC and log sample rates and RMS energy.

### Milestone 2: Gemini Multimodal Live Connection
- [ ] Install `@google/genai` (`^1.2.0`) and set up `GoogleGenAI` with `httpOptions: { apiVersion: 'v1alpha' }`.
- [ ] Configure `client.live.connect()` with `Modality.AUDIO`, speaker diarization (`minSpeakerCount: 2`), and system prompts.
- [ ] Route 24kHz PCM chunks via `session.sendRealtimeInput({ audio: { data, mimeType: 'audio/pcm;rate=24000' } })`.
- [ ] Parse `inputTranscription` and format speaker labels (`[Interviewer]` vs `[Candidate]`).
- [ ] Implement auto-reconnection with last 20 turns context replay (`buildContextMessage()`).
- [ ] *Verification*: Speak into microphone or play audio; verify live diarized text appears in console logs.

### Milestone 3: Dual-AI Groq Ultra-Fast Answering
- [ ] Create `sendToGroq(transcription)` triggered immediately upon speech turn completion.
- [ ] Connect to `POST https://api.groq.com/openai/v1/chat/completions` with SSE stream parser.
- [ ] Implement real-time `<think>` tag stripping so internal reasoning is hidden.
- [ ] Send streaming tokens to renderer via `new-response` and `update-response` IPC events.
- [ ] *Verification*: Verify responses stream into the UI in under 400ms.

### Milestone 4: Offline Local AI (Whisper + LLaMA)
- [ ] Implement linear interpolation 24kHz to 16kHz resampler (`resample24kTo16k`).
- [ ] Implement Voice Activity Detection (RMS energy + frame state machine).
- [ ] Integrate local `whisper-server` binary and send 16kHz WAV buffers on speech completion.
- [ ] Pipe transcription into local `llama-server` OpenAI-compatible endpoint.
- [ ] *Verification*: Test in airplane mode with no internet connection.

### Milestone 5: Stealth Window & Hotkeys
- [ ] Enable `mainWindow.setContentProtection(true)` to prevent screen capture in Zoom/Teams.
- [ ] Enable `mainWindow.setSkipTaskbar(true)` and click-through transparency.
- [ ] Register global hotkeys (`Ctrl+Enter`, `Ctrl+\`, `Ctrl+M`, `Ctrl+[`, `Ctrl+]`).

---

## 3. Copy-Paste AI Agent Prompt Template

When starting another project, paste the following prompt to your AI assistant:

```markdown
You are tasked with implementing a real-time voice listening and simultaneous AI answering feature in this codebase.

Please review the architectural blueprints and code modules in the `VoiceImplementation/` directory:
- `01_AUDIO_CAPTURE_PIPELINE.md`: Audio capture (Windows Loopback / macOS CoreAudio / Mic) at 24kHz 16-bit PCM.
- `02_GEMINI_LIVE_API_INTEGRATION.md`: Gemini Live WebSocket streaming, diarization, and auto-reconnect.
- `03_DUAL_AI_GROQ_ORCHESTRATION.md`: Groq LPU sub-second streaming answering with <think> tag filter.
- `04_LOCAL_OFFLINE_VOICE_STACK.md`: Offline Whisper.cpp + LLaMA.cpp with VAD.
- `05_ELECTRON_IPC_AND_LIFECYCLE.md`: IPC schema, stealth window protection, and hotkeys.
- `06_UI_STREAMING_AND_RENDERER.md`: Streaming Markdown rendering and waveform canvas.
- `starter_code/`: Complete modular implementations.

Task:
1. Integrate the audio capture engine to record 24kHz 16-bit mono PCM chunks (100ms duration).
2. Wire up the Gemini Live API bi-directional WebSocket client.
3. Wire up the Groq high-speed token streaming engine.
4. Set up the Electron IPC channels between Main and Renderer processes.
5. Create the floating stealth UI with streaming markdown and sound-reactive waveform.
```
