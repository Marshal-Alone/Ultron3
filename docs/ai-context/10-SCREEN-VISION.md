# Screen Vision Architecture

This document describes how Ultron3 captures the user's screen and feeds it into the AI's vision pipeline for analysis.

## Core Capture Logic (`src/utils/renderer.js`)

Unlike traditional screenshot tools that use native OS APIs (which might trigger anti-cheat software), Ultron3 captures the screen natively within the Chromium engine using WebRTC.

### Initialization
When `startCapture()` is called, the renderer requests a screen stream via:
```javascript
mediaStream = await navigator.mediaDevices.getDisplayMedia({
    video: {
        frameRate: 1,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        displaySurface: 'monitor',
    }
});
```

### Capture Process (`captureManualScreenshot`)
Instead of displaying the screen stream to the user, Ultron3 pipes it into a hidden HTML5 `<video>` element.
```javascript
const video = document.createElement('video');
video.srcObject = mediaStream;
video.play();

// Draw to offscreen canvas
const canvas = document.createElement('canvas');
canvas.width = video.videoWidth;
canvas.height = video.videoHeight;
const ctx = canvas.getContext('2d');
ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

// Extract base64 payload
const base64Image = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
ipcRenderer.send('send-image-content', { imageBase64: base64Image, prompt });
```

## AI Vision Pipeline (`src/utils/groq.js`)

While Gemini can handle native image inputs, the Groq integration (`analyzeScreenshot`) uses a highly specialized **Multi-Stage Chain-of-Thought Pipeline** to solve code problems from images rapidly.

### Stage 1: Vision Extraction
- **Model**: `qwen/qwen3.6-27b` (Vision capable).
- **System Prompt**: `'Extract all the code and the exact question/problem statement from this image. Return only the raw text, no extra commentary.'`

### Stage 2: Initial Solve
- **Model**: `openai/gpt-oss-120b` (Text only, high logic).
- **User Prompt Payload**:
```markdown
Here is the text/code extracted from an image:
[EXTRACTED_TEXT]

Solve the problem or answer the question according to the system instructions. Explain your reasoning first step-by-step, then give the final code.

CRITICAL RULES FOR FINAL CODE:
1. If the image shows an online editor with a pre-defined class or method, output ONLY the exact logic needed to fill in the blanks.
2. Do NOT include any comments in your code.
3. Output only the pure code inside a single markdown code block.
```

### Stage 3: Verification
- **Model**: `openai/gpt-oss-120b` (Text only, high logic).
- **System Prompt Payload**: `'Carefully verify this is correct according to these instructions: [USER_CUSTOM_PROMPT]'`
- **User Prompt Payload**: `'Here is the extracted text: [EXTRACTED_TEXT] \n\nHere is the proposed solution: [STAGE_2_SOLUTION]\n\nOutput only the final verified markdown code block.'`

*Note: In Invigilator Mode, the prompt is overridden (`INVIGILATOR_ANSWER_PROMPT`) to completely suppress reasoning and output ONLY the raw code or answer, optimizing for physical typing speed.*
