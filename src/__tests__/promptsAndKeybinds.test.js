import { describe, it, expect } from 'vitest';
const { getSystemPrompt } = require('../utils/prompts');
const storage = require('../storage');
const { getDefaultKeybinds } = require('../utils/window');

describe('Prompts Customization & Developer Instructions', () => {
    it('uses default profile intro when systemInstructionOverride is empty', () => {
        const prompt = getSystemPrompt('interview', '', true, '', '');
        expect(prompt).toContain('You are an AI-powered interview assistant');
        expect(prompt).toContain('RESPONSE FORMAT REQUIREMENTS');
    });

    it('replaces profile intro with custom systemInstructionOverride', () => {
        const customSys = 'You are a Senior Principal Architect. Answer with bullet points and code.';
        const prompt = getSystemPrompt('interview', '', true, customSys, '');
        expect(prompt).toContain(customSys);
        expect(prompt).not.toContain('You are an AI-powered interview assistant');
    });

    it('injects developer instructions when provided', () => {
        const devPrompt = 'Think step by step silently. Never output thought tags. Keep responses under 2 sentences.';
        const prompt = getSystemPrompt('interview', '', true, '', devPrompt);
        expect(prompt).toContain('**DEVELOPER / META INSTRUCTIONS:**');
        expect(prompt).toContain(devPrompt);
    });

    it('injects user custom prompt context', () => {
        const userContext = 'I have 8 years of React and Golang experience.';
        const prompt = getSystemPrompt('interview', userContext, true, '', '');
        expect(prompt).toContain('User-provided context');
        expect(prompt).toContain(userContext);
    });

    it('returns fullSystemPrompt override directly when provided', () => {
        const directPrompt = 'You are a completely custom prompt that replaces everything.';
        const prompt = getSystemPrompt('interview', '', true, '', '', directPrompt);
        expect(prompt).toBe(directPrompt);
    });

    it('getDefaultSystemPrompt returns default template for profile', () => {
        const { getDefaultSystemPrompt } = require('../utils/prompts');
        const defaultPrompt = getDefaultSystemPrompt('interview');
        expect(defaultPrompt).toContain('You are an AI-powered interview assistant');
        expect(defaultPrompt).toContain('RESPONSE FORMAT REQUIREMENTS');
    });
});

describe('Storage System & Developer Instructions', () => {
    it('has getters and setters for systemInstruction, developerInstruction, and fullSystemPrompt', () => {
        storage.setSystemInstruction('Custom System Role');
        expect(storage.getSystemInstruction()).toBe('Custom System Role');

        storage.setDeveloperInstruction('Custom Dev Rules');
        expect(storage.getDeveloperInstruction()).toBe('Custom Dev Rules');

        storage.setFullSystemPrompt('Custom Full Prompt Override');
        expect(storage.getFullSystemPrompt()).toBe('Custom Full Prompt Override');

        // Cleanup
        storage.setSystemInstruction('');
        storage.setDeveloperInstruction('');
        storage.setFullSystemPrompt('');
        expect(storage.getSystemInstruction()).toBe('');
        expect(storage.getDeveloperInstruction()).toBe('');
        expect(storage.getFullSystemPrompt()).toBe('');
    });
});

describe('Keybinds configuration', () => {
    it('includes toggleListenAnswer in default keybinds', () => {
        const keybinds = getDefaultKeybinds();
        expect(keybinds).toHaveProperty('toggleListenAnswer');
        expect(typeof keybinds.toggleListenAnswer).toBe('string');
        expect(keybinds.toggleListenAnswer.length).toBeGreaterThan(0);
    });
});
