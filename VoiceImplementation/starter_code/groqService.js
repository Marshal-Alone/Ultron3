/**
 * groqService.js
 * Node.js high-speed inference client for Groq LPUs.
 * Handles SSE streaming, real-time <think> tag stripping, sliding history,
 * and 3-stage vision reasoning.
 */

const OpenAI = require('openai');
const PromptLogger = require('./promptLogger');

class GroqService {
    constructor() {
        this.apiKey = null;
        this.client = null;
        this.primaryModel = 'openai/gpt-oss-120b';
        this.fallbackModel = 'llama-3.1-8b-instant';
        this.systemPrompt = 'You are a concise, direct on-screen assistant. Give direct, ready-to-speak answers in 1-3 bullet points.';
        this.conversationHistory = [];
        this.isGenerating = false;

        this.onToken = null; // (displayText) => void
        this.onComplete = null; // (fullCleanedText) => void
        this.onError = null; // (errorMessage) => void
    }

    init({ apiKey, primaryModel = 'openai/gpt-oss-120b', fallbackModel = 'llama-3.1-8b-instant', systemPrompt }) {
        this.apiKey = apiKey;
        this.primaryModel = primaryModel;
        this.fallbackModel = fallbackModel;
        if (systemPrompt) this.systemPrompt = systemPrompt;

        this.client = new OpenAI({
            apiKey: this.apiKey,
            baseURL: 'https://api.groq.com/openai/v1',
        });
    }

    /**
     * Strips <think>...</think> reasoning tags on the fly.
     */
    stripThinkingTags(text) {
        if (!text || typeof text !== 'string') return '';
        const trimmedStart = text.trimStart();
        if ('<think>'.startsWith(trimmedStart)) {
            return '';
        }
        return text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
    }

    /**
     * Sends transcription to Groq and streams response tokens in real-time.
     * @param {string} transcription
     * @param {string} customSystemPrompt
     */
    async generateAnswer(transcription, customSystemPrompt = null) {
        if (!this.apiKey || !transcription || transcription.trim() === '') return;

        const effectivePrompt = customSystemPrompt || this.systemPrompt;
        this.isGenerating = true;
        this.conversationHistory.push({ role: 'user', content: transcription.trim() });

        if (this.conversationHistory.length > 20) {
            this.conversationHistory = this.conversationHistory.slice(-20);
        }

        PromptLogger.logPayloadSentToAI({
            systemPrompt: effectivePrompt,
            conversationHistory: this.conversationHistory.slice(0, -1),
            question: transcription.trim(),
        });

        try {
            const stream = await this.client.chat.completions.create({
                model: this.primaryModel,
                messages: [{ role: 'system', content: effectivePrompt }, ...this.conversationHistory],
                temperature: 0.4,
                stream: true,
            });

            let fullText = '';
            let isFirst = true;

            for await (const chunk of stream) {
                const token = chunk.choices?.[0]?.delta?.content || '';
                if (token) {
                    fullText += token;
                    const cleaned = this.stripThinkingTags(fullText);
                    if (cleaned) {
                        this.onToken?.(cleaned, isFirst);
                        isFirst = false;
                    }
                }
            }

            const finalResponse = this.stripThinkingTags(fullText);
            if (finalResponse) {
                this.conversationHistory.push({ role: 'assistant', content: finalResponse });
                console.log(`[VOICE LOG] [AI RESPONSE]:\n${finalResponse}`);
                this.onComplete?.(finalResponse);
            }
            return { success: true, text: finalResponse };
        } catch (error) {
            console.error('[Groq Error]:', error.message);
            this.onError?.(error.message);
            return { success: false, error: error.message };
        } finally {
            this.isGenerating = false;
        }
    }

    /**
     * 3-Stage Vision Reasoning Pipeline for Screen Analysis
     * @param {string} base64Data - Base64 encoded JPEG/PNG image data
     * @param {string} prompt - User context and instructions
     */
    async analyzeScreenshot(base64Data, prompt) {
        const visionModel = 'qwen/qwen3.6-27b';
        const solveModel = 'openai/gpt-oss-120b';
        const imageUrl = `data:image/jpeg;base64,${base64Data}`;

        // STAGE 1: VISION EXTRACTION
        console.log('\n[SCREENSHOT] PIPELINE STAGE 1: VISION EXTRACTION');
        console.log('======================== [PAYLOAD SENT TO AI] ========================');
        console.log(`[MODEL]: ${visionModel}`);
        console.log('[SYSTEM PROMPT]: Extract all code and exact question from image. Return only raw text.');
        console.log('---------------------------------------------------------------------');
        console.log('[IMAGE]: Attached Base64 Image');
        console.log('=====================================================================');

        this.onToken?.('Extracting problem and code from image (Stage 1/3)...', true);

        const visionResponse = await this.client.chat.completions.create({
            model: visionModel,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Extract all the code and exact question from this image. Return raw text only, no extra commentary.' },
                        { type: 'image_url', image_url: { url: imageUrl } },
                    ],
                },
            ],
            temperature: 0.1,
        });
        const extractedText = visionResponse.choices[0]?.message?.content || '';

        // STAGE 2: INITIAL SOLVE
        console.log('\n[SCREENSHOT] PIPELINE STAGE 2: INITIAL SOLVE');
        console.log('======================== [PAYLOAD SENT TO AI] ========================');
        console.log(`[MODEL]: ${solveModel}`);
        console.log(`[SYSTEM PROMPT]:\n${prompt}`);
        console.log('---------------------------------------------------------------------');
        console.log(`[EXTRACTED CODE / QUESTION]:\n${extractedText}`);
        console.log('=====================================================================');

        this.onToken?.('Generating initial solution (Stage 2/3)...\n\n', true);

        const solveStream = await this.client.chat.completions.create({
            model: solveModel,
            messages: [
                { role: 'system', content: `Follow user instructions strictly:\n${prompt}` },
                { role: 'user', content: `Problem:\n${extractedText}\n\nProvide the complete code solution without comments.` },
            ],
            temperature: 0.2,
            stream: true,
        });

        let initialSolution = '';
        for await (const chunk of solveStream) {
            const token = chunk.choices[0]?.delta?.content || '';
            if (token) {
                initialSolution += token;
                this.onToken?.(this.stripThinkingTags(initialSolution), false);
            }
        }
        initialSolution = this.stripThinkingTags(initialSolution);

        // STAGE 3: VERIFICATION
        console.log('\n[SCREENSHOT] PIPELINE STAGE 3: VERIFICATION');
        console.log('======================== [PAYLOAD SENT TO AI] ========================');
        console.log(`[MODEL]: ${solveModel}`);
        console.log(`[SYSTEM PROMPT]: Carefully verify solution correctness and syntax.`);
        console.log('---------------------------------------------------------------------');
        console.log(`[PROPOSED SOLUTION TO VERIFY]:\n${initialSolution}`);
        console.log('=====================================================================');

        const verifyStream = await this.client.chat.completions.create({
            model: solveModel,
            messages: [
                {
                    role: 'user',
                    content: `Problem:\n${extractedText}\n\nProposed Solution:\n${initialSolution}\n\nVerify syntax, method signatures, and logic. Output the final verified code only.`,
                },
            ],
            temperature: 0.2,
            stream: true,
        });

        let verifiedSolution = '';
        for await (const chunk of verifyStream) {
            const token = chunk.choices[0]?.delta?.content || '';
            if (token) {
                verifiedSolution += token;
                this.onToken?.(initialSolution + '\n\n---\n**Verified Solution:**\n\n' + this.stripThinkingTags(verifiedSolution), false);
            }
        }

        console.log('\n[SCREENSHOT] FINAL VERIFIED SOLUTION:');
        console.log(this.stripThinkingTags(verifiedSolution));

        const finalOutput = initialSolution + '\n\n---\n**Verified Solution:**\n\n' + this.stripThinkingTags(verifiedSolution);
        this.onComplete?.(finalOutput);
        return { success: true, text: finalOutput };
    }
}

module.exports = GroqService;
