# Troubleshooting & Battle-Tested Error Fixes Playbook

This document contains every error encountered during the development and production hardening of the Real-Time Voice STT, Multi-Modal Vision, Groq Orchestration, and System Prompt Management pipelines, along with their exact root causes and proven solutions.

---

## 1. Gemini Live API Errors & Incompatibilities

### Bug 1.1: `responseModalities: [Modality.TEXT]` Session Crash

- **Error Message**:
    ```text
    [GeminiLive] Session closed: The requested combination of response modalities (TEXT) is not supported by the model. models/gemini-2.5-flash-native-audio
    ```
- **Root Cause**:
  The Gemini Multimodal Live WebSocket server requires `responseModalities: [Modality.AUDIO]` when using native audio models (`gemini-2.0-flash-exp` or native-audio variants). If you request `[Modality.TEXT]` alone, the server rejects the handshake with a 400 Bad Request error.
- **The Battle-Tested Fix**:
    1. Configure the Live WebSocket session with `responseModalities: [Modality.AUDIO]`.
    2. Enable audio transcription: `inputAudioTranscription: { enableSpeakerDiarization: true }` and `outputAudioTranscription: {}`.
    3. Intercept `inputAudioTranscription` chunks and debounce them (350ms on punctuation, 900ms otherwise) or wait for `turnComplete`.
    4. Delegate the actual text generation / answer generation to a dedicated HTTP stream (`gemini-2.5-flash` via `@google/genai`) or to **Groq LPU** (`openai/gpt-oss-120b` via OpenAI SDK).

```javascript
// Correct Live Session Config:
const session = await client.live.connect({
    model: 'gemini-2.0-flash-exp',
    callbacks: { onopen, onmessage, onerror, onclose },
    config: {
        responseModalities: [Modality.AUDIO], // MUST BE AUDIO
        inputAudioTranscription: {
            enableSpeakerDiarization: true,
            minSpeakerCount: 2,
            maxSpeakerCount: 2,
        },
        outputAudioTranscription: {},
        contextWindowCompression: { slidingWindow: {} },
        speechConfig: { languageCode: 'en-US' },
        systemInstruction: { parts: [{ text: systemPrompt }] },
    },
});
```

---

### Bug 1.2: Long Sessions (40–120 mins) Dropping WebSocket Connection

- **Error**: WebSocket closes unexpectedly due to idle timeouts or token limits during prolonged meetings.
- **The Fix**:
    1. Maintain a persistent `isUserClosing` flag to distinguish between user actions and unexpected drops.
    2. Implement an exponential-backoff auto-reconnector (up to 5 attempts).
    3. Store conversation turns in a local sliding history buffer (last 20 turns) so when reconnecting, the conversational context is fully preserved.

---

## 2. Windows Terminal Encoding & Unicode Mojibake

### Bug 2.1: Emojis Corrupting as `≡ƒÜÇ` in PowerShell / Windows Terminal

- **Error**:
    ```text
    ≡ƒÜÇ Shortcuts registered successfully
    ≡ƒö┤ [GeminiLive] Session closed
    ≡ƒùú∩╕Å HEARD / TRANSCRIBED: "..."
    ```
- **Root Cause**:
  Windows PowerShell / Command Prompt defaults to Code Page 437/1252 instead of UTF-8, causing multi-byte Unicode emojis to render as garbled mojibake symbols.
- **The Fix**:
    1. Replace all non-standard emojis in console logs with clean, ASCII-standard bracket identifiers:
        - `[VOICE LOG]`
        - `[SHORTCUT]`
        - `[Init]`
        - `[SCREENSHOT]`
        - `[PAYLOAD SENT TO AI]`
    2. In startup scripts / package.json, run with UTF-8 encoding support:
        ```json
        "scripts": {
          "start": "electron ."
        }
        ```

---

## 3. System Prompt & Instruction Persistence

### Bug 3.1: Developer Instructions & System Prompts Resetting on View Switch

- **Error**: Switching views in the UI caused custom developer instructions and base persona prompts to disappear or fail to save.
- **Root Cause**:
  The Web Component `CustomizeView` only read storage once during initial instantiation, not when reattached to the DOM (`connectedCallback`), and lacked a dedicated batch save handler.
- **The Fix**:
    1. Call `_loadFromStorage()` explicitly inside `connectedCallback()` in the view component.
    2. Add an explicit `💾 Save Instructions & Prompts` button with animated confirmation feedback.
    3. Store `fullSystemPrompt` in local preferences alongside `developerInstruction`, `systemInstruction`, and `customPrompt`.
    4. Ensure prompt builder (`getSystemPrompt`) checks for `fullSystemPromptOverride` first before assembling modular sections.

---

## 4. Multi-Stage Screenshot Vision Reasoning

### Bug 4.1: Missing AI Payload Logs During Screenshot Analysis

- **Error**:
  Terminal only showed:
    ```text
    [SCREENSHOT] PIPELINE STAGE 1: VISION EXTRACTION
    [SCREENSHOT] PIPELINE STAGE 2: INITIAL SOLVE
    [SCREENSHOT] PIPELINE STAGE 3: VERIFICATION
    ```
    without the prompt payload or candidate code.
- **The Fix**:
  Wire every pipeline stage to output both its stage header and the structured `[PAYLOAD SENT TO AI]` block:
    - **Stage 1 (Vision Extraction)**: `qwen/qwen3.6-27b` (Extracts raw code and question from image).
    - **Stage 2 (Initial Solve)**: `openai/gpt-oss-120b` (Solves problem with System Prompt + User Context).
    - **Stage 3 (Verification)**: `openai/gpt-oss-120b` (Double checks logic, verifies syntax, enforces exact user code matching).

---

## 5. UI Code Overflow on Narrow Teleprompter Windows

### Bug 5.1: Long Comments & Code Lines Getting Clipped

- **Error**: When the assistant window width was reduced (e.g. to 350px - 500px for stealth placement), long code comments were hidden past the right border.
- **The Fix**:
  Add universal word wrapping in `AssistantView.js` / CSS:
    ```css
    .markdown-content pre,
    .markdown-content code {
        white-space: pre-wrap !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
        max-width: 100%;
    }
    ```

---

## 6. Groq Thinking Tag Stripping

### Bug 6.1: `<think>` Tags Leaking into Real-Time Streaming UI

- **Error**: Models with internal reasoning (DeepSeek R1, Qwen 2.5 32B, GPT thinking variants) output `<think>...</think>` tags that cluttered the streaming response.
- **The Fix**:
  Implement dynamic regex & string parsing in `stripThinkingTags()` to filter out both complete `<think>...</think>` blocks and partial in-progress `<think>` tags during token-by-token streaming.
