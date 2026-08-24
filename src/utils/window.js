const { screen, globalShortcut, BrowserWindow, clipboard, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('os');
const storage = require('../storage');

let mouseEventsIgnored = true;
let windowResizing = false;
let resizeAnimation = null;
const RESIZE_ANIMATION_DURATION = 500; // milliseconds

function createWindow(sendToRenderer, geminiSessionRef) {
    // Get saved window bounds from storage, or use defaults
    const savedBounds = storage.getWindowBounds();
    let windowWidth = savedBounds.width || 509;
    let windowHeight = savedBounds.height || 352;

    const mainWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        frame: false,
        transparent: true,
        hasShadow: false,
        alwaysOnTop: true,
        focusable: true, // Allow keyboard input by default (stealth mode can disable)
        skipTaskbar: true, // Don't show in taskbar
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // TODO: change to true
            backgroundThrottling: false,
            enableBlinkFeatures: 'GetDisplayMedia',
            webSecurity: true,
            allowRunningInsecureContent: false,
            disableDialogs: true, // Disable dialogs and confirm boxes
        },
        backgroundColor: '#00000000',
    });

    // // Disable zoom functionality completely to prevent Ctrl+= from enlarging UI
    // mainWindow.webContents.on('before-input-event', (event, input) => {
    //     // Block Ctrl++ (or Cmd++ on Mac) - prevents zoom increase
    //     if ((input.control || input.meta) && input.key.toLowerCase() === '+') {
    //         event.preventDefault();
    //     }
    //     // Block Ctrl+- (or Cmd+- on Mac) - prevents zoom decrease
    //     if ((input.control || input.meta) && input.key === '-') {
    //         event.preventDefault();
    //     }
    //     // Block Ctrl+0 (or Cmd+0 on Mac) - prevents zoom reset (we do it in code)
    //     if ((input.control || input.meta) && input.key === '0') {
    //         event.preventDefault();
    //     }
    //     // Block Ctrl+= using different detection (numpad plus or shift equals)
    //     if ((input.control || input.meta) && (input.key === '=' || input.shift === true && input.key === '=')) {
    //         event.preventDefault();
    //     }
    // });

    // // Reset zoom level to 100% (fix for Ctrl+= browser zoom that enlarges entire UI)
    // mainWindow.webContents.setZoomLevel(0); // 0 = 100% zoom
    // console.log('[WINDOW] Zoom level reset to 100%');

    // // Force zoom reset after content loads to ensure it takes effect
    // mainWindow.webContents.on('did-finish-load', () => {
    //     mainWindow.webContents.setZoomLevel(0);
    //     console.log('[WINDOW] Zoom reset confirmed after content load');
    // });

    // // Also force zoom reset on every navigation
    // mainWindow.webContents.on('did-navigate', () => {
    //     mainWindow.webContents.setZoomLevel(0);
    // });

    const { session, desktopCapturer } = require('electron');
    session.defaultSession.setDisplayMediaRequestHandler(
        (request, callback) => {
            desktopCapturer.getSources({ types: ['screen'] }).then(sources => {
                callback({ video: sources[0], audio: 'loopback' });
            });
        },
        { useSystemPicker: true }
    );

    // Enable window resizing - user can drag corners/edges to resize
    mainWindow.setResizable(true);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Validate and set window position
    let x = savedBounds.x;
    let y = savedBounds.y;

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    // Check if the saved position is visible on any screen
    let isVisible = false;
    if (x !== undefined && y !== undefined) {
        const displays = screen.getAllDisplays();
        for (const display of displays) {
            const bounds = display.bounds;
            if (x >= bounds.x && x + windowWidth <= bounds.x + bounds.width && y >= bounds.y && y + windowHeight <= bounds.y + bounds.height) {
                isVisible = true;
                break;
            }
        }
    }

    // Default to top-left if no saved position or not fully visible
    if (!isVisible) {
        x = 0;
        y = 0;
    }

    mainWindow.setPosition(x, y);

    // Save bounds when window is moved or resized
    const saveBounds = () => {
        const bounds = mainWindow.getBounds();
        storage.setWindowBounds({
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
        });
    };

    mainWindow.on('resized', saveBounds);
    mainWindow.on('moved', saveBounds);

    // Make window invisible to screen capture and recording software
    // This is critical for the app's purpose - hiding from screen shares
    mainWindow.setContentProtection(true);

    if (process.platform === 'win32') {
        mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    }

    mainWindow.loadFile(path.join(__dirname, '../index.html'));

    // After window is created, initialize keybinds
    mainWindow.webContents.once('dom-ready', () => {
        // Apply default click-through state after window is ready
        if (mouseEventsIgnored) {
            mainWindow.setIgnoreMouseEvents(true, { forward: true });
            mainWindow.webContents.send('click-through-toggled', true);
        }

        setTimeout(() => {
            const defaultKeybinds = getDefaultKeybinds();
            let keybinds = defaultKeybinds;

            // Load keybinds from storage
            const savedKeybinds = storage.getKeybinds();
            if (savedKeybinds) {
                keybinds = { ...defaultKeybinds, ...savedKeybinds };
            }

            updateGlobalShortcuts(keybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }, 150);
    });

    setupWindowIpcHandlers(mainWindow, sendToRenderer, geminiSessionRef);

    return mainWindow;
}

function getDefaultKeybinds() {
    const isMac = process.platform === 'darwin';
    return {
        moveUp: isMac ? 'Alt+Up' : 'Ctrl+Up',
        moveDown: isMac ? 'Alt+Down' : 'Ctrl+Down',
        moveLeft: isMac ? 'Alt+Left' : 'Ctrl+Left',
        moveRight: isMac ? 'Alt+Right' : 'Ctrl+Right',
        toggleVisibility: isMac ? 'Cmd+\\' : 'Ctrl+\\',
        toggleClickThrough: isMac ? 'Cmd+M' : 'Ctrl+M',
        nextStep: isMac ? 'Cmd+Enter' : 'Ctrl+Enter',
        previousResponse: isMac ? 'Cmd+[' : 'Ctrl+[',
        nextResponse: isMac ? 'Cmd+]' : 'Ctrl+]',
        scrollUp: isMac ? 'Cmd+Shift+Up' : 'Ctrl+Shift+Up',
        scrollDown: isMac ? 'Cmd+Shift+Down' : 'Ctrl+Shift+Down',
        emergencyErase: isMac ? 'Cmd+Shift+E' : 'Ctrl+Shift+E',
        decreaseTransparency: isMac ? 'Cmd+Alt+9' : 'Ctrl+Alt+9',
        increaseTransparency: isMac ? 'Cmd+Alt+0' : 'Ctrl+Alt+0',
        decreaseFontSize: isMac ? 'Cmd+Alt+[' : 'Ctrl+Alt+[',
        increaseFontSize: isMac ? 'Cmd+Alt+]' : 'Ctrl+Alt+]',
        askClipboard: isMac ? 'Cmd+Alt+P' : 'Ctrl+Alt+P',
        toggleStealth: isMac ? 'Cmd+Alt+L' : 'Ctrl+Alt+L',
        toggleNavbar: isMac ? 'Cmd+Alt+N' : 'Ctrl+Alt+N',
        decreaseTextOpacity: isMac ? 'Cmd+Shift+9' : 'Ctrl+Shift+9',
        increaseTextOpacity: isMac ? 'Cmd+Shift+0' : 'Ctrl+Shift+0',
        quickStartGroq: isMac ? 'Cmd+Shift+S' : 'Ctrl+Shift+S',
        quickStop: 'Alt+S',
        killSwitch: isMac ? 'Cmd+Shift+Delete' : 'Ctrl+Shift+Delete',
        increaseWidth: isMac ? 'Cmd+Shift+Right' : 'Ctrl+Shift+Right',
        decreaseWidth: isMac ? 'Cmd+Shift+Left' : 'Ctrl+Shift+Left',
        increaseHeight: isMac ? 'Cmd+Alt+Up' : 'Ctrl+Alt+Up',
        decreaseHeight: isMac ? 'Cmd+Alt+Down' : 'Ctrl+Alt+Down',
        toggleListenAnswer: isMac ? 'Cmd+Space' : 'Ctrl+Space',
        projectCopilot: isMac ? 'Cmd+P' : 'Ctrl+P',
        // Invigilator Mode hotkeys
        toggleInvigilatorMode: isMac ? 'Cmd+Alt+M' : 'Ctrl+Alt+M',
        triggerAnswerCapture: isMac ? 'Cmd+Alt+A' : 'Ctrl+Alt+A',
        confirmAutoType: isMac ? 'Cmd+Alt+Space' : 'Ctrl+Alt+Space',
        toggleTypingMode: isMac ? 'Cmd+Shift+T' : 'Ctrl+Shift+T',
        pauseResumeTyping: isMac ? 'Cmd+Shift+]' : 'Ctrl+Shift+]',
        stopTyping: isMac ? 'Cmd+Alt+X' : 'Ctrl+Alt+X',
    };
}

function updateGlobalShortcuts(keybinds, mainWindow, sendToRenderer, geminiSessionRef) {
    // Unregister all existing shortcuts
    globalShortcut.unregisterAll();

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const moveIncrement = Math.floor(Math.min(width, height) * 0.1);

    // Register window movement shortcuts
    const movementActions = {
        moveUp: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX, currentY - moveIncrement);
        },
        moveDown: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX, currentY + moveIncrement);
        },
        moveLeft: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX - moveIncrement, currentY);
        },
        moveRight: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX + moveIncrement, currentY);
        },
    };

    // Register each movement shortcut
    Object.keys(movementActions).forEach(action => {
        const keybind = keybinds[action];
        if (keybind) {
            try {
                globalShortcut.register(keybind, movementActions[action]);
            } catch (error) {
                console.error(`Failed to register ${action} (${keybind}):`, error);
            }
        }
    });

    // Register toggle visibility shortcut
    if (keybinds.toggleVisibility) {
        try {
            globalShortcut.register(keybinds.toggleVisibility, () => {
                if (mainWindow.isVisible()) {
                    mainWindow.hide();
                } else {
                    mainWindow.showInactive();
                }
            });
        } catch (error) {
            console.error(`Failed to register toggleVisibility (${keybinds.toggleVisibility}):`, error);
        }
    }

    // Register toggle click-through shortcut
    if (keybinds.toggleClickThrough) {
        try {
            globalShortcut.register(keybinds.toggleClickThrough, () => {
                mouseEventsIgnored = !mouseEventsIgnored;
                if (mouseEventsIgnored) {
                    mainWindow.setIgnoreMouseEvents(true, { forward: true });
                } else {
                    mainWindow.setIgnoreMouseEvents(false);
                }
                mainWindow.webContents.send('click-through-toggled', mouseEventsIgnored);
            });
        } catch (error) {
            console.error(`Failed to register toggleClickThrough (${keybinds.toggleClickThrough}):`, error);
        }
    }

    // Register next step shortcut (either starts session or takes screenshot based on view)
    if (keybinds.nextStep) {
        const nextStepHandler = async () => {
            try {
                const isMac = process.platform === 'darwin';
                const shortcutKey = isMac ? 'cmd+enter' : 'ctrl+enter';
                await mainWindow.webContents.executeJavaScript(`
                    cheatingDaddy.handleShortcut('${shortcutKey}');
                `);
            } catch (error) {
                console.error('Error handling next step shortcut:', error);
            }
        };

        try {
            let keybind = keybinds.nextStep;
            let registered = globalShortcut.register(keybind, nextStepHandler);

            if (!registered) {
                registered = globalShortcut.register('CommandOrControl+Return', nextStepHandler);
                if (!registered) {
                    registered = globalShortcut.register('F9', nextStepHandler);
                    if (!registered) {
                        registered = globalShortcut.register('Ctrl+Shift+A', nextStepHandler);
                    }
                }
            }
        } catch (error) {
            console.error(`Failed to register nextStep (${keybinds.nextStep}):`, error);
        }
    }

    // Register previous response shortcut
    if (keybinds.previousResponse) {
        try {
            globalShortcut.register(keybinds.previousResponse, () => {
                sendToRenderer('navigate-previous-response');
            });
        } catch (error) {
            console.error(`Failed to register previousResponse (${keybinds.previousResponse}):`, error);
        }
    }

    // Register next response shortcut
    if (keybinds.nextResponse) {
        try {
            globalShortcut.register(keybinds.nextResponse, () => {
                sendToRenderer('navigate-next-response');
            });
        } catch (error) {
            console.error(`Failed to register nextResponse (${keybinds.nextResponse}):`, error);
        }
    }

    // Register scroll up shortcut
    if (keybinds.scrollUp) {
        try {
            globalShortcut.register(keybinds.scrollUp, () => {
                sendToRenderer('scroll-response-up');
            });
        } catch (error) {
            console.error(`Failed to register scrollUp (${keybinds.scrollUp}):`, error);
        }
    }

    // Register scroll down shortcut
    if (keybinds.scrollDown) {
        try {
            globalShortcut.register(keybinds.scrollDown, () => {
                sendToRenderer('scroll-response-down');
            });
        } catch (error) {
            console.error(`Failed to register scrollDown (${keybinds.scrollDown}):`, error);
        }
    }
    if (keybinds.scrollDown) {
        try {
            globalShortcut.register(keybinds.scrollDown, () => {
                console.log('Scroll down shortcut triggered');
                sendToRenderer('scroll-response-down');
            });
            console.log(`Registered scrollDown: ${keybinds.scrollDown}`);
        } catch (error) {
            console.error(`Failed to register scrollDown (${keybinds.scrollDown}):`, error);
        }
    }

    // Register emergency erase shortcut
    if (keybinds.emergencyErase) {
        try {
            globalShortcut.register(keybinds.emergencyErase, () => {
                console.log('Emergency Erase triggered!');
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.hide();

                    if (geminiSessionRef.current) {
                        geminiSessionRef.current.close();
                        geminiSessionRef.current = null;
                    }

                    sendToRenderer('clear-sensitive-data');

                    setTimeout(() => {
                        const { app } = require('electron');
                        app.quit();
                    }, 300);
                }
            });
        } catch (error) {
            console.error(`Failed to register emergencyErase (${keybinds.emergencyErase}):`, error);
        }
    }

    // Register toggle AI provider shortcut (Ctrl+Alt+Enter)
    try {
        globalShortcut.register('Ctrl+Alt+Return', async () => {
            try {
                const storage = require('../storage');
                const prefs = storage.getPreferences();
                const currentProvider = prefs.aiProvider || 'gemini';
                const newProvider = currentProvider === 'gemini' ? 'groq' : 'gemini';

                storage.updatePreference('aiProvider', newProvider);
                sendToRenderer('ai-provider-changed', newProvider);
            } catch (error) {
                console.error('Error toggling AI provider:', error);
            }
        });
    } catch (error) {
        console.error('Failed to register toggleAiProvider:', error);
    }

    // Register transparency adjustment shortcuts
    if (keybinds.decreaseTransparency) {
        try {
            globalShortcut.register(keybinds.decreaseTransparency, () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('adjust-transparency', -0.02);
                }
            });
        } catch (error) {
            console.error(`Failed to register decreaseTransparency:`, error);
        }
    }

    if (keybinds.increaseTransparency) {
        try {
            globalShortcut.register(keybinds.increaseTransparency, () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('adjust-transparency', 0.02);
                }
            });
        } catch (error) {
            console.error(`Failed to register increaseTransparency:`, error);
        }
    }

    // Register font size adjustment shortcuts
    if (keybinds.decreaseFontSize) {
        try {
            globalShortcut.register(keybinds.decreaseFontSize, () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('adjust-font-size', -2);
                }
            });
        } catch (error) {
            console.error(`Failed to register decreaseFontSize:`, error);
        }
    }

    if (keybinds.increaseFontSize) {
        try {
            globalShortcut.register(keybinds.increaseFontSize, () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('adjust-font-size', 2);
                }
            });
        } catch (error) {
            console.error(`Failed to register increaseFontSize:`, error);
        }
    }

    // Register text opacity adjustment shortcuts
    if (keybinds.decreaseTextOpacity) {
        try {
            globalShortcut.register(keybinds.decreaseTextOpacity, () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('adjust-text-opacity', -0.02);
                }
            });
        } catch (error) {
            console.error(`Failed to register decreaseTextOpacity:`, error);
        }
    }

    if (keybinds.increaseTextOpacity) {
        try {
            globalShortcut.register(keybinds.increaseTextOpacity, () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('adjust-text-opacity', 0.02);
                }
            });
        } catch (error) {
            console.error(`Failed to register increaseTextOpacity:`, error);
        }
    }

    // Register Stealth Paste shortcut
    if (keybinds.askClipboard) {
        try {
            globalShortcut.register(keybinds.askClipboard, () => {
                const text = clipboard.readText();
                if (text && text.trim().length > 0) {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('clipboard-query', text);
                    }
                }
            });
        } catch (error) {
            console.error(`Failed to register askClipboard:`, error);
        }
    }

    // Register Focus Lock (Stealth Mode) shortcut
    if (keybinds.toggleStealth) {
        try {
            globalShortcut.register(keybinds.toggleStealth, () => {
                const currentFocusable = mainWindow.isFocusable();
                const newMode = !currentFocusable;

                mainWindow.setFocusable(newMode);
                mainWindow.setIgnoreMouseEvents(!newMode);

                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('stealth-mode-changed', !newMode);
                }
            });
        } catch (error) {
            console.error(`Failed to register toggleStealth:`, error);
        }
    }

    // Register Ctrl+Alt+N for navbar toggle
    if (keybinds.toggleNavbar) {
        try {
            globalShortcut.register(keybinds.toggleNavbar, () => {
                sendToRenderer('toggle-navbar');
            });
        } catch (error) {
            console.error(`Failed to register toggleNavbar:`, error);
        }
    }

    // ==================== WINDOW RESIZE SHORTCUTS ====================

    // Window resize increment in pixels
    const resizeIncrement = 50;

    // Register increase width shortcut (Ctrl+Shift+=)
    if (keybinds.increaseWidth) {
        try {
            globalShortcut.register(keybinds.increaseWidth, () => {
                if (!mainWindow || mainWindow.isDestroyed()) return;
                const [width, height] = mainWindow.getSize();
                mainWindow.setSize(width + resizeIncrement, height);
                storage.setWindowSize(width + resizeIncrement, height);
            });
        } catch (error) {
            console.error(`Failed to register increaseWidth:`, error);
        }
    }

    // Register decrease width shortcut (Ctrl+Shift+-)
    if (keybinds.decreaseWidth) {
        try {
            globalShortcut.register(keybinds.decreaseWidth, () => {
                if (!mainWindow || mainWindow.isDestroyed()) return;
                const [width, height] = mainWindow.getSize();
                const newWidth = Math.max(200, width - resizeIncrement); // Min width 200px
                mainWindow.setSize(newWidth, height);
                storage.setWindowSize(newWidth, height);
            });
        } catch (error) {
            console.error(`Failed to register decreaseWidth:`, error);
        }
    }

    // Register increase height shortcut (Ctrl+Alt+=)
    if (keybinds.increaseHeight) {
        try {
            globalShortcut.register(keybinds.increaseHeight, () => {
                if (!mainWindow || mainWindow.isDestroyed()) return;
                const [width, height] = mainWindow.getSize();
                mainWindow.setSize(width, height + resizeIncrement);
                storage.setWindowSize(width, height + resizeIncrement);
            });
        } catch (error) {
            console.error(`Failed to register increaseHeight:`, error);
        }
    }

    // Register decrease height shortcut (Ctrl+Alt+-)
    if (keybinds.decreaseHeight) {
        try {
            globalShortcut.register(keybinds.decreaseHeight, () => {
                if (!mainWindow || mainWindow.isDestroyed()) return;
                const [width, height] = mainWindow.getSize();
                const newHeight = Math.max(200, height - resizeIncrement); // Min height 200px
                mainWindow.setSize(width, newHeight);
                storage.setWindowSize(width, newHeight);
            });
        } catch (error) {
            console.error(`Failed to register decreaseHeight:`, error);
        }
    }

    // ==================== QUICK START & KILL SWITCH ====================

    // Register Quick Start Groq shortcut (Ctrl+Shift+S / Cmd+Shift+S)
    const isMac = process.platform === 'darwin';
    const quickStartGroqShortcut = isMac ? 'Cmd+Shift+S' : 'Ctrl+Shift+S';
    try {
        globalShortcut.register(quickStartGroqShortcut, async () => {
            try {
                const storage = require('../storage');
                storage.updatePreference('aiProvider', 'groq');
                sendToRenderer('quick-start-groq');
            } catch (error) {
                console.error('Error in quick start Groq:', error);
            }
        });
    } catch (error) {
        console.error(`Failed to register Quick Start Groq (${quickStartGroqShortcut}):`, error);
    }

    // Register Kill Switch shortcut (Ctrl+Shift+Delete / Cmd+Shift+Delete)
    const killSwitchShortcut = isMac ? 'Cmd+Shift+Delete' : 'Ctrl+Shift+Delete';
    try {
        globalShortcut.register(killSwitchShortcut, async () => {
            try {
                const storage = require('../storage');
                const { app } = require('electron');

                mainWindow.webContents
                    .executeJavaScript(
                        `
                    if (window.cheatingDaddy && window.cheatingDaddy.currentSessionId) {
                        window.electronbridge?.sendSync?.('kill-switch-export', window.cheatingDaddy.currentSessionId);
                    }
                `
                    )
                    .catch(err => console.log('Could not get session ID from renderer'));

                setTimeout(() => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.hide();
                    }

                    if (geminiSessionRef.current) {
                        geminiSessionRef.current.close();
                        geminiSessionRef.current = null;
                    }

                    process.exit(0);
                }, 500);
            } catch (error) {
                console.error('Error in kill switch:', error);
                process.exit(0);
            }
        });
    } catch (error) {
        console.error(`Failed to register Kill Switch (${killSwitchShortcut}):`, error);
    }

    // Register Quick Stop shortcut (Alt+S) - stops capture without closing app
    const quickStopShortcut = 'Alt+S';
    try {
        globalShortcut.register(quickStopShortcut, async () => {
            try {
                sendToRenderer('quick-stop');
            } catch (error) {
                console.error('Error in quick stop:', error);
            }
        });
    } catch (error) {
        console.error(`Failed to register Quick Stop (${quickStopShortcut}):`, error);
    }

    // ==================== INVIGILATOR MODE HOTKEYS ====================

    // Register Toggle Invigilator Mode (Ctrl+Alt+M / Cmd+Alt+M)
    if (keybinds.toggleInvigilatorMode) {
        try {
            globalShortcut.register(keybinds.toggleInvigilatorMode, () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    sendToRenderer('invigilator:toggle-mode');
                }
            });
        } catch (error) {
            console.error(`[HOTKEYS] Failed to register toggleInvigilatorMode:`, error);
        }
    }

    // Register Trigger Answer Capture (Ctrl+Alt+A / Cmd+Alt+A)
    if (keybinds.triggerAnswerCapture) {
        try {
            globalShortcut.register(keybinds.triggerAnswerCapture, () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    sendToRenderer('invigilator:capture-answer');
                }
            });
        } catch (error) {
            console.error(`[HOTKEYS] Failed to register triggerAnswerCapture:`, error);
        }
    }

    // Register Confirm Auto-Type (Ctrl+Alt+Space / Cmd+Alt+Space)
    if (keybinds.confirmAutoType) {
        try {
            globalShortcut.register(keybinds.confirmAutoType, () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    sendToRenderer('invigilator:confirm-autotype');
                }
            });
        } catch (error) {
            console.error(`[HOTKEYS] Failed to register confirmAutoType:`, error);
        }
    }

    // Register Toggle Typing Mode (Ctrl+Shift+T / Cmd+Shift+T)
    if (keybinds.toggleTypingMode) {
        try {
            globalShortcut.register(keybinds.toggleTypingMode, () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    sendToRenderer('invigilator:toggle-typing-mode');
                }
            });
        } catch (error) {
            console.error(`[HOTKEYS] Failed to register toggleTypingMode:`, error);
        }
    }

    // Register Pause/Resume Typing (Ctrl+Alt+K / Cmd+Alt+K)
    if (keybinds.pauseResumeTyping) {
        try {
            globalShortcut.register(keybinds.pauseResumeTyping, () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    sendToRenderer('invigilator:pause-resume-typing');
                }
            });
        } catch (error) {
            console.error(`[HOTKEYS] Failed to register pauseResumeTyping:`, error);
        }
    }

    // Register Stop Typing (Ctrl+Alt+X / Cmd+Alt+X)
    if (keybinds.stopTyping) {
        try {
            globalShortcut.register(keybinds.stopTyping, () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    sendToRenderer('invigilator:stop-typing');
                }
            });
        } catch (error) {
            console.error(`[HOTKEYS] Failed to register stopTyping:`, error);
        }
    }

    // Register Toggle Listen & Answer shortcut (Ctrl+Space / Cmd+Space)
    if (keybinds.toggleListenAnswer) {
        try {
            globalShortcut.register(keybinds.toggleListenAnswer, () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    sendToRenderer('toggle-listen-answer');
                }
            });
        } catch (error) {
            console.error(`[HOTKEYS] Failed to register toggleListenAnswer (${keybinds.toggleListenAnswer}):`, error);
        }
    }

    // Register Project Copilot shortcut
    if (keybinds.projectCopilot) {
        try {
            globalShortcut.register(keybinds.projectCopilot, () => {
                const { ipcMain } = require('electron');
                ipcMain.emit('trigger-project-copilot');
            });
        } catch (error) {
            console.error(`[HOTKEYS] Failed to register projectCopilot (${keybinds.projectCopilot}):`, error);
        }
    }

    console.log('[SYSTEM] Shortcuts registered successfully');
}

function setupWindowIpcHandlers(mainWindow, sendToRenderer, geminiSessionRef) {
    ipcMain.on('update-keybinds', (event, newKeybinds) => {
        try {
            storage.setKeybinds(newKeybinds);
            const defaultKeybinds = getDefaultKeybinds();
            const mergedKeybinds = { ...defaultKeybinds, ...newKeybinds };
            updateGlobalShortcuts(mergedKeybinds, mainWindow, sendToRenderer, geminiSessionRef);
            console.log('Keybinds updated successfully via IPC');
        } catch (error) {
            console.error('Failed to update keybinds via IPC:', error);
        }
    });

    ipcMain.on('view-changed', (event, view) => {
        if (view !== 'assistant' && !mainWindow.isDestroyed()) {
            mainWindow.setIgnoreMouseEvents(false);
        }
    });

    ipcMain.handle('window-minimize', () => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.minimize();
        }
    });

    ipcMain.on('invigilator:hide-window', () => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.hide();
            console.log('[IPC] Invigilator mode: hid window');
        }
    });

    ipcMain.on('invigilator:show-window', () => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.showInactive();
            console.log('[IPC] Invigilator mode: showed window');
        }
    });

    ipcMain.on('update-keybinds', (event, newKeybinds) => {
        if (!mainWindow.isDestroyed()) {
            updateGlobalShortcuts(newKeybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }
    });

    ipcMain.handle('toggle-window-visibility', async event => {
        try {
            if (mainWindow.isDestroyed()) {
                return { success: false, error: 'Window has been destroyed' };
            }

            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.showInactive();
            }
            return { success: true };
        } catch (error) {
            console.error('Error toggling window visibility:', error);
            return { success: false, error: error.message };
        }
    });

    function animateWindowResize(mainWindow, targetWidth, targetHeight, layoutMode) {
        return new Promise(resolve => {
            if (mainWindow.isDestroyed()) {
                resolve();
                return;
            }

            if (resizeAnimation) {
                clearInterval(resizeAnimation);
                resizeAnimation = null;
            }

            const [startWidth, startHeight] = mainWindow.getSize();

            if (startWidth === targetWidth && startHeight === targetHeight) {
                resolve();
                return;
            }

            windowResizing = true;
            mainWindow.setResizable(true);

            const frameRate = 60;
            const totalFrames = Math.floor(RESIZE_ANIMATION_DURATION / (1000 / frameRate));
            let currentFrame = 0;

            const widthDiff = targetWidth - startWidth;
            const heightDiff = targetHeight - startHeight;

            resizeAnimation = setInterval(() => {
                currentFrame++;
                const progress = currentFrame / totalFrames;
                const easedProgress = 1 - Math.pow(1 - progress, 3);

                const currentWidth = Math.round(startWidth + widthDiff * easedProgress);
                const currentHeight = Math.round(startHeight + heightDiff * easedProgress);

                if (!mainWindow || mainWindow.isDestroyed()) {
                    clearInterval(resizeAnimation);
                    resizeAnimation = null;
                    windowResizing = false;
                    return;
                }
                mainWindow.setSize(currentWidth, currentHeight);

                const primaryDisplay = screen.getPrimaryDisplay();
                const { width: screenWidth } = primaryDisplay.workAreaSize;
                const x = Math.floor((screenWidth - currentWidth) / 2);
                const y = 0;
                mainWindow.setPosition(x, y);

                if (currentFrame >= totalFrames) {
                    clearInterval(resizeAnimation);
                    resizeAnimation = null;
                    windowResizing = false;

                    if (!mainWindow.isDestroyed()) {
                        mainWindow.setSize(targetWidth, targetHeight);
                        const finalX = Math.floor((screenWidth - targetWidth) / 2);
                        mainWindow.setPosition(finalX, 0);
                    }

                    resolve();
                }
            }, 1000 / frameRate);
        });
    }

    ipcMain.handle('update-sizes', async event => {
        try {
            if (mainWindow.isDestroyed()) {
                return { success: false, error: 'Window has been destroyed' };
            }

            let viewName, layoutMode;
            try {
                viewName = await event.sender.executeJavaScript('cheatingDaddy.getCurrentView()');
                layoutMode = await event.sender.executeJavaScript('cheatingDaddy.getLayoutMode()');
            } catch (error) {
                viewName = 'main';
                layoutMode = 'normal';
            }

            const prefs = storage.getPreferences();
            let targetWidth, targetHeight;
            const baseWidth = layoutMode === 'compact' ? 700 : prefs.windowWidth || 509;
            const baseHeight = layoutMode === 'compact' ? 500 : prefs.windowHeight || 352;

            switch (viewName) {
                case 'main':
                    targetWidth = baseWidth;
                    targetHeight = baseHeight;
                    break;
                case 'customize':
                case 'settings':
                    targetWidth = baseWidth;
                    targetHeight = layoutMode === 'compact' ? 700 : 800;
                    break;
                case 'help':
                    targetWidth = baseWidth;
                    targetHeight = layoutMode === 'compact' ? 650 : 750;
                    break;
                case 'history':
                    targetWidth = baseWidth;
                    targetHeight = layoutMode === 'compact' ? 650 : 750;
                    break;
                case 'assistant':
                case 'onboarding':
                default:
                    targetWidth = baseWidth;
                    targetHeight = baseHeight;
                    break;
            }

            await animateWindowResize(mainWindow, targetWidth, targetHeight, `${viewName} view (${layoutMode})`);

            return { success: true };
        } catch (error) {
            console.error('Error updating sizes:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = {
    createWindow,
    getDefaultKeybinds,
    updateGlobalShortcuts,
    setupWindowIpcHandlers,
};
