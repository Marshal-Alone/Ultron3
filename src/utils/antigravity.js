const electron = require('electron');
const ipcMain = electron.ipcMain || electron?.default?.ipcMain;
const BrowserWindow = electron.BrowserWindow || electron?.default?.BrowserWindow;
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const PromptLogger = require('./promptLogger');

// State
let activeRequestIdCounter = 0;
let activeRequestId = null;
let activeRequest = null;
let accumulatedText = '';

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

// Bind to PromptLogger events to automatically cancel Project Copilot when standard AI queries start
PromptLogger.events.on('new-ai-request', () => {
    cancelActiveRequest();
});

async function triggerProjectQuestion() {
    // 1. Check for question
    const question = (PromptLogger.lastQuestion || '').trim();
    if (!question) {
        sendToRenderer('update-status', '⚠️ No speech heard yet');
        return;
    }

    // 2. Prepare new request state
    cancelActiveRequest();
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
        console.error('[Antigravity] Failed to read session.json:', e);
        if (currentReqId === activeRequestId) {
            sendToRenderer('update-status', 'Disconnected');
            sendToRenderer('new-response', 'Error: Project Copilot bridge is not running.');
        }
        return;
    }

    if (!sessionData || sessionData.status !== 'ready' || !sessionData.port || !sessionData.token) {
        if (currentReqId === activeRequestId) {
            sendToRenderer('update-status', 'Disconnected');
            sendToRenderer('new-response', 'Error: Project Copilot bridge is not ready.');
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

            let splitIndex;
            while ((splitIndex = buffer.indexOf('\n\n')) >= 0) {
                const eventText = buffer.slice(0, splitIndex);
                buffer = buffer.slice(splitIndex + 2);
                processSseEvent(eventText, currentReqId);
            }
        });

        res.on('end', () => {
            if (currentReqId === activeRequestId) {
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
    processSseEvent
};

