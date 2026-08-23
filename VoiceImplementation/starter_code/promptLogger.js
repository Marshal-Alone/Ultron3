/**
 * promptLogger.js
 * Standardizes AI prompt and payload debug logging across all services.
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
                const aiText = t.ai_response || (t.role === 'assistant' || t.role === 'model' ? t.content : '') || '';
                if (userText || aiText) {
                    console.log(`  [Turn ${i + 1}] User: "${userText}" | AI: "${(aiText || '').slice(0, 80)}..."`);
                }
            });
        }
        console.log('---------------------------------------------------------------------');
        console.log(`[QUESTION]: "${question || ''}"`);
        console.log('=====================================================================\n');
    }
}

module.exports = PromptLogger;
