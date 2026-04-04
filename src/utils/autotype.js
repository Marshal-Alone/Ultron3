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
 * Get keyboard control object from Electron or fallback
 * @returns {Object} Keyboard control object with sendKey method
 */
export function getKeyboardControl() {
  try {
    // Check if we're in Electron context
    const { BrowserWindow } = window.require ? window.require('electron').remote || {} : {};
    
    // Return keyboard object that uses native keyboard simulation
    return {
      sendKey: async (key) => {
        // Call main process to simulate keyboard
        if (window.require) {
          try {
            const { ipcRenderer } = window.require('electron');
            // Use invoke to wait for the key to be sent
            await ipcRenderer.invoke('keyboard:send-key-sync', key);
            // Add a small delay to ensure the key press is registered
            await new Promise(resolve => setTimeout(resolve, 5));
          } catch (err) {
            console.warn(`[AutoType] Could not send key "${key}" via IPC:`, err.message);
          }
        } else {
          console.log(`[AutoType] Sent key: ${key}`);
        }
      },
    };
  } catch (err) {
    console.warn('[AutoType] Failed to initialize keyboard control:', err.message);
    // Fallback implementation
    return {
      sendKey: async (key) => {
        console.log(`[AutoType] (Fallback) Sent key: ${key}`);
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
      
      console.log(`[AutoType] Starting char-by-char typing (${text.length} chars, ${minDelay}-${maxDelay}ms delays)`);
      
      for (const char of text) {
        await keyboard.sendKey(char);
        
        // Randomize delay to mimic natural typing
        const delay = Math.random() * (maxDelay - minDelay) + minDelay;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      console.log('[AutoType] Typing complete');
    },

    /**
     * Type text instantly at maximum speed
     * @param {string} text - Text to type
     * @param {Object} options - Configuration options (minDelay defaults to 1ms)
     * @returns {Promise<void>}
     */
    typeInstant: async (text, options = {}) => {
      const { minDelay = 1, maxDelay = 1 } = options;
      
      console.log(`[AutoType] Starting instant typing (${text.length} chars)`);
      
      for (const char of text) {
        await keyboard.sendKey(char);
        
        // Minimal delay for instant mode
        const delay = Math.random() * (maxDelay - minDelay) + minDelay;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
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
      
      // Split by spaces and newlines while preserving them
      const words = text.split(/( |\n|\t)/);
      
      console.log(`[AutoType] Starting word-by-word typing (${words.length} words, ${charDelay}ms char delay, ${wordDelay}ms word delay)`);
      
      for (const word of words) {
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
            await keyboard.sendKey(char);
            await new Promise(resolve => setTimeout(resolve, charDelay));
          }
          // Pause after word before next word
          await new Promise(resolve => setTimeout(resolve, wordDelay));
        }
      }
      
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
      
      const lines = text.split('\n');
      
      console.log(`[AutoType] Starting line-by-line typing (${lines.length} lines, ${charDelay}ms char delay, ${lineDelay}ms line delay)`);
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Type each character in the line
        for (const char of line) {
          await keyboard.sendKey(char);
          await new Promise(resolve => setTimeout(resolve, charDelay));
        }
        
        // Send newline if not the last line
        if (i < lines.length - 1) {
          await keyboard.sendKey('Enter');
        }
        
        // Pause after line
        await new Promise(resolve => setTimeout(resolve, lineDelay));
      }
      
      console.log('[AutoType] Line-by-line typing complete');
    },

    /**
     * Send a special key (Enter, Tab, Backspace, etc.)
     * @param {string} key - Special key name
     * @returns {Promise<void>}
     */
    sendSpecialKey: async (key) => {
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
