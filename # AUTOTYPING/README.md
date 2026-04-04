# 📚 Study Stamp

Stamp the current study time into **any focused input field** — in Chrome, Notepad, VS Code, anywhere — with a global keyboard shortcut.

---

## Setup

```bash
npm install
npm start
```

> Requires Node.js + npm. Electron is installed automatically.

---

## How it works

1. Run the app — it lives in your **system tray** (no window)
2. Click any input field anywhere on your screen
3. Hit **Ctrl+Shift+Space** (default shortcut)
4. The stamp gets pasted in instantly ✅

---

## Default stamp format

```
📚 Study Time: 14:32:05
```

---

## Settings

Right-click the tray icon → **Settings** to:
- Change the global shortcut
- Edit the stamp template using variables:
  - `{time}` → `HH:MM:SS`
  - `{date}` → `YYYY-MM-DD`
  - `{datetime}` → `YYYY-MM-DD HH:MM:SS`

---

## Platform notes

| OS | Paste method |
|---|---|
| macOS | AppleScript `keystroke "v" using command down` |
| Windows | PowerShell `SendKeys('^v')` |
| Linux | `xdotool key ctrl+v` (install xdotool if needed) |

The app temporarily copies your stamp text to the clipboard, pastes it, then restores your original clipboard — all within ~600ms.

---

## Linux extra step

```bash
sudo apt install xdotool
```
