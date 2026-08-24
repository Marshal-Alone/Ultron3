# Screen Vision Architecture

This document describes how Ultron3 captures the user's screen and feeds it into the AI's vision pipeline for analysis.

## Core Capture Logic (`src/utils/renderer.js`)

Unlike traditional screenshot tools that use native OS APIs (which might trigger anti-cheat software), Ultron3 captures the screen natively within the Chromium engine using WebRTC.

### Initialization
When `startCapture()` is called, the renderer requests a screen stream via:
```javascript
navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 1, width: { ideal: 1920 }, height: { ideal: 1080 } },
    // ...
});
```
This stream (`mediaStream`) is kept alive in the background.

### Capture Process (`captureManualScreenshot`)
Instead of displaying the screen stream to the user, Ultron3 pipes it into a hidden HTML5 `<video>` element.

1. **Draw to Canvas**: When a screenshot is triggered (usually via a global keyboard shortcut), the current frame of the hidden `<video>` is drawn onto an offscreen `<canvas>`.
2. **Quality Adjustment**: The image quality can be dynamically adjusted (High=0.9, Medium=0.7, Low=0.5) to balance latency vs. OCR readability.
3. **Encoding**: The canvas is converted to a JPEG Blob, read as a Data URL, and stripped down to raw Base64.
4. **Routing**: The Base64 string is sent to the Main Process via the `send-image-content` IPC channel, along with the prompt (which includes User Custom Instructions).

## AI Vision Pipeline (`src/utils/groq.js`)

While Gemini can handle native image inputs, the Groq integration (`analyzeScreenshot`) uses a highly specialized **Multi-Stage Chain-of-Thought Pipeline** to solve code problems from images rapidly.

Because Groq's high-speed models (like `llama-3.1-8b-instant`) are excellent at text generation but sometimes struggle with complex zero-shot image-to-code tasks, the system splits the task into three distinct model calls:

### Stage 1: Vision Extraction
- **Model**: `qwen/qwen3.6-27b` (Vision capable).
- **Task**: Pure OCR and extraction. The system prompt explicitly demands: "Extract all the code and the exact question/problem statement from this image. Return only the raw text, no extra commentary."

### Stage 2: Initial Solve
- **Model**: `openai/gpt-oss-120b` (Text only, high logic).
- **Task**: The raw text from Stage 1 is fed into the logic model alongside the user's custom instructions. The AI streams its initial solution (and reasoning) back to the UI in real-time.

### Stage 3: Verification
- **Model**: `openai/gpt-oss-120b` (Text only, high logic).
- **Task**: The original extracted text (Stage 1) and the proposed solution (Stage 2) are fed *back* into the model for a self-reflection pass. It is asked to verify the solution against the prompt and output a final, verified markdown code block.

*Note: In Invigilator Mode, the prompt is overridden (`INVIGILATOR_ANSWER_PROMPT`) to completely suppress reasoning and output ONLY the raw code or answer, optimizing for physical typing speed.*
