# AI System Architecture

This document covers the AI routing, provider integrations, reasoning pipelines, and contextual state management within Ultron3.

## Overview
Ultron3 uses a dual-provider AI system that allows seamless hot-swapping between Google's **Gemini Live API** (for native audio duplex) and **Groq** (for ultra-fast LPU text generation). 

The system prioritizes extreme low latency, often employing secondary fallback models and reasoning tag stripping to achieve sub-second response times.

## `src/utils/ai.js` (The Router)
- **Purpose**: A centralized proxy to switch between Gemini and Groq based on user configuration (`storage.getPreferences().aiProvider`).
- **Core Methods**:
  - `sendImageForAnalysis`: Routes Base64 screenshots.
  - `getAvailableProvider`: Determines fallback. If Groq is selected but no key is present, it falls back to Gemini, and vice versa.

## `src/utils/gemini.js` (Google Integration)

Handles the complex WebSocket lifecycle for `gemini-2.5-flash-native-audio-latest`.

### Key Behaviors:
1. **Audio Streaming**:
   - Uses `client.live.connect` (via `@google/genai` SDK v1alpha).
   - Audio is pushed continuously via `send-mic-audio-content` (Renderer) and `startMacOSAudioCapture` (Main Process).
2. **Turn Management**:
   - Parses `serverContent.inputTranscription.results` for speaker diarization (`[Interviewer]: ...`).
   - Implements a custom **Debounce Timer** (Lines 340-360) on the incoming transcription. If speech pauses and ends in punctuation (`[.?!]`), it debounces for 350ms. Otherwise, it waits 900ms before triggering an answer.
   - If Groq is the selected provider, `gemini.js` *still maintains the WebSocket* for transcription, but passes the transcript to `groqAI.generateAnswer()` for the actual LLM completion.
3. **Session Reconnection**:
   - Implements `attemptReconnect()` (Lines 434-485) which retries up to 5 times.
   - It re-establishes context on reconnect by summarizing the last 20 valid turns and injecting them via `sendRealtimeInput({ text: contextMessage })`.

## `src/utils/groq.js` (Groq / OpenRouter Integration)

Optimized for pure speed using OpenAI-compatible endpoints (`https://api.groq.com/openai/v1`).

### Core Features:
1. **On-the-fly Tag Stripping**: 
   - `stripThinkingTags(text)` removes `<think>...</think>` blocks in real-time as the stream arrives. This prevents the UI from displaying internal reasoning.
2. **Fallback Mechanism**:
   - If the primary model (`qwen/qwen3.6-27b`) fails or hits a rate limit, the `generateAnswer` function immediately wraps it in a try/catch and falls back to `llama-3.1-8b-instant`.
3. **3-Stage Vision Pipeline (`analyzeScreenshot`)**:
   Because high-speed models often struggle with complex OCR and logical verification simultaneously, Ultron3 implements a multi-shot reasoning chain for image analysis:
   - **Stage 1 (Vision Extraction)**: Uses `qwen/qwen3.6-27b` to parse the image into raw text/code.
   - **Stage 2 (Initial Solve)**: Uses `openai/gpt-oss-120b` to solve the extracted problem while streaming the initial solution to the user.
   - **Stage 3 (Verification)**: Uses `openai/gpt-oss-120b` to verify the Stage 2 output against the user's prompt. It generates a verified solution and appends it to the UI stream.

## Context Management (`prompts.js` & `promptLogger.js`)
- `prompts.js` builds the final system prompt by combining the base persona (`interview`, `sales`, etc.) with user-defined custom instructions.
- `promptLogger.js` is a debugging utility that intercepts all outgoing payloads and writes them to the console, ensuring developers can see exactly what the LLM is receiving (including history truncations).
