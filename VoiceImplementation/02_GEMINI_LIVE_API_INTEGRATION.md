# Gemini Live API Integration Guide

## 1. Overview & Google GenAI Live Architecture

The Google Gemini Multimodal Live API provides a low-latency, full-duplex WebSocket connection enabling continuous real-time streaming of audio into Gemini while receiving real-time transcription, speaker diarization, and generated responses.

In this architecture, Gemini Live serves two critical roles:
1. **Real-time Speech Recognition & Speaker Diarization**: Continuously transcribing who is speaking (`[Interviewer]` vs `[Candidate]`).
2. **Conversation Orchestrator**: Handling turn completions and acting as the primary conversational bridge.

---

## 2. Dependencies & Initialization

### Installation
```bash
npm install @google/genai@^1.2.0 ws
```

### SDK Client Configuration
```javascript
const { GoogleGenAI, Modality } = require('@google/genai');

const client = new GoogleGenAI({
    vertexai: false,
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { apiVersion: 'v1alpha' }, // Live API requires v1alpha
});
```

---

## 3. Establishing the Live Session

### Session Connection & Configuration
```javascript
async function initializeGeminiSession(apiKey, customPrompt = '', profile = 'interview', language = 'en-US') {
    const client = new GoogleGenAI({
        vertexai: false,
        apiKey: apiKey,
        httpOptions: { apiVersion: 'v1alpha' },
    });

    const systemPrompt = getSystemPrompt(profile, customPrompt);

    const session = await client.live.connect({
        model: 'gemini-3.1-flash-live-preview', // or gemini-2.0-flash-exp
        callbacks: {
            onopen: handleSessionOpen,
            onmessage: handleSessionMessage,
            onerror: handleSessionError,
            onclose: handleSessionClose,
        },
        config: {
            // Audio response modality (enables speech transcription)
            responseModalities: [Modality.AUDIO],
            proactivity: { proactiveAudio: true },
            outputAudioTranscription: {}, // Request text transcript of model output
            
            // Speaker Diarization: distinguishes between multiple speakers
            inputAudioTranscription: {
                enableSpeakerDiarization: true,
                minSpeakerCount: 2,
                maxSpeakerCount: 2,
            },
            
            // Prevent context overflow during long sessions
            contextWindowCompression: { slidingWindow: {} },
            speechConfig: { languageCode: language },
            
            // System instructions defining the persona & response brevity
            systemInstruction: {
                parts: [{ text: systemPrompt }],
            },
            
            // Optional real-time tools (e.g. Google Search)
            tools: [{ googleSearch: {} }],
        },
    });

    return session;
}
```

---

## 4. Real-Time Event Handling (`onmessage`)

The `onmessage` callback receives structured payloads from Google's Live server:

```javascript
let currentTranscription = '';
let messageBuffer = '';
let groqRequestStartedForTurn = false;

function handleSessionMessage(message) {
    // 1. INPUT TRANSCRIPTION: What was spoken into the system / mic
    if (message.serverContent?.inputTranscription?.results) {
        // Formatted with speaker tags (e.g., [Interviewer]: "Tell me about yourself")
        currentTranscription += formatSpeakerResults(message.serverContent.inputTranscription.results);
    } else if (message.serverContent?.inputTranscription?.text) {
        const text = message.serverContent.inputTranscription.text;
        if (text.trim() !== '') {
            currentTranscription += text;
        }
    }

    // 2. TRIGGER DUAL-AI FAST RESPONSE (e.g. Groq)
    if (message.serverContent?.inputTranscription) {
        // Send the transcription to Groq for sub-second answering
        sendFinalTranscriptionToGroq();
    }

    // 3. OUTPUT TRANSCRIPTION: Gemini's own generated answer (Fallback if no Groq key)
    if (!hasGroqKey() && message.serverContent?.outputTranscription?.text) {
        const isFirstChunk = messageBuffer === '';
        messageBuffer += message.serverContent.outputTranscription.text;
        sendToRenderer(isFirstChunk ? 'new-response' : 'update-response', messageBuffer);
    }

    // 4. GENERATION COMPLETE: Model finished outputting response
    if (message.serverContent?.generationComplete) {
        if (currentTranscription.trim() !== '') {
            if (!hasGroqKey() && messageBuffer.trim() !== '') {
                saveConversationTurn(currentTranscription, messageBuffer);
            }
            currentTranscription = '';
        }
        messageBuffer = '';
    }

    // 5. TURN COMPLETE: Speaker finished speaking, ready for next input
    if (message.serverContent?.turnComplete) {
        currentTranscription = '';
        messageBuffer = '';
        groqRequestStartedForTurn = false;
        sendToRenderer('update-status', 'Listening...');
    }
}
```

---

## 5. Speaker Diarization Formatting

Gemini Live provides speaker tags with integer IDs (`speakerId: 1`, `speakerId: 2`). In interview or meeting contexts:
- `speakerId: 1` -> **Interviewer** / Other Speaker
- `speakerId: 2` -> **Candidate** / User

```javascript
function formatSpeakerResults(results) {
    let text = '';
    for (const result of results) {
        if (result.transcript && result.speakerId) {
            const speakerLabel = result.speakerId === 1 ? 'Interviewer' : 'Candidate';
            text += `[${speakerLabel}]: ${result.transcript}\n`;
        }
    }
    return text;
}
```

---

## 6. Streaming Audio Chunks to the Session

Audio captured from Windows Loopback or macOS `SystemAudioDump` is converted to Base64 and sent directly to Gemini:

```javascript
async function sendAudioToGemini(base64PcmData, geminiSessionRef) {
    if (!geminiSessionRef.current) return;

    try {
        await geminiSessionRef.current.sendRealtimeInput({
            audio: {
                data: base64PcmData,
                mimeType: 'audio/pcm;rate=24000',
            },
        });
    } catch (error) {
        console.error('Error sending audio to Gemini Live:', error);
    }
}
```

---

## 7. Automatic Reconnection & Context Restoration

WebSocket connections over public internet or long-running calls can experience transient dropouts. To ensure zero data loss during an ongoing conversation, the system maintains a turn-by-turn history and injects it back upon reconnect.

```javascript
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 2000;
let conversationHistory = []; // Array of { transcription, ai_response, timestamp }

function buildContextMessage() {
    const lastTurns = conversationHistory.slice(-20);
    const validTurns = lastTurns.filter(turn => turn.transcription?.trim() && turn.ai_response?.trim());

    if (validTurns.length === 0) return null;

    const contextLines = validTurns.map(
        turn => `[Interviewer]: ${turn.transcription.trim()}\n[Your answer]: ${turn.ai_response.trim()}`
    );

    return `Session reconnected. Here's the conversation so far:\n\n${contextLines.join('\n\n')}\n\nContinue from here.`;
}

async function attemptReconnect(sessionParams) {
    reconnectAttempts++;
    console.log(`Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

    sendToRenderer('update-status', `Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY));

    try {
        const session = await initializeGeminiSession(
            sessionParams.apiKey,
            sessionParams.customPrompt,
            sessionParams.profile,
            sessionParams.language
        );

        if (session) {
            global.geminiSessionRef.current = session;

            // Re-inject conversation history so the model knows prior context
            const contextMessage = buildContextMessage();
            if (contextMessage) {
                await session.sendRealtimeInput({ text: contextMessage });
            }

            reconnectAttempts = 0;
            sendToRenderer('update-status', 'Reconnected! Listening...');
            return true;
        }
    } catch (error) {
        console.error(`Reconnection attempt ${reconnectAttempts} failed:`, error);
    }

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        return attemptReconnect(sessionParams);
    }

    sendToRenderer('reconnect-failed', {
        message: 'Unable to reconnect after 3 attempts. Please check your internet connection.',
    });
    return false;
}
```
