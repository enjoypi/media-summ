import { describe, it, expect } from 'vitest';
import { estimateTokens } from './token-estimator.js';

describe('estimateTokens', () => {
  it('should estimate tokens with default chars_per_token', () => {
    const text = 'a'.repeat(300);
    expect(estimateTokens(text)).toBe(100);
  });

  it('should ceil the result', () => {
    expect(estimateTokens('hello')).toBe(2); // 5 / 3 = 1.67 → 2
  });

  it('should use custom chars_per_token', () => {
    const text = 'a'.repeat(400);
    expect(estimateTokens(text, 4)).toBe(100);
  });

  it('should return 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should throw on non-positive chars_per_token', () => {
    expect(() => estimateTokens('hello', 0)).toThrow('charsPerToken must be positive');
    expect(() => estimateTokens('hello', -1)).toThrow('charsPerToken must be positive');
  });
});
