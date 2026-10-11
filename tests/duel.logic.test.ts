import { describe, expect, it } from 'vitest';
import { ANSWER_LIST } from '../src/data/answers';
import {
  advanceWord,
  createProgress,
  finishProgress,
  generateRoomCode,
  getForfeitAt,
  getForfeitUid,
  getRoomPhase,
  mulberry32,
  rankDuel,
  reconcileMeta,
  ROOM_ALPHABET,
  sanitizeNickname,
  seededSequence,
  submitGuess,
} from '../src/duel/logic';
import type { PlayerSummary, RoomState } from '../src/duel/types';
import { isPlayerProgress, parseRoom } from '../src/duel/validation';

const summary = (overrides: Partial<PlayerSummary> = {}): PlayerSummary => ({
  wordsSolved: 2,
  guessesOnSolved: 6,
  lastSolveMs: 10000,
  totalGreens: 15,
  totalYellows: 8,
  totalGuesses: 7,
  ...overrides,
});
const options = (guess: string, now = 6000) => ({
  guess,
  answer: 'crane',
  now,
  startAt: 5000,
  endAt: 65000,
});
const player = {
  name: 'Player',
  ready: true,
  readySeed: 7,
  rematchSeed: null,
  joinedAt: 1000,
  connected: true,
  lastSeen: 5000,
};
const room = (): RoomState => ({
  meta: {
    hostUid: 'a',
    guestUid: 'b',
    createdAt: 1000,
    durationSec: 60,
    seed: 7,
    status: 'lobby',
    startAt: null,
    endAt: null,
  },
  players: { a: { ...player }, b: { ...player } },
  progress: { a: createProgress(7), b: createProgress(7) },
});

describe('deterministic shared sequence', () => {
  it('is a complete nonrepeating permutation without changing the answer list', () => {
    const original = [...ANSWER_LIST];
    const shuffled = seededSequence(123);
    expect(shuffled).toEqual(seededSequence(123));
    expect(shuffled).not.toEqual(seededSequence(124));
    expect(new Set(shuffled).size).toBe(ANSWER_LIST.length);
    expect([...shuffled].sort()).toEqual([...ANSWER_LIST].sort());
    expect(ANSWER_LIST).toEqual(original);
  });
  it('produces bounded random values and supports empty and single-item sequences', () => {
    const random = mulberry32(0xffffffff);
    for (let index = 0; index < 10000; index++) expect(random()).toBeGreaterThanOrEqual(0);
    const next = mulberry32(0);
    for (let index = 0; index < 10000; index++) expect(next()).toBeLessThan(1);
    expect(seededSequence(1, [])).toEqual([]);
    expect(seededSequence(1, ['crane'])).toEqual(['crane']);
  });
  it('generates five-character codes from the unambiguous alphabet', () => {
    for (let index = 0; index < 1000; index++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(5);
      expect([...code].every((letter) => ROOM_ALPHABET.includes(letter))).toBe(true);
      expect(code).not.toMatch(/[01OIL]/);
    }
    expect(generateRoomCode(() => 0)).toBe('AAAAA');
    expect(sanitizeNickname(' <Alice>\u0000 ')).toBe('Alice');
    expect(sanitizeNickname('')).toBe('Player');
    expect(sanitizeNickname('abcdefghijklmnop')).toHaveLength(14);
  });
});

describe('strict lexicographic Duel grading', () => {
  it.each([
    ['wordsSolved', { wordsSolved: 3, guessesOnSolved: 100, lastSolveMs: 60000, totalGreens: 0 }],
    ['guesses', { guessesOnSolved: 5, lastSolveMs: 60000, totalGreens: 0 }],
    ['finalSolveTime', { lastSolveMs: 9000, totalGreens: 0, totalYellows: 0 }],
    ['greens', { totalGreens: 16, totalYellows: 0 }],
    ['yellows', { totalYellows: 9 }],
  ] as const)('%s decides only after all earlier ties', (decidedBy, overrides) => {
    expect(rankDuel(summary(overrides), summary())).toEqual({ winner: 'a', decidedBy });
    expect(rankDuel(summary(), summary(overrides))).toEqual({ winner: 'b', decidedBy });
  });
  it('draws when every metric ties, ignoring total guesses on failed words', () => {
    expect(rankDuel(summary({ totalGuesses: 50 }), summary())).toEqual({
      winner: 'draw',
      decidedBy: 'draw',
    });
  });
  it('skips missing solve times safely and grades partial unsolved guesses', () => {
    const zero = summary({ wordsSolved: 0, guessesOnSolved: 0, lastSolveMs: null });
    expect(rankDuel(zero, { ...zero, totalGreens: 14 })).toEqual({
      winner: 'a',
      decidedBy: 'greens',
    });
    expect(rankDuel(zero, { ...zero, lastSolveMs: 0 })).toEqual({
      winner: 'draw',
      decidedBy: 'draw',
    });
  });
  it('forfeit overrides every metric, including simultaneous forfeits', () => {
    expect(rankDuel(summary({ wordsSolved: 100, forfeited: true }), summary())).toEqual({
      winner: 'b',
      decidedBy: 'forfeit',
    });
    expect(rankDuel(summary(), summary({ forfeited: true }))).toEqual({
      winner: 'a',
      decidedBy: 'forfeit',
    });
    expect(rankDuel(summary({ forfeited: true }), summary({ forfeited: true }))).toEqual({
      winner: 'draw',
      decidedBy: 'forfeit',
    });
  });
  it('is symmetric and deterministic across many combinations', () => {
    const random = mulberry32(8);
    for (let index = 0; index < 500; index++) {
      const make = () =>
        summary({
          wordsSolved: Math.floor(random() * 4),
          guessesOnSolved: Math.floor(random() * 20),
          lastSolveMs: random() > 0.2 ? Math.floor(random() * 10000) : null,
          totalGreens: Math.floor(random() * 50),
          totalYellows: Math.floor(random() * 50),
          forfeited: random() < 0.05,
        });
      const a = make();
      const b = make();
      const result = rankDuel(a, b);
      expect(rankDuel(a, b)).toEqual(result);
      expect(rankDuel(b, a)).toEqual({
        ...result,
        winner: result.winner === 'a' ? 'b' : result.winner === 'b' ? 'a' : 'draw',
      });
    }
  });
});

describe('Duel guess accounting and advancement', () => {
  it('accounts submitted guesses at Enter time and solved-only guesses', () => {
    const initial = createProgress(7);
    const first = submitGuess(initial, options('slate', 6100));
    expect(first.accepted).toBe(true);
    expect(first.progress.totalGuesses).toBe(1);
    expect(first.progress.guessesOnSolved).toBe(0);
    expect(first.progress.words[0].endedAtMs).toBe(1100);
    const solved = submitGuess(first.progress, options('CRANE', 7000));
    expect(solved).toMatchObject({
      accepted: true,
      solved: true,
      wordComplete: true,
      pattern: '22222',
    });
    expect(solved.progress).toMatchObject({
      wordsSolved: 1,
      guessesOnSolved: 2,
      lastSolveMs: 2000,
      totalGuesses: 2,
    });
    expect(isPlayerProgress(solved.progress)).toBe(true);
    expect(submitGuess(solved.progress, options('crane', 7100)).error).toBe('Word complete');
    const next = advanceWord(solved.progress, 7800, 5000);
    expect(next).toMatchObject({
      currentWordIndex: 1,
      currentWordStartedAtMs: 2800,
      currentPatterns: [],
    });
    expect(isPlayerProgress(next)).toBe(true);
    expect(initial.totalGuesses).toBe(0);
  });
  it('advances after the sixth failed attempt without increasing solved-word guesses', () => {
    let progress = createProgress(7);
    for (let attempt = 0; attempt < 6; attempt++)
      progress = submitGuess(progress, options('slate', 6000 + attempt * 100)).progress;
    expect(progress).toMatchObject({ wordsSolved: 0, guessesOnSolved: 0, totalGuesses: 6 });
    expect(progress.currentPatterns).toHaveLength(6);
    expect(advanceWord(progress, 7000, 5000).currentWordIndex).toBe(1);
    expect(isPlayerProgress(progress)).toBe(true);
  });
  it.each(['cr', 'zzzzz', '12abc'])('invalid %s does not consume any attempt', (guess) => {
    const progress = createProgress(7);
    const result = submitGuess(progress, options(guess));
    expect(result.accepted).toBe(false);
    expect(result.progress).toBe(progress);
    expect(advanceWord(progress, 7000, 5000)).toBe(progress);
  });
  it.each([4999, 65000, 65001])('rejects timestamps outside the active window: %i', (now) => {
    const progress = createProgress(7);
    expect(submitGuess(progress, options('crane', now))).toMatchObject({
      accepted: false,
      progress,
      error: "Time's up!",
    });
  });
  it('allows an Enter one millisecond before the buzzer and locks finished progress', () => {
    const submitted = submitGuess(createProgress(7), options('slate', 64999));
    expect(submitted.accepted).toBe(true);
    const finished = finishProgress(submitted.progress, 65000, 5000);
    expect(finished).toMatchObject({ finished: true, totalGuesses: 1, wordsSolved: 0 });
    expect(finished.words[0]).toMatchObject({ endedAtMs: 60000, solved: false, guessCount: 1 });
    expect(finishProgress(finished, 66000, 5000)).toBe(finished);
    expect(submitGuess(finished, options('crane')).accepted).toBe(false);
    expect(isPlayerProgress(finished)).toBe(true);
  });
  it('records a touched empty word as unsolved at expiry', () => {
    const result = finishProgress(createProgress(7), 65000, 5000);
    expect(result.words[0]).toMatchObject({
      guessCount: 0,
      solved: false,
      timeMs: 60000,
      patterns: [],
    });
    expect(isPlayerProgress(result)).toBe(true);
  });
});

describe('host lifecycle and payload validation', () => {
  it('starts once when both ready and derives exact start and end without a later write', () => {
    const value = room();
    const meta = reconcileMeta(value, 1000);
    expect(meta).toMatchObject({ status: 'countdown', startAt: 6000, endAt: 66000 });
    value.meta = meta!;
    expect(reconcileMeta(value, 1000)).toBeNull();
    expect(getRoomPhase(value, 5999)).toBe('countdown');
    expect(getRoomPhase(value, 6000)).toBe('playing');
    expect(getRoomPhase(value, 66000)).toBe('finished');
    value.players.b.ready = false;
    expect(reconcileMeta(value, 5000)).toMatchObject({
      status: 'lobby',
      startAt: null,
      endAt: null,
    });
  });
  it('does not ready missing/disconnected players or reuse stale ready flags', () => {
    const value = room();
    value.players.b.readySeed = 6;
    expect(reconcileMeta(value, 1000)).toBeNull();
    value.players.b.readySeed = 7;
    value.players.b.connected = false;
    expect(reconcileMeta(value, 1000)).toBeNull();
  });
  it('forfeits exactly at 20 seconds during play, but not after the game clock expires', () => {
    const value = room();
    value.meta = { ...value.meta, status: 'playing', startAt: 5000, endAt: 65000 };
    value.players.b.connected = false;
    value.players.b.lastSeen = 10000;
    expect(getForfeitUid(value, 29999)).toBeUndefined();
    expect(getForfeitUid(value, 30000)).toBe('b');
    value.players.b.lastSeen = 50000;
    expect(getForfeitUid(value, 70000)).toBeUndefined();
  });
  it('keeps the forfeit cutoff stable on reconnect, including voluntary departures', () => {
    const value = room();
    value.meta = {
      ...value.meta,
      status: 'finished',
      startAt: 5000,
      endAt: 65000,
      forfeitUid: 'b',
      forfeitAt: 30000,
    };
    value.players.b.lastSeen = 60000;
    value.players.b.connected = true;
    expect(getForfeitAt(value, 60000)).toBe(30000);
    delete value.meta.forfeitAt;
    value.players.b.forfeited = true;
    value.players.b.forfeitAt = 20000;
    value.players.a.forfeitClaim = { uid: 'b', disconnectedAt: 20000, seed: 7 };
    expect(getForfeitAt(value, 60000)).toBe(20000);
  });
  it('a mutual rematch always chooses a different seed and clears match metadata', () => {
    const value = room();
    value.meta.status = 'finished';
    value.meta.forfeitUid = 'b';
    value.players.a.rematchSeed = 7;
    value.players.b.rematchSeed = 7;
    expect(reconcileMeta(value, 100000, () => 7)).toEqual({
      ...value.meta,
      status: 'lobby',
      seed: 8,
      startAt: null,
      endAt: null,
      forfeitUid: undefined,
    });
  });
  it('normalizes Firebase nulls and omitted arrays while rejecting corrupt data', () => {
    const value = room();
    const raw = JSON.parse(JSON.stringify(value)) as RoomState;
    const omit = (entry: object, key: string) => {
      Reflect.deleteProperty(entry, key);
    };
    omit(raw.meta, 'startAt');
    omit(raw.meta, 'endAt');
    for (const entry of Object.values(raw.players)) omit(entry, 'rematchSeed');
    for (const entry of Object.values(raw.progress)) {
      omit(entry, 'lastSolveMs');
      omit(entry, 'currentPatterns');
      omit(entry, 'words');
    }
    expect(parseRoom(raw)).toEqual(value);
    expect(parseRoom(null)).toBeNull();
    expect(parseRoom({ ...value, meta: { ...value.meta, durationSec: 90 } })).toBeNull();
    expect(isPlayerProgress({ ...createProgress(7), totalGreens: 5 })).toBe(false);
    expect(isPlayerProgress({ ...createProgress(7), currentPatterns: ['SECRET'] })).toBe(false);
    expect(isPlayerProgress({ ...createProgress(7), guessedLetters: ['crane'] })).toBe(false);
    expect(isPlayerProgress({ ...createProgress(7), currentWordIndex: 1 })).toBe(false);
    expect(
      parseRoom({ ...value, progress: { ...value.progress, stranger: createProgress(7) } }),
    ).toBeNull();
  });
});
