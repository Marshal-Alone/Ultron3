if (require('electron-squirrel-startup')) {
    process.exit(0);
}

const { app, BrowserWindow, shell, ipcMain, clipboard } = require('electron');
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
    // Handle keyboard key sending for auto-type feature
    ipcMain.on('keyboard:send-key', (event, key) => {
        try {
            console.log(`[KEYBOARD] Sending key: ${key}`);
            
            // Map special key names and characters for SendKeys method
            const sendKeysMap = {
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
                '+': '{+}',
                '^': '{^}',
                '%': '{%}',
                '~': '{~}',
                '(': '{(}',
                ')': '{)}',
                '{': '{{}',
                '}': '{}}',
                '[': '{[}',
                ']': '{]}',
                '\n': '{ENTER}',
                '\t': '{TAB}'
            };
            
            // Convert key using map, or use as-is
            let mappedKey = key;
            if (sendKeysMap[key]) {
                mappedKey = sendKeysMap[key];
            }
            
            // Create PowerShell command with proper escaping
            const escapedKey = mappedKey.replace(/'/g, "''").replace(/\$/g, '`$');
            const psCommand = `[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.SendKeys]::SendWait('${escapedKey}')`;
            
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
                '+': '{+}',
                '^': '{^}',
                '%': '{%}',
                '~': '{~}',
                '(': '{(}',
                ')': '{)}',
                '{': '{{}',
                '}': '{}}',
                '[': '{[}',
                ']': '{]}',
                '\n': '{ENTER}',
                '\t': '{TAB}'
            };
            
            // Convert key using map, or use as-is
            let mappedKey = key;
            if (sendKeysMap[key]) {
                mappedKey = sendKeysMap[key];
            }
            
            // Create PowerShell command with proper escaping
            const escapedKey = mappedKey.replace(/'/g, "''").replace(/\$/g, '`$');
            const psCommand = `[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.SendKeys]::SendWait('${escapedKey}')`;
            
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

    // Handler for typing entire text at once via SendKeys script (works on ALL sites)
    ipcMain.handle('keyboard:type-text', async (event, text) => {
        const timestamp = Date.now();
        const textFile = path.join(os.tmpdir(), `ultron_text_${timestamp}.txt`);
        const scriptFile = path.join(os.tmpdir(), `ultron_sk_${timestamp}.ps1`);
        const pauseFile = path.join(os.tmpdir(), 'ultron_pause.flag');
        const stopFile = path.join(os.tmpdir(), 'ultron_stop.flag');
        
        try { fs.unlinkSync(pauseFile); } catch(e) {}
        try { fs.unlinkSync(stopFile); } catch(e) {}
        
        try {
            console.log(`[KEYBOARD] Typing text via SendKeys script (${text.length} chars)`);
            
            // Write text to temp file (UTF-8)
            fs.writeFileSync(textFile, text, 'utf8');
            
            // Get preferences for Hold-to-Type
            const { getPreferences } = require('./storage');
            const prefs = getPreferences();
            const holdToTypeEnabled = prefs.holdToTypeEnabled || false;
            const holdToTypeKey = prefs.holdToTypeKey || '0x11,0x10,VK:]';

            // PowerShell script: read text file, type line by line
            // After each Enter, select any auto-indent and replace with our content
            const textFilePath = textFile.replace(/\\/g, '/');
            const pauseFilePath = pauseFile.replace(/\\/g, '/');
            const stopFilePath = stopFile.replace(/\\/g, '/');
            const debugFile = path.join(os.tmpdir(), 'ultron_debug.log');
            const script = [
                '$ErrorActionPreference = "Stop"',
                'try {',
                'Add-Type -AssemblyName System.Windows.Forms',
                'Add-Type -TypeDefinition @"',
                'using System;',
                'using System.Runtime.InteropServices;',
                'public class Keyboard {',
                '    [DllImport("user32.dll")]',
                '    public static extern short GetAsyncKeyState(int vKey);',
                '}',
                'public class KeyMap {',
                '    [DllImport("user32.dll")]',
                '    public static extern short VkKeyScan(char ch);',
                '}',
                '"@',
                `$text = [System.IO.File]::ReadAllText('${textFilePath}', [System.Text.Encoding]::UTF8)`,
                `$pauseFile = '${pauseFilePath}'`,
                `$stopFile = '${stopFilePath}'`,
                `$debugFile = '${debugFile}'`,
                `$holdToTypeEnabled = $${holdToTypeEnabled ? 'true' : 'false'}`,
                `$holdToTypeKey = '${holdToTypeKey}'`,
                '$holdKeys = @()',
                'foreach ($k in ($holdToTypeKey -split ",")) {',
                '  if ($k.StartsWith("VK:")) {',
                '    $char = $k.Substring(3)',
                '    $vk = [KeyMap]::VkKeyScan([char]$char) -band 0xFF',
                '    $holdKeys += $vk',
                '  } else {',
                '    $holdKeys += [int]$k',
                '  }',
                '}',
                'function Check-HoldKeys {',
                '  foreach ($k in $holdKeys) {',
                '    if (-not ([Keyboard]::GetAsyncKeyState([int]$k) -band 0x8000)) { return $false }',
                '  }',
                '  return $true',
                '}',
                'function Log-Debug($msg) {',
                '  Add-Content -Path $debugFile -Value "$(Get-Date -Format \'HH.mm.ss.fff\') - $msg"',
                '}',
                'Log-Debug "Script started. holdToTypeEnabled=$holdToTypeEnabled, holdToTypeKey=$holdToTypeKey"',
                'Log-Debug "Text length: $($text.Length)"',
                'Log-Debug "holdKeys count: $($holdKeys.Count), values: $($holdKeys -join \',\')"',
                '$special = @{',
                "  '+' = '{+}'; '^' = '{^}'; '%' = '{%}'; '~' = '{~}'",
                "  '(' = '{(}'; ')' = '{)}'; '{' = '{{}'; '}' = '{}}'",
                "  '[' = '{[}'; ']' = '{]}'",
                '}',
                '',
                'function Check-Modifiers {',
                '  $ctrl = [Keyboard]::GetAsyncKeyState(0x11) -band 0x8000',
                '  $alt = [Keyboard]::GetAsyncKeyState(0x12) -band 0x8000',
                '  $win = ([Keyboard]::GetAsyncKeyState(0x5B) -band 0x8000) -or ([Keyboard]::GetAsyncKeyState(0x5C) -band 0x8000)',
                '  return ($ctrl -or $alt -or $win)',
                '}',
                '',
                'function Check-State {',
                '  if ([System.IO.File]::Exists($stopFile)) { Log-Debug "Stop file found"; exit }',
                '  while ([System.IO.File]::Exists($pauseFile)) {',
                '    if ([System.IO.File]::Exists($stopFile)) { Log-Debug "Stop file found during pause"; exit }',
                '    Start-Sleep -Milliseconds 100',
                '  }',
                '  if ($holdToTypeEnabled) {',
                '    $loggedWaiting = $false',
                '    while ($true) {',
                '      if ([System.IO.File]::Exists($stopFile)) { exit }',
                '      if ([System.IO.File]::Exists($pauseFile)) { Start-Sleep -Milliseconds 100; continue }',
                '      if (Check-HoldKeys) { break }',
                '      if (-not $loggedWaiting) { Log-Debug "Waiting for hold keys..."; $loggedWaiting = $true }',
                '      Start-Sleep -Milliseconds 30',
                '    }',
                '  }',
                '  $loggedMods = $false',
                '  while ($true) {',
                '    if ([System.IO.File]::Exists($stopFile)) { exit }',
                '    if ([System.IO.File]::Exists($pauseFile)) { Start-Sleep -Milliseconds 100; continue }',
                '    if (-not (Check-Modifiers)) { break }',
                '    if (-not $loggedMods) { Log-Debug "Waiting for modifiers to be released..."; $loggedMods = $true }',
                '    Start-Sleep -Milliseconds 30',
                '  }',
                '}',
                '',
                'function Send-LineText($line) {',
                '  Log-Debug "Typing line of length $($line.Length)..."',
                '  foreach ($char in $line.ToCharArray()) {',
                '    Check-State',
                '    $key = $char.ToString()',
                '    if ($special.ContainsKey($key)) {',
                '      [System.Windows.Forms.SendKeys]::SendWait($special[$key])',
                '    } else {',
                '      [System.Windows.Forms.SendKeys]::SendWait($key)',
                '    }',
                '    Start-Sleep -Milliseconds 10',
                '  }',
                '}',
                '',
                '$lines = $text -split "`n"',
                '$isFirst = $true',
                'Log-Debug "Total lines: $($lines.Count)"',
                'foreach ($line in $lines) {',
                '  Check-State',
                '  $line = $line.TrimEnd("`r")',
                '',
                '  if ($isFirst) {',
                '    $isFirst = $false',
                '    if ($line.Length -gt 0) { Send-LineText $line }',
                '    continue',
                '  }',
                '',
                '  # Send Enter then clear any auto-indent',
                '  Check-State',
                '  [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")',
                '  Start-Sleep -Milliseconds 30',
                '  Check-State',
                '  [System.Windows.Forms.SendKeys]::SendWait("{HOME}{HOME}")',
                '  Check-State',
                '  [System.Windows.Forms.SendKeys]::SendWait("+{END}")',
                '',
                '  if ($line.Length -gt 0) {',
                '    Send-LineText $line',
                '  } else {',
                '    Check-State',
                '    [System.Windows.Forms.SendKeys]::SendWait("{DELETE}")',
                '  }',
                '}',
                'Log-Debug "Script finished normally."',
                '} catch {',
                '  $errMsg = $_.Exception.Message',
                '  $errLine = $_.InvocationInfo.ScriptLineNumber',
                '  Add-Content -Path $debugFile -Value "$(Get-Date -Format \'HH.mm.ss.fff\') - FATAL ERROR at line $errLine : $errMsg"',
                '  Add-Content -Path $debugFile -Value "$(Get-Date -Format \'HH.mm.ss.fff\') - Full error: $_"',
                '  throw',
                '}'
            ].join('\r\n');
            
            // Dump generated script for debugging
            const dumpFile = path.join(os.tmpdir(), 'ultron_last_script.ps1');
            try { fs.writeFileSync(dumpFile, script, 'utf8'); } catch(e) {}
            
            // Write script to file and execute with -File (stdin piping breaks here-strings)
            fs.writeFileSync(scriptFile, script, 'utf8');
            console.log(`[KEYBOARD] Script saved to ${scriptFile}`);
            
            console.log('[KEYBOARD] Starting PowerShell Auto-Typer via -File...');
            return new Promise((resolve, reject) => {
                const { spawn } = require('child_process');
                const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptFile]);
                
                let stderrData = '';
                
                child.stdout.on('data', (data) => {
                    console.log('[KEYBOARD] PowerShell stdout:', data.toString().trim());
                });
                
                child.stderr.on('data', (data) => {
                    stderrData += data.toString();
                    console.error('[KEYBOARD] PowerShell stderr chunk:', data.toString().trim());
                });
                
                child.on('close', (code) => {
                    activeTypingProcess = null;
                    // Clean up temp files
                    try { fs.unlinkSync(textFile); } catch(e) {}
                    try { fs.unlinkSync(scriptFile); } catch(e) {}
                    
                    if (stderrData.trim()) {
                        console.error('[KEYBOARD] PowerShell stderr:', stderrData);
                    }
                    
                    if (code !== 0) {
                        console.error('[KEYBOARD] Error typing text via script:', stderrData.split('\n')[0]);
                        reject(new Error(stderrData || 'PowerShell script failed'));
                    } else {
                        console.log('[KEYBOARD] SendKeys script completed successfully');
                        resolve(true);
                    }
                });
                
                child.on('error', (error) => {
                    activeTypingProcess = null;
                    try { fs.unlinkSync(textFile); } catch(e) {}
                    try { fs.unlinkSync(scriptFile); } catch(e) {}
                    console.error('[KEYBOARD] Failed to spawn PowerShell:', error.message);
                    reject(error);
                });
                
                activeTypingProcess = child;
            });
        } catch (error) {
            activeTypingProcess = null;
            try { fs.unlinkSync(textFile); } catch(e) {}
            console.error('[KEYBOARD] Failed to type text:', error.message);
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
