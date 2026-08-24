# Renderer UI Architecture

This document describes the architectural pattern and component breakdown of the Ultron3 frontend (Renderer).

## Core Technologies
- **Framework**: `LitElement` (Web Components)
- **Routing**: Internal state-based routing via `currentView` property.
- **Styling**: Vanilla CSS inside Lit templates (`css` tag) with CSS variables mapping to dynamic preferences.
- **IPC Access**: Direct access via `window.require('electron').ipcRenderer` (due to `contextIsolation: false`).

## App Container: `CheatingDaddyApp.js`

`CheatingDaddyApp` is the root component that acts as the primary state manager and IPC router for the UI.

### Key State Properties
- `currentView`: Determines which sub-view to render (`main`, `assistant`, `customize`, `help`, `history`, `onboarding`).
- `statusText`: Dynamic status string (e.g., "Thinking...", "Listening...").
- `responses`: Array of strings containing the AI response history.
- `invigilatorModeActive`, `invigilatorTypingMode`: Stealth mode state flags.

### IPC Listeners
The app registers multiple `ipcRenderer` listeners in `connectedCallback` and forwards them to internal state:
- `new-response` / `update-response`: Updates the AI text response stream on the screen.
- `update-status`: Modifies `statusText`.
- `background-opacity-changed` / `toggle-navbar`: Dynamically adjusts the window transparency and hides the navigation bar.
- `invigilator:toggle-mode`, `invigilator:capture-answer`, `invigilator:confirm-autotype`: Triggers the stealth exam helper logic.

### Dynamic Theming
Uses a custom `applyBackgroundAppearance(hex, alpha)` method to generate a full CSS variable color palette (`--bg-primary`, `--bg-secondary`, `--bg-hover`, etc.) by shifting RGB values, applying it globally to `document.documentElement`.

## Architecture

The UI is built purely with **LitElement** (Web Components) without a bundler, loaded natively in Electron.
There is **no React** and **no React Router**. Routing is handled by simply swapping `<view>` elements based on the `currentView` property.

### 1. `CheatingDaddyApp.js` (The Root Component)
This is the root of the application, managing all global state and rendering sub-views.

**Core State Properties:**
```javascript
static properties = {
    currentView: { type: String }, // 'main', 'assistant', 'settings', 'onboarding'
    isListening: { type: Boolean },
    apiKey: { type: String },
    transcription: { type: String },
    responses: { type: Array },
    selectedProfile: { type: String },
    selectedLanguage: { type: String },
    isClickThrough: { type: Boolean },
    backgroundTransparency: { type: Number },
    // Invigilator State
    invigilatorModeActive: { type: Boolean },
    invigilatorTypingMode: { type: String }
};
```

### 2. Styling System and Theming
Styles are encapsulated via the Lit `css` literal. However, dynamic theming (opacity and layout modes) relies on CSS custom properties (variables) injected at the root or body level.

```css
:host {
    /* Main Layout */
    display: block;
    width: 100%;
    height: 100vh;
    background-color: var(--background-transparent);
    color: var(--text-color);
}

/* Dynamic properties controlled by JS: */
/* var(--bg-primary) */
/* var(--text-color) */
/* var(--accent-primary) */
/* var(--text-opacity) */
```
### 3. `CustomizeView.js`
- **Purpose**: Configuration and settings panel.
- **Behavior**: Allows the user to select AI profiles (Interview, Sales, Custom), language, screenshot capture interval, image quality, layout mode, and theme transparency.

### 4. `HistoryView.js`
- **Purpose**: Session review.
- **Behavior**: Lists previous sessions stored in `storage.js`.

### 5. `OnboardingView.js`
- **Purpose**: First-time setup wizard.
- **Behavior**: Automatically shown if `storage.js` indicates `onboarded: false`.

### 6. `HelpView.js`
- **Purpose**: Documentation and shortcuts reference.

### 7. `InvigilatorPreviewView.js`
- **Purpose**: Stealth mode confirmation.
- **Behavior**: Triggered when `window._invigilatorAnswerCapture = true`. Displays the code block captured from the AI response before it is sent to `AutoTyper.exe` for physical keyboard injection.

## Renderer Global Bridge

While `CheatingDaddyApp.js` uses `ipcRenderer` directly, the application also relies on a global object `window.cheatingDaddy` (likely injected by `src/utils/renderer.js` or `index.html`) which provides high-level helper functions:
- `cheatingDaddy.storage.*`: Direct mapping to IPC storage functions.
- `cheatingDaddy.initializeGemini()`
- `cheatingDaddy.startCapture()` / `cheatingDaddy.stopCapture()`
- `cheatingDaddy.sendTextMessage()`

## High-Risk Modification Areas
- **Context Isolation Assumption**: Any modern Electron developer will assume `window.require` is undefined. Refactoring this app to use `contextBridge` in `preload.js` will break the *entire* frontend, as every component imports `ipcRenderer` directly.
- **Streaming Response Appending**: The logic in `updateCurrentResponse(response)` that slices the last array item and appends the new text chunk is sensitive. Breaking this will cause the AI chat to either duplicate words or drop streaming chunks.
