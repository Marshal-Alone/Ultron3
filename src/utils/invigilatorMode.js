/**
 * Invigilator Mode State Manager
 * 
 * Manages the state of Invigilator Mode including:
 * - Active/inactive mode state
 * - Typing mode (charByChar or instant)
 * - Answer preview visibility
 * - Last captured answer code
 * - Event callbacks for state changes
 */

export class InvigilatorModeManager {
  constructor() {
    // State properties
    this.isActive = false;
    this.typingMode = 'charByChar'; // 'charByChar' or 'instant'
    this.previewWindowVisible = false;
    this.lastAnswerCode = '';

    // Event subscribers
    this.modeToggleCallbacks = [];
    this.typingModeChangeCallbacks = [];
    this.previewShowCallbacks = [];
  }

  /**
   * Toggle invigilator mode ON/OFF
   * @returns {boolean} New state (true = ON, false = OFF)
   */
  toggleMode() {
    this.isActive = !this.isActive;
    console.log(`[InvigilatorMode] Mode toggled: ${this.isActive ? 'ON' : 'OFF'}`);
    
    // Notify all subscribers
    this.modeToggleCallbacks.forEach(callback => {
      callback({ isActive: this.isActive });
    });
    
    return this.isActive;
  }

  /**
   * Set typing mode explicitly
   * @param {string} mode - 'charByChar', 'wordByWord', 'lineByLine', or 'instant'
   */
  setTypingMode(mode) {
    const validModes = ['charByChar', 'wordByWord', 'lineByLine', 'instant'];
    if (!validModes.includes(mode)) {
      console.warn(`[InvigilatorMode] Invalid typing mode: ${mode}. Using charByChar.`);
      mode = 'charByChar';
    }
    
    this.typingMode = mode;
    console.log(`[InvigilatorMode] Typing mode changed: ${mode}`);
    
    // Notify all subscribers
    this.typingModeChangeCallbacks.forEach(callback => {
      callback({ typingMode: this.typingMode });
    });
  }

  /**
   * Toggle between typing modes (charByChar -> wordByWord -> lineByLine -> instant -> charByChar)
   */
  toggleTypingMode() {
    const modes = ['charByChar', 'wordByWord', 'lineByLine', 'instant'];
    const currentIndex = modes.indexOf(this.typingMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    
    this.typingMode = modes[nextIndex];
    console.log(`[InvigilatorMode] Typing mode toggled to: ${this.typingMode}`);
    
    // Notify all subscribers
    this.typingModeChangeCallbacks.forEach(callback => {
      callback({ typingMode: this.typingMode });
    });
  }

  /**
   * Store answer code and trigger preview display
   * @param {string} code - Answer code to type
   */
  setAnswerCode(code) {
    this.lastAnswerCode = code;
    console.log(`[InvigilatorMode] Answer code set (${code.length} chars)`);
    
    // Trigger preview show callbacks
    this.previewShowCallbacks.forEach(callback => {
      callback({ code });
    });
  }

  /**
   * Show or hide the answer preview window
   * @param {boolean} visible - true to show, false to hide
   */
  setPreviewVisible(visible) {
    this.previewWindowVisible = visible;
    console.log(`[InvigilatorMode] Preview ${visible ? 'shown' : 'hidden'}`);
  }

  /**
   * Get complete state snapshot
   * @returns {Object} Current state object
   */
  getState() {
    return {
      isActive: this.isActive,
      typingMode: this.typingMode,
      previewWindowVisible: this.previewWindowVisible,
      lastAnswerCode: this.lastAnswerCode,
    };
  }

  /**
   * Register a callback for mode toggle events
   * @param {Function} callback - Function to call on mode change
   */
  onModeToggle(callback) {
    this.modeToggleCallbacks.push(callback);
  }

  /**
   * Register a callback for typing mode change events
   * @param {Function} callback - Function to call on typing mode change
   */
  onTypingModeChange(callback) {
    this.typingModeChangeCallbacks.push(callback);
  }

  /**
   * Register a callback for when answer code is set (preview should show)
   * @param {Function} callback - Function to call when preview should show
   */
  onPreviewShow(callback) {
    this.previewShowCallbacks.push(callback);
  }
}

// Export singleton instance for global use
export const invigilatorMode = new InvigilatorModeManager();
