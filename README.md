<img width="1299" height="424" alt="cd (1)" src="https://github.com/user-attachments/assets/b25fff4d-043d-4f38-9985-f832ae0d0f6e" />

## Recall.ai - API for desktop recording

If you’re looking for a hosted desktop recording API, consider checking out [Recall.ai](https://www.recall.ai/product/desktop-recording-sdk/?utm_source=github&utm_medium=sponsorship&utm_campaign=sohzm-cheating-daddy), an API that records Zoom, Google Meet, Microsoft Teams, in-person meetings, and more.

This project is sponsored by Recall.ai.

---

> [!NOTE]  
> Use latest MacOS and Windows version, older versions have limited support

> [!NOTE]  
> During testing it wont answer if you ask something, you need to simulate interviewer asking question, which it will answer

A real-time AI assistant that provides contextual help during video calls, technical interviews, presentations, and meetings using screen capture, live audio analysis, and an autonomous **Project Copilot**.

## Features

- **Live AI Assistance**: Real-time help powered by Google Gemini 2.0 Flash Live and Groq LPUs.
- **🚀 Project Copilot**: Codebase-grounded AI that answers technical interview questions about your current repository or any external project in ~1.0s.
- **Screen & Audio Capture**: Dual-channel extraction from on-screen text/editors and live speech.
- **Multiple Profiles**: Interview, Sales Call, Business Meeting, Presentation, Negotiation.
- **Transparent Stealth Overlay**: Always-on-top window with click-through mode, opacity adjustments, and custom keybindings.
- **Invigilator Auto-Type Mode**: Stealth code typing simulation directly into interview code editors.

---

## 🚀 Quick Start Guide

### Step 1: Start the Project Copilot Bridge (Terminal 1)

Navigate to the `ultron-antigravity-bridge` folder and run the persistent agent bridge:

```powershell
cd c:\Users\marsh\Downloads\Ultron3\ultron-antigravity-bridge
.\venv\Scripts\python run.py
```

Wait ~4 seconds until you see:
```text
[INFO] Workspace warmup complete ... Agent is READY.
```

### Step 2: Start the Ultron Desktop App (Terminal 2)

Open a second terminal in the project root directory and start the Electron application:

```powershell
cd c:\Users\marsh\Downloads\Ultron3
npm start
```

---

## 🎯 Pointing Project Copilot to Any Other Project

You can have Project Copilot ground its answers on **any project or codebase** on your machine:

### Option A: Pass the Folder Path in the Command Line (Recommended)

From the `ultron-antigravity-bridge` directory, pass the path to the project you want to talk about:

```powershell
cd c:\Users\marsh\Downloads\Ultron3\ultron-antigravity-bridge
.\venv\Scripts\python run.py "C:\Users\marsh\Desktop\MyNextJsApp"
```

*(You can also use the `-w` or `--workspace` flag):*
```powershell
.\venv\Scripts\python run.py --workspace "D:\FullStackProject\Backend"
```

### Option B: Set `PROJECT_WORKSPACE` in `.env`

Add your target project path to [`ultron-antigravity-bridge/.env`](ultron-antigravity-bridge/.env):

```env
PROJECT_WORKSPACE=C:\Users\marsh\Projects\ECommerceWebsite
```

Then simply start the bridge with `.\venv\Scripts\python run.py`.

---

## 🎮 How to Use During an Interview

| Scenario | How to Trigger | What Happens |
| :--- | :--- | :--- |
| **Question on Screen** *(e.g. IDE, Google Doc, HackerRank)* | Press **`Ctrl + Enter`**<br>➔ then press **`Ctrl + P`** | 1. `Ctrl + Enter` captures & extracts the question text from screen.<br>2. `Ctrl + P` sends it to Project Copilot to stream a 100% grounded answer in ~1.0s. |
| **Spoken Question** *(Interviewer asks verbally)* | Listen / Speak<br>➔ then press **`Ctrl + P`** | Live audio captures speech and `Ctrl + P` routes the question directly to Project Copilot. |

---

## ⌨️ Essential Keyboard Shortcuts

| Shortcut (Windows) | Shortcut (macOS) | Action |
| :--- | :--- | :--- |
| **`Ctrl + P`** | **`Cmd + P`** | **Trigger Project Copilot** (Answers about your codebase) |
| **`Ctrl + Enter`** | **`Cmd + Enter`** | **Take Screenshot & Extract Question** |
| **`Ctrl + Space`** | **`Cmd + Space`** | Toggle Listen & Answer / Force Answer |
| **`Ctrl + \`** | **`Cmd + \`** | Toggle Window Visibility |
| **`Ctrl + M`** | **`Cmd + M`** | Toggle Click-Through Mode |
| **`Ctrl + Arrow Keys`** | **`Alt + Arrow Keys`** | Move Overlay Window |
| **`Ctrl + Alt + M`** | **`Cmd + Alt + M`** | Toggle Invigilator Auto-Type Mode |
| **`Ctrl + Alt + Space`** | **`Cmd + Alt + Space`** | Confirm & Trigger Auto-Typing Code |

---

## Requirements

- **Node.js**: v18+ & Electron Forge
- **Python**: 3.10+ (for `ultron-antigravity-bridge`)
- **API Keys**: Google Gemini API key and/or Groq API key configured in Settings
- **Permissions**: Screen recording and Microphone permissions
