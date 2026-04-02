const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_VERSION = 1;

// Default values
const DEFAULT_CONFIG = {
    configVersion: CONFIG_VERSION,
    onboarded: false,
    layout: 'normal'
};

const DEFAULT_CREDENTIALS = {
    apiKey: '',
    groqApiKey: ''
};

const DEFAULT_PREFERENCES = {
    customPrompt: '',
    selectedProfile: 'interview',
    selectedLanguage: 'en-US',
    selectedScreenshotInterval: '5',
    selectedImageQuality: 'medium',
    advancedMode: false,
    audioMode: 'speaker_only',
    fontSize: 16,
    backgroundTransparency: 0.8,
    googleSearchEnabled: false,
    aiProvider: 'gemini',  // 'gemini' or 'groq'
    // Invigilator Mode preferences
    invigilatorTypingMode: 'charByChar',  // 'charByChar' or 'instant'
    invigilatorModeEnabled: false  // Default to disabled
};

const DEFAULT_KEYBINDS = null; // null means use system defaults

const DEFAULT_LIMITS = {
    data: [] // Array of { date: 'YYYY-MM-DD', flash: { count: 0 }, flashLite: { count: 0 } }
};

// Get the config directory path based on OS
function getConfigDir() {
    const platform = os.platform();
    let configDir;

    if (platform === 'win32') {
        configDir = path.join(os.homedir(), 'AppData', 'Roaming', 'jarvis-config');
    } else if (platform === 'darwin') {
        configDir = path.join(os.homedir(), 'Library', 'Application Support', 'jarvis-config');
    } else {
        configDir = path.join(os.homedir(), '.config', 'jarvis-config');
    }

    return configDir;
}

// File paths
function getConfigPath() {
    return path.join(getConfigDir(), 'config.json');
}

function getCredentialsPath() {
    return path.join(getConfigDir(), 'credentials.json');
}

function getPreferencesPath() {
    return path.join(getConfigDir(), 'preferences.json');
}

function getKeybindsPath() {
    return path.join(getConfigDir(), 'keybinds.json');
}

function getLimitsPath() {
    return path.join(getConfigDir(), 'limits.json');
}

function getHistoryDir() {
    return path.join(getConfigDir(), 'history');
}

// Helper to read JSON file safely
function readJsonFile(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.warn(`Error reading ${filePath}:`, error.message);
    }
    return defaultValue;
}

// Helper to write JSON file safely
function writeJsonFile(filePath, data) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error(`Error writing ${filePath}:`, error.message);
        return false;
    }
}

// Check if we need to reset (no configVersion or wrong version)
function needsReset() {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
        return true;
    }

    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return !config.configVersion || config.configVersion !== CONFIG_VERSION;
    } catch {
        return true;
    }
}

// Wipe and reinitialize the config directory
function resetConfigDir() {
    const configDir = getConfigDir();

    console.log('Resetting config directory...');

    // Remove existing directory if it exists
    if (fs.existsSync(configDir)) {
        fs.rmSync(configDir, { recursive: true, force: true });
    }

    // Create fresh directory structure
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(getHistoryDir(), { recursive: true });

    // Initialize with defaults
    writeJsonFile(getConfigPath(), DEFAULT_CONFIG);
    writeJsonFile(getCredentialsPath(), DEFAULT_CREDENTIALS);
    writeJsonFile(getPreferencesPath(), DEFAULT_PREFERENCES);

    console.log('Config directory initialized with defaults');
}

// Initialize storage - call this on app startup
function initializeStorage() {
    // Only reset if needed (version mismatch or no config exists)
    if (needsReset()) {
        resetConfigDir();
    }
}

// ============ CONFIG ============

function getConfig() {
    return readJsonFile(getConfigPath(), DEFAULT_CONFIG);
}

function setConfig(config) {
    const current = getConfig();
    const updated = { ...current, ...config, configVersion: CONFIG_VERSION };
    return writeJsonFile(getConfigPath(), updated);
}

function updateConfig(key, value) {
    const config = getConfig();
    config[key] = value;
    return writeJsonFile(getConfigPath(), config);
}

// ============ CREDENTIALS ============

function getCredentials() {
    return readJsonFile(getCredentialsPath(), DEFAULT_CREDENTIALS);
}

function setCredentials(credentials) {
    const current = getCredentials();
    const updated = { ...current, ...credentials };
    return writeJsonFile(getCredentialsPath(), updated);
}

function getApiKey() {
    return getCredentials().apiKey || '';
}

function setApiKey(apiKey) {
    return setCredentials({ apiKey });
}

function getGroqApiKey() {
    return getCredentials().groqApiKey || '';
}

function setGroqApiKey(apiKey) {
    return setCredentials({ groqApiKey: apiKey });
}

// ============ PREFERENCES ============

function getPreferences() {
    const saved = readJsonFile(getPreferencesPath(), {});
    return { ...DEFAULT_PREFERENCES, ...saved };
}

function setPreferences(preferences) {
    const current = getPreferences();
    const updated = { ...current, ...preferences };
    return writeJsonFile(getPreferencesPath(), updated);
}

function updatePreference(key, value) {
    const preferences = getPreferences();
    preferences[key] = value;
    return writeJsonFile(getPreferencesPath(), preferences);
}

// ============ KEYBINDS ============

function getKeybinds() {
    return readJsonFile(getKeybindsPath(), DEFAULT_KEYBINDS);
}

function setKeybinds(keybinds) {
    return writeJsonFile(getKeybindsPath(), keybinds);
}

// ============ LIMITS (Rate Limiting) ============

function getLimits() {
    return readJsonFile(getLimitsPath(), DEFAULT_LIMITS);
}

function setLimits(limits) {
    return writeJsonFile(getLimitsPath(), limits);
}

function getTodayDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD
}

function getTodayLimits() {
    const limits = getLimits();
    const today = getTodayDateString();

    // Find today's entry
    const todayEntry = limits.data.find(entry => entry.date === today);

    if (todayEntry) {
        return todayEntry;
    }

    // No entry for today - clean old entries and create new one
    limits.data = limits.data.filter(entry => entry.date === today);
    const newEntry = {
        date: today,
        flash: { count: 0 },
        flashLite: { count: 0 }
    };
    limits.data.push(newEntry);
    setLimits(limits);

    return newEntry;
}

function incrementLimitCount(model) {
    const limits = getLimits();
    const today = getTodayDateString();

    // Find or create today's entry
    let todayEntry = limits.data.find(entry => entry.date === today);

    if (!todayEntry) {
        // Clean old entries and create new one
        limits.data = [];
        todayEntry = {
            date: today,
            flash: { count: 0 },
            flashLite: { count: 0 }
        };
        limits.data.push(todayEntry);
    } else {
        // Clean old entries, keep only today
        limits.data = limits.data.filter(entry => entry.date === today);
    }

    // Increment the appropriate model count
    if (model === 'gemini-2.5-flash') {
        todayEntry.flash.count++;
    } else if (model === 'gemini-2.5-flash-lite') {
        todayEntry.flashLite.count++;
    }

    setLimits(limits);
    return todayEntry;
}

function getAvailableModel() {
    const todayLimits = getTodayLimits();

    // RPD limits: flash = 20, flash-lite = 20
    // After both exhausted, fall back to flash (for paid API users)
    if (todayLimits.flash.count < 20) {
        return 'gemini-2.5-flash';
    } else if (todayLimits.flashLite.count < 20) {
        return 'gemini-2.5-flash-lite';
    }

    return 'gemini-2.5-flash'; // Default to flash for paid API users
}

// ============ HISTORY ============

function getSessionPath(sessionId) {
    return path.join(getHistoryDir(), `${sessionId}.json`);
}

function saveSession(sessionId, data) {
    const sessionPath = getSessionPath(sessionId);

    // Load existing session to preserve metadata
    const existingSession = readJsonFile(sessionPath, null);

    const sessionData = {
        sessionId,
        createdAt: existingSession?.createdAt || parseInt(sessionId),
        lastUpdated: Date.now(),
        // Profile context - set once when session starts
        profile: data.profile || existingSession?.profile || null,
        customPrompt: data.customPrompt || existingSession?.customPrompt || null,
        // Conversation data
        conversationHistory: data.conversationHistory || existingSession?.conversationHistory || [],
        screenAnalysisHistory: data.screenAnalysisHistory || existingSession?.screenAnalysisHistory || []
    };
    return writeJsonFile(sessionPath, sessionData);
}

function getSession(sessionId) {
    return readJsonFile(getSessionPath(sessionId), null);
}

function getAllSessions() {
    const historyDir = getHistoryDir();

    try {
        if (!fs.existsSync(historyDir)) {
            return [];
        }

        const files = fs.readdirSync(historyDir)
            .filter(f => f.endsWith('.json'))
            .sort((a, b) => {
                // Sort by timestamp descending (newest first)
                const tsA = parseInt(a.replace('.json', ''));
                const tsB = parseInt(b.replace('.json', ''));
                return tsB - tsA;
            });

        return files.map(file => {
            const sessionId = file.replace('.json', '');
            const data = readJsonFile(path.join(historyDir, file), null);
            if (data) {
                return {
                    sessionId,
                    createdAt: data.createdAt,
                    lastUpdated: data.lastUpdated,
                    messageCount: data.conversationHistory?.length || 0,
                    screenAnalysisCount: data.screenAnalysisHistory?.length || 0,
                    profile: data.profile || null,
                    customPrompt: data.customPrompt || null
                };
            }
            return null;
        }).filter(Boolean);
    } catch (error) {
        console.error('Error reading sessions:', error.message);
        return [];
    }
}

function deleteSession(sessionId) {
    const sessionPath = getSessionPath(sessionId);
    try {
        if (fs.existsSync(sessionPath)) {
            fs.unlinkSync(sessionPath);
            return true;
        }
    } catch (error) {
        console.error('Error deleting session:', error.message);
    }
    return false;
}

function deleteAllSessions() {
    const historyDir = getHistoryDir();
    try {
        if (fs.existsSync(historyDir)) {
            const files = fs.readdirSync(historyDir).filter(f => f.endsWith('.json'));
            files.forEach(file => {
                fs.unlinkSync(path.join(historyDir, file));
            });
        }
        return true;
    } catch (error) {
        console.error('Error deleting all sessions:', error.message);
        return false;
    }
}

// ============ WINDOW SIZE ============

function getWindowSize() {
    const prefs = getPreferences();
    return {
        width: prefs.windowWidth || 1100,
        height: prefs.windowHeight || 800
    };
}

function setWindowSize(width, height) {
    return updatePreference('windowWidth', width) && updatePreference('windowHeight', height);
}

// ============ SCREENSHOT SAVING ============

/**
 * Save a screenshot from screen analysis
 * @param {string} base64Data - Base64 encoded image data
 * @param {string} sessionId - Session ID for organizing screenshots
 * @returns {Object} {success: boolean, filename?: string, path?: string, error?: string}
 */
function saveSessionScreenshot(base64Data, sessionId, aiResponse = null) {
    try {
        const downloadsPath = path.join(os.homedir(), 'Downloads');
        const conversationsDir = path.join(downloadsPath, 'Ultron-Conversations');
        
        // Ensure main conversations directory exists
        if (!fs.existsSync(conversationsDir)) {
            fs.mkdirSync(conversationsDir, { recursive: true });
        }
        
        // Create a session-specific screenshots folder
        const screenshotsDir = path.join(conversationsDir, `session_${sessionId}_screenshots`);
        if (!fs.existsSync(screenshotsDir)) {
            fs.mkdirSync(screenshotsDir, { recursive: true });
        }
        
        // Generate filename with timestamp
        const now = new Date();
        const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}_${Date.now() % 1000}`;
        const filename = `screenshot_${timestamp}.png`;
        const filepath = path.join(screenshotsDir, filename);
        
        // Convert base64 to buffer and save
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(filepath, buffer);
        // Screenshot saved
        
        // Save AI response as metadata JSON file alongside the screenshot
        if (aiResponse) {
            const metadataFilename = `screenshot_${timestamp}_response.json`;
            const metadataPath = path.join(screenshotsDir, metadataFilename);
            const metadata = {
                timestamp: Date.now(),
                screenshotFilename: filename,
                aiResponse: aiResponse,
                responseTimestamp: new Date().toISOString()
            };
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            // Response metadata saved
        }
        
        // Track screenshot in session with base64 data for history display
        const session = getSession(sessionId);
        if (session) {
            if (!session.screenshotReferences) {
                session.screenshotReferences = [];
            }
            session.screenshotReferences.push({
                timestamp: Date.now(),
                filename: filename,
                imagePath: filepath,
                base64Data: base64Data,  // Store base64 for history display
                aiResponse: aiResponse || undefined
            });
            saveSession(sessionId, session);
        }
        
        return { success: true, filename, path: filepath, hasResponse: Boolean(aiResponse) };
    } catch (error) {
        console.error('❌ Error saving screenshot:', error.message);
        return { success: false, error: error.message };
    }
}

// ============ EXPORT SESSION ============

/**
 * Export a session to Downloads folder with timestamp naming
 * Format: conversation_YYYY-MM-DD_HHmmss.json (JSON data)
 * Also creates conversation_YYYY-MM-DD_HHmmss.md (readable Q&A format)
 * And conversation_YYYY-MM-DD_HHmmss/ (folder with screenshots if any)
 */
function exportSessionToDownloads(sessionId) {
    try {
        const session = getSession(sessionId);
        if (!session) {
            console.error(`Session ${sessionId} not found`);
            return { success: false, error: 'Session not found' };
        }

        // Get Downloads folder path
        const downloadsPath = path.join(os.homedir(), 'Downloads');
        const conversationsDir = path.join(downloadsPath, 'Ultron-Conversations');
        
        // Ensure directory structure exists
        if (!fs.existsSync(conversationsDir)) {
            fs.mkdirSync(conversationsDir, { recursive: true });
        }
        
        // Create timestamp: YYYY-MM-DD_HHmmss
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timestamp = `${year}-${month}-${day}_${hours}${minutes}${seconds}`;
        
        // Create conversation folder structure
        const conversationFolder = path.join(conversationsDir, `conversation_${timestamp}`);
        if (!fs.existsSync(conversationFolder)) {
            fs.mkdirSync(conversationFolder, { recursive: true });
        }
        
        const files = [];
        
        // 1. Export JSON data
        const jsonFilename = `conversation_${timestamp}.json`;
        const jsonFilepath = path.join(conversationFolder, jsonFilename);
        const exportData = {
            ...session,
            exportedAt: Date.now(),
            exportedAtFormatted: now.toISOString()
        };
        fs.writeFileSync(jsonFilepath, JSON.stringify(exportData, null, 2), 'utf8');
        console.log(`Session JSON exported to: ${jsonFilepath}`);
        files.push(jsonFilepath);
        
        // 2. Export as readable Markdown (Q&A pairs with screenshot references)
        const mdFilename = `conversation_${timestamp}.md`;
        const mdFilepath = path.join(conversationFolder, mdFilename);
        let mdContent = `# Conversation - Q&A with Screenshots\n\n`;
        mdContent += `**Date:** ${new Date(session.createdAt).toLocaleString()}\n`;
        mdContent += `**Profile:** ${session.profile || 'N/A'}\n`;
        if (session.customPrompt) {
            mdContent += `**Custom Prompt:** ${session.customPrompt}\n`;
        }
        mdContent += `**Total Q&A Pairs:** ${session.conversationHistory?.length || 0}\n`;
        mdContent += `**Screenshots Captured:** ${session.screenshotReferences?.length || 0}\n`;
        mdContent += `**Note:** Screenshots saved in 'screenshots' subfolder\n\n`;
        mdContent += `---\n\n`;
        
        if (session.conversationHistory && session.conversationHistory.length > 0) {
            session.conversationHistory.forEach((turn, index) => {
                mdContent += `### Q${index + 1}: User\n\n`;
                mdContent += `${turn.transcription}\n\n`;
                mdContent += `### A${index + 1}: AI Response\n\n`;
                mdContent += `${turn.ai_response}\n\n`;
                mdContent += `---\n\n`;
            });
        }
        
        fs.writeFileSync(mdFilepath, mdContent, 'utf8');
        console.log(`✅ Markdown exported to: ${mdFilepath}`);
        files.push(mdFilepath);
        
        // 3. Copy screenshots to conversations folder
        const oldScreenshotsDir = path.join(conversationsDir, `session_${sessionId}_screenshots`);
        if (fs.existsSync(oldScreenshotsDir)) {
            const screenshotsFolder = path.join(conversationFolder, 'screenshots');
            if (!fs.existsSync(screenshotsFolder)) {
                fs.mkdirSync(screenshotsFolder, { recursive: true });
            }
            
            // Copy all screenshots
            const screenshotFiles = fs.readdirSync(oldScreenshotsDir);
            screenshotFiles.forEach(file => {
                const source = path.join(oldScreenshotsDir, file);
                const dest = path.join(screenshotsFolder, file);
                fs.copyFileSync(source, dest);
            });
            console.log(`✅ ${screenshotFiles.length} screenshots copied to: ${screenshotsFolder}`);
            files.push(screenshotsFolder);
        }
        
        return { success: true, filepaths: files, timestamp, folder: conversationFolder };
    } catch (error) {
        console.error('Error exporting session:', error.message);
        return { success: false, error: error.message };
    }
}

// ============ CLEAR ALL DATA ============

function clearAllData() {
    resetConfigDir();
    return true;
}

module.exports = {
    // Initialization
    initializeStorage,
    getConfigDir,

    // Config
    getConfig,
    setConfig,
    updateConfig,

    // Credentials
    getCredentials,
    setCredentials,
    getApiKey,
    setApiKey,
    getGroqApiKey,
    setGroqApiKey,

    // Preferences
    getPreferences,
    setPreferences,
    updatePreference,

    // Keybinds
    getKeybinds,
    setKeybinds,

    // Limits (Rate Limiting)
    getLimits,
    setLimits,
    getTodayLimits,
    incrementLimitCount,
    getAvailableModel,

    // History
    saveSession,
    getSession,
    getAllSessions,
    deleteSession,
    deleteAllSessions,

    // Window Size
    getWindowSize,
    setWindowSize,

    // Screenshots
    saveSessionScreenshot,

    // Export
    exportSessionToDownloads,

    // Clear all
    clearAllData
};
