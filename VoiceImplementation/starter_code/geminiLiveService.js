/**
 * geminiLiveService.js
 * Node.js backend service for Google Gemini Multimodal Live API.
 * Manages WebSocket connection, 24kHz audio ingestion, speaker diarization, and auto-reconnect.
 */

const { GoogleGenAI, Modality } = require('@google/genai');

class GeminiLiveService {
    constructor() {
        this.session = null;
        this.apiKey = null;
        this.systemPrompt = '';
        this.language = 'en-US';
        this.model = 'gemini-3.1-flash-live-preview';
        this.conversationHistory = [];
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.isUserClosing = false;
        
        // Event callbacks
        this.onTranscript = null;    // (text, speakerId) => void
        this.onModelOutput = null;   // (chunk) => void
        this.onTurnComplete = null;  // () => void
        this.onStatus = null;        // (statusString) => void
    }

    /**
     * Initializes and connects to the Gemini Live session.
     */
    async connect({ apiKey, systemPrompt, language = 'en-US', model = 'gemini-3.1-flash-live-preview' }) {
        this.apiKey = apiKey;
        this.systemPrompt = systemPrompt;
        this.language = language;
        this.model = model;
        this.isUserClosing = false;

        const client = new GoogleGenAI({
            vertexai: false,
            apiKey: this.apiKey,
            httpOptions: { apiVersion: 'v1alpha' },
        });

        try {
            this.session = await client.live.connect({
                model: this.model,
                callbacks: {
                    onopen: () => {
                        console.log('[GeminiLive] WebSocket connected');
                        this.reconnectAttempts = 0;
                        this.onStatus?.('Live session connected');
                    },
                    onmessage: (message) => this._handleMessage(message),
                    onerror: (error) => {
                        console.error('[GeminiLive] Error:', error.message);
                        this.onStatus?.(`Error: ${error.message}`);
                    },
                    onclose: (event) => {
                        console.log('[GeminiLive] Closed:', event.reason);
                        if (!this.isUserClosing) {
                            this._attemptReconnect();
                        } else {
                            this.onStatus?.('Session closed');
                        }
                    },
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    proactivity: { proactiveAudio: true },
                    outputAudioTranscription: {},
                    inputAudioTranscription: {
                        enableSpeakerDiarization: true,
                        minSpeakerCount: 2,
                        maxSpeakerCount: 2,
                    },
                    contextWindowCompression: { slidingWindow: {} },
                    speechConfig: { languageCode: this.language },
                    systemInstruction: {
                        parts: [{ text: this.systemPrompt }],
                    },
                },
            });

            return true;
        } catch (error) {
            console.error('[GeminiLive] Initialization failed:', error);
            this.onStatus?.('Failed to connect to Gemini Live');
            return false;
        }
    }

    _handleMessage(message) {
        // 1. Process Diarized Input Transcription
        if (message.serverContent?.inputTranscription?.results) {
            for (const result of message.serverContent.inputTranscription.results) {
                if (result.transcript) {
                    this.onTranscript?.(result.transcript, result.speakerId || 1);
                }
            }
        } else if (message.serverContent?.inputTranscription?.text) {
            this.onTranscript?.(message.serverContent.inputTranscription.text, 1);
        }

        // 2. Process Gemini Model Spoken Output Transcript
        if (message.serverContent?.outputTranscription?.text) {
            this.onModelOutput?.(message.serverContent.outputTranscription.text);
        }

        // 3. Process Turn Complete
        if (message.serverContent?.turnComplete) {
            this.onTurnComplete?.();
            this.onStatus?.('Listening...');
        }
    }

    /**
     * Streams 24kHz Base64 PCM audio chunk into Gemini Live.
     * @param {string} base64PcmData
     */
    async sendAudio(base64PcmData) {
        if (!this.session) return;
        try {
            await this.session.sendRealtimeInput({
                audio: {
                    data: base64PcmData,
                    mimeType: 'audio/pcm;rate=24000',
                },
            });
        } catch (error) {
            console.error('[GeminiLive] Send audio error:', error);
        }
    }

    /**
     * Sends a text message into the live session.
     * @param {string} text
     */
    async sendText(text) {
        if (!this.session) return;
        try {
            await this.session.sendRealtimeInput({ text });
        } catch (error) {
            console.error('[GeminiLive] Send text error:', error);
        }
    }

    /**
     * Auto-reconnects and restores conversation history.
     */
    async _attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.onStatus?.('Connection lost. Max reconnect attempts reached.');
            return;
        }

        this.reconnectAttempts++;
        this.onStatus?.(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        await new Promise(r => setTimeout(r, 2000));

        const success = await this.connect({
            apiKey: this.apiKey,
            systemPrompt: this.systemPrompt,
            language: this.language,
            model: this.model,
        });

        if (success && this.conversationHistory.length > 0) {
            // Context restoration message
            const contextLines = this.conversationHistory.slice(-20).map(
                turn => `[Interviewer]: ${turn.transcription}\n[Answer]: ${turn.aiResponse}`
            );
            const restoreMsg = `Session reconnected. Here is the conversation context so far:\n\n${contextLines.join('\n\n')}\n\nContinue assisting.`;
            await this.sendText(restoreMsg);
        }
    }

    saveTurn(transcription, aiResponse) {
        this.conversationHistory.push({
            transcription,
            aiResponse,
            timestamp: Date.now(),
        });
    }

    async close() {
        this.isUserClosing = true;
        if (this.session) {
            try {
                await this.session.close();
            } catch (e) {}
            this.session = null;
        }
        console.log('[GeminiLive] Session closed');
    }
}

module.exports = GeminiLiveService;
