/* ═══════════════════════════════════════════════════════════════════════
   Candidate — Editor + Event Capture
   Uses CodeMirror 6 via ESM CDN (esm.sh)
   ═══════════════════════════════════════════════════════════════════════ */

import { EditorView, basicSetup } from 'https://esm.sh/codemirror@6.0.1';
import { EditorState } from 'https://esm.sh/@codemirror/state@6.5.2';
import { javascript } from 'https://esm.sh/@codemirror/lang-javascript@6.2.3';
import { python } from 'https://esm.sh/@codemirror/lang-python@6.1.6';
import { java } from 'https://esm.sh/@codemirror/lang-java@6.0.1';
import { cpp } from 'https://esm.sh/@codemirror/lang-cpp@6.0.2';
import { rust } from 'https://esm.sh/@codemirror/lang-rust@6.0.1';
import { oneDark } from 'https://esm.sh/@codemirror/theme-one-dark@6.1.2';
import { ViewPlugin, ViewUpdate } from 'https://esm.sh/@codemirror/view@6.36.5';
import { io } from 'https://esm.sh/socket.io-client@4.7.5';

// ── Parse URL params ────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const sessionId = params.get('session');
const token = params.get('token');
const isTestMode = params.get('test') === 'true';

if (!sessionId || !token) {
    alert('Missing session or token. Please use the link from the lobby.');
    window.location.href = '/lobby.html';
}

// ── Language map ────────────────────────────────────────────────────────
const languageExtensions = {
    javascript: javascript(),
    typescript: javascript({ typescript: true }),
    python: python(),
    java: java(),
    cpp: cpp(),
    rust: rust(),
    go: [], // No official CM6 Go extension on CDN; use plain text
};

// ── State ───────────────────────────────────────────────────────────────
let editorView = null;
let socket = null;
let sessionStartTime = null;
let timerInterval = null;
let lastSnapshotTime = 0;
const SNAPSHOT_INTERVAL = 5000; // 5 seconds
const IDLE_THRESHOLD = 120000; // 2 minutes
let lastActivityTime = Date.now();
let idleNotified = false;
let eventBuffer = []; // Buffer events while disconnected
let isConnected = false;

// DevTools detection state
let prevWidth = window.outerWidth;
let prevHeight = window.outerHeight;

// ── DOM refs ────────────────────────────────────────────────────────────
const consentOverlay = document.getElementById('consentOverlay');
const consentCheckbox = document.getElementById('consentCheckbox');
const consentStartBtn = document.getElementById('consentStartBtn');
const candidateLayout = document.getElementById('candidateLayout');
const editorContainer = document.getElementById('editorContainer');
const timerDisplay = document.getElementById('timerDisplay');
const langSelector = document.getElementById('langSelector');
const disconnectedOverlay = document.getElementById('disconnectedOverlay');
const sessionEndedBanner = document.getElementById('sessionEndedBanner');

// ── Consent flow ────────────────────────────────────────────────────────
consentCheckbox.addEventListener('change', () => {
    consentStartBtn.disabled = !consentCheckbox.checked;
});

consentStartBtn.addEventListener('click', () => {
    consentOverlay.classList.add('hidden');
    candidateLayout.style.display = 'flex';
    initSession();
});

// Auto-start if in test mode
if (isTestMode) {
    consentOverlay.classList.add('hidden');
    candidateLayout.style.display = 'flex';
    initSession();
}

// ── Initialize session ──────────────────────────────────────────────────
function initSession() {
    connectSocket();
    initEditor('javascript');
    startTimer();
    attachGlobalListeners();
    startIdleDetection();
    if (!isTestMode) {
        startDevToolsDetection();
    }
}

// ── Socket.IO connection ────────────────────────────────────────────────
function connectSocket() {
    socket = io({
        query: { sessionId, token, role: 'candidate' },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
        isConnected = true;
        disconnectedOverlay.classList.remove('active');

        // Flush buffered events
        if (eventBuffer.length > 0) {
            socket.emit('buffered_events', eventBuffer);
            eventBuffer = [];
        }

        // Send reconnect event if this isn't the first connection
        if (sessionStartTime) {
            emitEvent('network_reconnect', {});
        }
    });

    socket.on('disconnect', () => {
        isConnected = false;
        disconnectedOverlay.classList.add('active');
    });

    socket.on('session_info', (info) => {
        document.getElementById('sessionTitle').textContent = `Assessment — ${info.candidateName}`;
        if (info.language) {
            langSelector.value = info.language;
        }
        if (info.startedAt) {
            sessionStartTime = new Date(info.startedAt);
        }
    });

    socket.on('session_status', (data) => {
        if (data.status === 'ended') {
            sessionEndedBanner.classList.add('active');
            if (editorView) {
                editorView.dispatch({
                    effects: EditorState.readOnly.of(true),
                });
            }
            clearInterval(timerInterval);
        }
    });

    socket.on('error_msg', (data) => {
        alert(data.message);
        window.location.href = '/lobby.html';
    });
}

// ── Editor setup ────────────────────────────────────────────────────────
function initEditor(lang) {
    const langExt = languageExtensions[lang] || [];

    // Update listener plugin
    const updateListener = ViewPlugin.fromClass(
        class {
            update(update) {
                if (update.docChanged) {
                    onEditorChange(update);
                }
            }
        }
    );

    editorView = new EditorView({
        state: EditorState.create({
            doc: '',
            extensions: [basicSetup, oneDark, Array.isArray(langExt) ? langExt : langExt, updateListener],
        }),
        parent: editorContainer,
    });
}

function onEditorChange(update) {
    lastActivityTime = Date.now();
    idleNotified = false;

    const content = update.state.doc.toString();
    const cursorPos = update.state.selection.main.head;

    // Send live content update
    if (isConnected && socket) {
        socket.emit('editor_update', { content, cursorPos });
    }

    // Periodic snapshot
    const now = Date.now();
    if (now - lastSnapshotTime >= SNAPSHOT_INTERVAL) {
        lastSnapshotTime = now;
        if (isConnected && socket) {
            socket.emit('editor_snapshot', { content, cursorPos });
        }
    }
}

// Language change
langSelector.addEventListener('change', () => {
    const lang = langSelector.value;
    const content = editorView ? editorView.state.doc.toString() : '';

    // Destroy and recreate editor with new language
    if (editorView) {
        editorView.destroy();
    }

    const langExt = languageExtensions[lang] || [];
    const updateListener = ViewPlugin.fromClass(
        class {
            update(update) {
                if (update.docChanged) {
                    onEditorChange(update);
                }
            }
        }
    );

    editorView = new EditorView({
        state: EditorState.create({
            doc: content,
            extensions: [basicSetup, oneDark, Array.isArray(langExt) ? langExt : langExt, updateListener],
        }),
        parent: editorContainer,
    });
});

// ── Event emission ──────────────────────────────────────────────────────
function emitEvent(type, payload) {
    const event = {
        type,
        timestamp: new Date().toISOString(),
        payload,
    };

    if (isConnected && socket) {
        socket.emit('activity_event', event);
    } else {
        eventBuffer.push(event);
    }
}

// ── Global event listeners ──────────────────────────────────────────────
function attachGlobalListeners() {
    // Tab visibility change
    document.addEventListener('visibilitychange', () => {
        lastActivityTime = Date.now();
        if (document.hidden) {
            emitEvent('tab_hidden', {});
        } else {
            emitEvent('tab_visible', {});
        }
    });

    // Window blur/focus
    window.addEventListener('blur', () => {
        lastActivityTime = Date.now();
        emitEvent('window_blur', {});
    });

    window.addEventListener('focus', () => {
        lastActivityTime = Date.now();
        emitEvent('window_focus', {});
    });

    // Paste on editor
    editorContainer.addEventListener('paste', (e) => {
        lastActivityTime = Date.now();
        const clipboardData = e.clipboardData || window.clipboardData;
        const textLength = clipboardData ? clipboardData.getData('text').length : 0;
        emitEvent('paste', { length: textLength });
    });

    // Copy on editor
    editorContainer.addEventListener('copy', () => {
        lastActivityTime = Date.now();
        const selection = window.getSelection();
        const selectedLength = selection ? selection.toString().length : 0;
        emitEvent('copy', { length: selectedLength });
    });

    // Right-click
    editorContainer.addEventListener('contextmenu', (e) => {
        lastActivityTime = Date.now();
        emitEvent('right_click', {});
    });

    // Keystroke metadata (throttled — 1 event per second max)
    let lastKeystrokeEmit = 0;
    document.addEventListener('keydown', (e) => {
        lastActivityTime = Date.now();
        idleNotified = false;
        const now = Date.now();
        if (now - lastKeystrokeEmit > 1000) {
            lastKeystrokeEmit = now;
            let category = 'character';
            if (e.key === 'Backspace' || e.key === 'Delete') category = 'delete';
            else if (e.key.startsWith('Arrow')) category = 'navigation';
            else if (e.key === 'Enter') category = 'enter';
            else if (e.key === 'Tab') category = 'tab';
            else if (e.ctrlKey || e.metaKey) category = 'modifier';
            emitEvent('keystroke', { category });
        }
    });
}

// ── Idle detection ──────────────────────────────────────────────────────
function startIdleDetection() {
    setInterval(() => {
        const elapsed = Date.now() - lastActivityTime;
        if (elapsed >= IDLE_THRESHOLD && !idleNotified) {
            idleNotified = true;
            emitEvent('idle', { idleMs: elapsed });
        }
    }, 10000);
}

// ── DevTools detection (heuristic) ──────────────────────────────────────
function startDevToolsDetection() {
    setInterval(() => {
        const widthDelta = Math.abs(window.outerWidth - prevWidth);
        const heightDelta = Math.abs(window.outerHeight - prevHeight);
        const threshold = window.outerWidth - window.innerWidth > 200 || window.outerHeight - window.innerHeight > 300;

        if (threshold) {
            emitEvent('devtools_suspected', {
                outerWidth: window.outerWidth,
                innerWidth: window.innerWidth,
                outerHeight: window.outerHeight,
                innerHeight: window.innerHeight,
            });
        }

        prevWidth = window.outerWidth;
        prevHeight = window.outerHeight;
    }, 3000);
}

// ── Timer ───────────────────────────────────────────────────────────────
function startTimer() {
    sessionStartTime = sessionStartTime || new Date();
    timerInterval = setInterval(() => {
        const elapsed = Date.now() - sessionStartTime.getTime();
        const hrs = Math.floor(elapsed / 3600000);
        const mins = Math.floor((elapsed % 3600000) / 60000);
        const secs = Math.floor((elapsed % 60000) / 1000);
        timerDisplay.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }, 1000);
}
