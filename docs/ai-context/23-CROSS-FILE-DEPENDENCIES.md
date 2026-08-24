# Cross-File Dependency Map

This document maps the exact module dependencies across the Ultron3 repository. This is critical for understanding what files might break if a core component is modified.

## High-Level Dependency Graph

```mermaid
flowchart TD
    index[src/index.js (Main Process)]
    preload[src/preload.js]
    app[src/components/app/CheatingDaddyApp.js (Renderer)]
    
    storage[src/storage.js]
    ai[src/utils/ai.js]
    gemini[src/utils/gemini.js]
    groq[src/utils/groq.js]
    window[src/utils/window.js]
    invigilator[src/utils/invigilatorMode.js]
    autotype[src/utils/autotype.js]
    
    index --> storage
    index --> window
    index --> autotype
    index --> invigilator
    index --> gemini
    
    app --> preload
    app --> invigilator
    app --> autotype
    
    window --> storage
    
    ai --> gemini
    ai --> groq
    
    gemini --> storage
    gemini --> prompts[src/utils/prompts.js]
    gemini --> promptLogger[src/utils/promptLogger.js]
    
    groq --> storage
    groq --> prompts
    groq --> promptLogger
    
    autotype --> AutoTyperExe[src/utils/AutoTyper.exe]
```

## Detailed File Dependencies

### `src/index.js`
**Depends on:**
- `electron` (app, ipcMain, BrowserWindow, Tray, etc.)
- `path`, `os`, `fs` (Node.js standard library)
- `src/storage.js`
- `src/utils/window.js` (for `createWindow`)
- `src/utils/gemini.js` (for `geminiAI.init()`)
- `src/utils/autotype.js` (for `createAutotyper`)
- `src/utils/invigilatorMode.js`

**Depended on by:**
- None (Entry point)

### `src/storage.js`
**Depends on:**
- `fs`, `path`, `os`
- `electron` (app, ipcMain)

**Depended on by:**
- `src/index.js`
- `src/utils/window.js`
- `src/utils/gemini.js`
- `src/utils/groq.js`
- `src/components/app/CheatingDaddyApp.js` (via IPC or global `cheatingDaddy` object)
- `src/utils/promptLogger.js`

### `src/utils/window.js`
**Depends on:**
- `electron` (screen, globalShortcut, BrowserWindow, clipboard, ipcMain)
- `path`, `fs`, `os`
- `src/storage.js`

**Depended on by:**
- `src/index.js`

### `src/utils/ai.js`
**Depends on:**
- `src/utils/gemini.js`
- `src/utils/groq.js`

**Depended on by:**
- Renderer UI (called via `cheatingDaddy.sendTextMessage` / global bridge)

### `src/utils/gemini.js`
**Depends on:**
- `@google/genai`
- `electron` (BrowserWindow)
- `fs`, `path`, `child_process` (for `SystemAudioDump` on macOS)
- `src/storage.js`
- `src/utils/promptLogger.js`
- `src/utils/prompts.js`

**Depended on by:**
- `src/index.js`
- `src/utils/ai.js`
- `src/utils/groq.js` (for saving conversation history)

### `src/utils/groq.js`
**Depends on:**
- `openai` (Groq uses OpenAI-compatible SDK)
- `electron` (BrowserWindow)
- `src/storage.js`
- `src/utils/promptLogger.js`
- `src/utils/prompts.js`
- `src/utils/gemini.js` (specifically calls `gemini.saveConversationTurn` and `gemini.saveScreenAnalysis`)

**Depended on by:**
- `src/utils/ai.js`

### `src/utils/autotype.js`
**Depends on:**
- `child_process` (exec, spawn)
- `path`, `fs`
- `src/utils/invigilatorMode.js`
- `src/utils/AutoTyper.exe` (executes this binary)

**Depended on by:**
- `src/index.js`
- `src/components/app/CheatingDaddyApp.js`

### `src/components/app/CheatingDaddyApp.js`
**Depends on:**
- `src/assets/lit-core-2.7.4.min.js`
- `src/components/app/AppHeader.js`
- `src/components/views/*`
- `src/utils/invigilatorMode.js`
- `src/utils/autotype.js`

**Depended on by:**
- `src/index.html`

## High-Risk Modification Points

If an AI or developer modifies these files, they must be extremely careful:

1. **`src/storage.js`**
   - **Risk**: High. It is imported by almost every backend utility. Changing the data structure without migrations will crash AI integrations and window creation.
2. **`src/utils/window.js`**
   - **Risk**: High. Contains `globalShortcut` registry. Modifying shortcut logic can break the stealth overlay or Invigilator Mode hotkeys.
3. **`src/utils/gemini.js`**
   - **Risk**: Very High. The WebSocket connection (`client.live.connect`) is extremely sensitive to payload formats. The macOS `SystemAudioDump` spawn logic is fragile.
4. **`src/utils/autotype.js`**
   - **Risk**: High. Depends on `AutoTyper.exe`. If the C# binary interface changes, or if the string sanitization logic is altered, it could trigger anti-cheat software or cause a runtime crash.
