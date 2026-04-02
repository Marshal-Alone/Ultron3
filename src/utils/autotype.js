/**
 * Auto-Type Engine - Keyboard simulation system for typing code into exam fields
 * 
 * Provides two typing modes:
 * 1. Char-by-Char: Types characters with randomized delays (40-80ms) for natural appearance
 * 2. Instant: Types all characters at maximum speed for quick entry
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
            // Send key to be simulated by main process
            ipcRenderer.send('keyboard:send-key', key);
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
