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

## Sub-Views (`src/components/views/`)

The application avoids a traditional router (like React Router) in favor of simple conditional rendering in `CheatingDaddyApp`'s `render()` method.

### 1. `MainView.js`
- **Purpose**: The dashboard entry point.
- **Behavior**: Displays the selected AI profile and provides the primary "Start Session" button. Has error states (`triggerApiKeyError`, `triggerGroqApiKeyError`) if keys are missing.

### 2. `AssistantView.js`
- **Purpose**: The active session interface (The "Chat").
- **Behavior**: Displays the real-time transcription and AI streaming response. Uses a custom carousel or pagination mechanism (driven by `currentResponseIndex` and `shouldAnimateResponse` props passed from parent) to display the AI's output.

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
