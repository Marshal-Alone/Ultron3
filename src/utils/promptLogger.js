/**
 * Prompt Logger Utility
 * Logs final prompts being sent to AI for debugging
 */

class PromptLogger {
    /**
     * Log a text prompt being sent to AI
     * @param {string} provider - 'Gemini' or 'Groq'
     * @param {string} prompt - The actual prompt being sent
     */
    static logTextPrompt(provider, prompt) {
        console.log('\n' + '='.repeat(70));
        console.log(`📤 FINAL PROMPT BEING SENT TO ${provider.toUpperCase()}:`);
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
        console.log(`📸 FINAL PROMPT BEING SENT TO ${provider.toUpperCase()} (SCREENSHOT ANALYSIS):`);
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
        console.log(`\n✅ Session started: ${sessionId} (Profile: ${profile})`);
    }

    /**
     * Log session end
     * @param {string} sessionId - Session ID
     */
    static logSessionEnd(sessionId) {
        console.log(`\n✅ Session ended: ${sessionId}`);
    }

    /**
     * Log AI response received
     * @param {string} provider - 'Gemini' or 'Groq'
     * @param {string} response - Response text
     * @param {number} length - Length of response
     */
    static logResponseReceived(provider, response, length) {
        console.log(`\n✅ Response received from ${provider}: ${length} characters`);
    }
}

module.exports = PromptLogger;
