import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluateGuess } from '../src/utils/evaluateGuess';
import { generateShareText, shareOrCopy } from '../src/utils/shareResult';

afterEach(() => vi.restoreAllMocks());

describe('sharing invites the next player without spoilers', () => {
  it.each(['unlimited', '2player'] as const)('uses a usable entry link for %s results', (mode) => {
    const text = generateShareText([evaluateGuess('crane', 'crane')], 1, mode);
    expect(text).toContain('1/6');
    expect(text).toContain('🟩🟩🟩🟩🟩');
    expect(text).not.toMatch(/crane/i);
    expect(text).toContain(
      window.location.origin + (mode === 'unlimited' ? '/#/unlimited' : '/#/challenge'),
    );
  });
  it('does not write the clipboard when the player cancels native sharing', async () => {
    const copy = vi.fn();
    vi.stubGlobal('navigator', {
      share: vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError')),
      clipboard: { writeText: copy },
    });
    try {
      expect(await shareOrCopy('Invitation', 'Custom Wordle')).toBe('cancelled');
      expect(copy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('falls back to copying after native sharing fails', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      share: vi.fn().mockRejectedValue(new Error('Unavailable')),
      clipboard: { writeText: copy },
    });
    try {
      expect(await shareOrCopy('Invitation', 'Custom Wordle')).toBe('copied');
      expect(copy).toHaveBeenCalledWith('Invitation');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
