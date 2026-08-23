Good — that's an honest, well-defined use case, and the design changes I mentioned actually make it _better_ engineering, not just safer. Here's the plan, plus working code.

## Key design differences from the original proposal

| Original plan                                         | This version                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Spawns hidden PowerShell/C# process per keystroke     | Types directly from the Electron main process — no subprocess at all, so there's no console-focus race to fix |
| Compiles a windowless`.exe` with no console subsystem | Runs as a normal visible Electron app with a tray icon                                                        |
| Fires instantly on hotkey                             | Shows a visible on-screen countdown ("Typing in 2s... Esc to cancel") before it types anything                |
| Reads from a pre-written "answer file"                | Reads from the clipboard at the moment you press the hotkey — you control what's in there                     |

The countdown + tray status also solves your original problem better than the C# approach would have: since there's no subprocess launch, there's no 0.5–1s startup race and nothing to steal focus in the first place.

## Architecture

- **Electron main process** — registers the global hotkey, holds app state
- **`robotjs`** — simulates keystrokes directly in-process (no external `.exe`, no console window ever created)
- **Small always-on-top overlay window** — shows countdown + "Esc to cancel", so it's never a surprise when typing starts
- **Tray icon** — always shows idle/typing state

Let me scaffold this for you.One thing missing: you'll need two small PNG icons at `assets/tray-idle.png` (16x16 or 32x32) for the tray — any simple icon works, that part isn't functional code.

If a phrase-picker (a saved list you click instead of copy-pasting each time) would be more useful day-to-day than clipboard-reading, say the word and I'll build that window next.

# Assistive Typer

A visible, hotkey-triggered typing tool for users who type with limited hand or finger mobility.

## How it works

1. Copy the text you want typed (e.g. from a notes app, a saved phrase list, a chat draft).
2. Press **Ctrl+Alt+Space**.
3. A small on-screen box appears near your cursor showing a preview and a
   countdown ("Typing in 2s… Esc to cancel").
4. If you don't cancel, it types the clipboard text into whichever window
   currently has focus — character by character, so it looks like normal
   typing rather than a paste.
5. Press **Esc** at any point (during the countdown or while typing) to stop.

The tray icon always reflects state (idle / typing), so it's never running invisibly.

## Setup (Windows)

```bash
npm install
npm start
```

**Note on `robotjs`:** it's a native Node module and needs build tools
(`node-gyp`, Visual Studio Build Tools) to compile on install. If `npm install`
fails on `robotjs`, install windows-build-tools or Visual Studio's "Desktop
development with C++" workload first. This is the only native-code
dependency in the project, and unlike the original PowerShell/C# approach it
runs in-process — no `.exe` is spawned at runtime.

/**

- Assistive Typer
- ***
- Hotkey-triggered typing tool for users who type with limited hand/finger
- mobility. Reads the current clipboard contents and types them into
- whatever window is focused, using an in-process keystroke simulator.
-
- Design principles (deliberate, do not "simplify" these away):
-   1. VISIBLE STATE — a tray icon always shows idle vs. typing, and an
- on-screen countdown overlay appears before any keystrokes are sent.
-   2. USER CAN ALWAYS CANCEL — Esc during the countdown or while typing
- immediately aborts.
-   3. NO SUBPROCESSES — typing happens via robotjs directly in this
- process. There is no spawned PowerShell/csc.exe/child .exe, so
- there's no console window, no startup race, and nothing that could
- "invisibly" steal focus.
-   4. NO ANTI-DETECTION FEATURES — this app is meant to be visible and
- auditable. Do not add hidden windows, silent-mode flags, or
- "run without tray icon" options.
  */

const { app, Tray, Menu, BrowserWindow, globalShortcut, clipboard, screen } = require('electron');
const path = require('path');
const robot = require('robotjs');

const HOTKEY = 'Control+Alt+Space';
const COUNTDOWN_SECONDS = 2;
const CHAR_DELAY_MS = 12; // per-keystroke delay; tune for reliability vs. speed

let tray = null;
let overlayWindow = null;
let typingCancelled = false;
let isTyping = false;

app.whenReady().then(() => {
createTray();
registerHotkey();
});

app.on('window-all-closed', (e) => {
// Keep running in the tray; this is a background utility, not a
// document-editing app the user expects to "quit" by closing a window.
e.preventDefault();
});

function createTray() {
const iconPath = path.join(__dirname, '..', 'assets', 'tray-idle.png');
tray = new Tray(iconPath);
updateTrayMenu();
tray.setToolTip('Assistive Typer — idle');
}

function updateTrayMenu() {
const menu = Menu.buildFromTemplate([
{ label: isTyping ? 'Typing… (Esc to cancel)' : 'Idle', enabled: false },
{ type: 'separator' },
{ label: `Hotkey: ${HOTKEY.replace('+', ' + ')}`, enabled: false },
{ type: 'separator' },
{ label: 'Quit Assistive Typer', click: () => app.quit() },
]);
tray.setContextMenu(menu);
}

function registerHotkey() {
const ok = globalShortcut.register(HOTKEY, onHotkeyPressed);
if (!ok) {
console.error(`Failed to register hotkey ${HOTKEY} — it may be in use by another app.`);
}
}

async function onHotkeyPressed() {
if (isTyping) return; // ignore re-trigger while already typing

const text = clipboard.readText();
if (!text || text.length === 0) {
flashOverlay('Clipboard is empty — nothing to type.', 1500);
return;
}

typingCancelled = false;
const proceed = await showCountdownOverlay(text);
if (!proceed) return;

await typeText(text);
}

/**

- Shows a small, always-on-top overlay near the cursor with a visible
- countdown and a preview of what will be typed, so the user always knows
- typing is about to start and can cancel with Esc.
- Resolves true if the countdown completed, false if cancelled.
  */
  function showCountdownOverlay(text) {
  return new Promise((resolve) => {
  const cursor = screen.getCursorScreenPoint();
  overlayWindow = new BrowserWindow({
  width: 360,
  height: 110,
  x: cursor.x + 20,
  y: cursor.y + 20,
  frame: false,
  alwaysOnTop: true,
  resizable: false,
  skipTaskbar: true,
  transparent: true,
  focusable: false, // never steals focus from the target editor
  webPreferences: { contextIsolation: true },
  });

    const preview = text.length > 60 ? text.slice(0, 60) + '…' : text;
    const escapedPreview = preview
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

    overlayWindow.loadURL(
    'data:text/html,' +
    encodeURIComponent(`<html><body style="margin:0;font-family:sans-serif;background:#222;color:#fff; border-radius:10px;padding:14px;box-sizing:border-box;height:100%;"> <div style="font-size:13px;opacity:0.8;">Typing into focused window in <span id="count">${COUNTDOWN_SECONDS}</span>s — press Esc to cancel</div> <div style="margin-top:8px;font-size:12px;opacity:0.6;white-space:nowrap; overflow:hidden;text-overflow:ellipsis;">"${escapedPreview}"</div> </body></html>`)
    );

    let remaining = COUNTDOWN_SECONDS;
    const interval = setInterval(() => {
    remaining -= 1;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents
    .executeJavaScript(`document.getElementById('count').innerText = ${remaining}`)
    .catch(() => {});
    }
    if (remaining <= 0) {
    clearInterval(interval);
    cleanupOverlay();
    resolve(!typingCancelled);
    }
    }, 1000);

    const cancelListener = globalShortcut.register('Escape', () => {
    typingCancelled = true;
    clearInterval(interval);
    cleanupOverlay();
    globalShortcut.unregister('Escape');
    resolve(false);
    });

    function cleanupOverlay() {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
    }
    overlayWindow = null;
    }
    });
    }

function flashOverlay(message, ms) {
const cursor = screen.getCursorScreenPoint();
const w = new BrowserWindow({
width: 300,
height: 60,
x: cursor.x + 20,
y: cursor.y + 20,
frame: false,
alwaysOnTop: true,
skipTaskbar: true,
transparent: true,
focusable: false,
});
w.loadURL(
'data:text/html,' +
encodeURIComponent(
`<body style="margin:0;font-family:sans-serif;background:#222;color:#fff;         border-radius:8px;padding:12px;font-size:13px;">${message}</body>`
)
);
setTimeout(() => !w.isDestroyed() && w.close(), ms);
}

async function typeText(text) {
isTyping = true;
updateTrayMenu();
tray.setToolTip('Assistive Typer — typing (Esc to cancel)');

globalShortcut.unregister('Escape');
globalShortcut.register('Escape', () => {
typingCancelled = true;
});

for (const char of text) {
if (typingCancelled) break;
// robotjs runs in-process — no subprocess, no console, no focus shift.
robot.typeString(char);
await sleep(CHAR_DELAY_MS);
}

globalShortcut.unregister('Escape');
isTyping = false;
typingCancelled = false;
updateTrayMenu();
tray.setToolTip('Assistive Typer — idle');
}

function sleep(ms) {
return new Promise((r) => setTimeout(r, ms));
}
