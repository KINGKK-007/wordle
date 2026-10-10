// Unit tests for evaluateGuess - covers duplicate letter edge cases
import { evaluateGuess, getBestLetterState } from '../src/utils/evaluateGuess';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
  } catch (e) {
    console.error(`❌ FAIL: ${name}`);
    console.error(e);
    process.exit(1);
  }
}

function expect<T>(actual: T, expected: T, msg = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${msg ? ` (${msg})` : ''}`);
  }
}

// Helper to get just the states
function states(guess: string, answer: string): string[] {
  return evaluateGuess(guess, answer).map(e => e.state);
}

// ─── Basic tests ───────────────────────────────────────────────────────────────

test('All correct', () => {
  expect(states('crane', 'crane'), ['correct','correct','correct','correct','correct']);
});

test('All absent', () => {
  expect(states('zzzzz', 'abcde'), ['absent','absent','absent','absent','absent']);
});

test('All present', () => {
  expect(states('edcba', 'abcde'), ['present','present','correct','present','present']);
});

// ─── Duplicate letter handling ─────────────────────────────────────────────────

test('ABBEY / BOBBY: duplicate letter with limited count', () => {
  // answer ABBEY: A(0) B(1) B(2) E(3) Y(4)
  // guess  BOBBY: B(0) O(1) B(2) B(3) Y(4)
  // Pass 1 greens: pos2=B(green), pos4=Y(green)
  // Remaining in answer after greens: A(0), B(1), E(3) -> [A, B, E]  (B count = 1)
  // Pass 2: B(0)->yellow (1 B remaining), O(1)->absent, skip pos2(green), B(3)->absent (0 B remaining)
  expect(states('bobby', 'abbey'), ['present','absent','correct','absent','correct']);
});

test('SPEED / ABCDE: single duplicate', () => {
  // answer: abcde, guess: speed -> s=absent,p=absent,e=present(only 1 e),e=absent,d=present
  // Actually answer=speed has 2 e's? No: s-p-e-e-d
  // let's use answer='speed', guess='eerie'
  // answer speed: s(0) p(1) e(2) e(3) d(4)  -> 2 e's
  // guess  eerie: e(0) e(1) r(2) i(3) e(4)  -> 3 e's
  // Pass 1 greens: pos2=e(green), pos3=e? no i≠e. Only pos2=e is green (answer[2]=e).
  //   Wait answer[2]=e, answer[3]=e. guess[2]=r not green. guess[3]=i not green.
  //   So no greens? Let me recount: guess=eerie, answer=speed
  //   pos0: e vs s -> no green
  //   pos1: e vs p -> no green
  //   pos2: r vs e -> no green
  //   pos3: i vs e -> no green
  //   pos4: e vs d -> no green
  //   Remaining answer letters: s,p,e,e,d (count: s=1,p=1,e=2,d=1)
  //   Pass 2: e(0) -> e in remaining? yes count=2->1 -> present
  //           e(1) -> e in remaining? yes count=1->0 -> present
  //           r(2) -> r in remaining? no -> absent
  //           i(3) -> i in remaining? no -> absent
  //           e(4) -> e in remaining? count=0 -> absent
  expect(states('eerie', 'speed'), ['present','present','absent','absent','absent']);
});

test('Answer with one letter, guess repeats it twice', () => {
  // answer=crane (1 r), guess=error (e=0,r=1,r=2,o=3,r=4)
  // answer: c(0)r(1)a(2)n(3)e(4)
  // Pass1 greens: pos1 r vs r => green. Others: no greens.
  // Remaining after greens removed: c,a,n,e (r count=0)
  // Pass2: e(0)->e in remaining? yes, present. r(1)->skip(green). r(2)->r in remaining? count=0->absent. o(3)->absent. r(4)->absent.
  expect(states('error', 'crane'), ['present','correct','absent','absent','absent']);
});

test('Correct letter in right position takes priority', () => {
  // answer=greed, guess=speed
  // answer: g(0)r(1)e(2)e(3)d(4)
  // Pass1: pos2 e=e green, pos3 e=e green, pos4 d=d green
  // Remaining: g,r (no e remaining)
  // Pass2: s(0)->absent, p(1)->absent
  expect(states('speed', 'greed'), ['absent','absent','correct','correct','correct']);
});

// ─── wordCodec tests ───────────────────────────────────────────────────────────

import { encodeWord, decodeWord, encodeToCode, decodeFromCode } from '../src/utils/wordCodec';

test('encodeWord / decodeWord roundtrip', () => {
  const words = ['crane', 'abbey', 'world', 'query', 'fuzzy'];
  for (const word of words) {
    const encoded = encodeWord(word);
    const decoded = decodeWord(encoded);
    if (decoded !== word) throw new Error(`${word} -> encode -> ${encoded} -> decode -> ${decoded}`);
    // Check it's not plaintext
    if (encoded.toLowerCase().includes(word)) throw new Error(`Encoded form contains plaintext word: ${encoded}`);
  }
});

test('encodeToCode / decodeFromCode roundtrip', () => {
  const words = ['crane', 'abbey', 'world', 'query', 'fuzzy', 'prize'];
  for (const word of words) {
    const code = encodeToCode(word);
    if (code.length !== 4) throw new Error(`Code length should be 4, got ${code.length} for '${word}'`);
    const decoded = decodeFromCode(code);
    if (decoded !== word) throw new Error(`${word} -> code ${code} -> decoded ${decoded}`);
    // Check code doesn't contain plaintext
    if (code.toLowerCase().includes(word)) throw new Error(`Code contains plaintext: ${code}`);
  }
});

test('decodeWord returns null for invalid input', () => {
  expect(decodeWord('!!!invalid!!!'), null);
  expect(decodeWord(''), null);
  expect(decodeWord('tooshort'), null); // wrong length after decode
});

test('decodeFromCode returns null for invalid input', () => {
  expect(decodeFromCode('AAA'), null);   // 3 chars, not 4
  expect(decodeFromCode('----'), null);  // invalid chars
  expect(decodeFromCode(''), null);      // empty
});

// ─── getBestLetterState tests ──────────────────────────────────────────────────

test('getBestLetterState: correct > present > absent', () => {
  const rows = [
    [{ letter: 'a', state: 'absent' as const }],
    [{ letter: 'a', state: 'present' as const }],
    [{ letter: 'a', state: 'correct' as const }],
  ];
  expect(getBestLetterState('a', rows), 'correct');
});

test('getBestLetterState: never downgrades correct to absent', () => {
  const rows = [
    [{ letter: 'b', state: 'correct' as const }],
    [{ letter: 'b', state: 'absent' as const }],
  ];
  expect(getBestLetterState('b', rows), 'correct');
});

console.log('\n✅ All tests passed!');
