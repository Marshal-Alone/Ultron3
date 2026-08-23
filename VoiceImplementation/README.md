
# Real-Time Voice AI Implementation Architecture

## 1. Executive Summary & Core Concept

This document package provides the complete engineering blueprint for implementing a **real-time voice listening and simultaneous AI answering system**.

The system continuously listens to **System Audio** (what comes out of the computer speakers, e.g., an interviewer speaking on Zoom, Teams, Google Meet, YouTube, or phone call), and/or the **User's Microphone**, transcribes the speech in real-time, analyzes the conversation context, and **simultaneously streams back intelligent answers** using cutting-edge LLMs (Gemini Live, Groq, or Local Offline Models).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CROSS-PLATFORM AUDIO CAPTURE                       │
│                                                                             │
│  [Windows]  WebRTC getDisplayMedia + Electron 'loopback' Audio             │
│  [macOS]    Native Helper 'SystemAudioDump' (CoreAudio stdout stream)       │
│  [Linux]    WebRTC getDisplayMedia (Monitor of Audio Sink)                  │
│  [Microphone] navigator.mediaDevices.getUserMedia (Optional user mic)       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ 24,000 Hz, 16-bit Mono PCM (0.1s chunks)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ELECTRON MAIN PROCESS / IPC ROUTER                    │
│                                                                             │
│               Routes real-time binary audio chunks (Base64)                 │
└──────────────┬───────────────────────┬───────────────────────┬──────────────┘
               │                       │                       │
       [Mode 1: BYOK Dual-AI]   [Mode 2: Local AI]      [Mode 3: Cloud WS]
               │                       │                       │
               ▼                       ▼                       ▼
┌───────────────────────────┐ ┌───────────────────┐ ┌─────────────────────┐
│     GEMINI LIVE API       │ │  NATIVE LOCAL AI  │ │  CLOUD WEBSOCKET    │
│  (Bi-directional Stream)  │ │ (whisper.cpp +    │ │  (Managed Backend)  │
│                           │ │  llama.cpp)       │ │                     │
│  • 24kHz PCM Ingestion    │ │ • 24k->16k Resample│ │ • Binary PCM audio  │
│  • Speaker Diarization    │ │ • Energy-based VAD│ │ • JSON stream event │
│  • Live STT Stream        │ │ • Whisper STT     │ └──────────┬──────────┘
└─────────────┬─────────────┘ └─────────┬─────────┘            │
              │ Real-time Transcript     │ Transcribed Speech  │
              ▼                         ▼                      │
┌───────────────────────────┐ ┌───────────────────┐            │
│       GROQ FAST LLM       │ │    LOCAL LLAMA    │            │
│  (Qwen / Llama / OSS)     │ │   (GGUF Model)    │            │
│                           │ │                   │            │
│  • Sub-second response    │ │ • Local inference │            │
│  • Streaming SSE tokens   │ │ • Token streaming │            │
│  • <think> tag filter     │ └─────────┬─────────┘            │
└─────────────┬─────────────┘           │                      │
              │ Token Stream            │ Token Stream         │
              ▼                         ▼                      │
┌──────────────────────────────────────────────────────────────▼──────────────┐
│                            RENDERER UI (STREAMING)                          │
│                                                                             │
│  • Live Markdown Parsing (`marked.js`)                                      │
│  • Auto-scrolling, word-wrapped token rendering                             │
│  • Sound-reactive Waveform Particle Animation                               │
│  • Stealth Overlay (`setContentProtection`, Click-through, Global Hotkeys)  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Directory Structure of this Implementation Guide

This folder contains all the technical specifications, architectural diagrams, protocol details, and copy-paste starter code required to replicate this feature in any application:

| File / Folder                                                                           | Purpose                                                                                                                                                                      |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`01_AUDIO_CAPTURE_PIPELINE.md`](./01_AUDIO_CAPTURE_PIPELINE.md)                       | Deep-dive into Windows Loopback, macOS`SystemAudioDump`, Linux capture, Web Audio API conversion (Float32 to Int16 PCM 24kHz), and stereo-to-mono downmixing.              |
| [`02_GEMINI_LIVE_API_INTEGRATION.md`](./02_GEMINI_LIVE_API_INTEGRATION.md)             | Full implementation guide for Google Gemini Live Multimodal WebSocket API, speaker diarization, real-time input transcription, and auto-reconnect with context catch-up.     |
| [`03_DUAL_AI_GROQ_ORCHESTRATION.md`](./03_DUAL_AI_GROQ_ORCHESTRATION.md)               | The dual-engine architecture: Gemini Live handles continuous speech-to-text, while Groq generates instantaneous responses simultaneously via SSE streaming.                  |
| [`04_LOCAL_OFFLINE_VOICE_STACK.md`](./04_LOCAL_OFFLINE_VOICE_STACK.md)                 | 100% offline, private implementation using embedded`whisper.cpp` and `llama.cpp`, Voice Activity Detection (VAD), and automatic model management.                        |
| [`05_ELECTRON_IPC_AND_LIFECYCLE.md`](./05_ELECTRON_IPC_AND_LIFECYCLE.md)               | Electron process architecture,`setDisplayMediaRequestHandler`, stealth window overlay configurations (`setContentProtection`, `setSkipTaskbar`), and global shortcuts. |
| [`06_UI_STREAMING_AND_RENDERER.md`](./06_UI_STREAMING_AND_RENDERER.md)                 | Reactive UI components, streaming markdown rendering without layout jitter, sound-wave animations, audio mode toggles, and response turn history.                            |
| [`07_STEP_BY_STEP_IMPLEMENTATION_GUIDE.md`](./07_STEP_BY_STEP_IMPLEMENTATION_GUIDE.md) | Master checklist and copy-paste prompt template designed for an AI agent to build the feature from scratch in a target project.                                              |
| [`starter_code/`](./starter_code/)                                                     | Self-contained, production-ready, clean JavaScript modules ready to drop into another codebase.                                                                              |

---

## 3. Technology Stack & Key Specifications

### Audio Format Standards

- **Sample Rate**: `24,000 Hz` (24kHz) for Gemini Live & cross-platform capture. Resampled to `16,000 Hz` (16kHz) for Whisper STT.
- **Bit Depth**: 16-bit signed integer (`Int16Array`, Little-Endian).
- **Channels**: 1 (Mono). Stereo inputs are downmixed on the fly.
- **Chunk Duration**: `0.1 seconds` (100ms) = 2,400 samples per chunk = 4,800 bytes per chunk.
- **Transport**: Base64-encoded strings over Electron IPC, raw binary buffers over WebSockets.

### Cloud AI Stack

- **Gemini Live API**: `@google/genai` (SDK `v1.2.0+` using `v1alpha` Live Client protocol).
  - Model: `gemini-3.1-flash-live-preview` (or `gemini-2.0-flash-exp`).
  - Capabilities: Real-time bi-directional audio ingestion + Speaker Diarization (`enableSpeakerDiarization: true`).
- **Groq Inference API**: High-speed OpenAI-compatible Chat Completions endpoint (`POST https://api.groq.com/openai/v1/chat/completions`).
  - Models: `qwen/qwen3.6-27b`, `llama-3.3-70b-versatile`, `openai/gpt-oss-120b`.
  - Latency: First token in ~150-300ms.

### Local AI Stack

- **STT**: `whisper.cpp` native server (`tiny.en`, `base.en`, `small.en` GGML models).
- **LLM**: `llama.cpp` native server with multimodal support (`Qwen3.5-4B-GGUF:Q4_K_M`).
- **VAD**: Real-time energy (RMS) calculation state machine with configurable silence/speech frame thresholds.

---

## 4. How to Use this Implementation Package

1. **For AI Agents / Pair Programmers**:
   - Read [`07_STEP_BY_STEP_IMPLEMENTATION_GUIDE.md`](./07_STEP_BY_STEP_IMPLEMENTATION_GUIDE.md) first to get the implementation milestones and execution order.
   - Use the code in [`starter_code/`](./starter_code/) as modular building blocks.
2. **For Human Developers**:
   - Start with [`01_AUDIO_CAPTURE_PIPELINE.md`](./01_AUDIO_CAPTURE_PIPELINE.md) to understand audio hardware access across Windows, macOS, and Linux.
   - Follow with [`02_GEMINI_LIVE_API_INTEGRATION.md`](./02_GEMINI_LIVE_API_INTEGRATION.md) and [`03_DUAL_AI_GROQ_ORCHESTRATION.md`](./03_DUAL_AI_GROQ_ORCHESTRATION.md) for cloud streaming.
