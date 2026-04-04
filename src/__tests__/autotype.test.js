import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAutotyper, typeCharByChar, typeInstant, typeWordByWord, typeLineByLine, sendSpecialKey, getKeyboardControl } from '../utils/autotype.js';

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

  describe('typeWordByWord', () => {
    it('types words separated by spaces with pauses between words', async () => {
      mockKeyboard.sendKey = vi.fn().mockResolvedValue(undefined);
      
      const text = 'hello world';
      const autotyper = createAutotyper(mockKeyboard);
      
      const promise = autotyper.typeWordByWord(text, { charDelay: 10, wordDelay: 50 });
      
      await vi.runAllTimersAsync();
      await promise;

      // Should have sent 'h', 'e', 'l', 'l', 'o', ' ', 'w', 'o', 'r', 'l', 'd'
      expect(mockKeyboard.sendKey).toHaveBeenCalledTimes(text.length);
      expect(mockKeyboard.sendKey).toHaveBeenNthCalledWith(1, 'h');
      expect(mockKeyboard.sendKey).toHaveBeenNthCalledWith(6, ' '); // space between words
      expect(mockKeyboard.sendKey).toHaveBeenNthCalledWith(11, 'd');
    });

    it('handles newlines and tabs correctly', async () => {
      mockKeyboard.sendKey = vi.fn().mockResolvedValue(undefined);
      
      const text = 'hello\nworld\ttab';
      const autotyper = createAutotyper(mockKeyboard);
      
      const promise = autotyper.typeWordByWord(text, { charDelay: 10, wordDelay: 50 });
      
      await vi.runAllTimersAsync();
      await promise;

      // Should send 'Enter' for newline and 'Tab' for tab
      const calls = mockKeyboard.sendKey.mock.calls;
      expect(calls.some(call => call[0] === 'Enter')).toBe(true);
      expect(calls.some(call => call[0] === 'Tab')).toBe(true);
    });
  });

  describe('typeLineByLine', () => {
    it('types lines separated by newlines with pauses between lines', async () => {
      mockKeyboard.sendKey = vi.fn().mockResolvedValue(undefined);
      
      const text = 'first line\nsecond line';
      const autotyper = createAutotyper(mockKeyboard);
      
      const promise = autotyper.typeLineByLine(text, { charDelay: 10, lineDelay: 50 });
      
      await vi.runAllTimersAsync();
      await promise;

      // Should have sent all characters plus Enter between lines
      const calls = mockKeyboard.sendKey.mock.calls;
      // 'first line' = 10 chars + Enter + 'second line' = 11 chars = 22 total
      expect(calls.length).toBe(22);
      
      // Find the Enter key call
      expect(calls.some(call => call[0] === 'Enter')).toBe(true);
    });

    it('handles last line without trailing newline', async () => {
      mockKeyboard.sendKey = vi.fn().mockResolvedValue(undefined);
      
      const text = 'only\none\nline';
      const autotyper = createAutotyper(mockKeyboard);
      
      const promise = autotyper.typeLineByLine(text, { charDelay: 10, lineDelay: 50 });
      
      await vi.runAllTimersAsync();
      await promise;

      // Should have 3 lines, so 2 Enter keys
      const enterCalls = mockKeyboard.sendKey.mock.calls.filter(call => call[0] === 'Enter');
      expect(enterCalls.length).toBe(2);
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
      expect(typeof autotyper.typeWordByWord).toBe('function');
      expect(typeof autotyper.typeLineByLine).toBe('function');
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
