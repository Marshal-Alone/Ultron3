const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    pingInterval: 10000,
    pingTimeout: 5000,
});

const PORT = process.env.PORT || 3200;

// ── In-memory stores ────────────────────────────────────────────────────
const sessions = new Map(); // sessionId → session metadata
const events = new Map(); // sessionId → Event[]
const snapshots = new Map(); // sessionId → { content, timestamp, cursorPos }

// ── Helpers ─────────────────────────────────────────────────────────────
function generateId() {
    return crypto.randomBytes(4).toString('hex');
}

function generateToken() {
    return crypto.randomBytes(16).toString('hex');
}

function serverTimestamp() {
    return new Date().toISOString();
}

// ── Static files ────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ── REST API ────────────────────────────────────────────────────────────

// Create a new session
app.post('/api/session', (req, res) => {
    const { candidateName, proctorName, language } = req.body;
    const sessionId = generateId();
    const candidateToken = generateToken();
    const proctorToken = generateToken();

    const session = {
        id: sessionId,
        candidateName: candidateName || 'Candidate',
        proctorName: proctorName || 'Proctor',
        language: language || 'javascript',
        candidateToken,
        proctorToken,
        status: 'waiting', // waiting | active | ended
        createdAt: serverTimestamp(),
        startedAt: null,
        endedAt: null,
        candidateConnected: false,
        proctorConnected: false,
    };

    sessions.set(sessionId, session);
    events.set(sessionId, []);
    snapshots.set(sessionId, { content: '', timestamp: serverTimestamp(), cursorPos: null });

    res.json({
        sessionId,
        candidateToken,
        proctorToken,
        candidateUrl: `/candidate.html?session=${sessionId}&token=${candidateToken}`,
        proctorUrl: `/proctor.html?session=${sessionId}&token=${proctorToken}`,
    });
});

// Get session info (public subset)
app.get('/api/session/:id', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({
        id: session.id,
        candidateName: session.candidateName,
        proctorName: session.proctorName,
        language: session.language,
        status: session.status,
        createdAt: session.createdAt,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
    });
});

// Get event log for a session (proctor only, validated by token)
app.get('/api/session/:id/events', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const token = req.query.token;
    if (token !== session.proctorToken) return res.status(403).json({ error: 'Forbidden' });
    res.json(events.get(req.params.id) || []);
});

// ── Socket.IO ───────────────────────────────────────────────────────────

io.on('connection', (socket) => {
    const { sessionId, token, role } = socket.handshake.query;

    const session = sessions.get(sessionId);
    if (!session) {
        socket.emit('error_msg', { message: 'Session not found' });
        socket.disconnect();
        return;
    }

    // Validate token
    if (role === 'candidate' && token !== session.candidateToken) {
        socket.emit('error_msg', { message: 'Invalid candidate token' });
        socket.disconnect();
        return;
    }
    if (role === 'proctor' && token !== session.proctorToken) {
        socket.emit('error_msg', { message: 'Invalid proctor token' });
        socket.disconnect();
        return;
    }

    // Join the session room
    const room = `session:${sessionId}`;
    socket.join(room);

    if (role === 'candidate') {
        session.candidateConnected = true;

        // Send session info to candidate
        socket.emit('session_info', {
            sessionId: session.id,
            candidateName: session.candidateName,
            language: session.language,
            status: session.status,
            startedAt: session.startedAt,
        });

        // If session hasn't started yet, start it now
        if (session.status === 'waiting') {
            session.status = 'active';
            session.startedAt = serverTimestamp();

            const startEvent = {
                id: generateId(),
                sessionId,
                type: 'session_start',
                timestampClient: null,
                timestampServer: serverTimestamp(),
                payload: { candidateName: session.candidateName },
                severity: 'info',
            };
            events.get(sessionId).push(startEvent);

            // Notify everyone in the room
            io.to(room).emit('event', startEvent);
            io.to(room).emit('session_status', { status: 'active', startedAt: session.startedAt });
        }

        // ── Candidate events ────────────────────────────────────────
        socket.on('activity_event', (data) => {
            const event = {
                id: generateId(),
                sessionId,
                type: data.type,
                timestampClient: data.timestamp,
                timestampServer: serverTimestamp(),
                payload: data.payload || {},
                severity: getSeverity(data.type),
            };
            events.get(sessionId).push(event);
            io.to(room).emit('event', event);
        });

        // Editor content updates
        socket.on('editor_update', (data) => {
            const snap = {
                content: data.content,
                timestamp: serverTimestamp(),
                cursorPos: data.cursorPos || null,
            };
            snapshots.set(sessionId, snap);
            // Broadcast to proctor
            socket.to(room).emit('editor_sync', snap);
        });

        // Editor snapshot (periodic full content)
        socket.on('editor_snapshot', (data) => {
            const snap = {
                content: data.content,
                timestamp: serverTimestamp(),
                cursorPos: data.cursorPos || null,
            };
            snapshots.set(sessionId, snap);
            socket.to(room).emit('editor_sync', snap);
        });

        // Buffered events (sent on reconnect)
        socket.on('buffered_events', (eventsArray) => {
            if (!Array.isArray(eventsArray)) return;
            for (const data of eventsArray) {
                const event = {
                    id: generateId(),
                    sessionId,
                    type: data.type,
                    timestampClient: data.timestamp,
                    timestampServer: serverTimestamp(),
                    payload: data.payload || {},
                    severity: getSeverity(data.type),
                };
                events.get(sessionId).push(event);
                io.to(room).emit('event', event);
            }
        });

        socket.on('disconnect', () => {
            session.candidateConnected = false;
            const event = {
                id: generateId(),
                sessionId,
                type: 'network_disconnect',
                timestampClient: null,
                timestampServer: serverTimestamp(),
                payload: { reason: 'Candidate disconnected' },
                severity: 'alert',
            };
            events.get(sessionId).push(event);
            io.to(room).emit('event', event);
        });
    }

    if (role === 'proctor') {
        session.proctorConnected = true;

        // Send full session state to proctor on connect
        socket.emit('session_info', {
            sessionId: session.id,
            candidateName: session.candidateName,
            proctorName: session.proctorName,
            language: session.language,
            status: session.status,
            startedAt: session.startedAt,
            createdAt: session.createdAt,
        });

        // Send existing event log
        const existingEvents = events.get(sessionId) || [];
        socket.emit('event_history', existingEvents);

        // Send current editor snapshot
        const currentSnapshot = snapshots.get(sessionId);
        if (currentSnapshot) {
            socket.emit('editor_sync', currentSnapshot);
        }

        // Proctor can end the session
        socket.on('end_session', () => {
            if (session.status === 'active') {
                session.status = 'ended';
                session.endedAt = serverTimestamp();

                const endEvent = {
                    id: generateId(),
                    sessionId,
                    type: 'session_end',
                    timestampClient: null,
                    timestampServer: serverTimestamp(),
                    payload: { endedBy: 'proctor' },
                    severity: 'info',
                };
                events.get(sessionId).push(endEvent);
                io.to(room).emit('event', endEvent);
                io.to(room).emit('session_status', { status: 'ended', endedAt: session.endedAt });
            }
        });

        socket.on('disconnect', () => {
            session.proctorConnected = false;
        });
    }
});

// ── Severity mapping ────────────────────────────────────────────────────
function getSeverity(eventType) {
    const severityMap = {
        session_start: 'info',
        session_end: 'info',
        idle: 'info',
        keystroke: 'info',
        tab_hidden: 'alert',
        tab_visible: 'alert',
        window_blur: 'alert',
        window_focus: 'alert',
        paste: 'warning',
        copy: 'warning',
        right_click: 'warning',
        fullscreen_exit: 'warning',
        devtools_suspected: 'alert',
        network_disconnect: 'alert',
        network_reconnect: 'info',
    };
    return severityMap[eventType] || 'info';
}

// ── Start ───────────────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`\n  ⚡ Proctor Rounds running at http://localhost:${PORT}\n`);
});
