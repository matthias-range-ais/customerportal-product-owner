import { describe, expect, it } from 'vitest';
import { envOrDefault } from './env.js';

describe('envOrDefault', () => {
  it('returns the fallback when the value is undefined', () => {
    expect(envOrDefault(undefined, 'fallback')).toBe('fallback');
  });

  it('returns the fallback when the value is an empty string', () => {
    expect(envOrDefault('', 'fallback')).toBe('fallback');
  });

  it('returns the fallback when the value is whitespace only', () => {
    expect(envOrDefault('   ', 'fallback')).toBe('fallback');
  });

  it('returns the value when it is set', () => {
    expect(envOrDefault('actual', 'fallback')).toBe('actual');
  });
});
