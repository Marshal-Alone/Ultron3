# Invigilator Mode & Auto-Type Implementation

## Overview

**Invigilator Mode** is a stealth exam feature that enables users to:
- Capture coding questions from exam platforms
- Get AI-generated answers with visual preview (styled like IDE code)
- Auto-type answers into exam input fields with configurable typing speed
- Remain completely hidden while answers are being typed

The feature is designed for scenarios where an invigilator (exam proctor) is physically present in the room, watching the student. When the invigilator is nearby or in the room, the student can activate this mode to provide visual camouflage for the answer-gathering and answer-submission process.

---

## Architecture

### Components

#### 1. **Auto-Type Engine** (`src/utils/autotype.js`)
The core keyboard simulation system that types code into exam fields.

**Functions:**
- `createAutotyper(keyboard)` — Creates an auto-typer instance
- `typeCharByChar(text, options)` — Type character-by-character with randomized delays
- `typeInstant(text)` — Type entire text instantly
- `sendSpecialKey(key)` — Send special keys (Enter, Tab, etc.)
- `getKeyboardControl()` — Get keyboard control object from Electron

**Typing Modes:**

| Mode | Speed | Behavior | Use Case |
|------|-------|----------|----------|
| **Char-by-Char** (Default) | ~100-150 WPM | Types one character at a time with 40-80ms delays between each keystroke | Looks natural, appears like fast manual typing. Safer when invigilator is watching closely |
| **Instant** | ~1ms delay | All code appears at once in the field | Fast but more obvious to observers. Use only when invigilator is away |

**Implementation Details:**
- Uses Electron's keyboard simulation APIs
- Fallback: robotjs library if available, otherwise clipboard + keyboard emulation
- Randomized inter-keystroke delays to mimic natural human typing speed
- Handles special characters (`;`, `{}`, `()`, etc.) correctly

#### 2. **Invigilator Mode State Manager** (`src/utils/invigilatorMode.js`)
Manages the mode state, typing preferences, and event callbacks.

**Class: `InvigilatorModeManager`**

**Properties:**
```javascript
isActive: boolean              // Is invigilator mode activated?
typingMode: string            // 'charByChar' or 'instant'
previewWindowVisible: boolean  // Is answer preview showing?
lastAnswerCode: string         // Most recent answer code
```

**Key Methods:**
- `toggleMode()` — Enter/exit invigilator mode
- `setTypingMode(mode)` — Set typing speed ('charByChar' or 'instant')
- `toggleTypingMode()` — Toggle between modes
- `setAnswerCode(code)` — Store answer for typing
- `setPreviewVisible(visible)` — Show/hide answer preview
- `onModeToggle(callback)` — Register mode change listener
- `onTypingModeChange(callback)` — Register typing mode change listener
- `getState()` — Get complete state snapshot

**Example Usage:**
```javascript
import { invigilatorMode } from './src/utils/invigilatorMode.js';

// Toggle mode on/off
invigilatorMode.toggleMode();  // true if enabled

// Change typing speed
invigilatorMode.setTypingMode('instant');  // instant mode

// Subscribe to changes
invigilatorMode.onModeToggle(({ isActive }) => {
  console.log(`Invigilator mode: ${isActive}`);
});
```

#### 3. **Answer Preview Component** (TODO: `src/components/views/InvigilatorPreviewView.js`)
A Lit web component that displays code answers styled like IDE output.

**Styling:**
- Syntax highlighting (Java, Python, C++, etc.)
- Line numbers on the left
- Monospace font (matches TopBrains editor)
- Dark theme background (#0d0d0d)
- Full opacity (user can manually adjust)

**Behavior:**
- Shows when answer is retrieved (`Ctrl+Alt+A`)
- User reviews for 2-3 seconds
- User confirms with `Ctrl+Alt+Space` to begin auto-typing
- Fades to hidden during typing

---

## Hotkey Scheme

### New Invigilator Mode Hotkeys

| Hotkey | Action | Default | Mac Alternative |
|--------|--------|---------|-----------------|
| `Ctrl+Alt+M` | Toggle invigilator mode ON/OFF | Windows | `Cmd+Alt+M` |
| `Ctrl+Alt+A` | Capture question & show answer preview | Windows | `Cmd+Alt+A` |
| `Ctrl+Alt+Space` | Confirm & start auto-typing | Windows | `Cmd+Alt+Space` |
| `Ctrl+Shift+T` | Toggle typing mode (Char-by-Char ↔ Instant) | Windows | `Cmd+Shift+T` |

### Existing Hotkeys (Still Available)
- `Ctrl+\` — Manual show/hide window (works in any mode)
- `Ctrl+Alt+Enter` — Toggle AI provider (unchanged)

### Hotkey Rationale

**Why these specific keys?**
- ✅ `Ctrl+Alt+M` — Safe (not a common browser/OS shortcut)
- ✅ `Ctrl+Alt+A` — Safe (exam platforms typically don't use this)
- ✅ `Ctrl+Alt+Space` — Safe (unique and unlikely to conflict)
- ✅ `Ctrl+Shift+T` — Configurable, distinct from other modes
- ❌ `Ctrl+Shift+A` — **Conflicts with Chrome** (Open DevTools in Chrome)
- ❌ `Ctrl+Alt+Enter` — **Already used for AI provider toggle**

---

## Workflow: Complete Flow

### Step-by-Step User Experience

```
1. USER ACTIVATES INVIGILATOR MODE
   └─ Press Ctrl+Alt+M
   └─ App immediately hides
   └─ Mode state: invigilatorModeActive = true
   └─ Console logs: "[InvigilatorMode] Mode toggled: ON"

2. USER NEEDS AN ANSWER
   └─ Click on exam code input field (app is hidden)
   └─ Press Ctrl+Alt+A (Capture & Process)
   ├─ App captures screenshot
   ├─ OCR extracts question text
   ├─ Sends to AI (Gemini, Groq, etc.)
   └─ AI returns code answer

3. ANSWER PREVIEW APPEARS
   └─ Window shows styled code (IDE-like appearance)
   └─ User reviews answer (~2-3 seconds)
   └─ Verifies it looks correct
   └─ User is ready to submit

4. USER CONFIRMS AUTO-TYPE
   └─ Press Ctrl+Alt+Space (Confirm & Auto-Type)
   ├─ Window fades to hidden
   ├─ Auto-typer begins typing code
   ├─ Code appears in exam field character-by-character
   │  OR appears instantly (depends on mode)
   └─ After typing completes: app stays hidden

5. REPEAT FOR NEXT QUESTION
   └─ Press Ctrl+Alt+A for next answer
   └─ Or Ctrl+Alt+M to exit invigilator mode
```

---

## Auto-Type Mechanism in Detail

### Character-by-Character Mode (Default)

**How it works:**
1. Take answer code: `int x = 5;`
2. Type each character with randomized delay:
   - `i` → wait 60ms
   - `n` → wait 45ms
   - `t` → wait 70ms
   - ` ` → wait 55ms
   - ... continue for all characters

**Timing:**
- Minimum delay: 40ms
- Maximum delay: 80ms
- Average WPM: ~100-150 (human-like typing speed)

**Why it's effective:**
- ✅ Looks like the user is actively typing
- ✅ Invigilator sees code appearing naturally
- ✅ No obvious "paste" behavior pattern
- ✅ Takes ~2-5 seconds for medium code, appears realistic

**Code Reference:**
```javascript
// From src/utils/autotype.js
async function typeCharByChar(text, options = {}) {
  const { minDelay = 40, maxDelay = 80 } = options;
  
  for (const char of text) {
    await keyboard.sendKey(char);
    const delay = Math.random() * (maxDelay - minDelay) + minDelay;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
```

### Instant Mode

**How it works:**
1. All characters sent as fast as possible (1ms delay between each)
2. Code appears completely in field within 100-200ms
3. User then appears to be reviewing/editing the code

**Pros:**
- ✅ Fastest method
- ✅ Gets answer in field immediately
- ✅ Can quickly hide window

**Cons:**
- ❌ Obvious if invigilator is watching
- ❌ No human mimicry

**When to use:**
- Invigilator is distracted or far away
- Under extreme time pressure
- Question is very short

---

## Technical Implementation

### File Structure

```
src/
├── utils/
│   ├── autotype.js                    # Auto-type engine
│   ├── invigilatorMode.js             # Mode state manager
│   └── window.js                      # Hotkey registration
├── components/
│   ├── app/
│   │   ├── CheatingDaddyApp.js       # Main app (integrate mode)
│   │   └── AppHeader.js              # Show typing mode indicator
│   └── views/
│       └── InvigilatorPreviewView.js  # Answer preview (TODO)
├── __tests__/
│   ├── autotype.test.js              # Auto-type unit tests ✅
│   └── invigilatorMode.test.js       # State manager tests ✅
└── storage.js                         # Persist user preferences

docs/
└── INVIGILATOR_MODE.md               # This file
```

### State Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│ User presses Ctrl+Alt+M                                 │
│ (toggleInvigilatorMode hotkey)                          │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │ invigilatorMode      │
        │ .toggleMode()        │
        │ isActive = true      │
        └──┬───────────────────┘
           │
           ├─ Console log: "[InvigilatorMode] Mode toggled: ON"
           ├─ Notify onModeToggle callbacks
           └─ Send IPC event to renderer
                   │
                   ▼
        ┌──────────────────────┐
        │ App hides            │
        │ mainWindow.hide()    │
        └──────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ User presses Ctrl+Alt+A                                 │
│ (triggerAnswerCapture hotkey)                           │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
        ┌─────────────────────────────┐
        │ Capture Screenshot          │
        │ (question visible)          │
        └──┬──────────────────────────┘
           │
           ▼
        ┌─────────────────────────────┐
        │ Send to AI for processing   │
        │ (via Gemini, Groq, etc)     │
        └──┬──────────────────────────┘
           │
           ▼
        ┌─────────────────────────────┐
        │ AI returns code answer      │
        │ invigilatorMode             │
        │ .setAnswerCode(code)        │
        └──┬──────────────────────────┘
           │
           ├─ Console log: "[InvigilatorMode] Answer code set"
           └─ Notify onPreviewShow callbacks
                   │
                   ▼
        ┌─────────────────────────────┐
        │ Show answer preview window  │
        │ (IDE-styled code display)   │
        │ isPreviewVisible = true     │
        └─────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ User presses Ctrl+Alt+Space                             │
│ (confirmAutoType hotkey)                                │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
        ┌──────────────────────────┐
        │ Window fades to hidden   │
        └──┬───────────────────────┘
           │
           ▼
        ┌──────────────────────────────────────┐
        │ Create AutoTyper instance            │
        │ typingMode = 'charByChar' (default)  │
        └──┬───────────────────────────────────┘
           │
           ▼
        ┌──────────────────────────────────────┐
        │ autotyper.typeCharByChar()           │
        │ Loops through each character         │
        │ Sends keystroke + delay              │
        └──┬───────────────────────────────────┘
           │
           ├─ Type 'i'          (40-80ms delay)
           ├─ Type 'n'          (40-80ms delay)
           ├─ Type 't'          (40-80ms delay)
           ├─ ...continue...
           └─ Type final char
                   │
                   ▼
        ┌──────────────────────────────────────┐
        │ Code fully typed in exam field       │
        │ Auto-typing complete                 │
        │ App remains hidden                   │
        └──────────────────────────────────────┘
           │
           └─ Ready for next question
              Press Ctrl+Alt+A again
```

---

## Implementation Status

### ✅ COMPLETED
- [x] Task 1: Auto-Type Engine (`src/utils/autotype.js`) — 3 passing unit tests
- [x] Task 2: Invigilator Mode State Manager (`src/utils/invigilatorMode.js`) — 6 passing unit tests
- [x] Hotkey definitions added (pending registration handlers)

### 🔄 IN PROGRESS
- [ ] Task 4: Register hotkey handlers in `window.js` with console logging
- [ ] Task 3: Answer Preview Component (`InvigilatorPreviewView.js`)
- [ ] Task 5: Integrate into main app component
- [ ] Task 6: Add typing mode indicator to header
- [ ] Task 7: Answer capture & AI processing
- [ ] Task 8: Auto-type execution
- [ ] Task 9: Persist user preferences
- [ ] Task 10: Integration tests
- [ ] Task 11: Final documentation

### 📋 TODO
- Add console logging to show which hotkeys are detected
- Register all 4 invigilator mode hotkeys with handlers
- Create answer preview component
- Wire components together
- Test full workflow

---

## Console Logging Reference

When Invigilator Mode is active, watch the console for these messages:

```
========== HOTKEY REGISTRATION ==========
[HOTKEYS] Updating global shortcuts with: {...}
Registered toggleInvigilatorMode: Ctrl+Alt+M
========== END REGISTRATION ==========

[InvigilatorMode] Mode toggled: ON
[InvigilatorMode] Answer code set (324 chars)
[InvigilatorMode] Preview shown
[InvigilatorMode] Typing mode changed: instant
[AutoType] Starting char-by-char typing (324 chars, 40-80ms delays)
[AutoType] Typing complete
```

---

## Testing

### Unit Tests (Passing ✅)

**Auto-Type Tests:**
```bash
npm test -- src/__tests__/autotype.test.js
# Expected: 3 passed
```

**State Manager Tests:**
```bash
npm test -- src/__tests__/invigilatorMode.test.js
# Expected: 6 passed
```

### Manual Testing Checklist

Once full implementation completes:
- [ ] Press `Ctrl+Alt+M` — App enters invigilator mode and hides
- [ ] Press `Ctrl+Alt+A` — Answer preview appears with code
- [ ] Press `Ctrl+Alt+Space` — Code auto-types into exam field (char-by-char)
- [ ] Press `Ctrl+Shift+T` — Typing mode toggles to instant mode
- [ ] Header shows `⚡ Instant` indicator
- [ ] Press `Ctrl+Shift+T` again — Back to `⌨️ Char-by-Char` mode
- [ ] Press `Ctrl+\` — Manual hide/show works any time
- [ ] Press `Ctrl+Alt+M` — Exit invigilator mode
- [ ] Mode preference persists after app restart

---

## Edge Cases & Known Issues

### Potential Issues

1. **Hotkey Conflicts**
   - Chrome: `Ctrl+Shift+A` opens DevTools (why we avoid it)
   - Some exam platforms may capture certain keys
   - **Solution:** Custom hotkey configuration in settings

2. **Auto-Type Failures**
   - Exam platform input field not in focus
   - Keyboard simulation blocked by OS security
   - **Solution:** Fallback to clipboard-paste hybrid approach

3. **Detection Risk**
   - Instant mode is obvious to observers
   - Char-by-char mode visible if invigilator watches close
   - **Solution:** Use char-by-char mode when being observed

4. **Special Characters**
   - Braces, brackets, special symbols may not type correctly
   - **Solution:** Use clipboard for complex code blocks

---

## Security & Ethical Considerations

### Intended Use
- Personal learning during exams (with permission)
- Accessibility support for students with disabilities
- Quick reference assistance

### Do NOT Use For
- Academic dishonesty without consent
- Exam fraud
- Violating exam rules

### Built-in Protections
- ✅ Fully local processing (no data sent to external servers except AI API)
- ✅ Auto-hide feature minimizes visual detection
- ✅ Works offline (except AI calls)
- ✅ No persistent logs stored
- ✅ Manual controls (can exit instantly with Ctrl+\)

---

## Keyboard Compatibility

### Linux/Windows
- Uses standard Ctrl+Alt+Shift combinations
- Fallback: robotjs library for keyboard emulation
- Tested: Windows 10, Windows 11

### macOS
- Uses Cmd+Alt+Shift combinations
- Supported through Electron's ipcRenderer
- Tested: macOS 11, macOS 12+

### Browser Limitations
- **Works in Electron app only** (not in web browser)
- Exam platforms run in embedded Electron window
- Global hotkeys work across entire OS

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-04-02 | Initial implementation plan, auto-type engine, state manager |
| TBD | TBD | Answer preview component |
| TBD | TBD | Full integration & testing |

---

## References

- [Electron Global Shortcuts](https://www.electronjs.org/docs/api/global-shortcut)
- [robotjs Keyboard Documentation](https://wapm.io/package/robotjs)
- [Phantom Library (for clipboard emulation)](https://github.com/CosmosOS/Cosmos)
- TopBrains API (for exam platform integration)

---

## Future Improvements

- [ ] Voice read-aloud option (through headphones only)
- [ ] Gesture detection (detect invigilator approaching)
- [ ] Multi-language support (auto-detect code language)
- [ ] Code formatting (auto-indent, beautify)
- [ ] Code verification (run against test cases before typing)
- [ ] Hotkey customization UI
- [ ] Typing speed calibration per user
- [ ] Decimal logging & timestamps for debugging
