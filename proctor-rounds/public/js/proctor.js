/* ═══════════════════════════════════════════════════════════════════════
   Proctor Dashboard — Live Monitoring + Event Feed
   Uses CodeMirror 6 (read-only) via ESM CDN
   ═══════════════════════════════════════════════════════════════════════ */

import { EditorView, basicSetup } from 'https://esm.sh/codemirror@6.0.1';
import { EditorState } from 'https://esm.sh/@codemirror/state@6.5.2';
import { javascript } from 'https://esm.sh/@codemirror/lang-javascript@6.2.3';
import { python } from 'https://esm.sh/@codemirror/lang-python@6.1.6';
import { java } from 'https://esm.sh/@codemirror/lang-java@6.0.1';
import { cpp } from 'https://esm.sh/@codemirror/lang-cpp@6.0.2';
import { rust } from 'https://esm.sh/@codemirror/lang-rust@6.0.1';
import { oneDark } from 'https://esm.sh/@codemirror/theme-one-dark@6.1.2';
import { io } from 'https://esm.sh/socket.io-client@4.7.5';

// ── Parse URL params ────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const sessionId = params.get('session');
const token = params.get('token');

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
    go: [],
};

// ── State ───────────────────────────────────────────────────────────────
let editorView = null;
let socket = null;
let sessionStartTime = null;
let timerInterval = null;
let activeFilter = 'all';
let sessionLanguage = 'javascript';

// Running counters
const counters = {
    tabSwitches: 0,
    pastes: 0,
    focusLost: 0,
    devtools: 0,
    disconnects: 0,
};

// Event icons
const eventIcons = {
    session_start: '🟢',
    session_end: '🏁',
    tab_hidden: '🔀',
    tab_visible: '🔀',
    window_blur: '👁️',
    window_focus: '👁️',
    paste: '📋',
    copy: '📄',
    right_click: '🖱️',
    devtools_suspected: '🔧',
    idle: '💤',
    keystroke: '⌨️',
    network_disconnect: '📡',
    network_reconnect: '📡',
    fullscreen_exit: '🖥️',
};

// Event descriptions
function getEventDescription(event) {
    const p = event.payload || {};
    switch (event.type) {
        case 'session_start':
            return `Session started for ${p.candidateName || 'candidate'}`;
        case 'session_end':
            return `Session ended by ${p.endedBy || 'proctor'}`;
        case 'tab_hidden':
            return 'Candidate switched away from this tab';
        case 'tab_visible':
            return 'Candidate returned to this tab';
        case 'window_blur':
            return 'Browser window lost focus';
        case 'window_focus':
            return 'Browser window regained focus';
        case 'paste':
            return `Pasted content (${p.length || 0} characters)`;
        case 'copy':
            return `Copied content (${p.length || 0} characters)`;
        case 'right_click':
            return 'Right-click detected on editor';
        case 'devtools_suspected':
            return `DevTools suspected (outer: ${p.outerWidth}×${p.outerHeight}, inner: ${p.innerWidth}×${p.innerHeight})`;
        case 'idle':
            return `Idle for ${Math.round((p.idleMs || 0) / 1000)}s`;
        case 'keystroke':
            return `Keystroke: ${p.category || 'unknown'}`;
        case 'network_disconnect':
            return `${p.reason || 'Connection lost'}`;
        case 'network_reconnect':
            return 'Connection restored';
        case 'fullscreen_exit':
            return 'Candidate exited fullscreen';
        default:
            return event.type;
    }
}

// ── DOM refs ────────────────────────────────────────────────────────────
const proctorEditorContainer = document.getElementById('proctorEditorContainer');
const editorEmpty = document.getElementById('editorEmpty');
const feedEmpty = document.getElementById('feedEmpty');
const eventFeed = document.getElementById('eventFeed');
const toastContainer = document.getElementById('toastContainer');
const disconnectedOverlay = document.getElementById('disconnectedOverlay');
const endSessionBtn = document.getElementById('endSessionBtn');
const proctorTimer = document.getElementById('proctorTimer');
const statusBadge = document.getElementById('statusBadge');
const editorLangBadge = document.getElementById('editorLangBadge');

// Metadata
const metaCandidate = document.getElementById('metaCandidate');
const metaSessionId = document.getElementById('metaSessionId');
const metaStarted = document.getElementById('metaStarted');
const metaStatus = document.getElementById('metaStatus');

// Counters
const counterTabs = document.getElementById('counterTabs');
const counterPastes = document.getElementById('counterPastes');
const counterFocus = document.getElementById('counterFocus');
const counterDevtools = document.getElementById('counterDevtools');
const counterDisconnects = document.getElementById('counterDisconnects');

// ── Init ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initEditor('javascript');
    connectSocket();
    setupFilters();
    setupEndSession();
});

// ── Editor (read-only) ─────────────────────────────────────────────────
function initEditor(lang) {
    const langExt = languageExtensions[lang] || [];

    if (editorView) {
        editorView.destroy();
    }

    editorView = new EditorView({
        state: EditorState.create({
            doc: '',
            extensions: [basicSetup, oneDark, Array.isArray(langExt) ? langExt : langExt, EditorState.readOnly.of(true)],
        }),
        parent: proctorEditorContainer,
    });
}

function updateEditorContent(content) {
    if (!editorView) return;
    editorEmpty.style.display = 'none';

    const currentContent = editorView.state.doc.toString();
    if (content !== currentContent) {
        editorView.dispatch({
            changes: { from: 0, to: currentContent.length, insert: content },
        });
    }
}

// ── Socket.IO ───────────────────────────────────────────────────────────
function connectSocket() {
    socket = io({
        query: { sessionId, token, role: 'proctor' },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
        disconnectedOverlay.classList.remove('active');
    });

    socket.on('disconnect', () => {
        disconnectedOverlay.classList.add('active');
    });

    socket.on('session_info', info => {
        metaCandidate.textContent = info.candidateName || '—';
        metaSessionId.textContent = info.sessionId || '—';
        metaStatus.textContent = capitalize(info.status || 'waiting');

        if (info.language) {
            sessionLanguage = info.language;
            editorLangBadge.textContent = capitalize(info.language);
            initEditor(info.language);
        }

        if (info.startedAt) {
            sessionStartTime = new Date(info.startedAt);
            metaStarted.textContent = formatTime(sessionStartTime);
            startTimer();
        }
    });

    socket.on('session_status', data => {
        metaStatus.textContent = capitalize(data.status);
        if (data.status === 'active' && data.startedAt) {
            sessionStartTime = new Date(data.startedAt);
            metaStarted.textContent = formatTime(sessionStartTime);
            startTimer();
        }
        if (data.status === 'ended') {
            statusBadge.innerHTML = '🏁 ENDED';
            statusBadge.classList.remove('badge-live');
            statusBadge.classList.add('badge-info');
            clearInterval(timerInterval);
            endSessionBtn.disabled = true;
            endSessionBtn.textContent = 'Session Ended';
        }
    });

    socket.on('editor_sync', snapshot => {
        updateEditorContent(snapshot.content || '');
    });

    socket.on('event', event => {
        processEvent(event);
    });

    socket.on('event_history', history => {
        for (const event of history) {
            processEvent(event, true);
        }
    });

    socket.on('error_msg', data => {
        alert(data.message);
        window.location.href = '/lobby.html';
    });
}

// ── Process event ───────────────────────────────────────────────────────
function processEvent(event, isHistory = false) {
    feedEmpty.style.display = 'none';

    // Update counters
    updateCounters(event);

    // Render event card
    renderEventCard(event);

    // Show toast for alerts and warnings (skip during history replay)
    if (!isHistory && (event.severity === 'alert' || event.severity === 'warning')) {
        showToast(event);
    }

    // Play sound for alerts (skip during history replay)
    if (!isHistory && event.severity === 'alert') {
        playAlertSound();
    }
}

function updateCounters(event) {
    switch (event.type) {
        case 'tab_hidden':
            counters.tabSwitches++;
            counterTabs.textContent = counters.tabSwitches;
            counterTabs.closest('.counter-chip').classList.add('has-value');
            break;
        case 'paste':
            counters.pastes++;
            counterPastes.textContent = counters.pastes;
            counterPastes.closest('.counter-chip').classList.add('has-value');
            break;
        case 'window_blur':
            counters.focusLost++;
            counterFocus.textContent = counters.focusLost;
            counterFocus.closest('.counter-chip').classList.add('has-value');
            break;
        case 'devtools_suspected':
            counters.devtools++;
            counterDevtools.textContent = counters.devtools;
            counterDevtools.closest('.counter-chip').classList.add('has-value');
            break;
        case 'network_disconnect':
            counters.disconnects++;
            counterDisconnects.textContent = counters.disconnects;
            counterDisconnects.closest('.counter-chip').classList.add('has-value');
            break;
    }
}

// ── Render event card ───────────────────────────────────────────────────
function renderEventCard(event) {
    const card = document.createElement('div');
    card.className = `event-card severity-${event.severity}`;
    card.dataset.severity = event.severity;
    card.dataset.type = event.type;

    const icon = eventIcons[event.type] || '📌';
    const description = getEventDescription(event);
    const time = event.timestampServer ? formatTimeShort(new Date(event.timestampServer)) : '—';
    const typeName = event.type.replace(/_/g, ' ');

    card.innerHTML = `
        <span class="event-icon">${icon}</span>
        <div class="event-body">
            <div class="event-type">${typeName}</div>
            <div class="event-detail">${description}</div>
        </div>
        <span class="event-time">${time}</span>
    `;

    // Apply current filter
    if (activeFilter !== 'all' && event.severity !== activeFilter) {
        card.style.display = 'none';
    }

    // Prepend (newest first)
    eventFeed.insertBefore(card, eventFeed.firstChild);
}

// ── Toast notifications ─────────────────────────────────────────────────
function showToast(event) {
    const toast = document.createElement('div');
    const icon = eventIcons[event.type] || '⚠️';
    const typeName = event.type.replace(/_/g, ' ');
    const time = formatTimeShort(new Date());
    const toastClass = event.severity === 'alert' ? 'toast-alert' : 'toast-warning';

    toast.className = `toast ${toastClass}`;
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-text">${typeName}</span>
        <span class="toast-time">${time}</span>
    `;

    toastContainer.appendChild(toast);

    // Auto-remove after 5s
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// ── Alert sound ─────────────────────────────────────────────────────────
function playAlertSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.3);
    } catch (e) {
        // Audio context not available; silently skip
    }
}

// ── Filter buttons ──────────────────────────────────────────────────────
function setupFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.filter;

            // Apply filter to existing cards
            document.querySelectorAll('.event-card').forEach(card => {
                if (activeFilter === 'all' || card.dataset.severity === activeFilter) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });
}

// ── End session ─────────────────────────────────────────────────────────
function setupEndSession() {
    endSessionBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to end this session?')) {
            socket.emit('end_session');
        }
    });
}

// ── Timer ───────────────────────────────────────────────────────────────
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!sessionStartTime) return;
        const elapsed = Date.now() - sessionStartTime.getTime();
        const hrs = Math.floor(elapsed / 3600000);
        const mins = Math.floor((elapsed % 3600000) / 60000);
        const secs = Math.floor((elapsed % 60000) / 1000);
        proctorTimer.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }, 1000);
}

// ── Helpers ─────────────────────────────────────────────────────────────
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatTimeShort(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
