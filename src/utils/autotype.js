/**
 * Auto-Type Engine - Keyboard simulation system for typing code into exam fields
 *
 * Provides four typing modes:
 * 1. Char-by-Char: Types characters with randomized delays (40-80ms) for natural appearance
 * 2. Instant: Types all characters at maximum speed for quick entry
 * 3. Word-by-Word: Types words separated by delays for emphasis
 * 4. Line-by-Line: Types lines separated by delays with automatic newlines
 */

/**
 * Global typing state
 */
export const typingState = {
    isTyping: false,
    isPaused: false,
    shouldStop: false,
};

export function getTypingState() {
    return typingState;
}

/**
 * Get keyboard control object from Electron or fallback
 * @returns {Object} Keyboard control object with sendKey method
 */
export function getKeyboardControl() {
    try {
        const resolveElectronModule = () => {
            if (typeof window !== 'undefined' && typeof window.require === 'function') {
                try {
                    return window.require('electron');
                } catch {
                    return null;
                }
            }

            if (typeof globalThis !== 'undefined' && typeof globalThis.require === 'function') {
                try {
                    return globalThis.require('electron');
                } catch {
                    return null;
                }
            }

            if (typeof require === 'function') {
                try {
                    return require('electron');
                } catch {
                    return null;
                }
            }

            return null;
        };

        const electronModule = resolveElectronModule();
        const ipcRenderer = electronModule?.ipcRenderer || electronModule?.remote?.ipcRenderer;

        return {
            sendKey: async key => {
                const normalizedKey = typeof key === 'string' ? key : String(key);

                if (ipcRenderer?.invoke) {
                    try {
                        await ipcRenderer.invoke('keyboard:send-key-sync', normalizedKey);
                        return;
                    } catch (err) {
                        console.warn(`[AutoType] Could not send key "${normalizedKey}" via invoke:`, err?.message || err);
                    }
                }

                if (ipcRenderer?.send) {
                    try {
                        ipcRenderer.send('keyboard:send-key', normalizedKey);
                        return;
                    } catch (err) {
                        console.warn(`[AutoType] Could not send key "${normalizedKey}" via send:`, err?.message || err);
                    }
                }

                console.log(`[AutoType] Sent key: ${normalizedKey}`);
            },
            typeText: async (text, mode = 'instant', options = {}) => {
                if (ipcRenderer?.invoke) {
                    try {
                        await ipcRenderer.invoke('keyboard:type-text', { text, mode, ...options });
                        return;
                    } catch (err) {
                        console.warn(`[AutoType] Could not type text via invoke:`, err?.message || err);
                    }
                }
                console.log(`[AutoType] Typed text (${mode}): ${text.length} chars`);
            },
        };
    } catch (err) {
        console.warn('[AutoType] Failed to initialize keyboard control:', err?.message || err);
        return {
            sendKey: async key => {
                console.log(`[AutoType] (Fallback) Sent key: ${key}`);
            },
            typeText: async (text, mode = 'instant') => {
                console.log(`[AutoType] (Fallback) Typed text (${mode}): ${text.length} chars`);
            },
        };
    }
}

/**
 * Create an autotyper instance with injected keyboard control
 * @param {Object} keyboard - Keyboard control object with sendKey method
 * @returns {Object} Autotyper instance with typing methods
 */
export function createAutotyper(keyboard) {
    return {
        /**
         * Type text character-by-character with randomized delays for natural appearance
         * @param {string} text - Text to type
         * @param {Object} options - Configuration options
         * @param {number} options.minDelay - Minimum delay between keystrokes in ms (default: 40)
         * @param {number} options.maxDelay - Maximum delay between keystrokes in ms (default: 80)
         * @returns {Promise<void>}
         */
        typeCharByChar: async (text, options = {}) => {
            const { minDelay = 40, maxDelay = 80 } = options;

            typingState.isTyping = true;
            typingState.isPaused = false;
            typingState.shouldStop = false;

            console.log(`[AutoType] Starting char-by-char typing (${text.length} chars, ${minDelay}-${maxDelay}ms delays)`);

            if (keyboard.typeText) {
                await keyboard.typeText(text, 'charByChar', { minDelay, maxDelay });
            } else {
                for (const char of text) {
                    if (typingState.shouldStop) {
                        console.log('[AutoType] Typing stopped by user');
                        break;
                    }

                    while (typingState.isPaused && !typingState.shouldStop) {
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }

                    if (typingState.shouldStop) break;

                    await keyboard.sendKey(char);

                    // Randomize delay to mimic natural typing
                    const delay = Math.random() * (maxDelay - minDelay) + minDelay;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            typingState.isTyping = false;
            console.log('[AutoType] Typing complete');
        },

        /**
         * Type text instantly at maximum speed
         * @param {string} text - Text to type
         * @param {Object} options - Configuration options (minDelay defaults to 1ms)
         * @returns {Promise<void>}
         */
        typeInstant: async (text, options = {}) => {
            typingState.isTyping = true;
            typingState.isPaused = false;
            typingState.shouldStop = false;

            console.log(`[AutoType] Starting instant typing (${text.length} chars)`);

            if (keyboard.typeText) {
                await keyboard.typeText(text, 'instant', options);
            } else {
                for (const char of text) {
                    if (typingState.shouldStop) break;
                    while (typingState.isPaused && !typingState.shouldStop) {
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                    if (typingState.shouldStop) break;
                    await keyboard.sendKey(char);
                }
            }

            typingState.isTyping = false;
            console.log('[AutoType] Instant typing complete');
        },

        /**
         * Type text word-by-word with delays between words
         * @param {string} text - Text to type
         * @param {Object} options - Configuration options
         * @param {number} options.charDelay - Delay between characters within a word in ms (default: 20ms, half of charByChar)
         * @param {number} options.wordDelay - Delay between words in ms (default: 120ms, 3x charByChar)
         * @returns {Promise<void>}
         */
        typeWordByWord: async (text, options = {}) => {
            const { charDelay = 20, wordDelay = 120 } = options;

            typingState.isTyping = true;
            typingState.isPaused = false;
            typingState.shouldStop = false;

            // Split by spaces and newlines while preserving them
            const words = text.split(/( |\n|\t)/);

            console.log(`[AutoType] Starting word-by-word typing (${words.length} words, ${charDelay}ms char delay, ${wordDelay}ms word delay)`);

            if (keyboard.typeText) {
                await keyboard.typeText(text, 'wordByWord', { charDelay, wordDelay });
            } else {
                for (const word of words) {
                    if (typingState.shouldStop) {
                        console.log('[AutoType] Typing stopped by user');
                        break;
                    }

                    while (typingState.isPaused && !typingState.shouldStop) {
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }

                    if (typingState.shouldStop) break;

                    if (word === '\n') {
                        await keyboard.sendKey('Enter');
                        await new Promise(resolve => setTimeout(resolve, wordDelay));
                    } else if (word === '\t') {
                        await keyboard.sendKey('Tab');
                        await new Promise(resolve => setTimeout(resolve, wordDelay));
                    } else if (word === ' ') {
                        await keyboard.sendKey(' ');
                        await new Promise(resolve => setTimeout(resolve, wordDelay));
                    } else if (word.length > 0) {
                        // Type each character in the word with charDelay
                        for (const char of word) {
                            if (typingState.shouldStop) break;
                            while (typingState.isPaused && !typingState.shouldStop) {
                                await new Promise(resolve => setTimeout(resolve, 50));
                            }
                            if (typingState.shouldStop) break;

                            await keyboard.sendKey(char);
                            await new Promise(resolve => setTimeout(resolve, charDelay));
                        }
                        // Pause after word before next word
                        await new Promise(resolve => setTimeout(resolve, wordDelay));
                    }
                }
            }

            typingState.isTyping = false;
            console.log('[AutoType] Word-by-word typing complete');
        },

        /**
         * Type text line-by-line with delays between lines
         * @param {string} text - Text to type
         * @param {Object} options - Configuration options
         * @param {number} options.charDelay - Delay between characters within a line in ms (default: 20ms)
         * @param {number} options.lineDelay - Delay between lines in ms (default: 200ms, 5x charByChar)
         * @returns {Promise<void>}
         */
        typeLineByLine: async (text, options = {}) => {
            const { charDelay = 20, lineDelay = 200 } = options;

            typingState.isTyping = true;
            typingState.isPaused = false;
            typingState.shouldStop = false;

            const lines = text.split('\n');

            console.log(`[AutoType] Starting line-by-line typing (${lines.length} lines, ${charDelay}ms char delay, ${lineDelay}ms line delay)`);

            if (keyboard.typeText) {
                await keyboard.typeText(text, 'lineByLine', { charDelay, lineDelay });
            } else {
                for (let i = 0; i < lines.length; i++) {
                    if (typingState.shouldStop) {
                        console.log('[AutoType] Typing stopped by user');
                        break;
                    }

                    while (typingState.isPaused && !typingState.shouldStop) {
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }

                    if (typingState.shouldStop) break;

                    const line = lines[i];

                    // Type each character in the line
                    for (const char of line) {
                        if (typingState.shouldStop) break;
                        while (typingState.isPaused && !typingState.shouldStop) {
                            await new Promise(resolve => setTimeout(resolve, 50));
                        }
                        if (typingState.shouldStop) break;

                        await keyboard.sendKey(char);
                        await new Promise(resolve => setTimeout(resolve, charDelay));
                    }

                    if (typingState.shouldStop) break;

                    // Send newline if not the last line
                    if (i < lines.length - 1) {
                        await keyboard.sendKey('Enter');
                    }

                    // Pause after line
                    await new Promise(resolve => setTimeout(resolve, lineDelay));
                }
            }

            typingState.isTyping = false;
            console.log('[AutoType] Line-by-line typing complete');
        },

        /**
         * Send a special key (Enter, Tab, Backspace, etc.)
         * @param {string} key - Special key name
         * @returns {Promise<void>}
         */
        sendSpecialKey: async key => {
            console.log(`[AutoType] Sending special key: ${key}`);
            await keyboard.sendKey(key);
        },
    };
}

/**
 * Type text character-by-character with randomized delays
 * Helper function for direct use without creating an autotyper instance
 * @param {string} text - Text to type
 * @param {Object} options - Configuration options
 * @returns {Promise<void>}
 */
export async function typeCharByChar(text, options = {}) {
    const keyboard = getKeyboardControl();
    const autotyper = createAutotyper(keyboard);
    return autotyper.typeCharByChar(text, options);
}

/**
 * Type text instantly
 * Helper function for direct use without creating an autotyper instance
 * @param {string} text - Text to type
 * @param {Object} options - Configuration options
 * @returns {Promise<void>}
 */
export async function typeInstant(text, options = {}) {
    const keyboard = getKeyboardControl();
    const autotyper = createAutotyper(keyboard);
    return autotyper.typeInstant(text, options);
}

/**
 * Send a special key
 * Helper function for direct use without creating an autotyper instance
 * @param {string} key - Special key name
 * @returns {Promise<void>}
 */
export async function sendSpecialKey(key) {
    const keyboard = getKeyboardControl();
    const autotyper = createAutotyper(keyboard);
    return autotyper.sendSpecialKey(key);
}

/**
 * Type text word-by-word
 * Helper function for direct use without creating an autotyper instance
 * @param {string} text - Text to type
 * @param {Object} options - Configuration options
 * @returns {Promise<void>}
 */
export async function typeWordByWord(text, options = {}) {
    const keyboard = getKeyboardControl();
    const autotyper = createAutotyper(keyboard);
    return autotyper.typeWordByWord(text, options);
}

/**
 * Type text line-by-line
 * Helper function for direct use without creating an autotyper instance
 * @param {string} text - Text to type
 * @param {Object} options - Configuration options
 * @returns {Promise<void>}
 */
export async function typeLineByLine(text, options = {}) {
    const keyboard = getKeyboardControl();
    const autotyper = createAutotyper(keyboard);
    return autotyper.typeLineByLine(text, options);
}

/**
 * Stop typing
 */
export function stopTyping() {
    if (typingState.isTyping) {
        typingState.shouldStop = true;
        typingState.isPaused = false;
        typingState.isTyping = false;
        console.log('[AutoType] Stop signal sent');

        // Kill any running PowerShell typing process
        try {
            const getElectron = () => {
                if (typeof window !== 'undefined' && typeof window.require === 'function') {
                    return window.require('electron');
                }
                return null;
            };
            const electron = getElectron();
            if (electron?.ipcRenderer?.invoke) {
                electron.ipcRenderer.invoke('keyboard:kill-typing').catch(() => {});
            }
        } catch (e) {
            // Ignore errors - best effort kill
        }
    }
}

/**
 * Pause typing
 */
export function pauseTyping() {
    if (typingState.isTyping && !typingState.isPaused) {
        typingState.isPaused = true;
        console.log('[AutoType] Paused');

        // Pause any running PowerShell typing process
        try {
            const getElectron = () => {
                if (typeof window !== 'undefined' && typeof window.require === 'function') {
                    return window.require('electron');
                }
                return null;
            };
            const electron = getElectron();
            if (electron?.ipcRenderer?.invoke) {
                electron.ipcRenderer.invoke('keyboard:pause-typing').catch(() => {});
            }
        } catch (e) {}
    }
}

/**
 * Resume typing
 */
export function resumeTyping() {
    if (typingState.isTyping && typingState.isPaused) {
        typingState.isPaused = false;
        console.log('[AutoType] Resumed');

        // Resume any running PowerShell typing process
        try {
            const getElectron = () => {
                if (typeof window !== 'undefined' && typeof window.require === 'function') {
                    return window.require('electron');
                }
                return null;
            };
            const electron = getElectron();
            if (electron?.ipcRenderer?.invoke) {
                electron.ipcRenderer.invoke('keyboard:resume-typing').catch(() => {});
            }
        } catch (e) {}
    }
}

/**
 * Toggle Pause/Resume
 */
export function togglePauseTyping() {
    if (!typingState.isTyping) return;

    if (typingState.isPaused) {
        resumeTyping();
    } else {
        pauseTyping();
    }
}
