# Storage and Configuration Architecture

This document describes how Ultron3 persists user data, API keys, AI history, and UI state across sessions.

## File System Strategy

Ultron3 deliberately avoids traditional database solutions (like SQLite or IndexedDB) in favor of raw JSON files on the local filesystem. This ensures the data is easily portable, readable, and perfectly isolated from the browser context (bypassing any Chromium sandbox restrictions).

The primary storage location depends on the operating system (`getConfigDir`):
- **Windows**: `%APPDATA%\jarvis-config`
- **macOS**: `~/Library/Application Support/jarvis-config`
- **Linux**: `~/.config/jarvis-config`

## Core Storage Models (`src/utils/storage.js`)

All storage is implemented as synchronous `fs.readFileSync` / `fs.writeFileSync` operations in the Main process, exposed to the Renderer via IPC `invoke` handlers.

### 1. `config.json`
- **Purpose**: High-level application state.
```json
{
    "configVersion": 1,
    "onboarded": false,
    "layout": "normal"
}
```

### 2. `credentials.json`
- **Purpose**: Secure(?) storage for API keys. (Stored in plaintext).
```json
{
    "apiKey": "",
    "groqApiKey": "",
    "openRouterApiKey": ""
}
```

### 3. `preferences.json`
- **Purpose**: User customization and theming. The Renderer aggressively caches this via `preferencesCache`.
```json
{
    "customPrompt": "",
    "systemInstruction": "", 
    "developerInstruction": "", 
    "fullSystemPrompt": "", 
    "selectedProfile": "interview",
    "selectedLanguage": "en-US",
    "selectedScreenshotInterval": "5",
    "selectedImageQuality": "medium",
    "advancedMode": false,
    "audioMode": "both",
    "fontSize": 16,
    "backgroundTransparency": 0.8,
    "googleSearchEnabled": false,
    "aiProvider": "gemini", 
    "invigilatorTypingMode": "charByChar", 
    "invigilatorModeEnabled": false, 
    "holdToTypeEnabled": false,
    "holdToTypeKey": "0x11,0x10,VK:]"
}
```

### 4. `history/` (Session Logs)
Each session is stored as a distinct JSON file named by its timestamp (`history/<sessionId>.json`).
- **Data Structure**:
  - `createdAt`, `lastUpdated`
  - `profile`, `customPrompt`
  - `conversationHistory`: Array of Q&A objects (`{ transcription, ai_response }`).
  - `screenshotReferences`: Array of image metadata (links to the actual saved screenshots).

### 5. `limits.json`
- **Purpose**: Tracks API usage to prevent Google rate-limit bans.
- **Behavior**: Tracks requests per day for `gemini-2.5-flash` and `gemini-2.5-flash-lite`. If the limits exceed 20, it triggers fallback logic in the AI router.

## Export & Debugging
The `storage.js` file includes robust export utilities:
- `exportSessionToDownloads(sessionId)`: Packages a specific session's JSON data, converts the Q&A into a readable Markdown file (`conversation_YYYY-MM-DD.md`), gathers all referenced screenshots, and drops them into `~/Downloads/Ultron-Conversations`.
- **Screenshot Logging**: Every manual capture is saved as a raw PNG to the Downloads folder with an associated JSON metadata file for debugging AI vision accuracy.
