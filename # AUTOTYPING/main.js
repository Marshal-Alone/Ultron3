const { app, globalShortcut, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')
const {
  pauseOrResumeTyping,
  resetTypingState,
  typeText: runTypingSession
} = require('./typing-engine')
const {
  getGlobalKeyboardListener
} = require('simen-keyboard-listener')
const execFileAsync = promisify(execFile)

// Config
let config = {
  shortcut: 'F8',
  stopShortcut: 'Escape',
  predefinedTexts: [
    { name: 'Find Second Largest', text: 
      `int arr[] = {12, 35, 1, 10, 34, 1};
int largest = arr[0], secondLargest = Integer.MIN_VALUE;
for (int i = 1; i < arr.length; i++) {
   if (arr[i] > largest) { 
       secondLargest = largest; 
       largest = arr[i]; 
   }
   else if (arr[i] > secondLargest && arr[i] != largest) 
       secondLargest = arr[i];
}
System.out.println(secondLargest);` },
{
  name : "text",
  text:
`A B C D E
F G H I J
K L M N O
P Q R S T 
U V W X Y
Z Z Z Z Z
  
1 2 3 4 5 
6 7 8 9 10`
}
   ],
  currentTextIndex: 0,
  typingMode: 'char',    // 'char', 'word', 'line'
  typingSpeed: 50,        // milliseconds between key presses
  isTyping: false,
  typingIndex: 0,
  lineCharIndex: 0,
  isPaused: false,
  isHoldTypingActive: false,
  resumeCooldownMs: 250,
  resumeReadyAt: 0
}

let mainWindow = null
let lastTypeShortcutAt = 0
let lastStopShortcutAt = 0
let startTypingTimer = null
let activeTypingRun = null
let lastTypingFinishedAt = 0
let typingLock = Promise.resolve()
let isHoldKeyHeld = false
const TYPE_SHORTCUT_DEBOUNCE_MS = 250
const STOP_SHORTCUT_DEBOUNCE_MS = 250
const RESTART_GUARD_MS = 900

// Prevent app from quitting when windows close
app.on('window-all-closed', (e) => e.preventDefault())

/**
 * Start a new typing session from selected text
 */
function startTyping() {
  if (startTypingTimer || activeTypingRun) return
  if (Date.now() - lastTypingFinishedAt < RESTART_GUARD_MS) return

  const selectedText = config.predefinedTexts[config.currentTextIndex]
  if (!selectedText) return

  const text = selectedText.text
  config.isTyping = true
  config.isPaused = false
  config.typingIndex = 0
  config.lineCharIndex = 0
  config.resumeReadyAt = 0

  // Delay to ensure modifier keys are fully released before typing starts.
  // Increased to 400ms to prevent the first character from being dropped.
  startTypingTimer = setTimeout(() => {
    startTypingTimer = null
    if (!config.isTyping || activeTypingRun) return

    console.log('Typing with mode:', config.typingMode, 'speed:', config.typingSpeed)
    activeTypingRun = runTypingSession(text, {
      state: config,
      mode: config.typingMode,
      speed: config.typingSpeed,
      typeChar,
      typeChunk
    }).finally(() => {
      activeTypingRun = null
      lastTypingFinishedAt = Date.now()
      if (mainWindow) {
        mainWindow.webContents.send('typing-finished')
      }
    })

    if (mainWindow) {
      mainWindow.webContents.send('text-typed', {
        text,
        selectedIndex: config.currentTextIndex
      })
    }
  }, 400)
}

function isSingleKeyAccelerator(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed.length > 0 && !trimmed.includes('+')
}

function escapeForSendKeys(input) {
  const specialChars = {
    '+': '{+}',
    '^': '{^}',
    '%': '{%}',
    '~': '{~}',
    '(': '{(}',
    ')': '{)}',
    '{': '{{}',
    '}': '{}}',
    '[': '{[}',
    ']': '{]}'
  }

  let escaped = ''
  for (const char of input) {
    escaped += specialChars[char] || char
  }

  return escaped.replace(/'/g, "''")
}

async function sendKeys(sequence) {
  typingLock = typingLock
    .catch(() => {})
    .then(async () => {
    const cmd = `[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.SendKeys]::SendWait('${sequence}')`
    await execFileAsync('powershell.exe', ['-NoProfile', '-Command', cmd], { windowsHide: true })

    // Give the focused app a brief chance to apply input before the next key.
    await new Promise((resolve) => setTimeout(resolve, 10))
    })

  return typingLock
}

function clearPendingTypingStart() {
  if (!startTypingTimer) return
  clearTimeout(startTypingTimer)
  startTypingTimer = null
}

/**
 * Type a single character using Windows SendKeys via PowerShell
 */
async function  typeChar(char) {
  try {
    if (char === '\n') {
      await sendKeys('{ENTER}')
      return
    }

    if (char === '\t') {
      await sendKeys('{TAB}')
      return
    }

    await sendKeys(escapeForSendKeys(char))
  } catch (err) {
    console.error(`Failed to type character '${char}':`, err.message)
  }
}

async function typeChunk(text) {
  if (!text) return

  try {
    await sendKeys(escapeForSendKeys(text))
  } catch (err) {
    console.error('Failed to type text chunk:', err.message)
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true
    }
  })

  mainWindow.loadFile('index.html')
  mainWindow.on('closed', () => { mainWindow = null })

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools()
  }
}

function registerGlobalShortcut() {
  globalShortcut.unregisterAll()

   // Global shortcuts disabled: Windows blocks keyboard hook registration
   // Use window-focused detection via index.html instead (works perfectly)
}

/**
 * Register global keyboard listener for hold-to-type using simen-keyboard-listener
 * F8 key = hold-to-type, ESCAPE = stop
 */
function registerGlobalKeyboardListener() {
  try {
    const listener = getGlobalKeyboardListener()

    listener.addListener((event) => {
      const keyName = event.name ? event.name.toLowerCase() : ''
      const isDown = event.state === 'DOWN'

      if (keyName === 'f8') {
        if (isDown) {
          if (isHoldKeyHeld) return
          isHoldKeyHeld = true
          config.isHoldTypingActive = true
          console.log('[Listener] F8 DOWN')

          if (!config.isTyping) {
            startTyping()
            return
          }

          if (config.isPaused) {
            config.isPaused = false
            mainWindow?.webContents.send('typing-resumed')
          }
        } else {
          isHoldKeyHeld = false
          config.isHoldTypingActive = false
          console.log('[Listener] F8 UP')

          if (config.isTyping) {
            config.isPaused = true
            mainWindow?.webContents.send('typing-paused')
          }
        }
      }

      // ESCAPE key for stop
      if (keyName === 'escape' && isDown && config.isTyping) {
        clearPendingTypingStart()
        resetTypingState(config)
        lastTypingFinishedAt = Date.now()
        isHoldKeyHeld = false
        config.isHoldTypingActive = false

        if (mainWindow) {
          mainWindow.webContents.send('typing-stopped')
        }
      }
    })

    console.log('✓ Global keyboard listener started (F8 for hold-to-type, ESCAPE for stop)')
    return listener
  } catch (err) {
    console.error('Failed to start global keyboard listener:', err.message)
    return null
  }
}

let globalKeyboardListener = null

app.whenReady().then(() => {
  createWindow()
  registerGlobalShortcut()

  // Global listener: F8 controls hold-to-type.
  globalKeyboardListener = registerGlobalKeyboardListener()

  // Hide from dock on macOS
  if (app.dock) app.dock.hide()
})

// IPC handlers
ipcMain.on('get-config', (event) => {
  event.reply('config-data', config)
})

ipcMain.on('update-config', (event, newConfig) => {
  if (Object.prototype.hasOwnProperty.call(newConfig, 'typingSpeed')) {
    const parsedSpeed = Number(newConfig.typingSpeed)
    if (Number.isFinite(parsedSpeed)) {
      newConfig.typingSpeed = Math.max(10, parsedSpeed)
    } else {
      delete newConfig.typingSpeed
    }
  }

  if (Object.prototype.hasOwnProperty.call(newConfig, 'typingMode')) {
    const allowedModes = new Set(['char', 'word', 'line'])
    if (!allowedModes.has(newConfig.typingMode)) {
      delete newConfig.typingMode
    }
  }

  if (Object.prototype.hasOwnProperty.call(newConfig, 'shortcut')) {
    const candidate = String(newConfig.shortcut).trim()
    if (isSingleKeyAccelerator(candidate)) {
      newConfig.shortcut = candidate
    } else {
      delete newConfig.shortcut
    }
  }

  if (Object.prototype.hasOwnProperty.call(newConfig, 'stopShortcut')) {
    const candidate = String(newConfig.stopShortcut).trim()
    if (isSingleKeyAccelerator(candidate)) {
      newConfig.stopShortcut = candidate
    } else {
      delete newConfig.stopShortcut
    }
  }

  if (Object.prototype.hasOwnProperty.call(newConfig, 'currentTextIndex')) {
    const parsedIndex = Number(newConfig.currentTextIndex)
    const maxIndex = Math.max(0, config.predefinedTexts.length - 1)

    if (Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex <= maxIndex) {
      newConfig.currentTextIndex = parsedIndex
    } else {
      delete newConfig.currentTextIndex
    }
  }

  const shortcutChanged = (
    (Object.prototype.hasOwnProperty.call(newConfig, 'shortcut') && newConfig.shortcut !== config.shortcut) ||
    (Object.prototype.hasOwnProperty.call(newConfig, 'stopShortcut') && newConfig.stopShortcut !== config.stopShortcut)
  )

  Object.assign(config, newConfig)

  // Re-register only when hotkeys changed to avoid unnecessary registration failures.
  if (shortcutChanged) {
    registerGlobalShortcut()
  }

  event.reply('config-updated', config)
})

ipcMain.on('add-text', (event, name, text) => {
  config.predefinedTexts.push({ name, text })

  if (config.predefinedTexts.length === 1) {
    config.currentTextIndex = 0
  }

  event.reply('text-added', config.predefinedTexts)
})

ipcMain.on('remove-text', (event, index) => {
  if (index >= 0 && index < config.predefinedTexts.length) {
    config.predefinedTexts.splice(index, 1)

    if (config.predefinedTexts.length === 0) {
      config.currentTextIndex = 0
    } else if (config.currentTextIndex >= config.predefinedTexts.length) {
      config.currentTextIndex = config.predefinedTexts.length - 1
    }
  }
  event.reply('text-removed', config.predefinedTexts)
})

ipcMain.on('stop-typing', (event) => {
  clearPendingTypingStart()
  resetTypingState(config)
  event.reply('typing-stopped')
})

// Hold-to-type: Handle keydown for typing key (F8)
ipcMain.on('typing-key-down', (event) => {
  config.isHoldTypingActive = true

  // If not typing, start typing
  if (!config.isTyping) {
    startTyping()
    return
  }

  // If already typing but paused, resume
  if (config.isPaused) {
    config.isPaused = false
    mainWindow?.webContents.send('typing-resumed')
  }

  // If already typing and not paused, ignore (already running)
})

// Hold-to-type: Handle keyup for typing key (F8)
ipcMain.on('typing-key-up', (event) => {
  config.isHoldTypingActive = false

  if (config.isTyping) {
    config.isPaused = true
    mainWindow?.webContents.send('typing-paused')
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  config.isHoldTypingActive = false
  try {
    globalKeyboardListener?.forceKill?.()
  } catch {}
})
