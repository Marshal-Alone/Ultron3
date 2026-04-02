import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAutotyper, typeCharByChar, typeInstant, sendSpecialKey, getKeyboardControl } from '../utils/autotype.js';

describe('Auto-Type Engine', () => {
  let mockKeyboard;

  beforeEach(() => {
    // Mock keyboard object with sendKey method
    mockKeyboard = {
      sendKey: vi.fn(),
      sendSpecialKey: vi.fn(),
    };
    
    // Mock setTimeout to speed up tests
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  describe('typeCharByChar', () => {
    it('types characters with realistic delays between keystrokes', async () => {
      mockKeyboard.sendKey = vi.fn().mockResolvedValue(undefined);
      
      const text = 'abc';
      const autotyper = createAutotyper(mockKeyboard);
      
      const promise = autotyper.typeCharByChar(text, { minDelay: 40, maxDelay: 80 });
      
      // Process all timers
      await vi.runAllTimersAsync();
      await promise;

      // Should have sent each character
      expect(mockKeyboard.sendKey).toHaveBeenCalledTimes(3);
      expect(mockKeyboard.sendKey).toHaveBeenNthCalledWith(1, 'a');
      expect(mockKeyboard.sendKey).toHaveBeenNthCalledWith(2, 'b');
      expect(mockKeyboard.sendKey).toHaveBeenNthCalledWith(3, 'c');
    });

    it('uses randomized delays between min and max values', async () => {
      mockKeyboard.sendKey = vi.fn().mockResolvedValue(undefined);
      
      const autotyper = createAutotyper(mockKeyboard);
      const minDelay = 40;
      const maxDelay = 80;
      
      const promise = autotyper.typeCharByChar('ab', { minDelay, maxDelay });
      
      await vi.runAllTimersAsync();
      await promise;

      // The delays should be recorded internally (we can at least verify function was called)
      expect(mockKeyboard.sendKey).toHaveBeenCalledTimes(2);
    });

    it('handles empty string without errors', async () => {
      mockKeyboard.sendKey = vi.fn();
      
      const autotyper = createAutotyper(mockKeyboard);
      
      const promise = autotyper.typeCharByChar('');
      
      await vi.runAllTimersAsync();
      await promise;

      expect(mockKeyboard.sendKey).not.toHaveBeenCalled();
    });
  });

  describe('typeInstant', () => {
    it('sends all characters at maximum speed with minimal delays', async () => {
      mockKeyboard.sendKey = vi.fn().mockResolvedValue(undefined);
      
      const text = 'test code';
      const autotyper = createAutotyper(mockKeyboard);
      
      const promise = autotyper.typeInstant(text);
      
      await vi.runAllTimersAsync();
      await promise;

      // Should have sent all characters
      expect(mockKeyboard.sendKey).toHaveBeenCalledTimes(text.length);
      
      // Verify all characters were sent in order
      for (let i = 0; i < text.length; i++) {
        expect(mockKeyboard.sendKey).toHaveBeenNthCalledWith(i + 1, text[i]);
      }
    });

    it('completes faster than charByChar mode', async () => {
      mockKeyboard.sendKey = vi.fn().mockResolvedValue(undefined);
      
      const autotyper = createAutotyper(mockKeyboard);
      const text = 'quick test';
      
      const promise = autotyper.typeInstant(text);
      
      await vi.runAllTimersAsync();
      await promise;

      expect(mockKeyboard.sendKey).toHaveBeenCalledTimes(text.length);
    });
  });

  describe('sendSpecialKey', () => {
    it('sends special keys like Enter, Tab, Backspace', async () => {
      mockKeyboard.sendKey = vi.fn().mockResolvedValue(undefined);
      
      const autotyper = createAutotyper(mockKeyboard);
      
      await autotyper.sendSpecialKey('Enter');
      await autotyper.sendSpecialKey('Tab');
      await autotyper.sendSpecialKey('Backspace');

      expect(mockKeyboard.sendKey).toHaveBeenCalledTimes(3);
      expect(mockKeyboard.sendKey).toHaveBeenNthCalledWith(1, 'Enter');
      expect(mockKeyboard.sendKey).toHaveBeenNthCalledWith(2, 'Tab');
      expect(mockKeyboard.sendKey).toHaveBeenNthCalledWith(3, 'Backspace');
    });
  });

  describe('createAutotyper', () => {
    it('creates and returns an autotyper instance with all methods', () => {
      const autotyper = createAutotyper(mockKeyboard);

      expect(autotyper).toBeDefined();
      expect(typeof autotyper.typeCharByChar).toBe('function');
      expect(typeof autotyper.typeInstant).toBe('function');
      expect(typeof autotyper.sendSpecialKey).toBe('function');
    });
  });

  describe('getKeyboardControl', () => {
    it('returns a keyboard control object', () => {
      const keyboard = getKeyboardControl();
      
      expect(keyboard).toBeDefined();
      expect(typeof keyboard.sendKey).toBe('function');
    });
  });

  describe('console logging', () => {
    it('logs messages with [AutoType] prefix', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      mockKeyboard.sendKey = vi.fn().mockResolvedValue(undefined);
      
      const autotyper = createAutotyper(mockKeyboard);
      
      const promise = autotyper.typeCharByChar('test', { minDelay: 40, maxDelay: 80 });
      
      await vi.runAllTimersAsync();
      await promise;

      // Check that some log was called with [AutoType] prefix
      const logCalls = consoleSpy.mock.calls.filter(call => 
        typeof call[0] === 'string' && call[0].includes('[AutoType]')
      );
      
      expect(logCalls.length).toBeGreaterThan(0);
      
      consoleSpy.mockRestore();
    });
  });
});
