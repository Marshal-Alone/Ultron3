/**
 * Groq AI Service
 * High-speed LPU inference client with SSE streaming, real-time <think> tag stripping,
 * multi-stage vision reasoning, and sliding conversational memory.
 */
const OpenAI = require('openai');
const { BrowserWindow } = require('electron');
const storage = require('../storage');
const PromptLogger = require('./promptLogger');

// Helper to send data to renderer (matches gemini.js pattern)
function sendToRenderer(channel, data) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        windows[0].webContents.send(channel, data);
    }
}

/**
 * Strips <think>...</think> reasoning tags on the fly.
 * Handles both partial thinking blocks (when reasoning is in progress)
 * and complete blocks.
 */
function stripThinkingTags(text) {
    if (!text || typeof text !== 'string') return '';
    const trimmedStart = text.trimStart();
    if ('<think>'.startsWith(trimmedStart)) {
        return '';
    }
    // Remove closed <think>...</think> blocks
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>\n*/gi, '');
    // Remove trailing unclosed <think>... blocks
    cleaned = cleaned.replace(/<think>[\s\S]*$/gi, '');
    return cleaned.trimStart();
}

class GroqAIService {
    constructor() {
        this.conversationHistory = [];
        this.isGenerating = false;
        this.activeSessionId = 0;
        this.defaultModel = 'qwen/qwen3.6-27b';
        this.fallbackModel = 'llama-3.1-8b-instant';
    }

    /**
     * Cancel any active Groq generation or screenshot pipeline
     */
    cancel() {
        this.activeSessionId++;
        this.isGenerating = false;
    }

    /**
     * Get configured OpenAI client pointing to Groq
     */
    getClient() {
        const apiKey = storage.getGroqApiKey();
        if (!apiKey) {
            throw new Error('Groq API key not configured. Please add it in Settings.');
        }
        return new OpenAI({
            baseURL: 'https://api.groq.com/openai/v1',
            apiKey: apiKey,
        });
    }

    /**
     * Resets or clears the sliding conversational context.
     */
    clearHistory() {
        this.conversationHistory = [];
    }

    /**
     * Ultra-fast sub-second answer generator triggered by real-time speech transcription.
     * Streams tokens in real-time to the renderer UI.
     * @param {string} transcription - The transcribed speech with speaker label (e.g. "[Interviewer]: What is your approach?")
     * @param {string} systemPrompt - System prompt defining concise persona & brevity
     * @returns {Promise<{success: boolean, text?: string, error?: string}>}
     */
    async generateAnswer(transcription, systemPrompt = null) {
        const apiKey = storage.getGroqApiKey();
        if (!apiKey || !transcription || transcription.trim() === '') {
            return { success: false, error: 'Missing Groq API key or transcription' };
        }

        const modelName = this.defaultModel;
        let defaultPrompt = systemPrompt;
        if (!defaultPrompt) {
            try {
                const { getPreferences } = require('../storage');
                const { getSystemPrompt } = require('./prompts');
                const prefs = getPreferences();
                defaultPrompt = getSystemPrompt(
                    prefs.profile || 'interview',
                    prefs.customPrompt || '',
                    prefs.googleSearchEnabled !== 'false',
                    prefs.systemInstruction || '',
                    prefs.developerInstruction || '',
                    prefs.fullSystemPrompt || ''
                );
            } catch (e) {
                defaultPrompt =
                    'You are an ultra-fast on-screen assistant. Give direct, high-value, ready-to-speak answers in 1-3 concise bullet points. No conversational filler.';
            }
        }

        this.isGenerating = true;
        this.conversationHistory.push({ role: 'user', content: transcription.trim() });

        // Maintain sliding history of last 20 messages
        if (this.conversationHistory.length > 20) {
            this.conversationHistory = this.conversationHistory.slice(-20);
        }

        try {
            const client = this.getClient();

            PromptLogger.logPayloadSentToAI({
                systemPrompt: defaultPrompt,
                conversationHistory: this.conversationHistory.slice(0, -1),
                question: transcription.trim(),
            });

            const stream = await client.chat.completions.create({
                model: modelName,
                messages: [{ role: 'system', content: defaultPrompt }, ...this.conversationHistory],
                max_tokens: 2048,
                temperature: 0.6,
                stream: true,
            });

            let fullText = '';
            let isFirst = true;
            let lastSendTime = Date.now();

            for await (const chunk of stream) {
                const token = chunk.choices?.[0]?.delta?.content || '';
                if (token) {
                    fullText += token;
                    const cleaned = stripThinkingTags(fullText);
                    const now = Date.now();
                    if (isFirst || now - lastSendTime > 40) {
                        sendToRenderer(isFirst ? 'new-response' : 'update-response', cleaned);
                        isFirst = false;
                        lastSendTime = now;
                    }
                }
            }

            const finalResponse = stripThinkingTags(fullText);
            if (finalResponse.length > 0) {
                sendToRenderer('update-response', finalResponse);
                this.conversationHistory.push({ role: 'assistant', content: finalResponse });
            }

            sendToRenderer('update-status', 'Listening...');
            console.log(`[VOICE LOG] [AI RESPONSE]:\n${finalResponse}`);

            // Save conversation turn to history (Q&A pair)
            try {
                const geminiModule = require('./gemini');
                if (geminiModule.saveConversationTurn && typeof geminiModule.saveConversationTurn === 'function') {
                    geminiModule.saveConversationTurn(transcription.trim(), finalResponse);
                }
            } catch (e) {
                console.error('❌ Could not save conversation turn to history:', e.message);
            }

            return { success: true, text: finalResponse };
        } catch (error) {
            console.error('[Groq Live] Primary model error:', error.message);

            // Automatic fallback to secondary high-speed model
            if (modelName !== fallbackModel) {
                try {
                    console.log(`[Groq Live] Falling back to ${fallbackModel}...`);
                    const client = this.getClient();
                    const stream = await client.chat.completions.create({
                        model: fallbackModel,
                        messages: [{ role: 'system', content: defaultPrompt }, ...this.conversationHistory],
                        max_tokens: 2048,
                        temperature: 0.6,
                        stream: true,
                    });

                    let fullText = '';
                    let isFirst = true;
                    let lastSendTime = Date.now();

                    for await (const chunk of stream) {
                        const token = chunk.choices?.[0]?.delta?.content || '';
                        if (token) {
                            fullText += token;
                            const cleaned = stripThinkingTags(fullText);
                            const now = Date.now();
                            if (isFirst || now - lastSendTime > 40) {
                                sendToRenderer(isFirst ? 'new-response' : 'update-response', cleaned);
                                isFirst = false;
                                lastSendTime = now;
                            }
                        }
                    }

                    const finalResponse = stripThinkingTags(fullText);
                    if (finalResponse.length > 0) {
                        sendToRenderer('update-response', finalResponse);
                        this.conversationHistory.push({ role: 'assistant', content: finalResponse });
                    }
                    sendToRenderer('update-status', 'Listening...');
                    return { success: true, text: finalResponse };
                } catch (fallbackError) {
                    console.error('[Groq Live] Fallback generation error:', fallbackError);
                }
            }

            sendToRenderer('update-status', `Groq error: ${error.message}`);
            return { success: false, error: error.message };
        } finally {
            this.isGenerating = false;
        }
    }

    /**
     * Send a text message to Groq's LLM with streaming response
     * @param {string} prompt - The text prompt
     * @param {string} systemPrompt - Optional system prompt
     * @returns {Promise<{success: boolean, text?: string, error?: string, model: string}>}
     */
    async sendTextMessage(prompt, systemPrompt = null) {
        const modelName = 'openai/gpt-oss-120b';

        try {
            const client = this.getClient();

            PromptLogger.logPayloadSentToAI({
                systemPrompt,
                conversationHistory: [],
                question: prompt,
            });

            const messages = [];
            if (systemPrompt) {
                messages.push({ role: 'system', content: systemPrompt });
            }
            messages.push({ role: 'user', content: prompt });

            console.log(`Sending text to Groq ${modelName} (streaming)...`);

            const stream = await client.chat.completions.create({
                model: modelName,
                messages,
                max_tokens: 2048,
                temperature: 0.3,
                stream: true,
            });

            let fullText = '';
            let isFirst = true;
            let lastSendTime = Date.now();

            for await (const chunk of stream) {
                const chunkText = chunk.choices[0]?.delta?.content || '';
                if (chunkText) {
                    fullText += chunkText;
                    const cleaned = stripThinkingTags(fullText);

                    if (cleaned.length > 0) {
                        const now = Date.now();
                        if (isFirst || now - lastSendTime > 100) {
                            sendToRenderer(isFirst ? 'new-response' : 'update-response', cleaned);
                            isFirst = false;
                            lastSendTime = now;
                        }
                    }
                }
            }

            const cleanedResponse = stripThinkingTags(fullText);
            if (!isFirst && cleanedResponse.length > 0) {
                sendToRenderer('update-response', cleanedResponse);
            }

            console.log(`Text response completed from Groq ${modelName}`);

            // Save conversation turn to history (Q&A pair)
            try {
                const geminiModule = require('./gemini');
                if (geminiModule.saveConversationTurn && typeof geminiModule.saveConversationTurn === 'function') {
                    geminiModule.saveConversationTurn(prompt, cleanedResponse);
                    console.log('✅ Conversation turn saved successfully');
                }
            } catch (e) {
                console.error('❌ Could not save conversation turn to history:', e.message);
            }

            return { success: true, text: cleanedResponse, model: `groq-${modelName}` };
        } catch (error) {
            console.error('Groq API error:', error);
            sendToRenderer('new-response', `Error: ${error.message}`);
            return { success: false, error: error.message, model: `groq-${modelName}` };
        }
    }

    /**
     * Analyze a screenshot with streaming response to renderer
     * @param {string} base64Data - Base64 encoded image data (without data URL prefix)
     * @param {string} prompt - The analysis prompt
     * @returns {Promise<{success: boolean, text?: string, error?: string, model: string}>}
     */
    async analyzeScreenshot(base64Data, prompt) {
        const sessionId = ++this.activeSessionId;
        const visionModelName = 'qwen/qwen3.6-27b';
        const initialSolveModelName = 'openai/gpt-oss-120b';
        const verificationModelName = 'openai/gpt-oss-120b';

        try {
            const client = this.getClient();
            const imageUrl = `data:image/jpeg;base64,${base64Data}`;

            console.log('\n[SCREENSHOT] PIPELINE STAGE 1: VISION EXTRACTION');
            console.log('======================== [PAYLOAD SENT TO AI] ========================');
            console.log(`[MODEL]: ${visionModelName}`);
            console.log(
                '[SYSTEM PROMPT]: Extract all the code and the exact question/problem statement from this image. Return only the raw text, no extra commentary.'
            );
            console.log('---------------------------------------------------------------------');
            console.log('[IMAGE]: Attached Base64 Image');
            console.log('=====================================================================');
            if (sessionId === this.activeSessionId) {
                sendToRenderer('new-response', 'Analyzing image and extracting code (Stage 1/3)...');
            }

            const visionResponse = await client.chat.completions.create({
                model: visionModelName,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Extract all the code and the exact question/problem statement from this image. Return only the raw text, no extra commentary.',
                            },
                            { type: 'image_url', image_url: { url: imageUrl } },
                        ],
                    },
                ],
                max_tokens: 2048,
                temperature: 0.1,
            });

            if (sessionId !== this.activeSessionId) return { success: false, error: 'Cancelled' };

            const extractedText = visionResponse.choices[0]?.message?.content || '';
            const cleanQuestion = stripThinkingTags(extractedText).trim();
            if (cleanQuestion) {
                PromptLogger.setLiveTranscript(cleanQuestion);
            }

            console.log('\n[SCREENSHOT] PIPELINE STAGE 2: INITIAL SOLVE');
            console.log('======================== [PAYLOAD SENT TO AI] ========================');
            console.log(`[MODEL]: ${initialSolveModelName}`);
            console.log('[SYSTEM PROMPT]:\n' + `You are an AI coding assistant. Follow these user instructions strictly and exactly:\n${prompt}`);
            console.log('---------------------------------------------------------------------');
            console.log('[EXTRACTED CODE / QUESTION]:\n' + cleanQuestion);
            console.log('=====================================================================');
            if (sessionId === this.activeSessionId) {
                sendToRenderer('new-response', 'Generating initial solution (Stage 2/3)...\n\n');
            }

            const stream = await client.chat.completions.create({
                model: initialSolveModelName,
                messages: [
                    {
                        role: 'system',
                        content: `You are an AI coding assistant. Follow these user instructions strictly and exactly:\n${prompt}`,
                    },
                    {
                        role: 'user',
                        content: `Here is the text/code extracted from an image:\n\n${cleanQuestion}\n\nSolve the problem or answer the question according to the system instructions. Explain your reasoning first step-by-step, then give the final code.\n\nCRITICAL RULES FOR FINAL CODE:\n1. If the image shows an online editor with a pre-defined class or method (like LeetCode/HackerRank), output ONLY the exact logic needed to fill in the blanks or complete the method. Do NOT rewrite the existing class or method signatures.\n2. Do NOT include any comments in your code.\n3. Output only the pure code inside a single markdown code block.\n4. EXTREMELY IMPORTANT: If the problem matches any of the specific programs listed in the 'USER CUSTOM INSTRUCTIONS' (e.g. 'NUMBER TO BINARY', 'ARMSTRONG NUMBER', etc.), you MUST output the EXACT code provided by the user for that problem VERBATIM. Do not change a single character of their provided solution. This overrides all other rules.`,
                    },
                ],
                max_tokens: 2048,
                temperature: 0.2,
                stream: true,
            });

            let fullText = '';
            let isFirst = true;
            let lastSendTime = Date.now();

            for await (const chunk of stream) {
                if (sessionId !== this.activeSessionId) return { success: false, error: 'Cancelled' };
                const chunkText = chunk.choices[0]?.delta?.content || '';
                if (chunkText) {
                    fullText += chunkText;
                    const displayText = stripThinkingTags(fullText);

                    if (displayText.length > 0) {
                        const now = Date.now();
                        if (isFirst || now - lastSendTime > 100) {
                            if (sessionId === this.activeSessionId) {
                                sendToRenderer(isFirst ? 'new-response' : 'update-response', displayText);
                            }
                            isFirst = false;
                            lastSendTime = now;
                        }
                    }
                }
            }

            if (sessionId !== this.activeSessionId) return { success: false, error: 'Cancelled' };

            const initialSolution = stripThinkingTags(fullText);
            if (initialSolution.length > 0 && !isFirst && sessionId === this.activeSessionId) {
                sendToRenderer('update-response', initialSolution);
            }

            console.log('\n[SCREENSHOT] PIPELINE STAGE 3: VERIFICATION');
            console.log('======================== [PAYLOAD SENT TO AI] ========================');
            console.log(`[MODEL]: ${verificationModelName}`);
            console.log('[SYSTEM PROMPT]:\n' + `Carefully verify this is correct according to these instructions: ${prompt}`);
            console.log('---------------------------------------------------------------------');
            console.log('[PROPOSED SOLUTION TO VERIFY]:\n' + initialSolution);
            console.log('=====================================================================');
            if (sessionId === this.activeSessionId) {
                sendToRenderer('update-response', initialSolution + '\n\n---\n*Verifying solution... (Stage 3/3)*\n');
            }

            const verifyStream = await client.chat.completions.create({
                model: verificationModelName,
                messages: [
                    {
                        role: 'user',
                        content: `Problem:\n${cleanQuestion}\n\nProposed solution:\n${initialSolution}\n\nCarefully verify this is correct according to these instructions: ${prompt}\n\nIf there's a bug, fix it and give the corrected code. If it's completely correct, just return the exact same code with no changes. Explain your reasoning first step-by-step.\n\nCRITICAL RULES FOR FINAL CODE:\n1. If the image shows an online editor with a pre-defined class or method (like LeetCode/HackerRank), output ONLY the exact logic needed to fill in the blanks or complete the method. Do NOT rewrite the existing class or method signatures.\n2. Do NOT include any comments in your code.\n3. Output only the pure code inside a single markdown code block.`,
                    },
                ],
                max_tokens: 2048,
                temperature: 0.2,
                stream: true,
            });

            let verifiedText = '';
            let isVerifyFirst = true;
            let lastVerifySendTime = Date.now();

            for await (const chunk of verifyStream) {
                if (sessionId !== this.activeSessionId) return { success: false, error: 'Cancelled' };
                const chunkText = chunk.choices[0]?.delta?.content || '';
                if (chunkText) {
                    verifiedText += chunkText;
                    const displayVerifiedText = stripThinkingTags(verifiedText);

                    if (displayVerifiedText.length > 0) {
                        const now = Date.now();
                        if (isVerifyFirst || now - lastVerifySendTime > 100) {
                            if (sessionId === this.activeSessionId) {
                                sendToRenderer('update-response', initialSolution + '\n\n---\n**Verified Solution:**\n\n' + displayVerifiedText);
                            }
                            isVerifyFirst = false;
                            lastVerifySendTime = now;
                        }
                    }
                }
            }

            if (sessionId !== this.activeSessionId) return { success: false, error: 'Cancelled' };

            const finalVerifiedText = stripThinkingTags(verifiedText);
            const finalOutput = initialSolution + '\n\n---\n**Verified Solution:**\n\n' + finalVerifiedText;

            console.log('\n[SCREENSHOT] FINAL VERIFIED SOLUTION:');
            console.log(finalVerifiedText);

            if (finalVerifiedText.length > 0 && sessionId === this.activeSessionId) {
                sendToRenderer('update-response', finalOutput);
            }

            // Save screen analysis to history
            try {
                const geminiModule = require('./gemini');
                if (geminiModule.saveScreenAnalysis && typeof geminiModule.saveScreenAnalysis === 'function') {
                    geminiModule.saveScreenAnalysis(prompt, finalOutput, `groq-${verificationModelName}`);
                }
                if (geminiModule.saveConversationTurn && typeof geminiModule.saveConversationTurn === 'function') {
                    geminiModule.saveConversationTurn('Screen Analysis', finalOutput);
                }
            } catch (e) {
                console.error('Could not save screen analysis to history:', e.message);
            }

            // Save screenshot image to disk with AI response
            try {
                const geminiModule = require('./gemini');
                const sessionId = geminiModule.getCurrentSessionId ? geminiModule.getCurrentSessionId() : null;
                if (sessionId) {
                    const result = storage.saveSessionScreenshot(base64Data, sessionId, finalOutput);
                    if (!result.success) {
                        console.warn(`Could not save screenshot image: ${result.error}`);
                    }
                }
            } catch (e) {
                console.error('Could not save screenshot image:', e.message);
            }

            return { success: true, text: finalOutput, model: `groq-${verificationModelName}` };
        } catch (error) {
            console.error('Groq API error:', error);
            sendToRenderer('new-response', `Error: ${error.message}`);
            return { success: false, error: error.message, model: `groq-${initialSolveModelName}->${verificationModelName}` };
        }
    }
}

const groqAI = new GroqAIService();

module.exports = {
    groqAI,
    GroqAIService,
    stripThinkingTags,
    sendToRenderer,
};
