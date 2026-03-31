const { screen, globalShortcut, BrowserWindow, clipboard, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('os');
const storage = require('../storage');

let mouseEventsIgnored = false;
let windowResizing = false;
let resizeAnimation = null;
const RESIZE_ANIMATION_DURATION = 500; // milliseconds

function createWindow(sendToRenderer, geminiSessionRef) {
    // Get saved window size from storage, or use defaults
    const savedSize = storage.getWindowSize();
    let windowWidth = savedSize.width || 1100;
    let windowHeight = savedSize.height || 800;

    const mainWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        frame: false,
        transparent: true,
        hasShadow: false,
        alwaysOnTop: true,
        focusable: true,       // Allow keyboard input by default (stealth mode can disable)
        skipTaskbar: true,     // Don't show in taskbar
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // TODO: change to true
            backgroundThrottling: false,
            enableBlinkFeatures: 'GetDisplayMedia',
            webSecurity: true,
            allowRunningInsecureContent: false,
        },
        backgroundColor: '#00000000',
    });

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
    
    // Listen for window resize events and save the size
    mainWindow.on('resized', () => {
        const [width, height] = mainWindow.getSize();
        storage.setWindowSize(width, height);
    });

    // Make window invisible to screen capture and recording software
    // This is critical for the app's purpose - hiding from screen shares
    mainWindow.setContentProtection(true);

    // Center window at the top of the screen
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.workAreaSize;
    const x = Math.floor((screenWidth - windowWidth) / 2);
    const y = 0;
    mainWindow.setPosition(x, y);

    if (process.platform === 'win32') {
        mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    }

    mainWindow.loadFile(path.join(__dirname, '../index.html'));

    // After window is created, initialize keybinds
    mainWindow.webContents.once('dom-ready', () => {
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
        quickStartGroq: isMac ? 'Cmd+Shift+S' : 'Ctrl+Shift+S',
        quickStop: 'Alt+S',
        killSwitch: isMac ? 'Cmd+Shift+Delete' : 'Ctrl+Shift+Delete',
        quickStop: 'Alt+S',
        killSwitch: isMac ? 'Cmd+Shift+Delete' : 'Ctrl+Shift+Delete',
    };
}

function updateGlobalShortcuts(keybinds, mainWindow, sendToRenderer, geminiSessionRef) {
    console.log('Updating global shortcuts with:', keybinds);

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
                console.log(`Registered ${action}: ${keybind}`);
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
            console.log(`Registered toggleVisibility: ${keybinds.toggleVisibility}`);
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
                    console.log('Mouse events ignored');
                } else {
                    mainWindow.setIgnoreMouseEvents(false);
                    console.log('Mouse events enabled');
                }
                mainWindow.webContents.send('click-through-toggled', mouseEventsIgnored);
            });
            console.log(`Registered toggleClickThrough: ${keybinds.toggleClickThrough}`);
        } catch (error) {
            console.error(`Failed to register toggleClickThrough (${keybinds.toggleClickThrough}):`, error);
        }
    }

    // Register next step shortcut (either starts session or takes screenshot based on view)
    if (keybinds.nextStep) {
        const nextStepHandler = async () => {
            console.log('=== NEXT STEP SHORTCUT TRIGGERED ===');
            try {
                const isMac = process.platform === 'darwin';
                const shortcutKey = isMac ? 'cmd+enter' : 'ctrl+enter';
                console.log('Executing JavaScript in renderer...');
                await mainWindow.webContents.executeJavaScript(`
                    console.log('Shortcut received in renderer');
                    cheatingDaddy.handleShortcut('${shortcutKey}');
                `);
                console.log('JavaScript execution completed');
            } catch (error) {
                console.error('Error handling next step shortcut:', error);
            }
        };

        try {
            // Try different formats for the shortcut
            let keybind = keybinds.nextStep;
            let registered = globalShortcut.register(keybind, nextStepHandler);

            // If Ctrl+Enter failed, try alternative formats
            if (!registered) {
                console.log(`${keybind} failed, trying alternatives...`);

                // Try CommandOrControl+Return
                registered = globalShortcut.register('CommandOrControl+Return', nextStepHandler);
                if (registered) {
                    console.log('Registered nextStep with: CommandOrControl+Return');
                }

                // Try F9 as fallback (commonly available)
                if (!registered) {
                    registered = globalShortcut.register('F9', nextStepHandler);
                    if (registered) {
                        console.log('Registered nextStep with fallback: F9');
                    }
                }

                // Try Ctrl+Shift+A as another fallback
                if (!registered) {
                    registered = globalShortcut.register('Ctrl+Shift+A', nextStepHandler);
                    if (registered) {
                        console.log('Registered nextStep with fallback: Ctrl+Shift+A');
                    }
                }
            }

            console.log(`Registered nextStep: ${keybinds.nextStep} - success: ${registered}`);
            if (!registered) {
                console.warn('WARNING: Could not register any nextStep shortcut! Try pressing F9 or change in Settings.');
            }
        } catch (error) {
            console.error(`Failed to register nextStep (${keybinds.nextStep}):`, error);
        }
    }

    // Register previous response shortcut
    if (keybinds.previousResponse) {
        try {
            globalShortcut.register(keybinds.previousResponse, () => {
                console.log('Previous response shortcut triggered');
                sendToRenderer('navigate-previous-response');
            });
            console.log(`Registered previousResponse: ${keybinds.previousResponse}`);
        } catch (error) {
            console.error(`Failed to register previousResponse (${keybinds.previousResponse}):`, error);
        }
    }

    // Register next response shortcut
    if (keybinds.nextResponse) {
        try {
            globalShortcut.register(keybinds.nextResponse, () => {
                console.log('Next response shortcut triggered');
                sendToRenderer('navigate-next-response');
            });
            console.log(`Registered nextResponse: ${keybinds.nextResponse}`);
        } catch (error) {
            console.error(`Failed to register nextResponse (${keybinds.nextResponse}):`, error);
        }
    }

    // Register scroll up shortcut
    if (keybinds.scrollUp) {
        try {
            globalShortcut.register(keybinds.scrollUp, () => {
                console.log('Scroll up shortcut triggered');
                sendToRenderer('scroll-response-up');
            });
            console.log(`Registered scrollUp: ${keybinds.scrollUp}`);
        } catch (error) {
            console.error(`Failed to register scrollUp (${keybinds.scrollUp}):`, error);
        }
    }

    // Register scroll down shortcut
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
            console.log(`Registered emergencyErase: ${keybinds.emergencyErase}`);
        } catch (error) {
            console.error(`Failed to register emergencyErase (${keybinds.emergencyErase}):`, error);
        }
    }

    // Register toggle AI provider shortcut (Ctrl+Alt+Enter)
    try {
        const registered = globalShortcut.register('Ctrl+Alt+Return', async () => {
            console.log('Toggle AI provider shortcut triggered');
            try {
                const storage = require('../storage');
                const prefs = storage.getPreferences();
                const currentProvider = prefs.aiProvider || 'gemini';
                const newProvider = currentProvider === 'gemini' ? 'groq' : 'gemini';

                // Update the preference
                storage.updatePreference('aiProvider', newProvider);

                console.log(`Switched AI provider from ${currentProvider} to ${newProvider}`);

                // Notify the renderer to update UI
                sendToRenderer('ai-provider-changed', newProvider);
            } catch (error) {
                console.error('Error toggling AI provider:', error);
            }
        });
        console.log(`Registered toggleAiProvider: Ctrl+Alt+Enter - success: ${registered}`);
    } catch (error) {
        console.error('Failed to register toggleAiProvider:', error);
    }

    // Register transparency adjustment shortcuts
    if (keybinds.decreaseTransparency) {
        try {
            globalShortcut.register(keybinds.decreaseTransparency, () => {
                console.log('Decrease transparency shortcut triggered');
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('adjust-transparency', -0.1);
                }
            });
            console.log(`Registered decreaseTransparency: ${keybinds.decreaseTransparency}`);
        } catch (error) {
            console.error(`Failed to register decreaseTransparency:`, error);
        }
    }

    if (keybinds.increaseTransparency) {
        try {
            globalShortcut.register(keybinds.increaseTransparency, () => {
                console.log('Increase transparency shortcut triggered');
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('adjust-transparency', 0.1);
                }
            });
            console.log(`Registered increaseTransparency: ${keybinds.increaseTransparency}`);
        } catch (error) {
            console.error(`Failed to register increaseTransparency:`, error);
        }
    }

    // Register font size adjustment shortcuts
    if (keybinds.decreaseFontSize) {
        try {
            globalShortcut.register(keybinds.decreaseFontSize, () => {
                console.log('Decrease font size shortcut triggered');
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('adjust-font-size', -2);
                }
            });
            console.log(`Registered decreaseFontSize: ${keybinds.decreaseFontSize}`);
        } catch (error) {
            console.error(`Failed to register decreaseFontSize:`, error);
        }
    }

    if (keybinds.increaseFontSize) {
        try {
            globalShortcut.register(keybinds.increaseFontSize, () => {
                console.log('Increase font size shortcut triggered');
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('adjust-font-size', 2);
                }
            });
            console.log(`Registered increaseFontSize: ${keybinds.increaseFontSize}`);
        } catch (error) {
            console.error(`Failed to register increaseFontSize:`, error);
        }
    }

    // Register Stealth Paste shortcut
    if (keybinds.askClipboard) {
        try {
            globalShortcut.register(keybinds.askClipboard, () => {
                const text = clipboard.readText();
                if (text && text.trim().length > 0) {
                    console.log('Stealth Clipboard Ask triggered');
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('clipboard-query', text);
                    }
                }
            });
            console.log(`Registered askClipboard: ${keybinds.askClipboard}`);
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

                console.log('Stealth Mode:', newMode ? 'OFF (Normal)' : 'ON (Locked/Unfocusable)');

                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('stealth-mode-changed', !newMode);
                }
            });
            console.log(`Registered toggleStealth: ${keybinds.toggleStealth}`);
        } catch (error) {
            console.error(`Failed to register toggleStealth:`, error);
        }
    }

    // Register Ctrl+Alt+N for navbar toggle
    if (keybinds.toggleNavbar) {
        try {
            globalShortcut.register(keybinds.toggleNavbar, () => {
                console.log('=== TOGGLE NAVBAR ===');
                sendToRenderer('toggle-navbar');
            });
            console.log(`Registered toggleNavbar: ${keybinds.toggleNavbar}`);
        } catch (error) {
            console.error(`Failed to register toggleNavbar:`, error);
        }
    }

    // ==================== QUICK START & KILL SWITCH ====================

    // Register Quick Start Groq shortcut (Ctrl+Shift+S / Cmd+Shift+S)
    const isMac = process.platform === 'darwin';
    const quickStartGroqShortcut = isMac ? 'Cmd+Shift+S' : 'Ctrl+Shift+S';
    try {
        globalShortcut.register(quickStartGroqShortcut, async () => {
            console.log('=== QUICK START GROQ SHORTCUT TRIGGERED ===');
            try {
                const storage = require('../storage');
                
                // Set Groq as the provider
                storage.updatePreference('aiProvider', 'groq');
                console.log('AI Provider set to: groq');

                // Notify renderer to start Groq session
                sendToRenderer('quick-start-groq');
                
            } catch (error) {
                console.error('Error in quick start Groq:', error);
            }
        });
        console.log(`Registered Quick Start Groq: ${quickStartGroqShortcut}`);
    } catch (error) {
        console.error(`Failed to register Quick Start Groq (${quickStartGroqShortcut}):`, error);
    }

    // Register Kill Switch shortcut (Ctrl+Shift+Delete / Cmd+Shift+Delete)
    const killSwitchShortcut = isMac ? 'Cmd+Shift+Delete' : 'Ctrl+Shift+Delete';
    try {
        globalShortcut.register(killSwitchShortcut, async () => {
            console.log('=== KILL SWITCH TRIGGERED ===');
            try {
                const storage = require('../storage');
                const { app } = require('electron');

                // Get current session ID from renderer (if exists)
                mainWindow.webContents.executeJavaScript(`
                    if (window.cheatingDaddy && window.cheatingDaddy.currentSessionId) {
                        window.electronbridge?.sendSync?.('kill-switch-export', window.cheatingDaddy.currentSessionId);
                    }
                `).catch(err => console.log('Could not get session ID from renderer'));

                // Brief delay to allow export
                setTimeout(() => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.hide();
                    }

                    // Close any active AI sessions
                    if (geminiSessionRef.current) {
                        geminiSessionRef.current.close();
                        geminiSessionRef.current = null;
                    }

                    console.log('Exiting application via kill switch');
                    process.exit(0); // Hard exit - no cleanup needed
                }, 500);
                
            } catch (error) {
                console.error('Error in kill switch:', error);
                process.exit(0); // Force exit on error
            }
        });
        console.log(`Registered Kill Switch: ${killSwitchShortcut}`);
    } catch (error) {
        console.error(`Failed to register Kill Switch (${killSwitchShortcut}):`, error);
    }

    // Register Quick Stop shortcut (Alt+S) - stops capture without closing app
    const quickStopShortcut = 'Alt+S';
    try {
        globalShortcut.register(quickStopShortcut, async () => {
            console.log('=== QUICK STOP SHORTCUT TRIGGERED ===');
            try {
                // Send stop signal to renderer to close capture session
                sendToRenderer('quick-stop');
                console.log('Quick stop signal sent to renderer');
            } catch (error) {
                console.error('Error in quick stop:', error);
            }
        });
        console.log(`Registered Quick Stop: ${quickStopShortcut}`);
    } catch (error) {
        console.error(`Failed to register Quick Stop (${quickStopShortcut}):`, error);
    }
}

function setupWindowIpcHandlers(mainWindow, sendToRenderer, geminiSessionRef) {
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

    ipcMain.on('update-keybinds', (event, newKeybinds) => {
        if (!mainWindow.isDestroyed()) {
            updateGlobalShortcuts(newKeybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }
    });

    ipcMain.handle('toggle-window-visibility', async (event) => {
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
        return new Promise((resolve) => {
            if (mainWindow.isDestroyed()) {
                console.log('Cannot animate resize: window has been destroyed');
                resolve();
                return;
            }

            if (resizeAnimation) {
                clearInterval(resizeAnimation);
                resizeAnimation = null;
            }

            const [startWidth, startHeight] = mainWindow.getSize();

            if (startWidth === targetWidth && startHeight === targetHeight) {
                console.log(`Window already at target size for ${layoutMode} mode`);
                resolve();
                return;
            }

            console.log(`Starting animated resize from ${startWidth}x${startHeight} to ${targetWidth}x${targetHeight}`);

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

                    console.log(`Animation complete: ${targetWidth}x${targetHeight}`);
                    resolve();
                }
            }, 1000 / frameRate);
        });
    }

    ipcMain.handle('update-sizes', async (event) => {
        try {
            if (mainWindow.isDestroyed()) {
                return { success: false, error: 'Window has been destroyed' };
            }

            let viewName, layoutMode;
            try {
                viewName = await event.sender.executeJavaScript('cheatingDaddy.getCurrentView()');
                layoutMode = await event.sender.executeJavaScript('cheatingDaddy.getLayoutMode()');
            } catch (error) {
                console.warn('Failed to get view/layout from renderer, using defaults:', error);
                viewName = 'main';
                layoutMode = 'normal';
            }

            console.log('Size update requested for view:', viewName, 'layout:', layoutMode);

            let targetWidth, targetHeight;
            const baseWidth = layoutMode === 'compact' ? 700 : 900;
            const baseHeight = layoutMode === 'compact' ? 500 : 600;

            switch (viewName) {
                case 'main':
                    targetWidth = baseWidth;
                    targetHeight = layoutMode === 'compact' ? 320 : 400;
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

            const [currentWidth, currentHeight] = mainWindow.getSize();
            console.log('Current window size:', currentWidth, 'x', currentHeight);

            if (windowResizing) {
                console.log('Interrupting current resize animation');
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
