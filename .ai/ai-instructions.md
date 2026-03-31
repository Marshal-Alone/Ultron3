# Cheating Daddy - AI Coding Instructions

## Overview

Electron-based real-time AI assistant that captures screen and system audio for contextual responses during video calls, interviews, and presentations. Uses **Google Gemini 2.0 Flash Live** for AI responses.

## Architecture

```
src/
├── index.js           # Main process entry - app lifecycle, IPC handlers
├── index.html         # Renderer entry point, loads LitElement components
├── preload.js         # Currently minimal (contextIsolation disabled)
├── storage.js         # Persistent config/credentials/history (JSON files)
├── audioUtils.js      # PCM/WAV conversion, audio debugging utilities
├── components/        # LitElement web components
│   ├── app/           # CheatingDaddyApp (root), AppHeader
│   └── views/         # MainView, AssistantView, CustomizeView, etc.
└── utils/
    ├── gemini.js      # Gemini WebSocket session, audio/image streaming
    ├── prompts.js     # Profile-specific system prompts
    ├── window.js      # Window creation, global shortcuts, resize animation
    └── renderer.js    # Renderer-side utilities
```

### Key Architectural Patterns

1. **IPC Communication**: Main ↔ Renderer via `ipcMain.handle()` and `ipcRenderer.invoke()`. Handlers defined in:
   - `src/index.js` → `setupStorageIpcHandlers()`, `setupGeneralIpcHandlers()`
   - `src/utils/gemini.js` → `setupGeminiIpcHandlers()`
   - `src/utils/window.js` → `setupWindowIpcHandlers()`

2. **LitElement Components**: UI built with Lit 2.7.4 (bundled in `src/assets/`). Components use `css` template literals for scoped styles - not external CSS files.

3. **Storage**: All user data stored in OS-specific config directories via `storage.js`:
   - Config version-controlled with auto-reset on version mismatch
   - Separate files: `config.json`, `credentials.json`, `preferences.json`, `keybinds.json`

## Developer Workflow

### Commands
```bash
npm install          # Install dependencies
npm start            # Run development app (Electron Forge)
npm test             # Run Vitest unit tests
npm run package      # Package app for current platform
npm run make         # Create distributable (installer/DMG)
```

### Code Style
- Run `npx prettier --write .` before committing (4-space indent, 150 print width, single quotes)
- No ESLint configured - `npm run lint` is a no-op

### Testing
- Test framework: **Vitest** (config in `vitest.config.js`)
- Tests in `src/__tests__/*.test.js`
- Electron mocked via `src/__mocks__/electron.js`
- Run: `npm test`

## AI Integration (`src/utils/gemini.js`)

- **WebSocket Session**: Real-time streaming via `@google/genai` SDK
- **Audio Capture**: 
  - macOS: `SystemAudioDump` binary (bundled in assets)
  - Windows: Loopback audio via `getDisplayMedia`
- **Screen Analysis**: HTTP API for screenshot analysis (`sendImageToGeminiHttp`)
- **Rate Limiting**: Per-model daily limits tracked in `storage.js`

### Profile Prompts (`src/utils/prompts.js`)
Six profiles: `interview`, `sales`, `meeting`, `presentation`, `negotiation`, `exam`. Each has structured prompt with `intro`, `formatRequirements`, `searchUsage`, `content`, `outputInstructions`.

---

## Multi-Provider AI Support (Gemini/Groq)

To add Groq as an alternative AI provider alongside Gemini, implement a centralized router pattern:

### 1. Create Groq Service (`src/utils/groq.js`)

```javascript
const OpenAI = require('openai');

class GroqAIService {
    getClient() {
        const apiKey = storage.getGroqApiKey();
        if (!apiKey) throw new Error('Groq API key not configured');
        
        return new OpenAI({
            baseURL: 'https://api.groq.com/openai/v1',
            apiKey: apiKey,
        });
    }

    async sendMessage(prompt, imageBase64 = null) {
        const client = this.getClient();
        const messages = [{
            role: 'user',
            content: imageBase64 
                ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageBase64 } }]
                : prompt
        }];

        const response = await client.chat.completions.create({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',  // Vision-capable
            messages,
            max_tokens: 1500,
            temperature: 0.2,
        });

        return response.choices[0]?.message?.content;
    }
}

module.exports = { groqAI: new GroqAIService() };
```

### 2. Create AI Router (`src/utils/ai.js`)

```javascript
const { geminiAI } = require('./gemini');
const { groqAI } = require('./groq');
const storage = require('../storage');

// Provider configuration stored in preferences
const getProvider = () => storage.getPreferences().aiProvider || 'gemini';

const setProvider = (provider) => {
    storage.updatePreference('aiProvider', provider);
};

// Unified API that routes to the selected provider
const sendMessage = async (prompt, imageBase64 = null) => {
    const provider = getProvider();
    console.log(`[AI] Using provider: ${provider}`);

    if (provider === 'groq') {
        return groqAI.sendMessage(prompt, imageBase64);
    }
    return geminiAI.sendMessage(prompt, imageBase64);
};

module.exports = { getProvider, setProvider, sendMessage, geminiAI, groqAI };
```

### 3. Add Storage for Groq API Key

In `storage.js`, add to `DEFAULT_CREDENTIALS`:
```javascript
const DEFAULT_CREDENTIALS = {
    apiKey: null,        // Gemini API key
    groqApiKey: null,    // Groq API key
};

// Add helper functions
function getGroqApiKey() {
    return getCredentials().groqApiKey;
}

function setGroqApiKey(apiKey) {
    const creds = getCredentials();
    creds.groqApiKey = apiKey;
    setCredentials(creds);
}
```

### 4. Add UI Toggle in CustomizeView

```javascript
// In CustomizeView.js render method
html`
    <div class="setting-group">
        <label>AI Provider</label>
        <select @change=${(e) => this.handleProviderChange(e.target.value)}>
            <option value="gemini" ?selected=${this.aiProvider === 'gemini'}>Google Gemini</option>
            <option value="groq" ?selected=${this.aiProvider === 'groq'}>Groq (Llama)</option>
        </select>
    </div>
    ${this.aiProvider === 'groq' ? html`
        <input type="password" placeholder="Groq API Key" 
               .value=${this.groqApiKey}
               @change=${(e) => this.handleGroqKeyChange(e.target.value)} />
    ` : ''}
`
```

### Provider Comparison

| Feature | Gemini | Groq |
|---------|--------|------|
| **Streaming** | WebSocket (real-time) | HTTP (request/response) |
| **Audio Input** | Native support | Not supported |
| **Vision** | Yes | Yes (Llama 4 Scout) |
| **Speed** | Fast | Very fast (LPU) |
| **Cost** | Free tier available | Free tier available |

### Dependencies

Add to `package.json`:
```json
{
    "dependencies": {
        "openai": "^4.0.0"  // Used for Groq API (OpenAI-compatible)
    }
}
```

> **Note:** Groq uses OpenAI-compatible API format, so the `openai` SDK works by changing `baseURL`.

---

## Critical Patterns

### Adding New IPC Handlers
```javascript
// In main process (index.js or utils/*.js)
ipcMain.handle('channel-name', async (event, arg) => {
    return { success: true, data: result };
});

// In renderer (components or renderer.js)
const result = await window.require('electron').ipcRenderer.invoke('channel-name', arg);
```

### Creating LitElement Components
```javascript
import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

class MyComponent extends LitElement {
    static styles = css`/* scoped styles */`;
    static properties = { myProp: { type: String } };
    render() { return html`<div>${this.myProp}</div>`; }
}
customElements.define('my-component', MyComponent);
```

### Storage Operations
```javascript
const storage = require('./storage');
storage.initializeStorage();  // Call on app startup
const config = storage.getConfig();
storage.updateConfig('key', value);
storage.setApiKey(apiKey);
```

## Platform-Specific Notes

| Platform | Audio Capture | Signing |
|----------|---------------|---------|
| macOS | `SystemAudioDump` binary | Optional codesigning in `forge.config.js` |
| Windows | Loopback via `getDisplayMedia` | Squirrel installer |
| Linux | Microphone only | AppImage maker |

## Future Migration (from AGENTS.md)

The codebase is planned to migrate toward TypeScript/React with shadcn/ui. When contributing:
- Prefer TypeScript strict mode for new files
- Use `@/` path alias for imports from `src/`
- Maintain secure IPC with parameter validation
- Keep heavy audio processing off UI thread

## Key Files for New Features

| Task | Primary Files |
|------|---------------|
| New UI view | `src/components/views/*.js`, register in `CheatingDaddyApp.js` |
| New profile/prompt | `src/utils/prompts.js` |
| Keyboard shortcuts | `src/utils/window.js` → `getDefaultKeybinds()`, `updateGlobalShortcuts()` |
| User preferences | `src/storage.js`, add to `DEFAULT_PREFERENCES` |
| AI functionality | `src/utils/gemini.js` |
