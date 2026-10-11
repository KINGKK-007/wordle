import { describe, expect, it } from 'vitest';
import { parseDuelInvitation } from '../src/duel/joinCode';

const origin = 'https://custom-wordle-nine.vercel.app';

describe('Live Duel invitation input', () => {
  it.each(['ABCDE', '  abcde  ', 'jkmn2', '23456'])('accepts room code %s', (input) => {
    expect(parseDuelInvitation(input, origin)).toBe(input.trim().toUpperCase());
  });

  it('accepts the full current-site invitation without truncating its host', () => {
    expect(parseDuelInvitation(`${origin}/#/duel/abcde`, origin)).toBe('ABCDE');
  });

  it.each([
    'ABCD',
    'ABCDEF',
    'ABCDI',
    'ABCDL',
    'ABCDO',
    'ABCD0',
    'ABCD1',
    'https://another.example/#/duel/ABCDE',
    `${origin}/#/play?w=ABCDE`,
    `${origin}/#/duel/ABCDE/extra`,
    `${origin}/#/duel/ABCDE?extra`,
    `${origin}/other/#/duel/ABCDE`,
    `${origin}/?extra#/duel/ABCDE`,
    'javascript:ABCDE',
    `https://someone@custom-wordle-nine.vercel.app/#/duel/ABCDE`,
  ])('rejects malformed, ambiguous, foreign or wrong-mode input %s', (input) => {
    expect(parseDuelInvitation(input, origin)).toBeNull();
  });
});
