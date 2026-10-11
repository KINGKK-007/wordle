import { ANSWER_LIST } from '../data/answers';
import { VALID_GUESS_SET } from '../data/validGuesses';
import { evaluateGuess } from '../utils/evaluateGuess';
import type {
  DuelPlayer,
  PlayerProgress,
  PlayerSummary,
  RoomMeta,
  RoomState,
  RoomStatus,
} from './types';

export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_EXPIRY_MS = 6 * 60 * 60 * 1000;
export const COUNTDOWN_MS = 5000;
export const FORFEIT_MS = 20000;

export function randomSeed(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 0x100000000);
}

export function generateRoomCode(random: () => number = Math.random): string {
  return Array.from(
    { length: 5 },
    () => ROOM_ALPHABET[Math.floor(random() * ROOM_ALPHABET.length)],
  ).join('');
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}

export function sanitizeNickname(name: string): string {
  return (
    [...name]
      .filter(
        (character) =>
          character !== '<' &&
          character !== '>' &&
          character.charCodeAt(0) > 31 &&
          character.charCodeAt(0) !== 127,
      )
      .join('')
      .trim()
      .slice(0, 14) || 'Player'
  );
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

export function seededSequence(seed: number, answers: readonly string[] = ANSWER_LIST): string[] {
  const sequence = [...answers];
  const random = mulberry32(seed);
  for (let index = sequence.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [sequence[index], sequence[swap]] = [sequence[swap], sequence[index]];
  }
  return sequence;
}

export type DecidingMetric =
  'wordsSolved' | 'guesses' | 'finalSolveTime' | 'greens' | 'yellows' | 'draw' | 'forfeit';
export interface DuelRanking {
  winner: 'a' | 'b' | 'draw';
  decidedBy: DecidingMetric;
}

export function rankDuel(a: PlayerSummary, b: PlayerSummary): DuelRanking {
  if (Boolean(a.forfeited) !== Boolean(b.forfeited)) {
    return { winner: a.forfeited ? 'b' : 'a', decidedBy: 'forfeit' };
  }
  if (a.forfeited && b.forfeited) return { winner: 'draw', decidedBy: 'forfeit' };
  const comparisons: [number, number, DecidingMetric, boolean][] = [
    [a.wordsSolved, b.wordsSolved, 'wordsSolved', true],
    [a.guessesOnSolved, b.guessesOnSolved, 'guesses', false],
  ];
  if (a.lastSolveMs !== null && b.lastSolveMs !== null) {
    comparisons.push([a.lastSolveMs, b.lastSolveMs, 'finalSolveTime', false]);
  }
  comparisons.push(
    [a.totalGreens, b.totalGreens, 'greens', true],
    [a.totalYellows, b.totalYellows, 'yellows', true],
  );
  for (const [left, right, decidedBy, higher] of comparisons) {
    if (left !== right) return { winner: left > right === higher ? 'a' : 'b', decidedBy };
  }
  return { winner: 'draw', decidedBy: 'draw' };
}

export function createProgress(seed: number, now = 0): PlayerProgress {
  return {
    seed,
    wordsSolved: 0,
    guessesOnSolved: 0,
    lastSolveMs: null,
    totalGreens: 0,
    totalYellows: 0,
    totalGuesses: 0,
    currentWordIndex: 0,
    currentWordStartedAtMs: 0,
    currentPatterns: [],
    words: [],
    finished: false,
    updatedAt: now,
  };
}

export interface SubmitGuessOptions {
  guess: string;
  answer: string;
  now: number;
  startAt: number;
  endAt: number;
  validGuesses?: ReadonlySet<string>;
}
export interface SubmitGuessResult {
  accepted: boolean;
  error?: 'Not enough letters' | 'Not in word list' | "Time's up!" | 'Word complete';
  progress: PlayerProgress;
  pattern?: string;
  wordComplete: boolean;
  solved: boolean;
}

export function isWordComplete(progress: PlayerProgress): boolean {
  return progress.currentPatterns.includes('22222') || progress.currentPatterns.length >= 6;
}

export function submitGuess(
  progress: PlayerProgress,
  options: SubmitGuessOptions,
): SubmitGuessResult {
  const reject = (error: SubmitGuessResult['error']): SubmitGuessResult => ({
    accepted: false,
    error,
    progress,
    wordComplete: isWordComplete(progress),
    solved: false,
  });
  if (progress.finished || options.now >= options.endAt || options.now < options.startAt)
    return reject("Time's up!");
  if (isWordComplete(progress)) return reject('Word complete');
  const guess = options.guess.toLowerCase();
  if (guess.length !== 5) return reject('Not enough letters');
  if (!/^[a-z]{5}$/.test(guess) || !(options.validGuesses ?? VALID_GUESS_SET).has(guess))
    return reject('Not in word list');
  const evaluated = evaluateGuess(guess, options.answer.toLowerCase());
  const pattern = evaluated
    .map(({ state }) => (state === 'correct' ? '2' : state === 'present' ? '1' : '0'))
    .join('');
  const solved = pattern === '22222';
  const relative = Math.max(0, options.now - options.startAt);
  const patterns = [...progress.currentPatterns, pattern];
  const word = {
    index: progress.currentWordIndex,
    solved,
    guessCount: patterns.length,
    startedAtMs: progress.currentWordStartedAtMs,
    endedAtMs: relative,
    timeMs: Math.max(0, relative - progress.currentWordStartedAtMs),
    patterns,
  };
  const words = [...progress.words.filter((entry) => entry.index !== word.index), word];
  const next: PlayerProgress = {
    ...progress,
    words,
    currentPatterns: patterns,
    wordsSolved: progress.wordsSolved + Number(solved),
    guessesOnSolved: progress.guessesOnSolved + (solved ? patterns.length : 0),
    lastSolveMs: solved ? relative : progress.lastSolveMs,
    totalGreens:
      progress.totalGreens + evaluated.filter((letter) => letter.state === 'correct').length,
    totalYellows:
      progress.totalYellows + evaluated.filter((letter) => letter.state === 'present').length,
    totalGuesses: progress.totalGuesses + 1,
    updatedAt: options.now,
  };
  return {
    accepted: true,
    progress: next,
    pattern,
    wordComplete: solved || patterns.length === 6,
    solved,
  };
}

export function advanceWord(
  progress: PlayerProgress,
  now: number,
  startAt: number,
): PlayerProgress {
  if (progress.finished || !isWordComplete(progress)) return progress;
  return {
    ...progress,
    currentWordIndex: progress.currentWordIndex + 1,
    currentPatterns: [],
    currentWordStartedAtMs: Math.max(0, now - startAt),
    updatedAt: now,
  };
}

export function finishProgress(
  progress: PlayerProgress,
  now: number,
  startAt: number,
): PlayerProgress {
  if (progress.finished) return progress;
  const relative = Math.max(progress.currentWordStartedAtMs, now - startAt);
  const words = [...progress.words];
  if (!isWordComplete(progress)) {
    const word = {
      index: progress.currentWordIndex,
      solved: false,
      guessCount: progress.currentPatterns.length,
      startedAtMs: progress.currentWordStartedAtMs,
      endedAtMs: relative,
      timeMs: Math.max(0, relative - progress.currentWordStartedAtMs),
      patterns: [...progress.currentPatterns],
    };
    const index = words.findIndex((entry) => entry.index === word.index);
    if (index === -1) words.push(word);
    else words[index] = word;
  }
  return { ...progress, words, finished: true, updatedAt: now };
}

export function isPlayerReady(room: RoomState, player: DuelPlayer): boolean {
  return player.ready && player.readySeed === room.meta.seed && player.connected;
}

export function progressForPlayer(room: RoomState, uid: string): PlayerProgress {
  const progress = room.progress[uid];
  return progress?.seed === room.meta.seed ? progress : createProgress(room.meta.seed);
}

export function getForfeitUid(room: RoomState, now: number): string | undefined {
  if (room.meta.forfeitUid) return room.meta.forfeitUid;
  if (room.meta.startAt === null || now < room.meta.startAt) return undefined;
  const claims = Object.values(room.players).flatMap((player) =>
    player.forfeitClaim?.seed === room.meta.seed ? [player.forfeitClaim] : [],
  );
  if (claims.length)
    return claims.sort(
      (a, b) => a.disconnectedAt - b.disconnectedAt || a.uid.localeCompare(b.uid),
    )[0].uid;
  const forfeits = Object.entries(room.players).filter(
    ([, player]) =>
      (player.forfeited && player.readySeed === room.meta.seed) ||
      (!player.connected &&
        now - player.lastSeen >= FORFEIT_MS &&
        (room.meta.endAt === null || player.lastSeen + FORFEIT_MS <= room.meta.endAt)),
  );
  return forfeits.sort(
    ([aUid, a], [bUid, b]) => a.lastSeen - b.lastSeen || aUid.localeCompare(bUid),
  )[0]?.[0];
}

/** Keep the cutoff stable after the forfeiting player reconnects or refreshes. */
export function getForfeitAt(room: RoomState, now: number): number | undefined {
  const uid = getForfeitUid(room, now);
  if (!uid) return undefined;
  if (room.meta.forfeitAt !== undefined) return room.meta.forfeitAt;
  const player = room.players[uid];
  if (player?.forfeitAt !== undefined) return player.forfeitAt;
  const claims = Object.values(room.players).flatMap((player) =>
    player.forfeitClaim?.seed === room.meta.seed && player.forfeitClaim.uid === uid
      ? [player.forfeitClaim]
      : [],
  );
  if (claims.length) return Math.min(...claims.map((claim) => claim.disconnectedAt + FORFEIT_MS));
  if (!player) return undefined;
  return player.forfeited ? player.lastSeen : player.lastSeen + FORFEIT_MS;
}

export function getRoomPhase(room: RoomState, now: number): RoomStatus {
  if (room.meta.status === 'finished') return 'finished';
  if (room.meta.startAt !== null && now >= room.meta.startAt) {
    if ((room.meta.endAt !== null && now >= room.meta.endAt) || getForfeitUid(room, now))
      return 'finished';
    return 'playing';
  }
  return room.meta.status;
}

/** Computes a host-owned metadata transition; caller writes it transactionally. */
export function reconcileMeta(
  room: RoomState,
  now: number,
  newSeed: () => number = randomSeed,
): RoomMeta | null {
  const meta = room.meta;
  const players = Object.values(room.players);
  const ready = players.length === 2 && players.every((player) => isPlayerReady(room, player));
  if (meta.status === 'lobby' && ready)
    return {
      ...meta,
      status: 'countdown',
      startAt: now + COUNTDOWN_MS,
      endAt: now + COUNTDOWN_MS + meta.durationSec * 1000,
    };
  if (meta.status === 'countdown' && meta.startAt !== null && now < meta.startAt && !ready) {
    return { ...meta, status: 'lobby', startAt: null, endAt: null };
  }
  const phase = getRoomPhase(room, now);
  if (phase === 'finished' && meta.status !== 'finished') {
    const forfeitUid = getForfeitUid(room, now);
    return {
      ...meta,
      status: 'finished',
      ...(forfeitUid ? { forfeitUid, forfeitAt: getForfeitAt(room, now) } : {}),
    };
  }
  if (phase === 'playing' && meta.status === 'countdown') return { ...meta, status: 'playing' };
  if (
    meta.status === 'finished' &&
    players.length === 2 &&
    players.every((player) => player.rematchSeed === meta.seed)
  ) {
    let seed = newSeed();
    if (seed === meta.seed) seed = (seed + 1) >>> 0;
    return {
      hostUid: meta.hostUid,
      ...(meta.guestUid ? { guestUid: meta.guestUid } : {}),
      createdAt: meta.createdAt,
      durationSec: meta.durationSec,
      seed,
      status: 'lobby',
      startAt: null,
      endAt: null,
    };
  }
  return null;
}
