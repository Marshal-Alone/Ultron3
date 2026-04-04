if (require('electron-squirrel-startup')) {
    process.exit(0);
}

const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { createWindow, updateGlobalShortcuts } = require('./utils/window');
const { setupGeminiIpcHandlers, stopMacOSAudioCapture, sendToRenderer } = require('./utils/gemini');
const storage = require('./storage');
const { execFile } = require('child_process');

const geminiSessionRef = { current: null };
let mainWindow = null;
let currentSessionId = null;

function createMainWindow() {
    mainWindow = createWindow(sendToRenderer, geminiSessionRef);
    return mainWindow;
}

app.whenReady().then(async () => {
    // Initialize storage (checks version, resets if needed)
    storage.initializeStorage();

    createMainWindow();
    setupGeminiIpcHandlers(geminiSessionRef);
    setupStorageIpcHandlers();
    setupGeneralIpcHandlers();
});

app.on('window-all-closed', () => {
    stopMacOSAudioCapture();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Auto-save session when app is about to quit
app.on('before-quit', async (event) => {
    console.log('=== APP QUIT - AUTO-SAVING SESSION ===');
    
    try {
        if (currentSessionId) {
            console.log(`Attempting to save session: ${currentSessionId}`);
            const session = storage.getSession(currentSessionId);
            console.log(`Retrieved session:`, session);
            
            if (session && (session.conversationHistory?.length > 0 || session.screenAnalysisHistory?.length > 0)) {
                const result = storage.exportSessionToDownloads(currentSessionId);
                if (result.success) {
                    console.log(`✅ Session auto-saved successfully`);
                    console.log(`Files saved:`, result.filepaths);
                } else {
                    console.error('❌ Failed to auto-save session:', result.error);
                }
            } else {
                console.log('⚠️ Session is empty, skipping export');
            }
        } else {
            console.log('⚠️ No active session to save');
        }
    } catch (error) {
        console.error('❌ Error during app quit auto-save:', error);
    }
    
    // Stop audio capture
    stopMacOSAudioCapture();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

function setupStorageIpcHandlers() {
    // ============ CONFIG ============
    ipcMain.handle('storage:get-config', async () => {
        try {
            return { success: true, data: storage.getConfig() };
        } catch (error) {
            console.error('Error getting config:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-config', async (event, config) => {
        try {
            storage.setConfig(config);
            return { success: true };
        } catch (error) {
            console.error('Error setting config:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:update-config', async (event, key, value) => {
        try {
            storage.updateConfig(key, value);
            return { success: true };
        } catch (error) {
            console.error('Error updating config:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ CREDENTIALS ============
    ipcMain.handle('storage:get-credentials', async () => {
        try {
            return { success: true, data: storage.getCredentials() };
        } catch (error) {
            console.error('Error getting credentials:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-credentials', async (event, credentials) => {
        try {
            storage.setCredentials(credentials);
            return { success: true };
        } catch (error) {
            console.error('Error setting credentials:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-api-key', async () => {
        try {
            return { success: true, data: storage.getApiKey() };
        } catch (error) {
            console.error('Error getting API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-api-key', async (event, apiKey) => {
        try {
            storage.setApiKey(apiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting API key:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ GROQ API KEY ============
    ipcMain.handle('storage:get-groq-api-key', async () => {
        try {
            return { success: true, data: storage.getGroqApiKey() };
        } catch (error) {
            console.error('Error getting Groq API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-groq-api-key', async (event, apiKey) => {
        try {
            storage.setGroqApiKey(apiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting Groq API key:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ PREFERENCES ============
    ipcMain.handle('storage:get-preferences', async () => {
        try {
            return { success: true, data: storage.getPreferences() };
        } catch (error) {
            console.error('Error getting preferences:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-preferences', async (event, preferences) => {
        try {
            storage.setPreferences(preferences);
            return { success: true };
        } catch (error) {
            console.error('Error setting preferences:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:update-preference', async (event, key, value) => {
        try {
            storage.updatePreference(key, value);
            return { success: true };
        } catch (error) {
            console.error('Error updating preference:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ KEYBINDS ============
    ipcMain.handle('storage:get-keybinds', async () => {
        try {
            return { success: true, data: storage.getKeybinds() };
        } catch (error) {
            console.error('Error getting keybinds:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-keybinds', async (event, keybinds) => {
        try {
            storage.setKeybinds(keybinds);
            return { success: true };
        } catch (error) {
            console.error('Error setting keybinds:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ HISTORY ============
    ipcMain.handle('storage:get-all-sessions', async () => {
        try {
            return { success: true, data: storage.getAllSessions() };
        } catch (error) {
            console.error('Error getting sessions:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-session', async (event, sessionId) => {
        try {
            return { success: true, data: storage.getSession(sessionId) };
        } catch (error) {
            console.error('Error getting session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:save-session', async (event, sessionId, data) => {
        try {
            storage.saveSession(sessionId, data);
            return { success: true };
        } catch (error) {
            console.error('Error saving session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:delete-session', async (event, sessionId) => {
        try {
            storage.deleteSession(sessionId);
            return { success: true };
        } catch (error) {
            console.error('Error deleting session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:delete-all-sessions', async () => {
        try {
            storage.deleteAllSessions();
            return { success: true };
        } catch (error) {
            console.error('Error deleting all sessions:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ LIMITS ============
    ipcMain.handle('storage:get-today-limits', async () => {
        try {
            return { success: true, data: storage.getTodayLimits() };
        } catch (error) {
            console.error('Error getting today limits:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ CLEAR ALL ============
    ipcMain.handle('storage:clear-all', async () => {
        try {
            storage.clearAllData();
            return { success: true };
        } catch (error) {
            console.error('Error clearing all data:', error);
            return { success: false, error: error.message };
        }
    });
}

function setupGeneralIpcHandlers() {
    ipcMain.handle('get-app-version', async () => {
        return app.getVersion();
    });

    ipcMain.handle('quit-application', async event => {
        try {
            stopMacOSAudioCapture();
            app.quit();
            return { success: true };
        } catch (error) {
            console.error('Error quitting application:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('open-external', async (event, url) => {
        try {
            await shell.openExternal(url);
            return { success: true };
        } catch (error) {
            console.error('Error opening external URL:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.on('update-keybinds', (event, newKeybinds) => {
        if (mainWindow) {
            // Also save to storage
            storage.setKeybinds(newKeybinds);
            updateGlobalShortcuts(newKeybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }
    });

    // AI Provider sync
    ipcMain.on('ai-provider-changed-notify', (event, provider) => {
        sendToRenderer('ai-provider-changed', provider);
    });

    // Debug logging from renderer
    ipcMain.on('log-message', (event, msg) => {
        console.log(msg);
    });

    // ============ QUICK START & KILL SWITCH ============

    // Track current session ID from renderer (set when session starts)
    ipcMain.on('session-started', (event, sessionId) => {
        currentSessionId = sessionId;
        console.log('Current session tracked:', sessionId);
    });

    // Handle kill switch export request
    ipcMain.on('kill-switch-export', (event, sessionId) => {
        if (sessionId) {
            console.log('Kill switch export requested for session:', sessionId);
            const result = storage.exportSessionToDownloads(sessionId);
            if (result.success) {
                console.log(`Session exported via kill switch: ${result.filepath}`);
            }
        }
    });

    // Handle quick start Groq request from main process (sent via shortcut)
    ipcMain.on('trigger-quick-start-groq', (event) => {
        console.log('Quick start Groq triggered via IPC');
        // The shortcut handler already sent 'quick-start-groq' to renderer
        // This is just for additional cleanup if needed
    });

    // Handle quick stop request from main process (sent via shortcut)
    ipcMain.on('trigger-quick-stop', (event) => {
        console.log('Quick stop triggered via IPC');
        // The shortcut handler already sent 'quick-stop' to renderer
    });

    // ============ KEYBOARD SIMULATION ============
    // Handle keyboard key sending for auto-type feature
    ipcMain.on('keyboard:send-key', (event, key) => {
        try {
            console.log(`[KEYBOARD] Sending key: ${key}`);
            
            // Map special key names and characters for SendKeys method
            const sendKeysMap = {
                // Special key names (from autotype.js)
                'Enter': '{ENTER}',
                'Tab': '{TAB}',
                'Backspace': '{BACKSPACE}',
                'Delete': '{DELETE}',
                'Escape': '{ESCAPE}',
                'Home': '{HOME}',
                'End': '{END}',
                'PageUp': '{PAGEUP}',
                'PageDown': '{PAGEDOWN}',
                'ArrowUp': '{UP}',
                'ArrowDown': '{DOWN}',
                'ArrowLeft': '{LEFT}',
                'ArrowRight': '{RIGHT}',
                'Shift': '+',
                'Control': '^',
                'Alt': '%',
                
                // Special characters
                '{': '{{',
                '}': '}}',
                '+': '{PLUS}',
                '^': '{CARET}',
                '%': '{PERCENT}',
                '\n': '{ENTER}',
                '\t': '{TAB}',
            };
            
            // Convert key using map, or use as-is
            let mappedKey = key;
            if (sendKeysMap[key]) {
                mappedKey = sendKeysMap[key];
            }
            
            // Create PowerShell command with proper escaping
            const escapedKey = mappedKey.replace(/'/g, "''").replace(/\$/g, '`$');
            const psCommand = `Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.SendKeys]::SendWait('${escapedKey}')`;
            
            // Execute PowerShell command
            execFile('powershell.exe', ['-NoProfile', '-Command', psCommand], 
                { timeout: 2000 }, 
                (error, stdout, stderr) => {
                    if (error) {
                        console.error(`[KEYBOARD] Error sending "${key}" (mapped: "${mappedKey}"):`, (stderr || error.message).split('\n')[0]);
                    }
                }
            );
        } catch (error) {
            console.error(`[KEYBOARD] Failed to send key "${key}":`, error.message);
        }
    });

    // Synchronous handler for keyboard:send-key (used by sendSync)
    ipcMain.handle('keyboard:send-key-sync', async (event, key) => {
        try {
            console.log(`[KEYBOARD] Sending key (sync): ${key}`);
            
            // Map special key names and characters for SendKeys method
            const sendKeysMap = {
                // Special key names (from autotype.js)
                'Enter': '{ENTER}',
                'Tab': '{TAB}',
                'Backspace': '{BACKSPACE}',
                'Delete': '{DELETE}',
                'Escape': '{ESCAPE}',
                'Home': '{HOME}',
                'End': '{END}',
                'PageUp': '{PAGEUP}',
                'PageDown': '{PAGEDOWN}',
                'ArrowUp': '{UP}',
                'ArrowDown': '{DOWN}',
                'ArrowLeft': '{LEFT}',
                'ArrowRight': '{RIGHT}',
                'Shift': '+',
                'Control': '^',
                'Alt': '%',
                
                // Special characters
                '{': '{{',
                '}': '}}',
                '+': '{PLUS}',
                '^': '{CARET}',
                '%': '{PERCENT}',
                '\n': '{ENTER}',
                '\t': '{TAB}',
            };
            
            // Convert key using map, or use as-is
            let mappedKey = key;
            if (sendKeysMap[key]) {
                mappedKey = sendKeysMap[key];
            }
            
            // Create PowerShell command with proper escaping
            const escapedKey = mappedKey.replace(/'/g, "''").replace(/\$/g, '`$');
            const psCommand = `Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.SendKeys]::SendWait('${escapedKey}')`;
            
            // Execute PowerShell command and wait for completion
            return new Promise((resolve, reject) => {
                execFile('powershell.exe', ['-NoProfile', '-Command', psCommand], 
                    { timeout: 2000 }, 
                    (error, stdout, stderr) => {
                        if (error) {
                            console.error(`[KEYBOARD] Error sending "${key}" (mapped: "${mappedKey}"):`, (stderr || error.message).split('\n')[0]);
                            reject(error);
                        } else {
                            resolve(true);
                        }
                    }
                );
            });
        } catch (error) {
            console.error(`[KEYBOARD] Failed to send key "${key}":`, error.message);
            throw error;
        }
    });
}
