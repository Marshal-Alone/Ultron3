const { GoogleGenAI, Modality } = require('@google/genai');
const { BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const { saveDebugAudio, convertStereoToMono } = require('../audioUtils');
const { getSystemPrompt } = require('./prompts');
const { getAvailableModel, incrementLimitCount, getApiKey, getGroqApiKey, getPreferences } = require('../storage');
const { groqAI } = require('./groq');
const PromptLogger = require('./promptLogger');

// Conversation tracking variables
let currentSessionId = null;
let currentTranscription = '';
let conversationHistory = [];
let screenAnalysisHistory = [];
let currentProfile = null;
let currentCustomPrompt = null;
let isInitializingSession = false;
let pendingSpeechTranscript = '';
let speechDebounceTimer = null;

function formatSpeakerResults(results) {
    let text = '';
    for (const result of results) {
        if (result.transcript) {
            const speakerId = result.speakerId || 1;
            const speakerLabel = speakerId === 1 ? 'Interviewer' : 'Candidate';
            text += `[${speakerLabel}]: ${result.transcript}\n`;
        }
    }
    return text;
}

module.exports.formatSpeakerResults = formatSpeakerResults;

// Audio capture variables
let systemAudioProc = null;
let messageBuffer = '';

// Reconnection variables
let isUserClosing = false;
let sessionParams = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000;

function sendToRenderer(channel, data) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        windows[0].webContents.send(channel, data);
    }
}

// Build context message for session restoration
function buildContextMessage() {
    const lastTurns = conversationHistory.slice(-20);
    const validTurns = lastTurns.filter(turn => turn.transcription?.trim() && turn.ai_response?.trim());

    if (validTurns.length === 0) return null;

    const contextLines = validTurns.map(turn => `[Interviewer]: ${turn.transcription.trim()}\n[Your answer]: ${turn.ai_response.trim()}`);

    return `Session reconnected. Here's the conversation so far:\n\n${contextLines.join('\n\n')}\n\nContinue from here.`;
}

// Conversation management functions
function initializeNewSession(profile = null, customPrompt = null) {
    currentSessionId = Date.now().toString();
    currentTranscription = '';
    conversationHistory = [];
    screenAnalysisHistory = [];
    currentProfile = profile;
    currentCustomPrompt = customPrompt;
    console.log('New conversation session started:', currentSessionId, 'profile:', profile);

    // Notify main process to track this session ID
    try {
        if (ipcMain && typeof ipcMain.emit === 'function') {
            ipcMain.emit('session-started', { session: { id: currentSessionId } }, currentSessionId);
        }
    } catch (e) {
        console.error('Could not notify main process of session start:', e);
    }

    // Reset Groq conversation history for a clean session
    groqAI.clearHistory();

    // Save initial session with profile context
    if (profile) {
        sendToRenderer('save-session-context', {
            sessionId: currentSessionId,
            profile: profile,
            customPrompt: customPrompt || '',
        });
    }
}

function saveConversationTurn(transcription, aiResponse) {
    if (!currentSessionId) {
        initializeNewSession();
    }

    const conversationTurn = {
        timestamp: Date.now(),
        transcription: (transcription || '').trim(),
        ai_response: (aiResponse || '').trim(),
    };

    conversationHistory.push(conversationTurn);

    // Send to renderer to save in IndexedDB/Storage
    sendToRenderer('save-conversation-turn', {
        sessionId: currentSessionId,
        turn: conversationTurn,
        fullHistory: conversationHistory,
    });
}

function saveScreenAnalysis(prompt, response, model) {
    if (!currentSessionId) {
        initializeNewSession();
    }

    const analysisEntry = {
        timestamp: Date.now(),
        prompt: prompt,
        response: (response || '').trim(),
        model: model,
    };

    screenAnalysisHistory.push(analysisEntry);

    // Send to renderer to save
    sendToRenderer('save-screen-analysis', {
        sessionId: currentSessionId,
        analysis: analysisEntry,
        fullHistory: screenAnalysisHistory,
        profile: currentProfile,
        customPrompt: currentCustomPrompt,
    });
}

function getCurrentSessionData() {
    return {
        sessionId: currentSessionId,
        history: conversationHistory,
    };
}

function getCurrentSessionId() {
    return currentSessionId;
}

async function getEnabledTools() {
    const tools = [];
    const googleSearchEnabled = await getStoredSetting('googleSearchEnabled', 'true');

    if (googleSearchEnabled === 'true') {
        tools.push({ googleSearch: {} });
    }

    return tools;
}

async function getStoredSetting(key, defaultValue) {
    try {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 50));
            const value = await windows[0].webContents.executeJavaScript(`
                (function() {
                    try {
                        if (typeof localStorage === 'undefined') return '${defaultValue}';
                        return localStorage.getItem('${key}') || '${defaultValue}';
                    } catch (e) {
                        return '${defaultValue}';
                    }
                })()
            `);
            return value;
        }
    } catch (error) {
        // Fallback to default
    }
    return defaultValue;
}

let isGeminiGenerating = false;

async function geminiStreamAnswer(question, systemPrompt) {
    if (!question || typeof question !== 'string' || question.trim().length === 0) return;
    if (isGeminiGenerating) return;

    const apiKey = getApiKey();
    if (!apiKey) return;

    isGeminiGenerating = true;
    const cleanQuestion = question.trim();

    PromptLogger.logPayloadSentToAI({
        systemPrompt,
        conversationHistory,
        question: cleanQuestion,
    });

    sendToRenderer('update-status', 'Thinking...');

    try {
        const client = new GoogleGenAI({ apiKey: apiKey });

        const chatContents = [];
        for (const turn of conversationHistory.slice(-10)) {
            if (turn.transcription && turn.ai_response) {
                chatContents.push({ role: 'user', parts: [{ text: turn.transcription }] });
                chatContents.push({ role: 'model', parts: [{ text: turn.ai_response }] });
            }
        }
        chatContents.push({ role: 'user', parts: [{ text: cleanQuestion }] });

        const responseStream = await client.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: chatContents,
            config: {
                systemInstruction: systemPrompt,
                temperature: 0.6,
            },
        });

        let fullText = '';
        let isFirst = true;
        let lastSendTime = Date.now();

        for await (const chunk of responseStream) {
            const token = chunk.text || '';
            if (token) {
                fullText += token;
                const now = Date.now();
                if (isFirst || now - lastSendTime > 60) {
                    sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
                    isFirst = false;
                    lastSendTime = now;
                }
            }
        }

        if (fullText.trim().length > 0) {
            console.log(`[VOICE LOG] [AI RESPONSE]:\n${fullText}`);
            sendToRenderer('update-response', fullText);
            saveConversationTurn(cleanQuestion, fullText);
        }

        sendToRenderer('update-status', 'Listening...');
    } catch (err) {
        console.error('Gemini stream generation error:', err.message);
        sendToRenderer('update-status', 'Error generating response');
    } finally {
        isGeminiGenerating = false;
    }
}

async function initializeGeminiSession(apiKey, customPrompt = '', profile = 'interview', language = 'en-US', isReconnect = false) {
    if (isInitializingSession && !isReconnect) {
        console.log('Session already initializing, skipping...');
        return null;
    }

    isInitializingSession = true;
    isUserClosing = false;
    sessionParams = { apiKey, customPrompt, profile, language };

    if (!isReconnect) {
        reconnectAttempts = 0;
    }

    const client = new GoogleGenAI({
        vertexai: false,
        apiKey: apiKey,
        httpOptions: { apiVersion: 'v1alpha' },
    });

    const enabledTools = await getEnabledTools();
    const googleSearchEnabled = enabledTools.some(tool => tool.googleSearch);
    const prefs = getPreferences();
    const systemPrompt = getSystemPrompt(
        profile,
        customPrompt,
        googleSearchEnabled,
        prefs.systemInstruction || '',
        prefs.developerInstruction || '',
        prefs.fullSystemPrompt || ''
    );

    if (!isReconnect) {
        initializeNewSession(profile, customPrompt);
    }

    const liveModel = 'gemini-2.5-flash-native-audio-latest';

    pendingSpeechTranscript = '';
    if (speechDebounceTimer) {
        clearTimeout(speechDebounceTimer);
        speechDebounceTimer = null;
    }

    try {
        const session = await client.live.connect({
            model: liveModel,
            callbacks: {
                onopen: function () {
                    console.log('[VOICE LOG] [TURN START] (Listening...)');
                    sendToRenderer('update-status', 'Live session connected');
                },
                onmessage: async function (message) {
                    const groqKey = getGroqApiKey();
                    const prefs = getPreferences();
                    const useGroq = Boolean(prefs.aiProvider === 'groq' && groqKey && groqKey.trim() !== '');

                    // 1. Handle input transcription (what was spoken & diarized)
                    let newTranscript = '';
                    if (message.serverContent?.inputTranscription?.results) {
                        newTranscript = formatSpeakerResults(message.serverContent.inputTranscription.results);
                        currentTranscription += newTranscript;
                        pendingSpeechTranscript += newTranscript;
                    } else if (message.serverContent?.inputTranscription?.text) {
                        const text = message.serverContent.inputTranscription.text;
                        if (text.trim() !== '') {
                            newTranscript = text;
                            currentTranscription += text;
                            pendingSpeechTranscript += text;
                        }
                    }

                    if (newTranscript && newTranscript.trim() !== '') {
                        sendToRenderer('update-status', `🎙️ Heard: "${newTranscript.trim().slice(0, 40)}"`);
                    }

                    // 2. Debounced AI answering (Groq or Gemini)
                    if (newTranscript && newTranscript.trim() !== '') {
                        if (speechDebounceTimer) {
                            clearTimeout(speechDebounceTimer);
                            speechDebounceTimer = null;
                        }

                        const trimmed = pendingSpeechTranscript.trim();
                        const hasPunctuationEnd = /[.?!]\s*$/.test(trimmed);
                        const debounceDelay = hasPunctuationEnd ? 350 : 900;

                        speechDebounceTimer = setTimeout(() => {
                            if (pendingSpeechTranscript.trim().length > 3) {
                                const questionToAnswer = pendingSpeechTranscript.trim();
                                pendingSpeechTranscript = '';
                                sendToRenderer('update-status', 'Thinking...');
                                if (useGroq) {
                                    groqAI.generateAnswer(questionToAnswer, systemPrompt);
                                } else {
                                    geminiStreamAnswer(questionToAnswer, systemPrompt);
                                }
                            }
                        }, debounceDelay);
                    }

                    // 3. Turn Complete
                    if (message.serverContent?.turnComplete) {
                        if (pendingSpeechTranscript.trim().length > 3) {
                            if (speechDebounceTimer) {
                                clearTimeout(speechDebounceTimer);
                                speechDebounceTimer = null;
                            }
                            const questionToAnswer = pendingSpeechTranscript.trim();
                            pendingSpeechTranscript = '';
                            sendToRenderer('update-status', 'Thinking...');
                            if (useGroq) {
                                groqAI.generateAnswer(questionToAnswer, systemPrompt);
                            } else {
                                geminiStreamAnswer(questionToAnswer, systemPrompt);
                            }
                        }
                        currentTranscription = '';
                        messageBuffer = '';
                        sendToRenderer('update-status', 'Listening...');
                        console.log('[VOICE LOG] [TURN COMPLETE] (Ready for next question)');
                    }
                },
                onerror: function (e) {
                    console.error('Session error:', e.message);
                    sendToRenderer('update-status', 'Error: ' + e.message);
                },
                onclose: function (e) {
                    if (isUserClosing) {
                        isUserClosing = false;
                        sendToRenderer('update-status', 'Session closed');
                        return;
                    }

                    // Auto-reconnect if session closed unexpectedly
                    if (sessionParams && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                        attemptReconnect();
                    } else {
                        sendToRenderer('update-status', 'Session closed');
                    }
                },
            },
            config: {
                responseModalities: [Modality.AUDIO],
                outputAudioTranscription: {},
                tools: enabledTools,
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
            },
        });

        isInitializingSession = false;
        if (!isReconnect) {
            sendToRenderer('session-initializing', false);
        }
        return session;
    } catch (error) {
        console.error('Failed to initialize Gemini session:', error);
        isInitializingSession = false;
        if (!isReconnect) {
            sendToRenderer('session-initializing', false);
        }
        return null;
    }
}

async function attemptReconnect() {
    reconnectAttempts++;
    console.log(`Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

    messageBuffer = '';
    currentTranscription = '';

    sendToRenderer('update-status', `Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY));

    try {
        const session = await initializeGeminiSession(
            sessionParams.apiKey,
            sessionParams.customPrompt,
            sessionParams.profile,
            sessionParams.language,
            true
        );

        if (session && global.geminiSessionRef) {
            global.geminiSessionRef.current = session;

            const contextMessage = buildContextMessage();
            if (contextMessage) {
                try {
                    console.log('Restoring conversation context...');
                    await session.sendRealtimeInput({ text: contextMessage });
                } catch (contextError) {
                    console.error('Failed to restore context:', contextError);
                }
            }

            reconnectAttempts = 0;
            sendToRenderer('update-status', 'Reconnected! Listening...');
            console.log('Session reconnected successfully');
            return true;
        }
    } catch (error) {
        console.error(`Reconnection attempt ${reconnectAttempts} failed:`, error);
    }

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        return attemptReconnect();
    }

    console.log('Max reconnection attempts reached');
    sendToRenderer('reconnect-failed', {
        message: 'Could not reconnect to live audio session. Please check your internet connection or restart the session.',
    });
    sessionParams = null;
    return false;
}

function killExistingSystemAudioDump() {
    return new Promise(resolve => {
        const killProc = spawn('pkill', ['-f', 'SystemAudioDump'], {
            stdio: 'ignore',
        });

        killProc.on('close', () => resolve());
        killProc.on('error', () => resolve());

        setTimeout(() => {
            try {
                killProc.kill();
            } catch (e) {}
            resolve();
        }, 2000);
    });
}

async function startMacOSAudioCapture(geminiSessionRef) {
    if (process.platform !== 'darwin') return false;

    await killExistingSystemAudioDump();

    const { app } = require('electron');
    const path = require('path');

    let systemAudioPath = app.isPackaged ? path.join(process.resourcesPath, 'SystemAudioDump') : path.join(__dirname, '../assets', 'SystemAudioDump');

    const spawnOptions = {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
    };

    systemAudioProc = spawn(systemAudioPath, [], spawnOptions);

    if (!systemAudioProc.pid) {
        console.error('Failed to start SystemAudioDump');
        return false;
    }

    const CHUNK_DURATION = 0.1;
    const SAMPLE_RATE = 24000;
    const BYTES_PER_SAMPLE = 2;
    const CHANNELS = 2;
    const CHUNK_SIZE = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * CHUNK_DURATION;

    let audioBuffer = Buffer.alloc(0);

    systemAudioProc.stdout.on('data', data => {
        audioBuffer = Buffer.concat([audioBuffer, data]);

        while (audioBuffer.length >= CHUNK_SIZE) {
            const chunk = audioBuffer.slice(0, CHUNK_SIZE);
            audioBuffer = audioBuffer.slice(CHUNK_SIZE);

            const monoChunk = CHANNELS === 2 ? convertStereoToMono(chunk) : chunk;
            const base64Data = monoChunk.toString('base64');
            sendAudioToGemini(base64Data, geminiSessionRef);

            if (process.env.DEBUG_AUDIO) {
                saveDebugAudio(monoChunk, 'system_audio');
            }
        }

        const maxBufferSize = SAMPLE_RATE * BYTES_PER_SAMPLE * 1;
        if (audioBuffer.length > maxBufferSize) {
            audioBuffer = audioBuffer.slice(-maxBufferSize);
        }
    });

    systemAudioProc.stderr.on('data', data => {
        console.error('SystemAudioDump stderr:', data.toString());
    });

    systemAudioProc.on('close', () => {
        systemAudioProc = null;
    });

    systemAudioProc.on('error', () => {
        systemAudioProc = null;
    });

    return true;
}

function stopMacOSAudioCapture() {
    if (systemAudioProc) {
        systemAudioProc.kill('SIGTERM');
        systemAudioProc = null;
    }
}

async function sendAudioToGemini(base64Data, geminiSessionRef) {
    if (!geminiSessionRef?.current) return;

    try {
        await geminiSessionRef.current.sendRealtimeInput({
            audio: {
                data: base64Data,
                mimeType: 'audio/pcm;rate=24000',
            },
        });
    } catch (error) {
        console.error('Error sending audio to Gemini:', error);
    }
}

async function sendImageToGeminiHttp(base64Data, prompt) {
    const apiKey = getApiKey();
    if (!apiKey) {
        return { success: false, error: 'Gemini API key is required' };
    }

    sendToRenderer('update-status', 'Analyzing image with Gemini...');
    sendToRenderer('new-response', 'Analyzing image...\n\n');

    try {
        const client = new GoogleGenAI({ apiKey });
        const prefs = getPreferences();
        const systemPrompt = getSystemPrompt(
            prefs.profile || 'interview',
            prefs.customPrompt || '',
            prefs.googleSearchEnabled !== 'false',
            prefs.systemInstruction || '',
            prefs.developerInstruction || '',
            prefs.fullSystemPrompt || ''
        );

        console.log('\n[SCREENSHOT] GEMINI VISION ANALYSIS');
        console.log('======================== [PAYLOAD SENT TO AI] ========================');
        console.log('[SYSTEM PROMPT]:\n' + systemPrompt);
        console.log('---------------------------------------------------------------------');
        console.log(`[USER PROMPT]: "${prompt}"`);
        console.log('=====================================================================');

        const responseStream = await client.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            inlineData: {
                                mimeType: 'image/jpeg',
                                data: base64Data,
                            },
                        },
                        {
                            text: prompt || 'Analyze this screenshot and provide the complete answer/code.',
                        },
                    ],
                },
            ],
            config: {
                systemInstruction: systemPrompt,
                temperature: 0.2,
            },
        });

        let fullText = '';
        let isFirst = true;
        let lastSendTime = Date.now();

        for await (const chunk of responseStream) {
            const token = chunk.text || '';
            if (token) {
                fullText += token;
                const now = Date.now();
                if (isFirst || now - lastSendTime > 60) {
                    sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
                    isFirst = false;
                    lastSendTime = now;
                }
            }
        }

        if (fullText.trim().length > 0) {
            console.log(`[SCREENSHOT] [AI RESPONSE]:\n${fullText}`);
            sendToRenderer('update-response', fullText);
            saveScreenAnalysis(prompt, fullText, 'gemini-2.5-flash');
            saveConversationTurn('Screen Analysis', fullText);
        }

        sendToRenderer('update-status', 'Listening...');
        return { success: true, text: fullText, model: 'gemini-2.5-flash' };
    } catch (err) {
        console.error('Gemini image analysis error:', err.message);
        sendToRenderer('new-response', `Error analyzing image: ${err.message}`);
        return { success: false, error: err.message };
    }
}

function setupGeminiIpcHandlers(geminiSessionRef) {
    global.geminiSessionRef = geminiSessionRef;

    ipcMain.handle('initialize-gemini', async (event, apiKey, customPrompt, profile = 'interview', language = 'en-US') => {
        const { getPreferences } = require('../storage');
        const prefs = getPreferences();
        const provider = prefs.aiProvider || 'gemini';

        console.log(`[Init] initialize-gemini called (provider: ${provider})`);

        if (apiKey) {
            const session = await initializeGeminiSession(apiKey, customPrompt, profile, language);
            if (session) {
                geminiSessionRef.current = session;
                return true;
            }
            return false;
        } else {
            initializeNewSession(profile, customPrompt);
            return true;
        }
    });

    const handleAudioChunk = (data, mimeType) => {
        if (!data || !geminiSessionRef.current) return;
        try {
            const res = geminiSessionRef.current.sendRealtimeInput({
                audio: { data: data, mimeType: mimeType || 'audio/pcm;rate=24000' },
            });
            if (res && typeof res.catch === 'function') {
                res.catch(error => {
                    console.error('Error sending audio chunk to Gemini:', error.message);
                });
            }
        } catch (error) {
            console.error('Error in handleAudioChunk:', error.message);
        }
    };

    ipcMain.on('send-audio-content', (event, { data, mimeType }) => {
        handleAudioChunk(data, mimeType);
    });

    ipcMain.on('send-mic-audio-content', (event, { data, mimeType }) => {
        handleAudioChunk(data, mimeType);
    });

    ipcMain.handle('send-audio-content', async (event, { data, mimeType }) => {
        if (!geminiSessionRef.current) return { success: false, error: 'No active Gemini session' };
        try {
            await geminiSessionRef.current.sendRealtimeInput({
                audio: { data: data, mimeType: mimeType || 'audio/pcm;rate=24000' },
            });
            return { success: true };
        } catch (error) {
            console.error('Error sending system audio:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('send-mic-audio-content', async (event, { data, mimeType }) => {
        if (!geminiSessionRef.current) return { success: false, error: 'No active Gemini session' };
        try {
            await geminiSessionRef.current.sendRealtimeInput({
                audio: { data: data, mimeType: mimeType || 'audio/pcm;rate=24000' },
            });
            return { success: true };
        } catch (error) {
            console.error('Error sending mic audio:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('send-image-content', async (event, { data, prompt }) => {
        try {
            if (!data || typeof data !== 'string') {
                return { success: false, error: 'Invalid image data' };
            }

            const { getPreferences, getGroqApiKey } = require('../storage');
            const prefs = getPreferences();
            const groqKey = getGroqApiKey();
            const provider = prefs.aiProvider || 'gemini';

            if (provider === 'groq' && groqKey) {
                return await groqAI.analyzeScreenshot(data, prompt);
            } else {
                return await sendImageToGeminiHttp(data, prompt);
            }
        } catch (error) {
            console.error('Error sending image:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('send-text-message', async (event, text) => {
        try {
            if (!text || typeof text !== 'string' || text.trim().length === 0) {
                return { success: false, error: 'Invalid text message' };
            }

            const { getPreferences, getGroqApiKey } = require('../storage');
            const prefs = getPreferences();
            const groqKey = getGroqApiKey();
            const provider = prefs.aiProvider || 'gemini';

            const googleSearchEnabled = prefs.googleSearchEnabled !== 'false';
            const systemPrompt = getSystemPrompt(
                prefs.profile || 'interview',
                prefs.customPrompt || '',
                googleSearchEnabled,
                prefs.systemInstruction || '',
                prefs.developerInstruction || '',
                prefs.fullSystemPrompt || ''
            );

            PromptLogger.logPayloadSentToAI({
                systemPrompt,
                conversationHistory,
                question: text.trim(),
            });

            if (provider === 'groq' && groqKey) {
                return await groqAI.sendTextMessage(text.trim(), systemPrompt);
            } else {
                if (!geminiSessionRef.current) {
                    return { success: false, error: 'No active Gemini session' };
                }
                await geminiSessionRef.current.sendRealtimeInput({ text: text.trim() });
                return { success: true };
            }
        } catch (error) {
            console.error('Error sending text:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('force-trigger-answer', async () => {
        console.log('[VOICE LOG] [SHORTCUT] Force trigger answer immediately');
        const groqKey = getGroqApiKey();
        const prefs = getPreferences();
        const useGroq = Boolean(prefs.aiProvider === 'groq' && groqKey && groqKey.trim() !== '');

        if (speechDebounceTimer) {
            clearTimeout(speechDebounceTimer);
            speechDebounceTimer = null;
        }

        const question = (pendingSpeechTranscript || currentTranscription || '').trim();
        if (question.length > 0) {
            pendingSpeechTranscript = '';
            sendToRenderer('update-status', '⚡ Analyzing...');
            const googleSearchEnabled = prefs.googleSearchEnabled !== 'false';
            const systemPrompt = getSystemPrompt(
                prefs.profile || 'interview',
                prefs.customPrompt || '',
                googleSearchEnabled,
                prefs.systemInstruction || '',
                prefs.developerInstruction || '',
                prefs.fullSystemPrompt || ''
            );

            if (useGroq) {
                return await groqAI.generateAnswer(question, systemPrompt);
            } else {
                return await geminiStreamAnswer(question, systemPrompt);
            }
        }
        sendToRenderer('update-status', '⚠️ No speech heard yet');
        return { success: false, error: 'No transcription captured yet' };
    });

    ipcMain.handle('start-macos-audio', async () => {
        if (process.platform !== 'darwin') {
            return { success: false, error: 'macOS audio capture only available on macOS' };
        }
        try {
            const success = await startMacOSAudioCapture(geminiSessionRef);
            return { success };
        } catch (error) {
            console.error('Error starting macOS audio capture:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('stop-macos-audio', async () => {
        try {
            stopMacOSAudioCapture();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('close-session', async () => {
        try {
            stopMacOSAudioCapture();
            isUserClosing = true;
            sessionParams = null;

            if (geminiSessionRef.current) {
                await geminiSessionRef.current.close();
                geminiSessionRef.current = null;
            }

            return { success: true };
        } catch (error) {
            console.error('Error closing session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-current-session', async () => {
        try {
            return { success: true, data: getCurrentSessionData() };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('start-new-session', async () => {
        try {
            initializeNewSession();
            return { success: true, sessionId: currentSessionId };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('update-google-search-setting', async (event, enabled) => {
        return { success: true };
    });
}

module.exports = {
    initializeGeminiSession,
    getEnabledTools,
    getStoredSetting,
    sendToRenderer,
    initializeNewSession,
    saveConversationTurn,
    getCurrentSessionData,
    getCurrentSessionId,
    killExistingSystemAudioDump,
    startMacOSAudioCapture,
    convertStereoToMono,
    stopMacOSAudioCapture,
    sendAudioToGemini,
    sendImageToGeminiHttp,
    setupGeminiIpcHandlers,
    formatSpeakerResults,
    saveScreenAnalysis,
};
