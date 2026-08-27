const electron = require('electron');
const ipcMain = electron.ipcMain || electron?.default?.ipcMain;
const BrowserWindow = electron.BrowserWindow || electron?.default?.BrowserWindow;
const http = require('http');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const { spawn, exec } = require('child_process');
const PromptLogger = require('./promptLogger');

// State
let activeRequestIdCounter = 0;
let activeRequestId = null;
let activeRequest = null;
let accumulatedText = '';
let bridgeProcess = null;

// Helper to send to renderer
function sendToRenderer(channel, data) {
    if (!BrowserWindow) return;
    const windows = BrowserWindow.getAllWindows();
    if (windows && windows.length > 0) {
        windows[0].webContents.send(channel, data);
    }
}

function cancelActiveRequest() {
    if (activeRequest) {
        console.log('[Antigravity] Cancelling active request:', activeRequestId);
        try {
            activeRequest.destroy();
        } catch (e) {
            console.error('[Antigravity] Error destroying active request:', e);
        }
        activeRequest = null;
    }
    activeRequestId = null;
    accumulatedText = '';
}

function startBridgeProcess() {
    const sessionPath = path.join(os.homedir(), '.ultron', 'session.json');
    if (fsSync.existsSync(sessionPath) || bridgeProcess) {
        sendToRenderer('update-status', 'Bridge Ready 🟢');
        return;
    }

    const bridgeDir = path.join(__dirname, '..', '..', 'ultron-antigravity-bridge');
    const pythonExe = process.platform === 'win32'
        ? path.join(bridgeDir, 'venv', 'Scripts', 'pythonw.exe')
        : path.join(bridgeDir, 'venv', 'bin', 'python');

    try {
        bridgeProcess = spawn(pythonExe, ['run.py'], {
            cwd: bridgeDir,
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
        });
        if (typeof bridgeProcess.unref === 'function') {
            bridgeProcess.unref();
        }
        sendToRenderer('update-status', 'Bridge Starting 🟢');
        console.log('[Antigravity] Started background stealth bridge process');
    } catch (err) {
        console.error('[Antigravity] Failed to spawn bridge:', err);
        sendToRenderer('update-status', 'Bridge Error 🔴');
    }
}

function stopBridgeProcess() {
    cancelActiveRequest();
    if (process.platform === 'win32') {
        try {
            exec('taskkill /F /IM pythonw.exe', () => {});
        } catch (_) {}
    } else if (bridgeProcess) {
        try {
            bridgeProcess.kill();
        } catch (e) {}
    }
    bridgeProcess = null;

    const sessionPath = path.join(os.homedir(), '.ultron', 'session.json');
    try {
        if (fsSync.existsSync(sessionPath)) {
            fsSync.unlinkSync(sessionPath);
        }
    } catch (_) {}

    sendToRenderer('update-status', 'Bridge Stopped 🔴');
    console.log('[Antigravity] Stopped background bridge process');
}

function toggleBridgeProcess() {
    const sessionPath = path.join(os.homedir(), '.ultron', 'session.json');
    if (fsSync.existsSync(sessionPath) || bridgeProcess) {
        stopBridgeProcess();
    } else {
        startBridgeProcess();
    }
}

// Bind to PromptLogger events to automatically cancel Project Copilot when standard AI queries start
PromptLogger.events.on('new-ai-request', () => {
    cancelActiveRequest();
});

async function triggerProjectQuestion() {
    // 1. Check for question
    const question = (PromptLogger.lastQuestion || PromptLogger.liveTranscript || '').trim();
    if (!question) {
        sendToRenderer('update-status', '⚠️ No speech heard yet');
        return;
    }

    // Ensure main window is visible to the user
    if (BrowserWindow && typeof BrowserWindow.getAllWindows === 'function') {
        try {
            const windows = BrowserWindow.getAllWindows();
            if (windows && windows.length > 0 && typeof windows[0]?.isVisible === 'function' && !windows[0].isVisible()) {
                if (typeof windows[0].showInactive === 'function') {
                    windows[0].showInactive();
                }
            }
        } catch (e) {}
    }

    // 2. Prepare new request state & cancel any active Groq/Gemini streaming
    cancelActiveRequest();
    try {
        const groqAI = require('./groq');
        if (groqAI && typeof groqAI.cancel === 'function') {
            groqAI.cancel();
        }
    } catch (e) {}

    const currentReqId = `req_${Date.now()}_${++activeRequestIdCounter}`;
    activeRequestId = currentReqId;
    accumulatedText = '';

    sendToRenderer('update-status', 'Connecting...');

    // 3. Session Discovery
    const sessionPath = path.join(os.homedir(), '.ultron', 'session.json');
    let sessionData;
    try {
        const fileContent = await fs.readFile(sessionPath, 'utf8');
        sessionData = JSON.parse(fileContent);
    } catch (e) {
        console.log('[Antigravity] session.json not found, auto-starting stealth bridge...');
        startBridgeProcess();
        if (currentReqId === activeRequestId) {
            sendToRenderer('update-status', 'Starting Bridge...');
            sendToRenderer('new-response', '⚡ **Project Copilot bridge is starting in stealth background mode...**\n\n*Please press `Ctrl + P` in a few seconds once warmup is complete.*');
        }
        return;
    }

    if (!sessionData || sessionData.status !== 'ready' || !sessionData.port || !sessionData.token) {
        if (currentReqId === activeRequestId) {
            sendToRenderer('update-status', 'Bridge Warming...');
            sendToRenderer('new-response', '⏳ **Project Copilot is warming up...**\n\n*Please press `Ctrl + P` again in a moment.*');
        }
        return;
    }

    if (currentReqId === activeRequestId) {
        sendToRenderer('update-status', 'Thinking...');
        sendToRenderer('new-response', 'Analyzing project...\n\n');
    }

    // 4. Make HTTP Request
    const postData = JSON.stringify({
        requestId: currentReqId,
        question: question,
        mode: 'interview',
        stream: true
    });

    const options = {
        hostname: '127.0.0.1',
        port: sessionData.port,
        path: '/v1/project/ask',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionData.token}`,
            'Accept': 'text/event-stream'
        }
    };

    const req = http.request(options, (res) => {
        if (currentReqId !== activeRequestId) {
            res.destroy();
            return;
        }

        if (res.statusCode !== 200) {
            console.error('[Antigravity] HTTP Error:', res.statusCode);
            if (currentReqId === activeRequestId) {
                sendToRenderer('update-status', 'Error');
                sendToRenderer('new-response', `Error: Bridge returned status ${res.statusCode}`);
                activeRequest = null;
            }
            return;
        }

        if (currentReqId === activeRequestId) {
            sendToRenderer('update-status', 'Streaming...');
        }

        let buffer = '';

        res.on('data', (chunk) => {
            if (currentReqId !== activeRequestId) return;
            buffer += chunk.toString('utf8');

            let match;
            while ((match = buffer.match(/\r?\n\r?\n/)) !== null) {
                const eventText = buffer.slice(0, match.index);
                buffer = buffer.slice(match.index + match[0].length);
                if (eventText.trim()) {
                    processSseEvent(eventText, currentReqId);
                }
            }
        });

        res.on('end', () => {
            if (currentReqId === activeRequestId) {
                if (buffer.trim()) {
                    processSseEvent(buffer, currentReqId);
                }
                sendToRenderer('update-status', 'Ready');
                activeRequest = null;
            }
        });
    });

    req.on('error', (e) => {
        console.error('[Antigravity] Request error:', e);
        if (currentReqId === activeRequestId) {
            sendToRenderer('update-status', 'Disconnected');
            if (e.code === 'ECONNREFUSED') {
                sendToRenderer('new-response', 'Error: Connection refused. Bridge might be down.');
            } else if (e.message !== 'socket hang up' && e.message !== 'req.destroy() called') {
                sendToRenderer('new-response', `Error: ${e.message}`);
            }
            activeRequest = null;
        }
    });

    activeRequest = req;
    req.write(postData);
    req.end();
}

function processSseEvent(eventText, reqId) {
    if (reqId !== activeRequestId || !activeRequestId) return;

    const lines = eventText.split(/\r?\n/);
    let eventType = 'message';
    let data = '';

    for (const line of lines) {
        if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
            data += line.slice(5).trim();
        }
    }

    if (!data) return;

    try {
        const parsed = JSON.parse(data);
        if (parsed.requestId && parsed.requestId !== activeRequestId) {
            return;
        }

        const type = parsed.type || eventType;

        if (type === 'start') {
            accumulatedText = '';
            sendToRenderer('new-response', 'Analyzing project...\n\n');
        } else if (type === 'token') {
            if (parsed.token) {
                accumulatedText += parsed.token;
                sendToRenderer('update-response', accumulatedText);
            }
        } else if (type === 'error') {
            sendToRenderer('new-response', `Error: ${parsed.message || parsed.error || 'Project analysis error'}`);
            sendToRenderer('update-status', 'Error');
        } else if (type === 'complete') {
            sendToRenderer('update-status', 'Ready');
        }
    } catch (e) {
        console.error('[Antigravity] Failed to parse SSE JSON payload:', e, data);
    }
}

function setupAntigravityIpcHandlers() {
    if (ipcMain && typeof ipcMain.on === 'function') {
        ipcMain.on('trigger-project-copilot', () => {
            triggerProjectQuestion();
        });
    }
}

module.exports = {
    setupAntigravityIpcHandlers,
    triggerProjectQuestion,
    cancelActiveRequest,
    processSseEvent,
    startBridgeProcess,
    stopBridgeProcess,
    toggleBridgeProcess
};

