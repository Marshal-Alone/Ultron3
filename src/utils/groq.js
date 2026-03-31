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
        const modelName = 'llama-3.3-70b-versatile';

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

            for await (const chunk of stream) {
                const chunkText = chunk.choices[0]?.delta?.content || '';
                if (chunkText) {
                    fullText += chunkText;
                    // Send to renderer - new response for first chunk, update for subsequent
                    sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
                    isFirst = false;
                }
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
        const modelName = 'llama-4-scout-17b-16e-instruct';

        try {
            const client = this.getClient();

            // Convert raw base64 to data URL format
            const imageUrl = `data:image/jpeg;base64,${base64Data}`;

            console.log('\n[SCREENSHOT] PROMPT SENT TO AI:');
            console.log('-'.repeat(70));
            console.log(prompt);
            console.log('-'.repeat(70) + '\n');

            // Use streaming for real-time response display
            const stream = await client.chat.completions.create({
                model: `meta-llama/${modelName}`,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: imageUrl } }
                        ]
                    }
                ],
                max_tokens: 1500,
                temperature: 0.2,
                stream: true,  // Enable streaming
            });

            // Stream responses to renderer (matching Gemini pattern)
            let fullText = '';
            let isFirst = true;

            for await (const chunk of stream) {
                const chunkText = chunk.choices[0]?.delta?.content || '';
                if (chunkText) {
                    fullText += chunkText;
                    // Send to renderer - new response for first chunk, update for subsequent
                    sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
                    isFirst = false;
                }
            }

            // Image response received

            // Save screen analysis to history
            try {
                const geminiModule = require('./gemini');
                if (geminiModule.saveScreenAnalysis && typeof geminiModule.saveScreenAnalysis === 'function') {
                    geminiModule.saveScreenAnalysis(prompt, fullText, `groq-${modelName}`);
                    // Screen analysis saved
                } else {
                    console.warn('⚠️ saveScreenAnalysis function not available in gemini module');
                }
            } catch (e) {
                console.error('❌ Could not save screen analysis to history:', e.message);
            }

            // Also save as conversation turn (for Q&A history)
            try {
                const geminiModule = require('./gemini');
                if (geminiModule.saveConversationTurn && typeof geminiModule.saveConversationTurn === 'function') {
                    geminiModule.saveConversationTurn('Screen Analysis', fullText);
                    console.log('✅ Screen analysis turn saved to Q&A history');
                } else {
                    console.warn('⚠️ saveConversationTurn function not available');
                }
            } catch (e) {
                console.error('❌ Could not save screen analysis turn:', e.message);
            }

            // Save screenshot image to disk with AI response
            try {
                const geminiModule = require('./gemini');
                const sessionId = geminiModule.getCurrentSessionId ? geminiModule.getCurrentSessionId() : null;
                if (sessionId) {
                    const storage = require('../storage');
                    const result = storage.saveSessionScreenshot(base64Data, sessionId, fullText);
                    if (result.success) {
                        // Screenshot saved
                    } else {
                        console.warn(`⚠️ Could not save screenshot image: ${result.error}`);
                    }
                }
            } catch (e) {
                console.error('❌ Could not save screenshot image:', e.message);
            }

            return { success: true, text: fullText, model: `groq-${modelName}` };
        } catch (error) {
            console.error('Groq API error:', error);
            // Send error to renderer so user sees it
            sendToRenderer('new-response', `Error: ${error.message}`);
            return { success: false, error: error.message, model: `groq-${modelName}` };
        }
    }
}

const groqAI = new GroqAIService();

module.exports = { groqAI, GroqAIService, sendToRenderer };
