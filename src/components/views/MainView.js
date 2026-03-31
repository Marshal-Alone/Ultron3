import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { resizeLayout } from '../../utils/windowResize.js';

export class MainView extends LitElement {
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
            max-width: 480px;
            padding: 8px 0;
        }

        .welcome {
            font-size: 24px;
            margin-bottom: 20px;
            font-weight: 600;
            color: var(--text-color);
            text-align: center;
        }

        .provider-section {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
        }

        .provider-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
        }

        .provider-icon {
            width: 20px;
            height: 20px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 11px;
            color: white;
        }

        .provider-icon.gemini {
            background: linear-gradient(135deg, #4285f4, #34a853);
        }

        .provider-icon.groq {
            background: linear-gradient(135deg, #f55036, #ff7b5c);
        }

        .provider-name {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-color);
        }

        .provider-desc {
            font-size: 11px;
            color: var(--text-muted);
            margin-left: auto;
        }

        .input-row {
            display: flex;
            gap: 10px;
        }

        input {
            flex: 1;
            background: var(--input-background);
            color: var(--text-color);
            border: 1px solid var(--border-color);
            padding: 12px 14px;
            border-radius: 6px;
            font-size: 13px;
            transition: all 0.15s ease;
        }

        input:focus {
            outline: none;
            border-color: #4285f4;
            box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.15);
        }

        input::placeholder {
            color: var(--placeholder-color);
        }

        input.api-key-error {
            animation: blink-red 0.6s ease-in-out;
            border-color: var(--error-color);
        }

        @keyframes blink-red {
            0%, 100% {
                border-color: var(--border-color);
            }
            50% {
                border-color: var(--error-color);
                background: rgba(241, 76, 76, 0.1);
            }
        }

        .start-button {
            padding: 12px 20px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            white-space: nowrap;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: all 0.15s ease;
            border: none;
            cursor: pointer;
        }

        .start-button.gemini {
            background: linear-gradient(135deg, #4285f4, #5a95f5);
            color: white;
            box-shadow: 0 2px 8px rgba(66, 133, 244, 0.3);
        }

        .start-button.gemini:hover {
            background: linear-gradient(135deg, #3367d6, #4285f4);
            box-shadow: 0 4px 12px rgba(66, 133, 244, 0.4);
            transform: translateY(-1px);
        }

        .start-button.groq {
            background: linear-gradient(135deg, #f55036, #ff6b4a);
            color: white;
            box-shadow: 0 2px 8px rgba(245, 80, 54, 0.3);
        }

        .start-button.groq:hover {
            background: linear-gradient(135deg, #d4432d, #f55036);
            box-shadow: 0 4px 12px rgba(245, 80, 54, 0.4);
            transform: translateY(-1px);
        }

        .start-button.initializing {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none !important;
        }

        .shortcut-hint {
            font-size: 10px;
            opacity: 0.8;
            font-family: 'SF Mono', Monaco, monospace;
        }

        .divider {
            display: flex;
            align-items: center;
            gap: 16px;
            margin: 4px 0;
            color: var(--text-muted);
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .divider::before,
        .divider::after {
            content: '';
            flex: 1;
            height: 1px;
            background: var(--border-color);
        }
    `;

    static properties = {
        onStart: { type: Function },
        onAPIKeyHelp: { type: Function },
        isInitializing: { type: Boolean },
        onLayoutModeChange: { type: Function },
        showApiKeyError: { type: Boolean },
        showGroqApiKeyError: { type: Boolean },
    };

    constructor() {
        super();
        this.onStart = () => { };
        this.onAPIKeyHelp = () => { };
        this.isInitializing = false;
        this.onLayoutModeChange = () => { };
        this.showApiKeyError = false;
        this.showGroqApiKeyError = false;
        this.boundKeydownHandler = this.handleKeydown.bind(this);
        this.apiKey = '';
        this.groqApiKey = '';
        this._loadApiKeys();
    }

    async _loadApiKeys() {
        this.apiKey = await cheatingDaddy.storage.getApiKey();
        this.groqApiKey = await cheatingDaddy.storage.getGroqApiKey();
        this.requestUpdate();
    }

    connectedCallback() {
        super.connectedCallback();
        window.electron?.ipcRenderer?.on('session-initializing', (event, isInitializing) => {
            this.isInitializing = isInitializing;
        });
        document.addEventListener('keydown', this.boundKeydownHandler);
        resizeLayout();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.electron?.ipcRenderer?.removeAllListeners('session-initializing');
        document.removeEventListener('keydown', this.boundKeydownHandler);
    }

    handleKeydown(e) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const isStartShortcut = isMac ? e.metaKey && e.key === 'Enter' : e.ctrlKey && e.key === 'Enter';
        if (isStartShortcut) {
            e.preventDefault();
            this.handleGeminiStartClick();
        }
    }

    async handleGeminiInput(e) {
        this.apiKey = e.target.value;
        await cheatingDaddy.storage.setApiKey(e.target.value);
        if (this.showApiKeyError) this.showApiKeyError = false;
    }

    async handleGroqInput(e) {
        this.groqApiKey = e.target.value;
        await cheatingDaddy.storage.setGroqApiKey(e.target.value);
        if (this.showGroqApiKeyError) this.showGroqApiKeyError = false;
    }

    async handleGeminiStartClick() {
        if (this.isInitializing) return;
        await cheatingDaddy.storage.updatePreference('aiProvider', 'gemini');
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('ai-provider-changed-notify', 'gemini');
        }
        this.onStart();
    }

    async handleGroqStartClick() {
        if (this.isInitializing) return;
        if (!this.groqApiKey || this.groqApiKey.trim() === '') {
            this.triggerGroqApiKeyError();
            return;
        }
        await cheatingDaddy.storage.updatePreference('aiProvider', 'groq');
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('ai-provider-changed-notify', 'groq');
        }
        this.onStart();
    }

    handleAPIKeyHelpClick() {
        this.onAPIKeyHelp();
    }

    triggerApiKeyError() {
        this.showApiKeyError = true;
        setTimeout(() => { this.showApiKeyError = false; }, 1000);
    }

    triggerGroqApiKeyError() {
        this.showGroqApiKeyError = true;
        setTimeout(() => { this.showGroqApiKeyError = false; }, 1000);
    }

    render() {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const shortcut = isMac ? '⌘↵' : 'Ctrl+↵';

        return html`
            <div class="welcome">Welcome to Jarvis</div>

            <div class="provider-section">
                <div class="provider-header">
                    <div class="provider-icon gemini">G</div>
                    <span class="provider-name">Google Gemini</span>
                    <span class="provider-desc">Recommended</span>
                </div>
                <div class="input-row">
                    <input
                        type="password"
                        placeholder="Paste your Gemini API Key"
                        .value=${this.apiKey}
                        @input=${this.handleGeminiInput}
                        class="${this.showApiKeyError ? 'api-key-error' : ''}"
                    />
                    <button @click=${this.handleGeminiStartClick} class="start-button gemini ${this.isInitializing ? 'initializing' : ''}">
                        Start <span class="shortcut-hint">${shortcut}</span>
                    </button>
                </div>
            </div>

            <div class="divider">or</div>

            <div class="provider-section">
                <div class="provider-header">
                    <div class="provider-icon groq">Q</div>
                    <span class="provider-name">Groq</span>
                    <span class="provider-desc">Fast inference</span>
                </div>
                <div class="input-row">
                    <input
                        type="password"
                        placeholder="Paste your Groq API Key"
                        .value=${this.groqApiKey}
                        @input=${this.handleGroqInput}
                        class="${this.showGroqApiKeyError ? 'api-key-error' : ''}"
                    />
                    <button @click=${this.handleGroqStartClick} class="start-button groq ${this.isInitializing ? 'initializing' : ''}">
                        Start
                    </button>
                </div>
            </div>
        `;
    }
}

customElements.define('main-view', MainView);


