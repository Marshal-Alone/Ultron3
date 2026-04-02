import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class AppHeader extends LitElement {
    static styles = css`
        * {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            cursor: default;
            user-select: none;
        }

        .header {
            -webkit-app-region: drag;
            display: flex;
            align-items: center;
            padding: var(--header-padding);
            background: var(--header-background);
            border-bottom: 1px solid var(--border-color);
        }

        .header-title {
            flex: 1;
            font-size: var(--header-font-size);
            font-weight: 500;
            color: var(--text-color);
            -webkit-app-region: drag;
        }

        .header-actions {
            display: flex;
            gap: var(--header-gap);
            align-items: center;
            -webkit-app-region: no-drag;
        }

        .header-actions span {
            font-size: var(--header-font-size-small);
            color: var(--text-secondary);
        }

        .button {
            background: transparent;
            color: var(--text-color);
            border: 1px solid var(--border-color);
            padding: var(--header-button-padding);
            border-radius: 3px;
            font-size: var(--header-font-size-small);
            font-weight: 500;
            transition: background 0.1s ease;
        }

        .button:hover {
            background: var(--hover-background);
        }

        .icon-button {
            background: transparent;
            color: var(--text-secondary);
            border: none;
            padding: var(--header-icon-padding);
            border-radius: 3px;
            font-size: var(--header-font-size-small);
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.1s ease;
        }

        .icon-button svg {
            width: var(--icon-size);
            height: var(--icon-size);
        }

        .icon-button:hover {
            background: var(--hover-background);
            color: var(--text-color);
        }

        :host([isclickthrough]) .button:hover,
        :host([isclickthrough]) .icon-button:hover {
            background: transparent;
        }

        .key {
            background: var(--key-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            font-family: 'SF Mono', Monaco, monospace;
        }

        .click-through-indicator {
            font-size: 10px;
            color: var(--text-muted);
            background: var(--key-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'SF Mono', Monaco, monospace;
        }

        .update-button {
            background: transparent;
            color: #f14c4c;
            border: 1px solid #f14c4c;
            padding: var(--header-button-padding);
            border-radius: 3px;
            font-size: var(--header-font-size-small);
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: all 0.1s ease;
        }

        .update-button svg {
            width: 14px;
            height: 14px;
        }

        .update-button:hover {
            background: rgba(241, 76, 76, 0.1);
        }

        .provider-badge {
            display: inline-flex;
            align-items: center;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 500;
            cursor: pointer;
            transition: opacity 0.15s ease;
            -webkit-app-region: no-drag;
            opacity: 0.7;
        }

        .provider-badge:hover {
            opacity: 1;
        }

        .provider-badge.gemini {
            color: #4285f4;
        }

        .provider-badge.groq {
            color: #f55036;
        }

        .header.hidden {
            display: none;
            border: none;
        }

        .invigilator-mode-indicator {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            background: rgba(0, 255, 136, 0.1);
            color: #00ff88;
            border: 1px solid rgba(0, 255, 136, 0.3);
            letter-spacing: 0.5px;
        }

        .invigilator-mode-indicator.inactive {
            opacity: 0.3;
            background: rgba(128, 128, 128, 0.1);
            color: var(--text-secondary);
            border-color: transparent;
        }

        .invigilator-mode-indicator.char-by-char::before {
            content: '⌨️';
            font-size: 10px;
        }

        .invigilator-mode-indicator.instant::before {
            content: '⚡';
            font-size: 10px;
        }
    `;

    static properties = {
        currentView: { type: String },
        statusText: { type: String },
        startTime: { type: Number },
        backgroundTransparency: { type: Number },
        isNavbarHidden: { type: Boolean },
        onCustomizeClick: { type: Function },
        onHelpClick: { type: Function },
        onHistoryClick: { type: Function },
        onCloseClick: { type: Function },
        onBackClick: { type: Function },
        onHideToggleClick: { type: Function },
        isClickThrough: { type: Boolean, reflect: true },
        updateAvailable: { type: Boolean },
        aiProvider: { type: String },
        // Invigilator Mode properties
        invigilatorModeActive: { type: Boolean },
        invigilatorTypingMode: { type: String },
    };

    constructor() {
        super();
        this.currentView = 'main';
        this.statusText = '';
        this.startTime = null;
        this.backgroundTransparency = 0.8;
        this.isNavbarHidden = false;
        this.onCustomizeClick = () => { };
        this.onHelpClick = () => { };
        this.onHistoryClick = () => { };
        this.onCloseClick = () => { };
        this.onBackClick = () => { };
        this.onHideToggleClick = () => { };
        this.isClickThrough = false;
        this.updateAvailable = false;
        this._timerInterval = null;
        this.aiProvider = 'gemini';
        // Invigilator Mode defaults
        this.invigilatorModeActive = false;
        this.invigilatorTypingMode = 'charByChar';
        this._loadAiProvider();
    }

    async _loadAiProvider() {
        try {
            if (window.cheatingDaddy?.storage?.getPreferences) {
                const prefs = await window.cheatingDaddy.storage.getPreferences();
                if (prefs && prefs.aiProvider) {
                    this.aiProvider = prefs.aiProvider;
                    this.requestUpdate();
                }
            }
        } catch (error) {
            console.error('Error loading AI provider in header:', error);
        }
    }

    connectedCallback() {
        super.connectedCallback();
        this._startTimer();
        this._checkForUpdates();

        // Listen for AI provider changes
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            this._handleProviderChanged = (event, provider) => {
                this.aiProvider = provider;
                this.requestUpdate();
            };
            ipcRenderer.on('ai-provider-changed', this._handleProviderChanged);
        }
    }

    async _checkForUpdates() {
        try {
            const currentVersion = await cheatingDaddy.getVersion();
            const response = await fetch('https://raw.githubusercontent.com/sohzm/cheating-daddy/refs/heads/master/package.json');
            if (!response.ok) return;

            const remotePackage = await response.json();
            const remoteVersion = remotePackage.version;

            if (this._isNewerVersion(remoteVersion, currentVersion)) {
                this.updateAvailable = true;
            }
        } catch (err) {
            console.log('Update check failed:', err.message);
        }
    }

    _isNewerVersion(remote, current) {
        const remoteParts = remote.split('.').map(Number);
        const currentParts = current.split('.').map(Number);

        for (let i = 0; i < Math.max(remoteParts.length, currentParts.length); i++) {
            const r = remoteParts[i] || 0;
            const c = currentParts[i] || 0;
            if (r > c) return true;
            if (r < c) return false;
        }
        return false;
    }

    async _openUpdatePage() {
        const { ipcRenderer } = require('electron');
        await ipcRenderer.invoke('open-external', 'https://cheatingdaddy.com');
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopTimer();

        // Clean up IPC listener
        if (window.require && this._handleProviderChanged) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.removeListener('ai-provider-changed', this._handleProviderChanged);
        }
    }

    updated(changedProperties) {
        super.updated(changedProperties);

        // Start/stop timer based on view change
        if (changedProperties.has('currentView')) {
            if (this.currentView === 'assistant' && this.startTime) {
                this._startTimer();
            } else {
                this._stopTimer();
            }
        }

        // Start timer when startTime is set
        if (changedProperties.has('startTime')) {
            if (this.startTime && this.currentView === 'assistant') {
                this._startTimer();
            } else if (!this.startTime) {
                this._stopTimer();
            }
        }
    }

    _startTimer() {
        // Clear any existing timer
        this._stopTimer();

        // Only start timer if we're in assistant view and have a start time
        if (this.currentView === 'assistant' && this.startTime) {
            this._timerInterval = setInterval(() => {
                // Trigger a re-render by requesting an update
                this.requestUpdate();
            }, 1000); // Update every second
        }
    }

    _stopTimer() {
        if (this._timerInterval) {
            clearInterval(this._timerInterval);
            this._timerInterval = null;
        }
    }

    getViewTitle() {
        const titles = {
            onboarding: 'Welcome to Jarvis',
            main: 'Jarvis',
            customize: 'Customize',
            help: 'Help & Shortcuts',
            history: 'Conversation History',
            advanced: 'Advanced Tools',
            assistant: 'Jarvis',
        };
        return titles[this.currentView] || 'Jarvis';
    }

    getElapsedTime() {
        if (this.currentView === 'assistant' && this.startTime) {
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            if (elapsed >= 60) {
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                return `${minutes}m ${seconds}s`;
            }
            return `${elapsed}s`;
        }
        return '';
    }

    isNavigationView() {
        const navigationViews = ['customize', 'help', 'history', 'advanced'];
        return navigationViews.includes(this.currentView);
    }

    async _toggleAiProvider() {
        const newProvider = this.aiProvider === 'gemini' ? 'groq' : 'gemini';
        this.aiProvider = newProvider;

        if (window.cheatingDaddy?.storage?.updatePreference) {
            await window.cheatingDaddy.storage.updatePreference('aiProvider', newProvider);
        }

        // Notify other components (like CustomizeView)
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('ai-provider-changed-notify', newProvider);
        }

        this.requestUpdate();
    }

    render() {
        const elapsedTime = this.getElapsedTime();
        const shouldHideHeader = this.isNavbarHidden || (this.currentView === 'assistant' && this.backgroundTransparency < 0.7);
        const headerClass = shouldHideHeader ? 'header hidden' : 'header';
        
        // Get invigilator mode indicator class
        const indicatorClass = this.invigilatorModeActive 
            ? `invigilator-mode-indicator ${this.invigilatorTypingMode === 'instant' ? 'instant' : 'char-by-char'}`
            : 'invigilator-mode-indicator inactive';
        const indicatorLabel = this.invigilatorModeActive 
            ? `${this.invigilatorTypingMode === 'instant' ? 'Instant' : 'Char-by-Char'}`
            : 'Invigilator OFF';

        return html`
            <div class="${headerClass}">
                <div class="header-title">${this.getViewTitle()}</div>
                <div class="header-actions">
                    ${this.invigilatorModeActive ? html`<div class="${indicatorClass}" title="Invigilator Mode: ${indicatorLabel}">${indicatorLabel}</div>` : ''}
                    ${this.currentView === 'assistant'
                ? html`
                              <div class="provider-badge ${this.aiProvider}" @click=${this._toggleAiProvider} title="Click to switch AI provider">
                                  ${this.aiProvider === 'gemini' ? 'Gemini' : 'Groq'}
                              </div>
                              <span>${elapsedTime}</span>
                              <span>${this.statusText}</span>
                              ${this.isClickThrough ? html`<span class="click-through-indicator">click-through</span>` : ''}
                          `
                : ''}
                    ${this.currentView === 'main'
                ? html`
                              <button class="icon-button" @click=${this.onHistoryClick}>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                      <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clip-rule="evenodd" />
                                  </svg>
                              </button>
                              <button class="icon-button" @click=${this.onCustomizeClick}>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                      <path fill-rule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clip-rule="evenodd" />
                                  </svg>
                              </button>
                              <button class="icon-button" @click=${this.onHelpClick}>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                      <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.94 6.94a.75.75 0 1 1-1.061-1.061 3 3 0 1 1 2.871 5.026v.345a.75.75 0 0 1-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 1 0 8.94 6.94ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd" />
                                  </svg>
                              </button>
                          `
                : ''}
                    ${this.currentView === 'assistant'
                ? html`
                              <button @click=${this.onHideToggleClick} class="button">
                                  Hide&nbsp;&nbsp;<span class="key" style="pointer-events: none;">${cheatingDaddy.isMacOS ? 'Cmd' : 'Ctrl'}</span
                                  >&nbsp;&nbsp;<span class="key">&bsol;</span>
                              </button>
                              <button @click=${this.onCloseClick} class="icon-button window-close">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                                  </svg>
                              </button>
                          `
                : html`
                              <button @click=${this.isNavigationView() ? this.onBackClick : this.onCloseClick} class="icon-button window-close">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                                  </svg>
                              </button>
                          `}
                </div>
            </div>
        `;
    }
}

customElements.define('app-header', AppHeader);
