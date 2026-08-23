/**
 * groqService.js
 * Node.js high-speed inference client for Groq LPUs.
 * Handles SSE streaming, real-time <think> tag stripping, and sliding history.
 */

class GroqService {
    constructor() {
        this.apiKey = null;
        this.model = 'qwen/qwen3.6-27b';
        this.systemPrompt = 'You are a concise, direct on-screen assistant. Give direct, ready-to-speak answers in 1-3 bullet points.';
        this.conversationHistory = [];
        this.isGenerating = false;

        this.onToken = null; // (displayText) => void
        this.onComplete = null; // (fullCleanedText) => void
        this.onError = null; // (errorMessage) => void
    }

    init({ apiKey, model = 'qwen/qwen3.6-27b', systemPrompt }) {
        this.apiKey = apiKey;
        this.model = model;
        if (systemPrompt) this.systemPrompt = systemPrompt;
    }

    /**
     * Strips <think>...</think> reasoning tags on the fly.
     */
    stripThinkingTags(text) {
        const trimmedStart = text.trimStart();
        if ('<think>'.startsWith(trimmedStart)) {
            return '';
        }
        return text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
    }

    /**
     * Sends transcription to Groq and streams response tokens in real-time.
     * @param {string} transcription
     */
    async generateAnswer(transcription) {
        if (!this.apiKey || !transcription || transcription.trim() === '') return;

        this.isGenerating = true;
        this.conversationHistory.push({ role: 'user', content: transcription.trim() });

        if (this.conversationHistory.length > 20) {
            this.conversationHistory = this.conversationHistory.slice(-20);
        }

        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [{ role: 'system', content: this.systemPrompt }, ...this.conversationHistory],
                    stream: true,
                    temperature: 0.7,
                    max_completion_tokens: 4096,
                }),
            });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Groq HTTP ${response.status}: ${err}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(l => l.trim() !== '');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const json = JSON.parse(data);
                            const token = json.choices?.[0]?.delta?.content || '';
                            if (token) {
                                fullText += token;
                                const cleaned = this.stripThinkingTags(fullText);
                                if (cleaned) {
                                    this.onToken?.(cleaned);
                                }
                            }
                        } catch (e) {}
                    }
                }
            }

            const finalResponse = this.stripThinkingTags(fullText);
            if (finalResponse) {
                this.conversationHistory.push({ role: 'assistant', content: finalResponse });
                this.onComplete?.(finalResponse);
            }
        } catch (error) {
            console.error('[GroqService] Generation error:', error);
            this.onError?.(error.message);
        } finally {
            this.isGenerating = false;
        }
    }
}

module.exports = new GroqService();
