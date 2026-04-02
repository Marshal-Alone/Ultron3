import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

/**
 * Invigilator Preview Component
 * 
 * Displays code answers in IDE-like styling with:
 * - Syntax highlighted code from highlight.js
 * - Monospace font for code view
 * - Dark theme background
 * - Typing mode indicator
 * - Smooth fade in/out transitions
 */
export class InvigilatorPreviewView extends LitElement {
  static styles = css`
    :host {
      --bg-primary: #0d0d0d;
      --bg-secondary: #1e1e1e;
      --text-primary: #e0e0e0;
      --text-secondary: #a0a0a0;
      --accent: #00ff88;
      --border: #333333;
      font-family: 'Courier New', monospace;
    }

    :host([hidden]) {
      display: none;
    }

    .preview-container {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 90%;
      max-width: 800px;
      max-height: 70vh;
      background: var(--bg-primary);
      border: 2px solid var(--border);
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
      z-index: 10000;
      opacity: 1;
      transition: opacity 0.3s ease-in-out;
      animation: fadeIn 0.3s ease-in-out;
    }

    .preview-container[hidden] {
      display: none;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translate(-50%, -48%);
      }
      to {
        opacity: 1;
        transform: translate(-50%, -50%);
      }
    }

    .preview-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-secondary);
      border-radius: 10px 10px 0 0;
    }

    .mode-indicator {
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
      background: rgba(0, 255, 136, 0.1);
      padding: 4px 12px;
      border-radius: 16px;
      border: 1px solid rgba(0, 255, 136, 0.3);
      letter-spacing: 0.5px;
    }

    .close-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      padding: 4px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    }

    .close-btn:hover {
      background: var(--bg-primary);
      color: var(--text-primary);
      border-color: var(--text-primary);
    }

    .preview-content {
      flex: 1;
      overflow: auto;
      padding: 20px;
      background: var(--bg-primary);
    }

    pre {
      margin: 0;
      overflow-x: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    code {
      color: var(--text-primary);
      font-size: 13px;
      line-height: 1.6;
      letter-spacing: 0.3px;
    }

    /* Syntax highlighting colors from highlight.js vscode-dark */
    .hljs {
      color: var(--text-primary);
      background: var(--bg-primary);
    }

    .hljs-attr,
    .hljs-attribute {
      color: #9cdcfe;
    }

    .hljs-built_in,
    .hljs-class {
      color: #4ec9b0;
    }

    .hljs-literal {
      color: #569cd6;
    }

    .hljs-number {
      color: #b5cea8;
    }

    .hljs-string {
      color: #ce9178;
    }

    .hljs-type {
      color: #4ec9b0;
    }

    .hljs-keyword {
      color: #569cd6;
    }

    .hljs-function {
      color: #dcdcaa;
    }

    .hljs-comment {
      color: #6a9955;
    }

    .hljs-attr-value {
      color: #ce9178;
    }

    .preview-footer {
      padding: 16px 20px;
      border-top: 1px solid var(--border);
      background: var(--bg-secondary);
      color: var(--text-secondary);
      font-size: 12px;
      text-align: center;
      border-radius: 0 0 10px 10px;
      letter-spacing: 0.3px;
    }

    /* Scrollbar styling */
    .preview-content::-webkit-scrollbar {
      width: 8px;
    }

    .preview-content::-webkit-scrollbar-track {
      background: var(--bg-primary);
    }

    .preview-content::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 4px;
    }

    .preview-content::-webkit-scrollbar-thumb:hover {
      background: var(--text-secondary);
    }
  `;

  static properties = {
    codeText: { type: String },
    language: { type: String },
    isVisible: { type: Boolean },
    typingMode: { type: String },
  };

  constructor() {
    super();
    this.codeText = '';
    this.language = 'javascript';
    this.isVisible = false;
    this.typingMode = 'charByChar';
  }

  /**
   * Show code in the preview
   * @param {string} code - Code to display
   * @param {string} language - Programming language for syntax highlighting
   */
  show(code, language = 'javascript') {
    this.codeText = code;
    this.language = language;
    this.isVisible = true;
    
    // Apply syntax highlighting after rendering
    setTimeout(() => {
      this.applyHighlighting();
    }, 0);
  }

  /**
   * Hide the preview
   */
  close() {
    this.isVisible = false;
  }

  /**
   * Update typing mode indicator
   * @param {string} mode - 'charByChar' or 'instant'
   */
  updateTypingMode(mode) {
    this.typingMode = mode;
  }

  /**
   * Apply syntax highlighting via highlight.js
   */
  applyHighlighting() {
    try {
      // Check if highlight.js is available
      if (typeof window.hljs !== 'undefined') {
        const codeElement = this.shadowRoot?.querySelector('code');
        if (codeElement) {
          window.hljs.highlightElement(codeElement);
        }
      }
    } catch (err) {
      console.warn('[InvigilatorPreview] Syntax highlighting failed:', err.message);
    }
  }

  /**
   * Get typing mode display label
   */
  getTypingModeLabel() {
    return this.typingMode === 'instant' 
      ? '⚡ Instant' 
      : '⌨️ Char-by-Char';
  }

  render() {
    return html`
      <div class="preview-container" ?hidden=${!this.isVisible}>
        <div class="preview-header">
          <div class="mode-indicator">${this.getTypingModeLabel()}</div>
          <button class="close-btn" @click=${this.close}>Close</button>
        </div>
        
        <div class="preview-content">
          <pre><code class="language-${this.language}">${this.codeText}</code></pre>
        </div>
        
        <div class="preview-footer">
          Press <strong>Ctrl+Alt+Space</strong> to auto-type this code
        </div>
      </div>
    `;
  }
}

// Register the custom element
if (!customElements.get('invigilator-preview')) {
  customElements.define('invigilator-preview', InvigilatorPreviewView);
}
