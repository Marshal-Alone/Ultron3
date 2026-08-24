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

## 1. Gemini Live API Integration (`src/utils/gemini.js`)
Ultron3 establishes a bidirectional WebSocket connection to the Gemini Multimodal Live API.

**Session Initialization Payload:**
```javascript
config: {
    responseModalities: [Modality.AUDIO], // We request AUDIO back
    outputAudioTranscription: {}, // Request transcript of AI's speech
    tools: enabledTools, // Google Search grounding
    inputAudioTranscription: {
        enableSpeakerDiarization: true,
        minSpeakerCount: 2,
        maxSpeakerCount: 2,
    },
    contextWindowCompression: { slidingWindow: {} },
    speechConfig: { languageCode: language },
    systemInstruction: {
        parts: [{ text: systemPrompt }],
    },
}
```

## 2. Groq AI Integration (`src/utils/groq.js`)
Used for ultra-fast text generation, bypassing the heavier Gemini Live API.

**Streaming API Call:**
```javascript
const stream = await client.chat.completions.create({
    model: 'qwen/qwen3.6-27b', // Default Groq model
    messages: [
        { role: 'system', content: systemPrompt },
        ...this.conversationHistory,
        { role: 'user', content: "[Interviewer]: What is your approach?" }
    ],
    stream: true,
    temperature: 0.3,
    max_tokens: 150, // Very short responses
});
```

## 3. Prompts (`src/utils/prompts.js`)
The `getSystemPrompt` function constructs the system instructions dynamically based on the selected profile.

**Example `interview` profile requirements:**
```markdown
**RESPONSE FORMAT REQUIREMENTS:**
- Keep responses SHORT and CONCISE (1-3 sentences max)
- Use **markdown formatting** for better readability
- Use **bold** for key points and emphasis
- Use bullet points (-) for lists when appropriate
- Focus on the most essential information only

**SEARCH TOOL USAGE:**
- If the interviewer mentions **recent events, news, or current trends**, **ALWAYS use Google search** to get up-to-date information
```

- `promptLogger.js` is a debugging utility that intercepts all outgoing payloads and writes them to the console, ensuring developers can see exactly what the LLM is receiving (including history truncations).
