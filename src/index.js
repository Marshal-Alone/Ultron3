if (require('electron-squirrel-startup')) {
    process.exit(0);
}

const { app, BrowserWindow, shell, ipcMain, clipboard, screen, globalShortcut } = require('electron');
const { createWindow, updateGlobalShortcuts } = require('./utils/window');
const { setupGeminiIpcHandlers, stopMacOSAudioCapture, sendToRenderer } = require('./utils/gemini');
const storage = require('./storage');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const geminiSessionRef = { current: null };
let mainWindow = null;
let activeTypingProcess = null;
let currentSessionId = null;

function createMainWindow() {
    mainWindow = createWindow(sendToRenderer, geminiSessionRef);
    return mainWindow;
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our existing window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            if (!mainWindow.isVisible()) mainWindow.showInactive();
            mainWindow.focus();
        }
    });

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
} // Close the 'else' block from requestSingleInstanceLock

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

    // ============ OPENROUTER API KEY ============
    ipcMain.handle('storage:get-openrouter-api-key', async () => {
        try {
            return { success: true, data: storage.getOpenRouterApiKey() };
        } catch (error) {
            console.error('Error getting OpenRouter API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-openrouter-api-key', async (event, apiKey) => {
        try {
            storage.setOpenRouterApiKey(apiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting OpenRouter API key:', error);
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
    // Helper PowerShell C# snippet for SendInput
    const winInputCSharp = `
        using System;
        using System.Runtime.InteropServices;
        public class Keyboard {
            [DllImport("user32.dll")]
            public static extern short GetAsyncKeyState(int vKey);
        }
        public class KeyMap {
            [DllImport("user32.dll")]
            public static extern short VkKeyScan(char ch);
        }
        public class WinInput {
            [StructLayout(LayoutKind.Sequential)]
            public struct INPUT {
                public uint type;
                public KEYBDINPUT ki;
            }
            [StructLayout(LayoutKind.Sequential)]
            public struct KEYBDINPUT {
                public ushort wVk;
                public ushort wScan;
                public uint dwFlags;
                public uint time;
                public IntPtr dwExtraInfo;
            }
            [DllImport("user32.dll")]
            public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

            const uint INPUT_KEYBOARD = 1;
            const uint KEYEVENTF_KEYUP = 0x0002;
            const uint KEYEVENTF_UNICODE = 0x0004;

            public static void SendKey(string key) {
                if (string.IsNullOrEmpty(key)) return;

                ushort vk = 0;
                if (key == "Enter" || key == "\\n") vk = 0x0D;
                else if (key == "Tab" || key == "\\t") vk = 0x09;
                else if (key == "Backspace") vk = 0x08;
                else if (key == "Delete") vk = 0x2E;
                else if (key == "Escape") vk = 0x1B;
                else if (key == "Home") vk = 0x24;
                else if (key == "End") vk = 0x23;
                else if (key == "PageUp") vk = 0x21;
                else if (key == "PageDown") vk = 0x22;
                else if (key == "ArrowUp") vk = 0x26;
                else if (key == "ArrowDown") vk = 0x28;
                else if (key == "ArrowLeft") vk = 0x25;
                else if (key == "ArrowRight") vk = 0x27;

                if (vk != 0) {
                    SendVk(vk);
                } else {
                    foreach (char c in key) {
                        SendChar(c);
                    }
                }
            }

            public static void SendChar(char ch) {
                if (ch == '\\r') return;
                if (ch == '\\n') { SendVk(0x0D); return; }
                if (ch == '\\t') { SendVk(0x09); return; }

                short vkCode = KeyMap.VkKeyScan(ch);
                
                // SAFETY: If VkKeyScan wants Ctrl (0x0200) or Alt (0x0400),
                // use Unicode injection instead to avoid triggering shortcuts.
                bool needsCtrl = (vkCode & 0x0200) != 0;
                bool needsAlt  = (vkCode & 0x0400) != 0;
                
                if (vkCode == -1 || needsCtrl || needsAlt) {
                    // Safe Unicode injection — never triggers any shortcut
                    INPUT[] uInputs = new INPUT[2];
                    uInputs[0].type = INPUT_KEYBOARD;
                    uInputs[0].ki.wVk = 0;
                    uInputs[0].ki.wScan = (ushort)ch;
                    uInputs[0].ki.dwFlags = KEYEVENTF_UNICODE;
                    uInputs[1].type = INPUT_KEYBOARD;
                    uInputs[1].ki.wVk = 0;
                    uInputs[1].ki.wScan = (ushort)ch;
                    uInputs[1].ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
                    SendInput(2, uInputs, Marshal.SizeOf(typeof(INPUT)));
                    return;
                }

                ushort vk = (ushort)(vkCode & 0xFF);
                bool shift = (vkCode & 0x0100) != 0;

                // Only Shift is safe to combine with VK codes.
                // Ctrl and Alt are NEVER sent (handled above).
                int numInputs = 2;
                if (shift) numInputs += 2;

                INPUT[] inputs = new INPUT[numInputs];
                int i = 0;

                if (shift) {
                    inputs[i].type = INPUT_KEYBOARD;
                    inputs[i].ki.wVk = 0x10; // VK_SHIFT
                    inputs[i].ki.wScan = 0;
                    inputs[i].ki.dwFlags = 0;
                    i++;
                }

                inputs[i].type = INPUT_KEYBOARD;
                inputs[i].ki.wVk = vk;
                inputs[i].ki.wScan = 0;
                inputs[i].ki.dwFlags = 0;
                i++;

                inputs[i].type = INPUT_KEYBOARD;
                inputs[i].ki.wVk = vk;
                inputs[i].ki.wScan = 0;
                inputs[i].ki.dwFlags = KEYEVENTF_KEYUP;
                i++;

                if (shift) {
                    inputs[i].type = INPUT_KEYBOARD;
                    inputs[i].ki.wVk = 0x10;
                    inputs[i].ki.wScan = 0;
                    inputs[i].ki.dwFlags = KEYEVENTF_KEYUP;
                    i++;
                }

                SendInput((uint)numInputs, inputs, Marshal.SizeOf(typeof(INPUT)));
            }

            public static void SendVk(ushort vk) {
                INPUT[] inputs = new INPUT[2];
                inputs[0].type = INPUT_KEYBOARD;
                inputs[0].ki.wVk = vk;
                inputs[0].ki.wScan = 0;
                inputs[0].ki.dwFlags = 0;

                inputs[1].type = INPUT_KEYBOARD;
                inputs[1].ki.wVk = vk;
                inputs[1].ki.wScan = 0;
                inputs[1].ki.dwFlags = KEYEVENTF_KEYUP;

                SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
            }

            public static void SendVkCombo(ushort modifierVk, ushort keyVk) {
                INPUT[] inputs = new INPUT[4];
                inputs[0].type = INPUT_KEYBOARD;
                inputs[0].ki.wVk = modifierVk;
                inputs[0].ki.dwFlags = 0;

                inputs[1].type = INPUT_KEYBOARD;
                inputs[1].ki.wVk = keyVk;
                inputs[1].ki.dwFlags = 0;

                inputs[2].type = INPUT_KEYBOARD;
                inputs[2].ki.wVk = keyVk;
                inputs[2].ki.dwFlags = KEYEVENTF_KEYUP;

                inputs[3].type = INPUT_KEYBOARD;
                inputs[3].ki.wVk = modifierVk;
                inputs[3].ki.dwFlags = KEYEVENTF_KEYUP;

                SendInput(4, inputs, Marshal.SizeOf(typeof(INPUT)));
            }
        }
    `;

    // Handle keyboard key sending for auto-type feature (async fire-and-forget)
    ipcMain.on('keyboard:send-key', (event, key) => {
        try {
            console.log(`[KEYBOARD] Sending key: ${key}`);
            const escapedKey = String(key).replace(/'/g, "''").replace(/\\/g, '\\\\');
            const psCommand = `Add-Type -TypeDefinition @'\n${winInputCSharp}\n'@; [WinInput]::SendKey('${escapedKey}')`;
            
            execFile('powershell.exe', ['-NoProfile', '-Command', psCommand], 
                { timeout: 2000 }, 
                (error, stdout, stderr) => {
                    if (error) {
                        console.error(`[KEYBOARD] Error sending "${key}":`, (stderr || error.message).split('\n')[0]);
                    }
                }
            );
        } catch (error) {
            console.error(`[KEYBOARD] Failed to send key "${key}":`, error.message);
        }
    });

    // Synchronous handler for keyboard:send-key (used by send-key-sync)
    ipcMain.handle('keyboard:send-key-sync', async (event, key) => {
        try {
            console.log(`[KEYBOARD] Sending key (sync): ${key}`);
            const escapedKey = String(key).replace(/'/g, "''").replace(/\\/g, '\\\\');
            const psCommand = `Add-Type -TypeDefinition @'\n${winInputCSharp}\n'@; [WinInput]::SendKey('${escapedKey}')`;
            
            return new Promise((resolve, reject) => {
                execFile('powershell.exe', ['-NoProfile', '-Command', psCommand], 
                    { timeout: 2000 }, 
                    (error, stdout, stderr) => {
                        if (error) {
                            console.error(`[KEYBOARD] Error sending "${key}":`, (stderr || error.message).split('\n')[0]);
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

    let typingCancelled = false;
    let lastTypedText = '';
    let lastTypedLineIndex = 0;

    // Handler for typing entire text via SendInput C# executable
    ipcMain.handle('keyboard:type-text', async (event, data) => {
        let text = typeof data === 'string' ? data : (data?.text || '');
        const mode = (typeof data === 'object' && data?.mode) ? data.mode : 'instant';
        
        if (!text || text.length === 0) return true;

        // Ignore UI loading texts if user accidentally triggers early
        if (text.includes('Analyzing image and extracting code (Stage') || 
            text.includes('Generating initial solution (Stage') ||
            text.includes('*Verifying solution...')) {
            console.log('[KEYBOARD] Ignoring UI loading text');
            return true;
        }

        // Extract code from markdown backticks if present
        if (text.includes('```')) {
            const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
            let extracted = '';
            let match;
            while ((match = codeBlockRegex.exec(text)) !== null) {
                extracted += match[1] + '\n';
            }
            if (extracted.trim()) {
                text = extracted.trim();
            }
        }

        // Implement stateful line-by-line mode
        if (mode === 'lineByLine') {
            if (text !== lastTypedText) {
                lastTypedText = text;
                lastTypedLineIndex = 0;
            }
            
            const lines = text.split('\n');
            if (lastTypedLineIndex >= lines.length) {
                console.log('[KEYBOARD] Reached end of text for lineByLine mode. Resetting.');
                lastTypedLineIndex = 0;
                return true; // Already typed everything
            }
            
            text = lines[lastTypedLineIndex] + '\n';
            console.log(`[KEYBOARD] Typing line ${lastTypedLineIndex + 1}/${lines.length}`);
            lastTypedLineIndex++;
        } else {
            lastTypedText = '';
            lastTypedLineIndex = 0;
        }

        try {
            // Allow 250ms for the user to release the hotkeys (Ctrl+Alt+Space) 
            // before SendInput starts firing, otherwise modifier keys interfere with typing.
            await new Promise(resolve => setTimeout(resolve, 250));
            
            if (typingCancelled) {
                return false;
            }

            const timestamp = Date.now();
            const textFile = path.join(os.tmpdir(), `ultron_text_${timestamp}.txt`);
            const pauseFile = path.join(os.tmpdir(), 'ultron_pause.flag');
            const stopFile = path.join(os.tmpdir(), 'ultron_stop.flag');
            
            try { fs.unlinkSync(pauseFile); } catch(e) {}
            try { fs.unlinkSync(stopFile); } catch(e) {}

            console.log(`[KEYBOARD] Typing text via AutoTyper.exe (${text.length} chars, mode: ${mode})`);
            fs.writeFileSync(textFile, text, 'utf8');

            const { execFile } = require('child_process');
            const autoTyperPath = app.isPackaged
                ? path.join(process.resourcesPath, 'AutoTyper.exe')
                : path.join(__dirname, 'utils', 'AutoTyper.exe');

            console.log(`[KEYBOARD] Executing native AutoTyper: ${autoTyperPath}`);

            // Register Escape to kill during typing
            globalShortcut.register('Escape', () => {
                if (activeTypingProcess) {
                    console.log('[KEYBOARD] Killing active typing process via Escape shortcut');
                    activeTypingProcess.kill();
                    activeTypingProcess = null;
                }
            });

            return new Promise((resolve, reject) => {
                const child = execFile(autoTyperPath, [textFile, mode], (error, stdout, stderr) => {
                    activeTypingProcess = null;
                    globalShortcut.unregister('Escape');
                    try { fs.unlinkSync(textFile); } catch(e) {}

                    if (error) {
                        if (error.signal === 'SIGTERM') {
                            console.log('[KEYBOARD] AutoTyper was killed.');
                            resolve(false);
                        } else {
                            console.error('[KEYBOARD] AutoTyper execution failed:', error.message);
                            reject(error);
                        }
                    } else {
                        console.log('[KEYBOARD] AutoTyper completed successfully');
                        resolve(true);
                    }
                });

                activeTypingProcess = child;
            });
        } catch (error) {
            activeTypingProcess = null;
            globalShortcut.unregister('Escape');
            console.error('[KEYBOARD] Failed to setup AutoTyper:', error.message);
            throw error;
        }
    });

    // Pause the active typing process
    ipcMain.handle('keyboard:pause-typing', async () => {
        if (activeTypingProcess) {
            const pauseFile = path.join(os.tmpdir(), 'ultron_pause.flag');
            try { fs.writeFileSync(pauseFile, 'paused', 'utf8'); } catch(e) {}
            console.log('[KEYBOARD] Pausing active typing process');
            return true;
        }
        return false;
    });

    // Resume the active typing process
    ipcMain.handle('keyboard:resume-typing', async () => {
        if (activeTypingProcess) {
            const pauseFile = path.join(os.tmpdir(), 'ultron_pause.flag');
            try { fs.unlinkSync(pauseFile); } catch(e) {}
            console.log('[KEYBOARD] Resuming active typing process');
            return true;
        }
        return false;
    });

    // Kill the active typing process
    ipcMain.handle('keyboard:kill-typing', async () => {
        if (activeTypingProcess) {
            console.log('[KEYBOARD] Killing active typing process');
            const stopFile = path.join(os.tmpdir(), 'ultron_stop.flag');
            try { fs.writeFileSync(stopFile, 'stopped', 'utf8'); } catch(e) {}
            activeTypingProcess.kill();
            activeTypingProcess = null;
            return true;
        }
        return false;
    });

    // Handler for clipboard paste (faster but blocked on some sites)
    ipcMain.handle('keyboard:type-text-clipboard', async (event, text) => {
        try {
            console.log(`[KEYBOARD] Pasting text via clipboard (${text.length} chars)`);
            const previousText = clipboard.readText();
            clipboard.writeText(text);
            
            const psCommand = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')`;
            
            return new Promise((resolve, reject) => {
                execFile('powershell.exe', ['-NoProfile', '-Command', psCommand], 
                    { timeout: 5000 }, 
                    (error, stdout, stderr) => {
                        setTimeout(() => {
                            clipboard.writeText(previousText || '');
                        }, 250);
                        if (error) {
                            reject(error);
                        } else {
                            resolve(true);
                        }
                    }
                );
            });
        } catch (error) {
            console.error('[KEYBOARD] Clipboard paste failed:', error.message);
            throw error;
        }
    });
}
