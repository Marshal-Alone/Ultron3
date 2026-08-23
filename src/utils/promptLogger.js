/**
 * Prompt Logger Utility
 * Logs final prompts being sent to AI for debugging
 */

class PromptLogger {
    /**
     * Standardized unified payload logging for any question/prompt sent to AI
     * @param {Object} options
     * @param {string} options.systemPrompt
     * @param {Array} [options.conversationHistory]
     * @param {string} options.question
     */
    static logPayloadSentToAI({ systemPrompt, conversationHistory = [], question }) {
        console.log('\n======================== [PAYLOAD SENT TO AI] ========================');
        console.log('[SYSTEM PROMPT]:');
        console.log(systemPrompt || '(Default system persona)');
        if (conversationHistory && conversationHistory.length > 0) {
            console.log('---------------------------------------------------------------------');
            console.log(`[CONVERSATION HISTORY (${conversationHistory.length} turns)]:`);
            conversationHistory.slice(-5).forEach((t, i) => {
                const userText = t.transcription || (t.role === 'user' ? t.content : '') || '';
                const aiText = t.ai_response || (t.role === 'assistant' ? t.content : '') || '';
                if (userText || aiText) {
                    console.log(`  [Turn ${i + 1}] User: "${userText}" | AI: "${(aiText || '').slice(0, 80)}..."`);
                }
            });
        }
        console.log('---------------------------------------------------------------------');
        console.log(`[QUESTION]: "${question || ''}"`);
        console.log('=====================================================================\n');
    }

    /**
     * Log a text prompt being sent to AI
     * @param {string} provider - 'Gemini' or 'Groq'
     * @param {string} prompt - The actual prompt being sent
     */
    static logTextPrompt(provider, prompt) {
        console.log('\n' + '='.repeat(70));
        console.log(`FINAL PROMPT BEING SENT TO ${provider.toUpperCase()}:`);
        console.log('='.repeat(70));
        console.log(prompt);
        console.log('='.repeat(70) + '\n');
    }

    /**
     * Log a screenshot analysis prompt
     * @param {string} provider - 'Gemini' or 'Groq'
     * @param {string} prompt - The analysis prompt
     */
    static logScreenshotPrompt(provider, prompt) {
        console.log('\n' + '='.repeat(70));
        console.log(`FINAL PROMPT BEING SENT TO ${provider.toUpperCase()} (SCREENSHOT ANALYSIS):`);
        console.log('='.repeat(70));
        console.log(prompt);
        console.log('='.repeat(70) + '\n');
    }

    /**
     * Log session start
     * @param {string} sessionId - Session ID
     * @param {string} profile - Profile name
     */
    static logSessionStart(sessionId, profile) {
        console.log(`\nSession started: ${sessionId} (Profile: ${profile})`);
    }

    /**
     * Log session end
     * @param {string} sessionId - Session ID
     */
    static logSessionEnd(sessionId) {
        console.log(`\nSession ended: ${sessionId}`);
    }

    /**
     * Log AI response received
     * @param {string} provider - 'Gemini' or 'Groq'
     * @param {string} response - Response text
     * @param {number} length - Length of response
     */
    static logResponseReceived(provider, response, length) {
        console.log(`\nResponse received from ${provider}: ${length} characters`);
    }
}

module.exports = PromptLogger;
