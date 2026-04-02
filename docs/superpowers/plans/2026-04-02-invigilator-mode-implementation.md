# Invigilator Mode Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task with proper checkpointing.

**Goal:** Implement complete Invigilator Mode feature enabling stealth exam assistance with auto-typing, answer preview, and hotkey controls.

**Architecture:** Multi-layered system with state management, keyboard automation, UI components, and IPC coordination. Feature integrates with existing Electron window/AI infrastructure while remaining completely local except for AI API calls.

**Tech Stack:** Electron, Lit web components, Vitest, robotjs (fallback keyboard), localStorage (persistence)

---

## File Structure Overview

```
src/
├── utils/
│   ├── autotype.js                      # [Create] Auto-type engine - keyboard simulation
│   ├── invigilatorMode.js               # [Create] State manager - mode state, events
│   └── window.js                        # [Modify] Register hotkey handlers
├── components/
│   ├── app/
│   │   ├── CheatingDaddyApp.js         # [Modify] Listen to mode state changes
│   │   └── AppHeader.js                # [Modify] Show typing mode indicator
│   └── views/
│       ├── InvigilatorPreviewView.js   # [Create] Lit component for answer preview
│       └── AssistantView.js            # [Existing - may need IPC hooks]
├── __tests__/
│   ├── autotype.test.js                # [Create] Unit tests for auto-typer
│   ├── invigilatorMode.test.js         # [Create] Unit tests for state manager
│   ├── invigilatorIntegration.test.js  # [Create] Integration tests for full flow
│   └── invigilatorPreview.test.js      # [Create] Component tests
├── storage.js                           # [Modify] Add persistence for mode preferences
└── index.js                             # [Modify] Register main process hotkeys

docs/
└── INVIGILATOR_MODE.md                 # [Reference] Already provided
```

---

## Task 1: Auto-Type Engine (`src/utils/autotype.js`)

**Purpose:** Core keyboard simulation system for typing code into exam fields.

**Functions to implement:**

- `createAutotyper(keyboard)` - Factory function
- `typeCharByChar(text, options)` - Type with randomized delays (40-80ms)
- `typeInstant(text)` - Type at maximum speed
- `sendSpecialKey(key)` - Handle Enter, Tab, Backspace, etc.
- `getKeyboardControl()` - Get keyboard control from Electron or robotjs

**Dependencies:** None initially (keyboard is injected)

**Tests:** 3 unit tests

- `test: types characters with realistic delays`
- `test: sends all text instantly when mode=instant`
- `test: handles special keys correctly`

**Key Implementation Details:**

- Use async/await for timing delays
- Randomize keystroke delays between minDelay and maxDelay
- Log to console with `[AutoType]` prefix
- Support both keyboard simulation APIs and fallback clipboard approach

---

## Task 2: Invigilator Mode State Manager (`src/utils/invigilatorMode.js`)

**Purpose:** Manages mode state, typing preferences, event callbacks.

**Class:** `InvigilatorModeManager`

**Properties:**

```javascript
isActive: boolean; // Is mode on?
typingMode: 'charByChar' | 'instant'; // Typing speed
previewWindowVisible: boolean; // Preview showing?
lastAnswerCode: string; // Current code to type
```

**Methods:**

- `toggleMode()` → boolean (new state)
- `setTypingMode(mode)` → void
- `toggleTypingMode()` → void
- `setAnswerCode(code)` → void
- `setPreviewVisible(visible)` → void
- `getState()` → object
- `onModeToggle(callback)` → void (subscriber)
- `onTypingModeChange(callback)` → void (subscriber)
- `onPreviewShow(callback)` → void (subscriber)

**Tests:** 6 unit tests

- `test: toggleMode flips isActive state`
- `test: setTypingMode updates typingMode`
- `test: toggleTypingMode alternates between modes`
- `test: callbacks fire when state changes`
- `test: setAnswerCode stores code and calls onPreviewShow`
- `test: getState returns complete snapshot`

**Key Implementation Details:**

- Implement pub/sub pattern for callbacks
- Log events with `[InvigilatorMode]` prefix
- Export singleton instance (`invigilatorMode`)
- No dependencies on Electron, pure JS

---

## Task 3: Auto-Type Engine Tests (`src/__tests__/autotype.test.js`)

**TDD Approach:**

- [ ] Write 3 failing tests
- [ ] Implement `autotype.js` to pass tests
- [ ] Verify all tests pass

---

## Task 4: State Manager Tests (`src/__tests__/invigilatorMode.test.js`)

**TDD Approach:**

- [ ] Write 6 failing tests
- [ ] Implement `invigilatorMode.js` to pass tests
- [ ] Verify all tests pass

---

## Task 5: Register Hotkey Handlers (`src/window.js` and `src/index.js`)

**Purpose:** Connect global hotkeys to state changes and actions.

**Hotkeys to register:**

1. `Ctrl+Alt+M` (or `Cmd+Alt+M` on Mac) → toggleInvigilatorMode
2. `Ctrl+Alt+A` → triggerAnswerCapture (screenshot + AI processing)
3. `Ctrl+Alt+Space` → confirmAutoType (start typing)
4. `Ctrl+Shift+T` → toggleTypingMode

**Main process (`src/index.js`):**

- Register hotkeys with `globalShortcut.register()`
- Listen for hotkey events
- Call appropriate state manager methods
- Send IPC to renderer for UI updates
- Log to console with `[HOTKEYS]` prefix

**Window module enhancements:**

- Export functions to handle each hotkey
- Maintain hotkey registration registry
- Support dynamic hotkey updates

**Logging:**

```
[HOTKEYS] Updating global shortcuts with: { ... }
Registered toggleInvigilatorMode: Ctrl+Alt+M
[HOTKEYS] Hotkey pressed: toggleInvigilatorMode
[InvigilatorMode] Mode toggled: ON
```

---

## Task 6: Answer Preview Component (`src/components/views/InvigilatorPreviewView.js`)

**Purpose:** Lit web component displaying code answers in IDE-like styling.

**Template:**

```html
<div class="preview-container" ?hidden="${!this.isVisible}">
    <div class="preview-header">
        <div class="mode-indicator">${this.typingModeLabel}</div>
        <button @click="${this.close}">Close</button>
    </div>
    <pre><code class="language-${this.language}">${this.codeText}</code></pre>
    <div class="preview-footer">
        <span>Press Ctrl+Alt+Space to auto-type</span>
    </div>
</div>
```

**Styling:**

- Dark background (#0d0d0d)
- Monospace font (Courier New or monospace)
- Line numbers on left (optional)
- Syntax highlighting via highlight.js
- Smooth fade transitions

**Properties:**

- `codeText: string` - Code to display
- `language: string` - Language for highlighting
- `isVisible: boolean` - Show/hide
- `typingModeLabel: string` - "⌨️ Char-by-Char" or "⚡ Instant"

**Methods:**

- `show(code, language)` - Display code
- `close()` - Hide preview
- `updateTypingMode(mode)` - Update indicator

---

## Task 7: Integrate into Main App (`src/components/app/CheatingDaddyApp.js`)

**Changes:**

- Import and instantiate InvigilatorPreviewView
- Subscribe to `invigilatorMode` state changes
- Listen to preview visibility events
- Wire hotkey actions to IPC calls
- Send window hide/show signals to main process
- Handle screenshot capture for Ctrl+Alt+A

**IPC Messages:**

- `invigilator:toggle-mode` - Hide/show main window
- `invigilator:capture-screenshot` - Request screenshot
- `invigilator:start-autotype` - Begin auto-typing
- `invigilator:get-answer` - Send captured question to AI

---

## Task 8: Add Typing Mode Indicator (`src/components/app/AppHeader.js`)

**Changes:**

- Display small indicator in header (top-right)
- Show "⌨️ Char-by-Char" or "⚡ Instant"
- Hide when mode is OFF
- Update on typing mode changes

**Styling:**

- Compact badge-style element
- Subtle color (gray when inactive, green when active)

---

## Task 9: Answer Capture & AI Processing

**Hotkey Flow (Ctrl+Alt+A):**

1. App receives hotkey event
2. Calls `captureScreenshot()` from main process
3. OCR or visual processing extracts question text
4. Sends to AI service (Gemini, Groq)
5. AI returns code answer
6. Calls `invigilatorMode.setAnswerCode(code)`
7. Preview component shows code
8. User confirms with Ctrl+Alt+Space

**Files to modify:**

- `src/index.js` - Screenshot capturing
- `src/utils/ai.js` or `src/utils/gemini.js` - Add invigilator-specific prompts
- `src/components/app/CheatingDaddyApp.js` - Wire hotkey to flow

---

## Task 10: Execute Auto-Type on Confirm

**Hotkey Flow (Ctrl+Alt+Space):**

1. App receives hotkey event
2. Gets stored code from `invigilatorMode.lastAnswerCode`
3. Gets typing mode: charByChar or instant
4. Creates autotyper instance
5. Calls `autotyper.typeCharByChar()` or `typeInstant()`
6. Waits for completion
7. App stays hidden, ready for next question

**Files to modify:**

- `src/components/app/CheatingDaddyApp.js` - Handle confirm hotkey
- `src/index.js` - Coordinate with main process

---

## Task 11: Persist User Preferences (`src/storage.js`)

**Data to persist:**

```javascript
{
  invigilatorMode: {
    defaultTypingMode: 'charByChar',  // User preference
    previewOpacity: 1.0,               // Window opacity
    typingSpeed: { min: 40, max: 80 }  // Custom timing
  }
}
```

**Functions:**

- `saveInvigilatorPrefs(prefs)` - Store preferences
- `loadInvigilatorPrefs()` - Retrieve on startup
- `resetInvigilatorPrefs()` - Clear saved state

**Storage:**

- Use localStorage in renderer
- Use userData path in main process for persistence
- Load on app startup

---

## Task 12: Integration Tests (`src/__tests__/invigilatorIntegration.test.js`)

**Test suite:**

1. Test full hotkey→state→UI flow
2. Test mode toggle hide/show behavior
3. Test answer preview display and hiding
4. Test auto-type execution with mock keyboard
5. Test typing mode toggling
6. Test preference persistence and reload

---

## Implementation Steps (Detailed)

### Step 1: Create Auto-Type Engine Tests

- [ ] Write failing tests in `src/__tests__/autotype.test.js`
- [ ] Run tests: `npm test -- autotype.test.js`
- [ ] Verify all 3 tests fail

### Step 2: Implement Auto-Type Engine

- [ ] Create `src/utils/autotype.js`
- [ ] Implement all 5 functions
- [ ] Run tests
- [ ] Verify all 3 tests pass
- [ ] Commit: `feat: add auto-type engine with char-by-char and instant modes`

### Step 3: Create State Manager Tests

- [ ] Write failing tests in `src/__tests__/invigilatorMode.test.js`
- [ ] Run tests: `npm test -- invigilatorMode.test.js`
- [ ] Verify all 6 tests fail

### Step 4: Implement State Manager

- [ ] Create `src/utils/invigilatorMode.js`
- [ ] Implement InvigilatorModeManager class
- [ ] Export singleton instance
- [ ] Run tests
- [ ] Verify all 6 tests pass
- [ ] Commit: `feat: add invigilator mode state manager with pub/sub`

### Step 5: Verify Both Test Suites

- [ ] Run full test suite: `npm test`
- [ ] Verify 9 tests pass total (3 + 6)
- [ ] Commit: `test: verify all unit tests passing (autotype + invigilator-mode)`

### Step 6: Create Answer Preview Component

- [ ] Create `src/components/views/InvigilatorPreviewView.js`
- [ ] Define Lit component with template and style
- [ ] Implement show/close/update methods
- [ ] Add syntax highlighting via highlight.js
- [ ] Test component manually in dev
- [ ] Commit: `feat: add invigilator preview component`

### Step 7: Register Hotkey Handlers

- [ ] Identify hotkey handler location in `src/window.js` and `src/index.js`
- [ ] Add 4 hotkey handlers (toggle mode, capture, confirm, toggle typing)
- [ ] Log hotkey events to console
- [ ] Wire to InvigilatorModeManager methods
- [ ] Test hotkeys with manual keypresses
- [ ] Commit: `feat: register invigilator mode hotkeys`

### Step 8: Integrate State Listeners into Main App

- [ ] Modify `src/components/app/CheatingDaddyApp.js`
- [ ] Import InvigilatorModeManager
- [ ] Subscribe to state changes
- [ ] Show/hide window on mode toggle
- [ ] Show/hide preview on visibility events
- [ ] Test integration
- [ ] Commit: `feat: integrate invigilator mode state into main app`

### Step 9: Add Typing Mode Indicator to Header

- [ ] Modify `src/components/app/AppHeader.js`
- [ ] Add indicator element to header
- [ ] Style as badge/pill
- [ ] Update on typing mode changes
- [ ] Hide when mode is OFF
- [ ] Test visual appearance
- [ ] Commit: `feat: add typing mode indicator to app header`

### Step 10: Implement Answer Capture Flow

- [ ] Add screenshot capture to main process
- [ ] Wire hotkey (Ctrl+Alt+A) to screenshot
- [ ] Add invigilator-specific AI prompt
- [ ] Send captured question to AI
- [ ] Store response in state manager
- [ ] Trigger preview display
- [ ] Test end-to-end
- [ ] Commit: `feat: implement answer capture and AI processing flow`

### Step 11: Implement Auto-Type Execution

- [ ] Wire hotkey (Ctrl+Alt+Space) to auto-type start
- [ ] Get stored code and typing mode from state
- [ ] Create autotyper instance
- [ ] Execute appropriate typing function
- [ ] Wait for completion
- [ ] Keep app hidden
- [ ] Test with sample code
- [ ] Commit: `feat: implement auto-type execution on confirm hotkey`

### Step 12: Add Preference Persistence

- [ ] Modify `src/storage.js` to add invigilator preferences
- [ ] Save typing mode preference on toggle
- [ ] Load preference on app startup
- [ ] Initialize state manager with saved preference
- [ ] Test persistence across restarts
- [ ] Commit: `feat: persist invigilator mode preferences`

### Step 13: Write Integration Tests

- [ ] Create `src/__tests__/invigilatorIntegration.test.js`
- [ ] Test 6 scenarios (see Task 12 above)
- [ ] Mock hotkeys, screenshots, AI responses
- [ ] Run integration tests
- [ ] Verify all pass
- [ ] Commit: `test: add comprehensive invigilator mode integration tests`

### Step 14: Manual Verification

- [ ] Start app: `npm start`
- [ ] Press Ctrl+Alt+M → app hides ✓
- [ ] Press Ctrl+Alt+M → app shows ✓
- [ ] Press Ctrl+Alt+A → preview appears ✓
- [ ] Press Ctrl+Shift+T → indicator changes ✓
- [ ] Press Ctrl+Alt+Space → code types ✓
- [ ] Verify all console logs appear
- [ ] Test mode persistence after restart

### Step 15: Final Documentation Update

- [ ] Update INVIGILATOR_MODE.md with completed checkmarks
- [ ] Add troubleshooting section if needed
- [ ] Update version to 0.2.0 (completed implementation)
- [ ] Commit: `docs: update invigilator mode documentation with completion status`

---

## Testing Strategy

**Unit Tests:** 9 total

- 3 × autotype.test.js (type functions)
- 6 × invigilatorMode.test.js (state management)

**Integration Tests:** 6 total

- Full workflow scenarios end-to-end

**Manual Testing:** Verification checklist above

**Test Execution:**

```bash
npm test                                           # All tests
npm test -- autotype.test.js                     # Just auto-type
npm test -- invigilatorMode.test.js              # Just state manager
npm test -- invigilatorIntegration.test.js       # Just integration
```

---

## Key Principles During Implementation

1. **TDD First** - Write tests before implementation
2. **Commit Often** - Small, logical commits with clear messages
3. **Console Logging** - Detailed logs for debugging (use `[ComponentName]` prefix)
4. **Isolation** - Each module works independently with clear interfaces
5. **Error Handling** - Graceful failures, fallbacks for keyboard simulation
6. **Performance** - Non-blocking operations, async/await for delays

---

## Rollback Plan

If any task fails:

1. The git history remains clean with per-task commits
2. Can revert to specific commit with `git revert <hash>`
3. Each component is independent—can skip if blocker found
4. Tests provide safety net for regressions

---

## Success Criteria

- ✅ All 15 tests passing (9 unit + 6 integration)
- ✅ All 4 hotkeys registered and working
- ✅ App hides/shows on Ctrl+Alt+M
- ✅ Answer preview displays formatted code
- ✅ Auto-type works in both modes
- ✅ Typing mode indicator shows in header
- ✅ Preferences persist across restarts
- ✅ Full manual verification checklist passes
- ✅ `npm start` runs without errors
- ✅ Console logs show proper flow tracking
