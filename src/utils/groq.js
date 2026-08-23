/**
 * Groq AI Service
 * Uses OpenAI SDK with Groq's API endpoint for LLM inference
 */
const OpenAI = require('openai');
const { BrowserWindow } = require('electron');
const storage = require('../storage');

// Helper to send data to renderer (matches gemini.js pattern)
function sendToRenderer(channel, data) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        windows[0].webContents.send(channel, data);
    }
}

class GroqAIService {
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
     * Send a text message to Groq's LLM with streaming response
     * @param {string} prompt - The text prompt
     * @param {string} systemPrompt - Optional system prompt
     * @returns {Promise<{success: boolean, text?: string, error?: string, model: string}>}
     */
    async sendTextMessage(prompt, systemPrompt = null) {
        const modelName = 'openai/gpt-oss-120b';

        try {
            const client = this.getClient();

            const messages = [];
            if (systemPrompt) {
                messages.push({ role: 'system', content: systemPrompt });
            }
            messages.push({ role: 'user', content: prompt });

            console.log(`Sending text to Groq ${modelName} (streaming)...`);

            // Use streaming for real-time response display
            const stream = await client.chat.completions.create({
                model: modelName,
                messages,
                max_tokens: 2048,
                temperature: 0.3,
                stream: true,
            });

            // Stream responses to renderer (matching Gemini pattern)
            let fullText = '';
            let isFirst = true;
            let lastSendTime = Date.now();

            for await (const chunk of stream) {
                const chunkText = chunk.choices[0]?.delta?.content || '';
                if (chunkText) {
                    fullText += chunkText;

                    const now = Date.now();
                    if (isFirst || now - lastSendTime > 100) {
                        // Send to renderer - new response for first chunk, update for subsequent
                        sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
                        isFirst = false;
                        lastSendTime = now;
                    }
                }
            }

            if (!isFirst && fullText.length > 0) {
                sendToRenderer('update-response', fullText);
            }

            console.log(`Text response completed from Groq ${modelName}`);

            // Save conversation turn to history (Q&A pair)
            try {
                const geminiModule = require('./gemini');
                if (geminiModule.saveConversationTurn && typeof geminiModule.saveConversationTurn === 'function') {
                    geminiModule.saveConversationTurn(prompt, fullText);
                    console.log('✅ Conversation turn saved successfully');
                } else {
                    console.warn('⚠️ saveConversationTurn function not available in gemini module');
                }
            } catch (e) {
                console.error('❌ Could not save conversation turn to history:', e.message);
            }

            return { success: true, text: fullText, model: `groq-${modelName}` };
        } catch (error) {
            console.error('Groq API error:', error);
            // Send error to renderer so user sees it
            sendToRenderer('new-response', `Error: ${error.message}`);
            return { success: false, error: error.message, model: `groq-${modelName}` };
        }
    }

    /**
     * Analyze a screenshot with streaming response to renderer
     * This matches the Gemini sendImageToGeminiHttp pattern
     * @param {string} base64Data - Base64 encoded image data (without data URL prefix)
     * @param {string} prompt - The analysis prompt
     * @returns {Promise<{success: boolean, text?: string, error?: string, model: string}>}
     */
    async analyzeScreenshot(base64Data, prompt) {
        const visionModelName = 'qwen/qwen3.6-27b';
        const initialSolveModelName = 'openai/gpt-oss-120b';
        const verificationModelName = 'openai/gpt-oss-120b';

        try {
            const client = this.getClient();

            const imageUrl = `data:image/jpeg;base64,${base64Data}`;

            console.log('\n[SCREENSHOT] PIPELINE STAGE 1: VISION EXTRACTION');
            sendToRenderer('new-response', 'Analyzing image and extracting code (Stage 1/3)...');

            const visionResponse = await client.chat.completions.create({
                model: visionModelName,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Extract all the code and the exact question/problem statement from this image. Return only the raw text, no extra commentary.' },
                            { type: 'image_url', image_url: { url: imageUrl } }
                        ]
                    }
                ],
                max_tokens: 2048,
                temperature: 0.1,
            });

            const extractedText = visionResponse.choices[0]?.message?.content || '';

            console.log('--- Extracted Text ---');
            console.log(extractedText);
            console.log('----------------------\n');

            console.log('[SCREENSHOT] PIPELINE STAGE 2: INITIAL SOLVE');
            console.log('-'.repeat(70));
            console.log(prompt);
            console.log('-'.repeat(70) + '\n');

            sendToRenderer('new-response', 'Generating initial solution (Stage 2/3)...\n\n');

            const stream = await client.chat.completions.create({
                model: initialSolveModelName,
                messages: [
                    {
                        role: 'system',
                        content: `You are an AI coding assistant. Follow these user instructions strictly and exactly:\n${prompt}`
                    },
                    {
                        role: 'user',
                        content: `Here is the text/code extracted from an image:\n\n${extractedText}\n\nSolve the problem or answer the question according to the system instructions. Explain your reasoning first step-by-step, then give the final code.\n\nCRITICAL RULES FOR FINAL CODE:\n1. If the image shows an online editor with a pre-defined class or method (like LeetCode/HackerRank), output ONLY the exact logic needed to fill in the blanks or complete the method. Do NOT rewrite the existing class or method signatures.\n2. Do NOT include any comments in your code.\n3. Output only the pure code inside a single markdown code block.\n4. EXTREMELY IMPORTANT: If the problem matches any of the specific programs listed in the 'USER CUSTOM INSTRUCTIONS' (e.g. 'NUMBER TO BINARY', 'ARMSTRONG NUMBER', etc.), you MUST output the EXACT code provided by the user for that problem VERBATIM. Do not change a single character of their provided solution. This overrides all other rules.`
                    }
                ],
                max_tokens: 2048,
                temperature: 0.2,
                stream: true,
            });

            let fullText = '';
            let isFirst = true;
            let lastSendTime = Date.now();

            for await (const chunk of stream) {
                const chunkText = chunk.choices[0]?.delta?.content || '';
                if (chunkText) {
                    fullText += chunkText;

                    // Filter out reasoning blocks commonly produced by OSS reasoning models
                    let displayText = fullText.replace(/<think>[\s\S]*?<\/think>\n*/g, '');
                    displayText = displayText.replace(/<think>[\s\S]*$/g, '');
                    displayText = displayText.trimStart();

                    // Only update the renderer if there's actual text outside the think block
                    if (displayText.length > 0) {
                        const now = Date.now();
                        if (isFirst || now - lastSendTime > 100) {
                            sendToRenderer(isFirst ? 'new-response' : 'update-response', displayText);
                            isFirst = false;
                            lastSendTime = now;
                        }
                    }
                }
            }

            // Ensure the final text is sent
            let initialSolution = fullText.replace(/<think>[\s\S]*?<\/think>\n*/g, '').trimStart();
            if (initialSolution.length > 0 && !isFirst) {
                sendToRenderer('update-response', initialSolution);
            }

            console.log('[SCREENSHOT] PIPELINE STAGE 3: VERIFICATION');
            sendToRenderer('update-response', initialSolution + '\n\n---\n*Verifying solution... (Stage 3/3)*\n');

            const verifyStream = await client.chat.completions.create({
                model: verificationModelName,
                messages: [
                    {
                        role: 'user',
                        content: `Problem:\n${extractedText}\n\nProposed solution:\n${initialSolution}\n\nCarefully verify this is correct according to these instructions: ${prompt}\n\nIf there's a bug, fix it and give the corrected code. If it's completely correct, just return the exact same code with no changes. Explain your reasoning first step-by-step.\n\nCRITICAL RULES FOR FINAL CODE:\n1. If the image shows an online editor with a pre-defined class or method (like LeetCode/HackerRank), output ONLY the exact logic needed to fill in the blanks or complete the method. Do NOT rewrite the existing class or method signatures.\n2. Do NOT include any comments in your code.\n3. Output only the pure code inside a single markdown code block.`
                    }
                ],
                max_tokens: 2048,
                temperature: 0.2,
                stream: true,
            });

            let verifiedText = '';
            let isVerifyFirst = true;
            let lastVerifySendTime = Date.now();

            for await (const chunk of verifyStream) {
                const chunkText = chunk.choices[0]?.delta?.content || '';
                if (chunkText) {
                    verifiedText += chunkText;

                    let displayVerifiedText = verifiedText.replace(/<think>[\s\S]*?<\/think>\n*/g, '');
                    displayVerifiedText = displayVerifiedText.replace(/<think>[\s\S]*$/g, '');
                    displayVerifiedText = displayVerifiedText.trimStart();

                    if (displayVerifiedText.length > 0) {
                        const now = Date.now();
                        if (isVerifyFirst || now - lastVerifySendTime > 100) {
                            sendToRenderer('update-response', initialSolution + '\n\n---\n**Verified Solution:**\n\n' + displayVerifiedText);
                            isVerifyFirst = false;
                            lastVerifySendTime = now;
                        }
                    }
                }
            }

            let finalVerifiedText = verifiedText.replace(/<think>[\s\S]*?<\/think>\n*/g, '').trimStart();
            if (finalVerifiedText.length > 0) {
                sendToRenderer('update-response', initialSolution + '\n\n---\n**Verified Solution:**\n\n' + finalVerifiedText);
            }

            let finalOutput = initialSolution + '\n\n---\n**Verified Solution:**\n\n' + finalVerifiedText;

            // Image response received

            // Save screen analysis to history
            try {
                const geminiModule = require('./gemini');
                if (geminiModule.saveScreenAnalysis && typeof geminiModule.saveScreenAnalysis === 'function') {
                    geminiModule.saveScreenAnalysis(prompt, finalOutput, `groq-${verificationModelName}`);
                    // Screen analysis saved
                } else {
                    console.warn('s,? saveScreenAnalysis function not available in gemini module');
                }
            } catch (e) {
                console.error('?O Could not save screen analysis to history:', e.message);
            }

            // Also save as conversation turn (for Q&A history)
            try {
                const geminiModule = require('./gemini');
                if (geminiModule.saveConversationTurn && typeof geminiModule.saveConversationTurn === 'function') {
                    geminiModule.saveConversationTurn('Screen Analysis', finalOutput);
                    console.log('o. Screen analysis turn saved to Q&A history');
                } else {
                    console.warn('s,? saveConversationTurn function not available');
                }
            } catch (e) {
                console.error('?O Could not save screen analysis turn:', e.message);
            }

            // Save screenshot image to disk with AI response
            try {
                const geminiModule = require('./gemini');
                const sessionId = geminiModule.getCurrentSessionId ? geminiModule.getCurrentSessionId() : null;
                if (sessionId) {
                    const storage = require('../storage');
                    const result = storage.saveSessionScreenshot(base64Data, sessionId, finalOutput);
                    if (result.success) {
                        // Screenshot saved
                    } else {
                        console.warn(`s,? Could not save screenshot image: ${result.error}`);
                    }
                }
            } catch (e) {
                console.error('?O Could not save screenshot image:', e.message);
            }

            return { success: true, text: finalOutput, model: `groq-${verificationModelName}` };
        } catch (error) {
            console.error('Groq API error:', error);
            // Send error to renderer so user sees it
            sendToRenderer('new-response', `Error: ${error.message}`);
            return { success: false, error: error.message, model: `groq-${initialSolveModelName}->${verificationModelName}` };
        }
    }
}

const groqAI = new GroqAIService();

module.exports = { groqAI, GroqAIService, sendToRenderer };

