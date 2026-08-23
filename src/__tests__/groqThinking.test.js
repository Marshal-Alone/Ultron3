const { stripThinkingTags } = require('../utils/groq');

describe('Groq stripThinkingTags utility', () => {
    it('returns empty string when reasoning is starting with <think>', () => {
        expect(stripThinkingTags('<think>')).toBe('');
        expect(stripThinkingTags('<think> analyzing the problem...')).toBe('');
    });

    it('strips closed <think>...</think> tags and returns the answer', () => {
        const input = '<think>\nHere is some internal reasoning\nand thoughts\n</think>\n\n- Point 1\n- Point 2';
        expect(stripThinkingTags(input)).toBe('- Point 1\n- Point 2');
    });

    it('handles multiple think blocks', () => {
        const input = '<think>Thought 1</think>Answer 1 <think>Thought 2</think>Answer 2';
        expect(stripThinkingTags(input)).toBe('Answer 1 Answer 2');
    });

    it('handles clean text without think tags', () => {
        const input = 'This is a clean, direct answer.';
        expect(stripThinkingTags(input)).toBe('This is a clean, direct answer.');
    });

    it('handles empty or null inputs', () => {
        expect(stripThinkingTags('')).toBe('');
        expect(stripThinkingTags(null)).toBe('');
        expect(stripThinkingTags(undefined)).toBe('');
    });
});
