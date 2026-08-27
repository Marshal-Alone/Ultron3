import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';

const electronPath = require.resolve('electron');
const mockSend = vi.fn();
const mockWindow = { webContents: { send: mockSend } };
const mockIpcHandlers = new Map();
const electronMock = {
    BrowserWindow: {
        getAllWindows: vi.fn(() => [mockWindow]),
    },
    ipcMain: {
        handle: vi.fn(),
        on: vi.fn((event, handler) => {
            mockIpcHandlers.set(event, handler);
        }),
        emit: vi.fn((event, ...args) => {
            const handler = mockIpcHandlers.get(event);
            if (handler) {
                handler({} /* mock event */, ...args);
            }
        })
    },
    shell: { openExternal: vi.fn() },
};
require.cache[electronPath] = {
    exports: electronMock,
};

const fs = require('fs');
const http = require('http');
const antigravity = require('../utils/antigravity');
const PromptLogger = require('../utils/promptLogger');


describe('Antigravity Client', () => {
    let createdRequests = [];
    let readFileSpy;
    let httpRequestSpy;

    beforeEach(() => {
        mockSend.mockClear();
        mockIpcHandlers.clear();

        if (readFileSpy) readFileSpy.mockRestore();
        readFileSpy = vi.spyOn(fs.promises, 'readFile');
        
        createdRequests = [];
        if (httpRequestSpy) httpRequestSpy.mockRestore();
        httpRequestSpy = vi.spyOn(http, 'request').mockImplementation((options, callback) => {
            const req = new EventEmitter();
            req.write = vi.fn();
            req.end = vi.fn();
            req.destroy = vi.fn();
            req.callback = callback;
            req.options = options;
            createdRequests.push(req);
            return req;
        });

        // Clear any previous active request in antigravity
        antigravity.cancelActiveRequest();

        antigravity.setupAntigravityIpcHandlers();
        PromptLogger.lastQuestion = 'test question';
    });

    test('no-question behavior', async () => {
        PromptLogger.lastQuestion = '';
        await antigravity.triggerProjectQuestion();
        expect(mockSend).toHaveBeenCalledWith('update-status', '⚠️ No speech heard yet');
        expect(readFileSpy).not.toHaveBeenCalled();
    });

    test('missing session auto-starts bridge', async () => {
        readFileSpy.mockRejectedValue(new Error('File not found'));
        await antigravity.triggerProjectQuestion();
        
        expect(mockSend).toHaveBeenCalledWith('update-status', 'Starting Bridge...');
        expect(mockSend).toHaveBeenCalledWith(
            'new-response',
            expect.stringContaining('Project Copilot bridge is starting in stealth background mode')
        );
    });

    test('stale session notifies warming', async () => {
        readFileSpy.mockResolvedValue(JSON.stringify({ status: 'stopped' }));
        await antigravity.triggerProjectQuestion();
        
        expect(mockSend).toHaveBeenCalledWith('update-status', 'Bridge Warming...');
        expect(mockSend).toHaveBeenCalledWith(
            'new-response',
            expect.stringContaining('Project Copilot is warming up')
        );
    });

    test('bridge connectivity (ECONNREFUSED)', async () => {
        readFileSpy.mockResolvedValue(JSON.stringify({ status: 'ready', port: 8080, token: 'test' }));
        const triggerPromise = antigravity.triggerProjectQuestion();
        await triggerPromise;
        
        const req = createdRequests[0];
        expect(req).toBeDefined();

        const error = new Error('ECONNREFUSED');
        error.code = 'ECONNREFUSED';
        req.emit('error', error);

        expect(mockSend).toHaveBeenCalledWith('update-status', 'Disconnected');
        expect(mockSend).toHaveBeenCalledWith('new-response', 'Error: Connection refused. Bridge might be down.');
    });

    test('SSE lifecycle: start, token accumulation, complete', async () => {
        readFileSpy.mockResolvedValue(JSON.stringify({ status: 'ready', port: 8080, token: 'test' }));
        await antigravity.triggerProjectQuestion();
        
        const req = createdRequests[0];
        expect(req).toBeDefined();

        const responseMock = new EventEmitter();
        responseMock.statusCode = 200;
        req.callback(responseMock);

        expect(mockSend).toHaveBeenCalledWith('update-status', 'Streaming...');

        responseMock.emit('data', Buffer.from('event: message\ndata: {"type": "start"}\n\n'));
        expect(mockSend).toHaveBeenCalledWith('new-response', 'Analyzing project...\n\n');

        responseMock.emit('data', Buffer.from('event: message\ndata: {"type": "token", "token": "hello"}\n\n'));
        expect(mockSend).toHaveBeenCalledWith('update-response', 'hello');

        responseMock.emit('data', Buffer.from('event: message\ndata: {"type": "token", "token": " world"}\n\n'));
        expect(mockSend).toHaveBeenCalledWith('update-response', 'hello world');

        responseMock.emit('data', Buffer.from('event: message\ndata: {"type": "complete"}\n\n'));
        expect(mockSend).toHaveBeenCalledWith('update-status', 'Ready');
    });

    test('SSE error', async () => {
        readFileSpy.mockResolvedValue(JSON.stringify({ status: 'ready', port: 8080, token: 'test' }));
        await antigravity.triggerProjectQuestion();
        
        const req = createdRequests[0];
        expect(req).toBeDefined();

        const responseMock = new EventEmitter();
        responseMock.statusCode = 200;
        req.callback(responseMock);

        responseMock.emit('data', Buffer.from('event: message\ndata: {"type": "error", "message": "Test error"}\n\n'));
        expect(mockSend).toHaveBeenCalledWith('new-response', 'Error: Test error');
        expect(mockSend).toHaveBeenCalledWith('update-status', 'Error');
    });

    test('cancellation via PromptLogger', async () => {
        readFileSpy.mockResolvedValue(JSON.stringify({ status: 'ready', port: 8080, token: 'test' }));
        await antigravity.triggerProjectQuestion();
        
        const req = createdRequests[0];
        expect(req).toBeDefined();

        PromptLogger.events.emit('new-ai-request');
        expect(req.destroy).toHaveBeenCalled();
    });

    test('duplicate trigger supersedes active request', async () => {
        readFileSpy.mockResolvedValue(JSON.stringify({ status: 'ready', port: 8080, token: 'test' }));
        
        await antigravity.triggerProjectQuestion();
        const req1 = createdRequests[0];
        const res1 = new EventEmitter();
        res1.statusCode = 200;
        req1.callback(res1);

        await antigravity.triggerProjectQuestion();
        expect(req1.destroy).toHaveBeenCalled();

        const req2 = createdRequests[1];
        const res2 = new EventEmitter();
        res2.statusCode = 200;
        req2.callback(res2);

        mockSend.mockClear();
        res1.emit('data', Buffer.from('event: message\ndata: {"type": "start"}\n\n'));
        expect(mockSend).not.toHaveBeenCalled();

        res2.emit('data', Buffer.from('event: message\ndata: {"type": "start"}\n\n'));
        expect(mockSend).toHaveBeenCalledWith('new-response', 'Analyzing project...\n\n');
    });

    test('stale events with mismatched requestId are ignored', async () => {
        readFileSpy.mockResolvedValue(JSON.stringify({ status: 'ready', port: 8080, token: 'test' }));
        await antigravity.triggerProjectQuestion();
        
        const req = createdRequests[0];
        const responseMock = new EventEmitter();
        responseMock.statusCode = 200;
        req.callback(responseMock);

        mockSend.mockClear();
        // Send event with a stale requestId
        responseMock.emit('data', Buffer.from('event: message\ndata: {"type": "token", "token": "stale text", "requestId": "req_old_123"}\n\n'));
        expect(mockSend).not.toHaveBeenCalled();
    });

    test('handles split SSE buffer chunks', async () => {
        readFileSpy.mockResolvedValue(JSON.stringify({ status: 'ready', port: 8080, token: 'test' }));
        await antigravity.triggerProjectQuestion();
        
        const req = createdRequests[0];
        const responseMock = new EventEmitter();
        responseMock.statusCode = 200;
        req.callback(responseMock);

        mockSend.mockClear();
        // First half of SSE event
        responseMock.emit('data', Buffer.from('event: message\ndata: {"type": "token", "toke'));
        expect(mockSend).not.toHaveBeenCalled();

        // Second half of SSE event
        responseMock.emit('data', Buffer.from('n": "split data"}\n\n'));
        expect(mockSend).toHaveBeenCalledWith('update-response', 'split data');
    });
});



