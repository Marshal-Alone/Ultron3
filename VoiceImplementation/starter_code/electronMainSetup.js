/**
 * electronMainSetup.js
 * Boilerplate Electron Main process setup file.
 * Wires up loopback display media, stealth overlay flags, and IPC listeners.
 */

const { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, session } = require('electron');
const path = require('path');
const GeminiLiveService = require('./geminiLiveService');
const groqService = require('./groqService');

let mainWindow = null;
const geminiService = new GeminiLiveService();

function createStealthWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 800,
        minWidth: 700,
        minHeight: 320,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        backgroundColor: '#00000000',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false,
            enableBlinkFeatures: 'GetDisplayMedia',
        },
    });

    // 1. Hide window from screen-share apps (Zoom, Teams, Meet)
    mainWindow.setContentProtection(true);

    // 2. Hide from OS taskbar on Windows
    if (process.platform === 'win32') {
        mainWindow.setSkipTaskbar(true);
        mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    }

    // 3. Intercept getDisplayMedia to supply screen + loopback audio
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        desktopCapturer.getSources({ types: ['screen'] }).then(sources => {
            callback({ video: sources[0], audio: 'loopback' });
        });
    });

    mainWindow.loadFile('index.html');
    return mainWindow;
}

function setupIpcHandlers() {
    // 1. Initialize Gemini Live
    ipcMain.handle('initialize-gemini', async (event, apiKey, customPrompt, profile, language) => {
        geminiService.onTranscript = (transcript, speakerId) => {
            const label = speakerId === 1 ? 'Interviewer' : 'Candidate';
            console.log(`[Transcript] [${label}]: ${transcript}`);
            
            // Trigger simultaneous Groq answer
            groqService.generateAnswer(`[${label}]: ${transcript}`);
        };

        geminiService.onStatus = (status) => {
            mainWindow?.webContents.send('update-status', status);
        };

        groqService.init({
            apiKey: process.env.GROQ_API_KEY,
            systemPrompt: customPrompt || 'You are an ultra-fast on-screen assistant. Give direct, ready-to-speak answers in 1-3 bullet points.',
        });

        groqService.onToken = (tokenText) => {
            mainWindow?.webContents.send('update-response', tokenText);
        };

        groqService.onComplete = (finalText) => {
            geminiService.saveTurn('User Context', finalText);
        };

        return await geminiService.connect({ apiKey, systemPrompt: customPrompt, language });
    });

    // 2. Ingest 24kHz Audio Chunks from Renderer
    ipcMain.handle('send-audio-content', async (event, { data }) => {
        await geminiService.sendAudio(data);
        return { success: true };
    });

    ipcMain.handle('send-mic-audio-content', async (event, { data }) => {
        await geminiService.sendAudio(data);
        return { success: true };
    });

    // 3. Close Session
    ipcMain.handle('close-session', async () => {
        await geminiService.close();
        return { success: true };
    });
}

function registerHotkeys() {
    const isMac = process.platform === 'darwin';

    // Toggle Hide/Show: Ctrl+\ (Cmd+\ on macOS)
    globalShortcut.register(isMac ? 'Cmd+\\' : 'Ctrl+\\', () => {
        if (mainWindow.isVisible()) mainWindow.hide();
        else mainWindow.showInactive();
    });

    // Toggle Click-through: Ctrl+M
    let clickThrough = false;
    globalShortcut.register(isMac ? 'Cmd+M' : 'Ctrl+M', () => {
        clickThrough = !clickThrough;
        mainWindow.setIgnoreMouseEvents(clickThrough, { forward: true });
        mainWindow.webContents.send('click-through-toggled', clickThrough);
    });
}

app.whenReady().then(() => {
    createStealthWindow();
    setupIpcHandlers();
    registerHotkeys();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
