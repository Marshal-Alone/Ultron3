import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { resizeLayout } from '../../utils/windowResize.js';

export class HistoryView extends LitElement {
    static styles = css`
        * {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            cursor: default;
            user-select: none;
        }

        :host {
            height: 100%;
            display: flex;
            flex-direction: column;
            width: 100%;
        }

        .history-container {
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        .sessions-list {
            flex: 1;
            overflow-y: auto;
        }

        .session-item {
            padding: 12px;
            border-bottom: 1px solid var(--border-color);
            cursor: pointer;
            transition: background 0.1s ease;
        }

        .session-item:hover {
            background: var(--hover-background);
        }

        .session-item.selected {
            background: var(--bg-secondary);
        }

        .session-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }

        .session-date {
            font-size: 12px;
            font-weight: 500;
            color: var(--text-color);
        }

        .session-time {
            font-size: 11px;
            color: var(--text-muted);
            font-family: 'SF Mono', Monaco, monospace;
        }

        .session-preview {
            font-size: 11px;
            color: var(--text-muted);
            line-height: 1.3;
        }

        .conversation-view {
            flex: 1;
            overflow-y: auto;
            background: var(--bg-primary);
            padding: 12px 0;
            user-select: text;
            cursor: text;
        }

        .message {
            margin-bottom: 8px;
            padding: 8px 12px;
            border-left: 2px solid transparent;
            font-size: 12px;
            line-height: 1.4;
            background: var(--bg-secondary);
            user-select: text;
            cursor: text;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .message.user {
            border-left-color: #3b82f6;
        }

        .message.ai {
            border-left-color: #ef4444;
        }

        .back-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding: 12px 12px 12px 12px;
            border-bottom: 1px solid var(--border-color);
        }

        .back-button {
            background: transparent;
            color: var(--text-color);
            border: 1px solid var(--border-color);
            padding: 6px 12px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: background 0.1s ease;
        }

        .back-button:hover {
            background: var(--hover-background);
        }

        .legend {
            display: flex;
            gap: 12px;
            align-items: center;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            color: var(--text-muted);
        }

        .legend-dot {
            width: 8px;
            height: 2px;
        }

        .legend-dot.user {
            background-color: #3b82f6;
        }

        .legend-dot.ai {
            background-color: #ef4444;
        }

        .legend-dot.screen {
            background-color: #22c55e;
        }

        .session-context {
            padding: 8px 12px;
            margin-bottom: 8px;
            background: var(--bg-tertiary);
            border-radius: 4px;
            font-size: 11px;
        }

        .session-context-row {
            display: flex;
            gap: 8px;
            margin-bottom: 4px;
        }

        .session-context-row:last-child {
            margin-bottom: 0;
        }

        .context-label {
            color: var(--text-muted);
            min-width: 80px;
        }

        .context-value {
            color: var(--text-color);
            font-weight: 500;
        }

        .custom-prompt-value {
            color: var(--text-secondary);
            font-style: italic;
            word-break: break-word;
            white-space: pre-wrap;
        }

        .view-tabs {
            display: flex;
            gap: 0;
            border-bottom: 1px solid var(--border-color);
            margin-bottom: 8px;
        }

        .view-tab {
            background: transparent;
            color: var(--text-muted);
            border: none;
            padding: 8px 16px;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            margin-bottom: -1px;
            transition: color 0.1s ease;
        }

        .view-tab:hover {
            color: var(--text-color);
        }

        .view-tab.active {
            color: var(--text-color);
            border-bottom-color: var(--text-color);
        }

        .message.screen {
            border-left-color: #22c55e;
        }

        .analysis-meta {
            font-size: 10px;
            color: var(--text-muted);
            margin-bottom: 4px;
            font-family: 'SF Mono', Monaco, monospace;
        }

        .empty-state {
            text-align: center;
            color: var(--text-muted);
            font-size: 12px;
            margin-top: 32px;
        }

        .empty-state-title {
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 6px;
            color: var(--text-secondary);
        }

        .loading {
            text-align: center;
            color: var(--text-muted);
            font-size: 12px;
            margin-top: 32px;
        }

        .sessions-list::-webkit-scrollbar,
        .conversation-view::-webkit-scrollbar {
            width: 8px;
        }

        .sessions-list::-webkit-scrollbar-track,
        .conversation-view::-webkit-scrollbar-track {
            background: transparent;
        }

        .sessions-list::-webkit-scrollbar-thumb,
        .conversation-view::-webkit-scrollbar-thumb {
            background: var(--scrollbar-thumb);
            border-radius: 4px;
        }

        .sessions-list::-webkit-scrollbar-thumb:hover,
        .conversation-view::-webkit-scrollbar-thumb:hover {
            background: var(--scrollbar-thumb-hover);
        }

        .tabs-container {
            display: flex;
            gap: 0;
            margin-bottom: 16px;
            border-bottom: 1px solid var(--border-color);
        }

        .tab {
            background: transparent;
            color: var(--text-muted);
            border: none;
            padding: 8px 16px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: color 0.1s ease;
            border-bottom: 2px solid transparent;
            margin-bottom: -1px;
        }

        .tab:hover {
            color: var(--text-color);
        }

        .tab.active {
            color: var(--text-color);
            border-bottom-color: var(--text-color);
        }

        .saved-response-item {
            padding: 12px 0;
            border-bottom: 1px solid var(--border-color);
        }

        .saved-response-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 6px;
        }

        .saved-response-profile {
            font-size: 11px;
            font-weight: 500;
            color: var(--text-secondary);
            text-transform: capitalize;
        }

        .saved-response-date {
            font-size: 10px;
            color: var(--text-muted);
            font-family: 'SF Mono', Monaco, monospace;
        }

        .saved-response-content {
            font-size: 12px;
            color: var(--text-color);
            line-height: 1.4;
            user-select: text;
            cursor: text;
        }

        .delete-button {
            background: transparent;
            color: var(--text-muted);
            border: none;
            padding: 4px;
            border-radius: 3px;
            cursor: pointer;
            transition: all 0.1s ease;
        }

        .delete-button:hover {
            background: rgba(241, 76, 76, 0.1);
            color: var(--error-color);
        }

        .screenshot-gallery {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 12px;
            padding: 12px;
        }

        .screenshot-item {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            overflow: hidden;
            cursor: pointer;
            transition: border-color 0.1s ease;
        }

        .screenshot-item:hover {
            border-color: var(--text-secondary);
        }

        .screenshot-image {
            width: 100%;
            max-height: 150px;
            object-fit: cover;
            background: #000;
        }

        .screenshot-info {
            padding: 8px;
            border-top: 1px solid var(--border-color);
        }

        .screenshot-timestamp {
            font-size: 10px;
            color: var(--text-muted);
            font-family: 'SF Mono', Monaco, monospace;
            margin-bottom: 4px;
        }

        .screenshot-response {
            font-size: 11px;
            color: var(--text-color);
            line-height: 1.3;
            max-height: 60px;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
        }

        .screenshot-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }

        .screenshot-modal-content {
            background: var(--bg-primary);
            border-radius: 8px;
            max-width: 90vw;
            max-height: 90vh;
            overflow: auto;
            padding: 16px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        }

        .screenshot-modal-image {
            max-width: 100%;
            max-height: 70vh;
            object-fit: contain;
            margin-bottom: 12px;
            border-radius: 4px;
        }

        .screenshot-modal-response {
            font-size: 12px;
            line-height: 1.5;
            color: var(--text-color);
            white-space: pre-wrap;
            word-break: break-word;
        }

        .screenshot-modal-close {
            position: absolute;
            top: 12px;
            right: 12px;
            background: var(--bg-secondary);
            color: var(--text-color);
            border: 1px solid var(--border-color);
            border-radius: 3px;
            width: 32px;
            height: 32px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.1s ease;
        }

        .screenshot-modal-close:hover {
            background: var(--hover-background);
        }
    `;

    static properties = {
        sessions: { type: Array },
        selectedSession: { type: Object },
        loading: { type: Boolean },
        activeTab: { type: String },
        selectedScreenshot: { type: Object },
    };

    constructor() {
        super();
        this.sessions = [];
        this.selectedSession = null;
        this.loading = true;
        this.activeTab = 'conversation'; // 'conversation', 'screen', or 'context'
        this.selectedScreenshot = null;
        this.loadSessions();
    }

    connectedCallback() {
        super.connectedCallback();
        // Resize window for this view
        resizeLayout();
    }

    async loadSessions() {
        try {
            this.loading = true;
            this.sessions = await cheatingDaddy.storage.getAllSessions();
        } catch (error) {
            console.error('Error loading conversation sessions:', error);
            this.sessions = [];
        } finally {
            this.loading = false;
            this.requestUpdate();
        }
    }

    async loadSelectedSession(sessionId) {
        try {
            const session = await cheatingDaddy.storage.getSession(sessionId);
            if (session) {
                this.selectedSession = session;
                this.requestUpdate();
            }
        } catch (error) {
            console.error('Error loading session:', error);
        }
    }

    formatDate(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    getSessionPreview(session) {
        const parts = [];
        if (session.messageCount > 0) {
            parts.push(`${session.messageCount} messages`);
        }
        if (session.screenAnalysisCount > 0) {
            parts.push(`${session.screenAnalysisCount} screen analysis`);
        }
        if (session.profile) {
            const profileNames = this.getProfileNames();
            parts.push(profileNames[session.profile] || session.profile);
        }
        return parts.length > 0 ? parts.join(' • ') : 'Empty session';
    }

    handleSessionClick(session) {
        this.loadSelectedSession(session.sessionId);
    }

    handleBackClick() {
        this.selectedSession = null;
        this.activeTab = 'conversation';
    }

    handleTabClick(tab) {
        this.activeTab = tab;
    }

    async handleClearHistory() {
        const confirmed = confirm(
            '⚠️ Clear all conversation history?\n\n' +
            'This will permanently delete all saved conversations and cannot be undone.\n\n' +
            'Type "DELETE" to confirm:'
        );
        
        if (!confirmed) return;
        
        // Ask for confirmation by typing DELETE
        const userInput = prompt('Type "DELETE" to permanently clear all history:');
        if (userInput !== 'DELETE') {
            alert('Cancelled. History was not cleared.');
            return;
        }

        try {
            // Call the ipcRenderer to delete all sessions
            const result = await cheatingDaddy.ipcRenderer.invoke('storage:delete-all-sessions');
            if (result.success) {
                // Reload sessions after clearing
                await this.loadSessions();
                this.selectedSession = null;
                alert('Check mark All conversation history has been cleared.');
            } else {
                alert('Cross mark Failed to clear history: ' + result.error);
            }
        } catch (error) {
            console.error('Error clearing history:', error);
            alert('Failed to clear history. Please try again.');
        }
    }

    handleScreenshotClick(screenshot) {
        this.selectedScreenshot = screenshot;
    }

    handleCloseScreenshot() {
        this.selectedScreenshot = null;
    }

    getProfileNames() {
        return {
            interview: 'Job Interview',
            sales: 'Sales Call',
            meeting: 'Business Meeting',
            presentation: 'Presentation',
            negotiation: 'Negotiation',
            exam: 'Exam Assistant',
        };
    }

    renderSessionsList() {
        if (this.loading) {
            return html`<div class="loading">Loading conversation history...</div>`;
        }

        if (this.sessions.length === 0) {
            return html`
                <div class="empty-state">
                    <div class="empty-state-title">No conversations yet</div>
                    <div>Start a session to see your conversation history here</div>
                </div>
            `;
        }

        return html`
            <div class="history-container" style="display: flex; flex-direction: column; height: 100%;">
                <div style="padding: 12px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-weight: 500; color: var(--text-color);">Conversation History</div>
                    ${this.sessions.length > 0 ? html`
                        <button 
                            class="back-button" 
                            @click=${() => this.handleClearHistory()}
                            style="background: rgba(241, 76, 76, 0.1); color: var(--error-color); border-color: var(--error-color);"
                        >
                            Clear All
                        </button>
                    ` : ''}
                </div>
                <div class="sessions-list" style="flex: 1; overflow-y: auto;">
                    ${this.sessions.map(
                        session => html`
                            <div class="session-item" @click=${() => this.handleSessionClick(session)}>
                                <div class="session-header">
                                    <div class="session-date">${this.formatDate(session.createdAt)}</div>
                                    <div class="session-time">${this.formatTime(session.createdAt)}</div>
                                </div>
                                <div class="session-preview">${this.getSessionPreview(session)}</div>
                            </div>
                        `
                    )}
                </div>
            </div>
        `;
    }

    renderContextContent() {
        const { profile, customPrompt } = this.selectedSession;
        const profileNames = this.getProfileNames();

        if (!profile && !customPrompt) {
            return html`<div class="empty-state">No profile context available</div>`;
        }

        return html`
            <div class="session-context">
                ${profile ? html`
                    <div class="session-context-row">
                        <span class="context-label">Profile:</span>
                        <span class="context-value">${profileNames[profile] || profile}</span>
                    </div>
                ` : ''}
                ${customPrompt ? html`
                    <div class="session-context-row">
                        <span class="context-label">Custom Prompt:</span>
                        <span class="custom-prompt-value">${customPrompt}</span>
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderConversationContent() {
        const { conversationHistory } = this.selectedSession;

        // Flatten the conversation turns into individual messages
        const messages = [];
        if (conversationHistory) {
            conversationHistory.forEach(turn => {
                if (turn.transcription) {
                    messages.push({
                        type: 'user',
                        content: turn.transcription,
                        timestamp: turn.timestamp,
                    });
                }
                if (turn.ai_response) {
                    messages.push({
                        type: 'ai',
                        content: turn.ai_response,
                        timestamp: turn.timestamp,
                    });
                }
            });
        }

        if (messages.length === 0) {
            return html`<div class="empty-state">No conversation data available</div>`;
        }

        return messages.map(message => html`<div class="message ${message.type}">${message.content}</div>`);
    }

    renderScreenAnalysisContent() {
        const { screenshotReferences } = this.selectedSession;

        if (!screenshotReferences || screenshotReferences.length === 0) {
            return html`<div class="empty-state">No screenshots available</div>`;
        }

        return html`
            <div class="screenshot-gallery">
                ${screenshotReferences.map(screenshot => html`
                    <div class="screenshot-item" @click=${() => this.handleScreenshotClick(screenshot)}>
                        <img class="screenshot-image" src="data:image/png;base64,${screenshot.base64Data}" alt="Screenshot" />
                        <div class="screenshot-info">
                            <div class="screenshot-timestamp">${this.formatTimestamp(screenshot.timestamp)}</div>
                            ${screenshot.aiResponse ? html`
                                <div class="screenshot-response">${screenshot.aiResponse}</div>
                            ` : html`<div class="screenshot-response" style="color: var(--text-muted);">No response</div>`}
                        </div>
                    </div>
                `)}
            </div>
        `;
    }

    renderConversationView() {
        if (!this.selectedSession) return html``;

        const { conversationHistory, screenshotReferences, profile, customPrompt } = this.selectedSession;
        const hasConversation = conversationHistory && conversationHistory.length > 0;
        const hasScreenshots = screenshotReferences && screenshotReferences.length > 0;
        const hasContext = profile || customPrompt;

        return html`
            <div class="back-header">
                <button class="back-button" @click=${this.handleBackClick}>
                    <svg
                        width="16px"
                        height="16px"
                        stroke-width="1.7"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        color="currentColor"
                    >
                        <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                    Back to Sessions
                </button>
                <div class="legend">
                    <div class="legend-item">
                        <div class="legend-dot user"></div>
                        <span>Them</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-dot ai"></div>
                        <span>Suggestion</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-dot screen"></div>
                        <span>Screen</span>
                    </div>
                </div>
            </div>
            <div class="view-tabs">
                <button
                    class="view-tab ${this.activeTab === 'conversation' ? 'active' : ''}"
                    @click=${() => this.handleTabClick('conversation')}
                >
                    Conversation ${hasConversation ? `(${conversationHistory.length})` : ''}
                </button>
                <button
                    class="view-tab ${this.activeTab === 'screen' ? 'active' : ''}"
                    @click=${() => this.handleTabClick('screen')}
                >
                    Screen ${hasScreenshots ? `(${screenshotReferences.length})` : ''}
                </button>
                <button
                    class="view-tab ${this.activeTab === 'context' ? 'active' : ''}"
                    @click=${() => this.handleTabClick('context')}
                >
                    Context ${hasContext ? '' : '(empty)'}
                </button>
            </div>
            <div class="conversation-view">
                ${this.activeTab === 'conversation'
                    ? this.renderConversationContent()
                    : this.activeTab === 'screen'
                        ? this.renderScreenAnalysisContent()
                        : this.renderContextContent()}
            </div>
        `;
    }

    render() {
        if (this.selectedScreenshot) {
            return html`
                <div class="screenshot-modal" @click=${this.handleCloseScreenshot}>
                    <button class="screenshot-modal-close" @click=${this.handleCloseScreenshot}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                    <div class="screenshot-modal-content" @click=${e => e.stopPropagation()}>
                        <img class="screenshot-modal-image" src="data:image/png;base64,${this.selectedScreenshot.base64Data}" alt="Screenshot" />
                        ${this.selectedScreenshot.aiResponse ? html`
                            <div class="screenshot-modal-response">${this.selectedScreenshot.aiResponse}</div>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        if (this.selectedSession) {
            return html`<div class="history-container">${this.renderConversationView()}</div>`;
        }

        return html`
            <div class="history-container">
                ${this.renderSessionsList()}
            </div>
        `;
    }
}

customElements.define('history-view', HistoryView);
