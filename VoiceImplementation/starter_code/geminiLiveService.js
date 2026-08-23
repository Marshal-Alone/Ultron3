/**
 * geminiLiveService.js
 * Node.js backend service for Google Gemini Multimodal Live API.
 * Manages WebSocket connection, 24kHz audio ingestion, speaker diarization,
 * adaptive speech debouncing, and auto-reconnect.
 */

const { GoogleGenAI, Modality } = require('@google/genai');
const PromptLogger = require('./promptLogger');

class GeminiLiveService {
    constructor() {
        this.session = null;
        this.client = null;
        this.apiKey = null;
        this.systemPrompt = '';
        this.language = 'en-US';
        this.model = 'gemini-2.0-flash-exp';
        this.conversationHistory = [];
        this.pendingSpeechTranscript = '';
        this.speechDebounceTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.isUserClosing = false;
        this.isGeminiGenerating = false;

        // Event callbacks
        this.onTranscript = null; // (text, speakerLabel) => void
        this.onModelOutput = null; // (token, isFirst) => void
        this.onTurnComplete = null; // (fullAnswer) => void
        this.onStatus = null; // (statusString) => void
        this.externalAnswerHandler = null; // Optional external handler (e.g. Groq)
    }

    /**
     * Initializes and connects to the Gemini Live session.
     */
    async connect({ apiKey, systemPrompt, language = 'en-US', model = 'gemini-2.0-flash-exp', externalAnswerHandler = null }) {
        this.apiKey = apiKey;
        this.systemPrompt = systemPrompt;
        this.language = language;
        this.model = model;
        this.externalAnswerHandler = externalAnswerHandler;
        this.isUserClosing = false;

        this.client = new GoogleGenAI({
            apiKey: this.apiKey,
            httpOptions: { apiVersion: 'v1alpha' },
        });

        console.log(`[VOICE LOG] Initializing Live Session | Model: ${this.model}`);

        try {
            this.session = await this.client.live.connect({
                model: this.model,
                callbacks: {
                    onopen: () => {
                        console.log('[VOICE LOG] WebSocket connected & ready for audio streaming');
                        this.reconnectAttempts = 0;
                        this.onStatus?.('Listening...');
                    },
                    onmessage: message => this._handleMessage(message),
                    onerror: error => {
                        console.error('[VOICE LOG] Session error:', error.message);
                        this.onStatus?.(`Error: ${error.message}`);
                    },
                    onclose: event => {
                        console.log('[VOICE LOG] Session closed:', event.reason || '');
                        if (!this.isUserClosing) {
                            this._attemptReconnect();
                        } else {
                            this.onStatus?.('Session closed');
                        }
                    },
                },
                config: {
                    // CRITICAL: Live WebSocket MUST use Modality.AUDIO
                    responseModalities: [Modality.AUDIO],
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
            console.error('[VOICE LOG] Initialization failed:', error);
            this.onStatus?.('Failed to connect to Gemini Live');
            return false;
        }
    }

    _handleMessage(message) {
        let newTranscript = '';

        // 1. Process Diarized Input Transcription
        if (message.serverContent?.inputTranscription?.results) {
            for (const result of message.serverContent.inputTranscription.results) {
                if (result.transcript) {
                    const speaker = result.speakerId === 1 ? 'Interviewer' : 'Candidate';
                    const text = `[${speaker}]: ${result.transcript} `;
                    newTranscript += text;
                    this.onTranscript?.(result.transcript, speaker);
                }
            }
            this.pendingSpeechTranscript += newTranscript;
        } else if (message.serverContent?.inputTranscription?.text) {
            newTranscript = message.serverContent.inputTranscription.text;
            this.pendingSpeechTranscript += newTranscript;
            this.onTranscript?.(newTranscript, 'User');
        }

        // 2. Adaptive Speech Debounce (350ms on punctuation, 900ms otherwise)
        if (newTranscript && newTranscript.trim() !== '') {
            if (this.speechDebounceTimer) {
                clearTimeout(this.speechDebounceTimer);
                this.speechDebounceTimer = null;
            }

            const trimmed = this.pendingSpeechTranscript.trim();
            const hasPunctuationEnd = /[.?!]\s*$/.test(trimmed);
            const debounceDelay = hasPunctuationEnd ? 350 : 900;

            this.speechDebounceTimer = setTimeout(() => {
                if (this.pendingSpeechTranscript.trim().length > 3) {
                    const question = this.pendingSpeechTranscript.trim();
                    this.pendingSpeechTranscript = '';
                    this._dispatchAnswer(question);
                }
            }, debounceDelay);
        }

        // 3. Process Turn Complete
        if (message.serverContent?.turnComplete) {
            if (this.pendingSpeechTranscript.trim().length > 3) {
                if (this.speechDebounceTimer) {
                    clearTimeout(this.speechDebounceTimer);
                    this.speechDebounceTimer = null;
                }
                const question = this.pendingSpeechTranscript.trim();
                this.pendingSpeechTranscript = '';
                this._dispatchAnswer(question);
            }
            this.onStatus?.('Listening...');
        }
    }

    async _dispatchAnswer(question) {
        this.onStatus?.('Thinking...');

        if (this.externalAnswerHandler) {
            return this.externalAnswerHandler(question, this.systemPrompt);
        }

        return this.streamGeminiTextAnswer(question);
    }

    /**
     * Fallback text answering via Gemini 2.5 Flash HTTP stream
     */
    async streamGeminiTextAnswer(question) {
        if (this.isGeminiGenerating) return;
        this.isGeminiGenerating = true;

        PromptLogger.logPayloadSentToAI({
            systemPrompt: this.systemPrompt,
            conversationHistory: this.conversationHistory,
            question: question.trim(),
        });

        try {
            const responseStream = await this.client.models.generateContentStream({
                model: 'gemini-2.5-flash',
                contents: [
                    ...this.conversationHistory.slice(-6).map(t => ({
                        role: t.role,
                        parts: [{ text: t.content }],
                    })),
                    { role: 'user', parts: [{ text: question }] },
                ],
                config: {
                    systemInstruction: this.systemPrompt,
                    temperature: 0.3,
                },
            });

            let fullText = '';
            let isFirst = true;

            for await (const chunk of responseStream) {
                const token = chunk.text || '';
                if (token) {
                    fullText += token;
                    this.onModelOutput?.(fullText, isFirst);
                    isFirst = false;
                }
            }

            if (fullText.trim()) {
                this.conversationHistory.push({ role: 'user', content: question });
                this.conversationHistory.push({ role: 'model', content: fullText });
                console.log(`[VOICE LOG] [AI RESPONSE]:\n${fullText}`);
                this.onTurnComplete?.(fullText);
            }
        } catch (err) {
            console.error('[GeminiLive] Stream text answer error:', err.message);
        } finally {
            this.isGeminiGenerating = false;
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
            externalAnswerHandler: this.externalAnswerHandler,
        });

        if (success && this.conversationHistory.length > 0) {
            console.log('[VOICE LOG] Session reconnected successfully, restoring context...');
        }
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
