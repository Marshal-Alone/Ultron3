/**
 * AI Router - Centralized AI provider switching
 * Routes requests to either Gemini or Groq based on user preference
 */
const storage = require('../storage');

// Lazy imports to avoid circular dependencies
let geminiModule = null;
let groqModule = null;

function getGeminiModule() {
    if (!geminiModule) {
        geminiModule = require('./gemini');
    }
    return geminiModule;
}

function getGroqModule() {
    if (!groqModule) {
        groqModule = require('./groq');
    }
    return groqModule;
}

/**
 * Get the current AI provider from preferences
 * @returns {'gemini' | 'groq'}
 */
function getProvider() {
    const prefs = storage.getPreferences();
    return prefs.aiProvider || 'gemini';
}

/**
 * Set the AI provider preference
 * @param {'gemini' | 'groq'} provider
 */
function setProvider(provider) {
    storage.updatePreference('aiProvider', provider);
}

/**
 * Check if the selected provider is available (has API key)
 * @param {'gemini' | 'groq'} provider
 * @returns {boolean}
 */
function isProviderAvailable(provider) {
    if (provider === 'groq') {
        return !!storage.getGroqApiKey();
    }
    return !!storage.getApiKey();  // Gemini
}

/**
 * Get available provider (falls back if selected is unavailable)
 * @returns {'gemini' | 'groq'}
 */
function getAvailableProvider() {
    const selected = getProvider();
    if (isProviderAvailable(selected)) {
        return selected;
    }
    // Fall back to the other provider
    const fallback = selected === 'gemini' ? 'groq' : 'gemini';
    if (isProviderAvailable(fallback)) {
        console.log(`[AI Router] ${selected} unavailable, falling back to ${fallback}`);
        return fallback;
    }
    // Return selected anyway - will fail with proper error message
    return selected;
}

/**
 * Send image for analysis (screenshot analysis feature)
 * Routes to appropriate provider based on settings
 * @param {string} base64Data - Raw base64 image data
 * @param {string} prompt - Analysis prompt
 * @returns {Promise<{success: boolean, text?: string, error?: string, model: string}>}
 */
async function sendImageForAnalysis(base64Data, prompt) {
    const provider = getAvailableProvider();
    console.log(`[AI Router] Image analysis using: ${provider.toUpperCase()}`);

    if (provider === 'groq') {
        const { groqAI } = getGroqModule();
        return groqAI.analyzeScreenshot(base64Data, prompt);
    } else {
        const { sendImageToGeminiHttp } = getGeminiModule();
        return sendImageToGeminiHttp(base64Data, prompt);
    }
}

/**
 * Get provider info for display
 * @returns {{current: string, geminiAvailable: boolean, groqAvailable: boolean}}
 */
function getProviderInfo() {
    return {
        current: getProvider(),
        geminiAvailable: isProviderAvailable('gemini'),
        groqAvailable: isProviderAvailable('groq'),
    };
}

module.exports = {
    getProvider,
    setProvider,
    isProviderAvailable,
    getAvailableProvider,
    sendImageForAnalysis,
    getProviderInfo,
};
