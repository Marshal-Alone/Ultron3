import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvigilatorModeManager } from '../utils/invigilatorMode.js';

describe('Invigilator Mode State Manager', () => {
  let manager;

  beforeEach(() => {
    // Create a fresh instance for each test
    manager = new InvigilatorModeManager();
  });

  describe('toggleMode', () => {
    it('toggles isActive state and returns new state', () => {
      expect(manager.isActive).toBe(false);
      
      const result1 = manager.toggleMode();
      expect(result1).toBe(true);
      expect(manager.isActive).toBe(true);
      
      const result2 = manager.toggleMode();
      expect(result2).toBe(false);
      expect(manager.isActive).toBe(false);
    });
  });

  describe('setTypingMode', () => {
    it('updates typingMode to charByChar', () => {
      manager.setTypingMode('charByChar');
      expect(manager.typingMode).toBe('charByChar');
    });

    it('updates typingMode to instant', () => {
      manager.setTypingMode('instant');
      expect(manager.typingMode).toBe('instant');
    });

    it('defaults to charByChar on initialization', () => {
      expect(manager.typingMode).toBe('charByChar');
    });
  });

  describe('toggleTypingMode', () => {
    it('alternates between charByChar and instant', () => {
      expect(manager.typingMode).toBe('charByChar');
      
      manager.toggleTypingMode();
      expect(manager.typingMode).toBe('instant');
      
      manager.toggleTypingMode();
      expect(manager.typingMode).toBe('charByChar');
    });
  });

  describe('setAnswerCode', () => {
    it('stores answer code in lastAnswerCode', () => {
      const code = 'int x = 5;';
      manager.setAnswerCode(code);
      
      expect(manager.lastAnswerCode).toBe(code);
    });

    it('triggers onPreviewShow callback when code is set', () => {
      const callback = vi.fn();
      manager.onPreviewShow(callback);
      
      const code = 'function test() {}';
      manager.setAnswerCode(code);
      
      expect(callback).toHaveBeenCalledWith({ code });
    });
  });

  describe('setPreviewVisible', () => {
    it('updates previewWindowVisible state', () => {
      expect(manager.previewWindowVisible).toBe(false);
      
      manager.setPreviewVisible(true);
      expect(manager.previewWindowVisible).toBe(true);
      
      manager.setPreviewVisible(false);
      expect(manager.previewWindowVisible).toBe(false);
    });
  });

  describe('onModeToggle', () => {
    it('registers callback and fires when mode toggles', () => {
      const callback = vi.fn();
      manager.onModeToggle(callback);
      
      manager.toggleMode();
      
      expect(callback).toHaveBeenCalledWith({ isActive: true });
      
      manager.toggleMode();
      
      expect(callback).toHaveBeenCalledWith({ isActive: false });
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('supports multiple subscribers', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      manager.onModeToggle(callback1);
      manager.onModeToggle(callback2);
      
      manager.toggleMode();
      
      expect(callback1).toHaveBeenCalledWith({ isActive: true });
      expect(callback2).toHaveBeenCalledWith({ isActive: true });
    });
  });

  describe('onTypingModeChange', () => {
    it('registers callback and fires when typing mode changes', () => {
      const callback = vi.fn();
      manager.onTypingModeChange(callback);
      
      manager.setTypingMode('instant');
      
      expect(callback).toHaveBeenCalledWith({ typingMode: 'instant' });
      
      manager.setTypingMode('charByChar');
      
      expect(callback).toHaveBeenCalledWith({ typingMode: 'charByChar' });
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('fires when typing mode is toggled', () => {
      const callback = vi.fn();
      manager.onTypingModeChange(callback);
      
      manager.toggleTypingMode();
      
      expect(callback).toHaveBeenCalledWith({ typingMode: 'instant' });
    });
  });

  describe('onPreviewShow', () => {
    it('registers callback and fires when answer code is set', () => {
      const callback = vi.fn();
      manager.onPreviewShow(callback);
      
      const code = 'console.log("test");';
      manager.setAnswerCode(code);
      
      expect(callback).toHaveBeenCalledWith({ code });
    });
  });

  describe('getState', () => {
    it('returns complete state snapshot', () => {
      manager.toggleMode();
      manager.setTypingMode('instant');
      manager.setAnswerCode('const x = 1;');
      manager.setPreviewVisible(true);
      
      const state = manager.getState();
      
      expect(state).toEqual({
        isActive: true,
        typingMode: 'instant',
        previewWindowVisible: true,
        lastAnswerCode: 'const x = 1;',
      });
    });

    it('returns default state initially', () => {
      const state = manager.getState();
      
      expect(state).toEqual({
        isActive: false,
        typingMode: 'charByChar',
        previewWindowVisible: false,
        lastAnswerCode: '',
      });
    });
  });

  describe('console logging', () => {
    it('logs events with [InvigilatorMode] prefix', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      
      manager.toggleMode();
      
      const calls = consoleSpy.mock.calls.filter(call =>
        typeof call[0] === 'string' && call[0].includes('[InvigilatorMode]')
      );
      
      expect(calls.length).toBeGreaterThan(0);
      
      consoleSpy.mockRestore();
    });
  });

  describe('multiple independent instances', () => {
    it('each instance maintains its own state', () => {
      const manager1 = new InvigilatorModeManager();
      const manager2 = new InvigilatorModeManager();
      
      manager1.toggleMode();
      manager1.setTypingMode('instant');
      
      expect(manager1.isActive).toBe(true);
      expect(manager1.typingMode).toBe('instant');
      
      expect(manager2.isActive).toBe(false);
      expect(manager2.typingMode).toBe('charByChar');
    });
  });
});
