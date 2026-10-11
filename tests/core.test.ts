import { describe, it, expect } from 'vitest';
import { evaluateGuess, getBestLetterState } from '../src/utils/evaluateGuess';
import { encodeWord, decodeWord, encodeToCode, decodeFromCode } from '../src/utils/wordCodec';
import { VALID_GUESSES } from '../src/data/validGuesses';

const states = (guess: string, answer: string) => evaluateGuess(guess.toLowerCase(), answer.toLowerCase()).map(letter => letter.state);
describe('Wordle two-pass evaluation', () => {
  it.each([
    ['CRANE', 'CRANE', ['correct', 'correct', 'correct', 'correct', 'correct']],
    ['BOBBY', 'ABBEY', ['present', 'absent', 'correct', 'absent', 'correct']],
    ['ERASE', 'SPEED', ['present', 'absent', 'absent', 'present', 'present']],
    ['ALLAY', 'LLAMA', ['present', 'correct', 'present', 'present', 'absent']],
    ['EERIE', 'SPEED', ['present', 'present', 'absent', 'absent', 'absent']],
    ['ERROR', 'CRANE', ['present', 'correct', 'absent', 'absent', 'absent']],
    ['SPEED', 'GREED', ['absent', 'absent', 'correct', 'correct', 'correct']],
  ])('%s against %s', (guess, answer, expected) => expect(states(guess, answer)).toEqual(expected));
  it('keyboard colors retain the best result', () => {
    const rows = [evaluateGuess('crane', 'crane'), evaluateGuess('error', 'crane')];
    expect(getBestLetterState('r', rows)).toBe('correct');
    expect(getBestLetterState('z', rows)).toBeUndefined();
  });
});
describe('challenge codec', () => {
  it('round-trips every dictionary word through links and short codes', () => {
    for (const word of VALID_GUESSES) {
      expect(decodeWord(encodeWord(word))).toBe(word);
      expect(decodeFromCode(encodeToCode(word))).toBe(word);
      expect(encodeToCode(word)).toHaveLength(4);
      expect(encodeWord(word).toLowerCase()).not.toContain(word);
    }
  });
  it.each(['', '!', 'AAAAA', '====', '!!!invalid!!!', 'tooshort'])('rejects malformed URL payload %s', payload => expect(decodeWord(payload)).toBeNull());
  it.each(['', 'AAA', '-----', '0000'])('rejects malformed code %s', code => expect(decodeFromCode(code)).toBeNull());
  it('rejects truncated and single-character tampered versioned payloads', () => {
    const payload=encodeWord('crane');
    expect(decodeWord(payload.slice(0,-1))).toBeNull();
    for (let i=0;i<payload.length;i++) {
      const changed=payload.slice(0,i)+(payload[i]==='A'?'B':'A')+payload.slice(i+1);
      expect(decodeWord(changed)).toBeNull();
    }
  });
});
