import { describe, expect, it } from 'vitest';
import { DEFAULT_MODE_ID, findMode, MODES } from './modes';

describe('findMode', () => {
  it('returns the matching mode for every id in MODES', () => {
    for (const mode of MODES) {
      expect(findMode(mode.id)).toBe(mode);
    }
  });

  it('defaults to plain chat', () => {
    expect(DEFAULT_MODE_ID).toBe('plain');
    expect(findMode(DEFAULT_MODE_ID).usesHistory).toBe(true);
  });

  it('only draft carries a caution threshold', () => {
    const withCaution = MODES.filter((m) => m.cautionBelowB !== null);
    expect(withCaution.map((m) => m.id)).toEqual(['draft']);
  });

  it('only plain chat and search carry conversation history', () => {
    const withHistory = MODES.filter((m) => m.usesHistory).map((m) => m.id);
    expect(withHistory).toEqual(['plain', 'search']);
  });
});
