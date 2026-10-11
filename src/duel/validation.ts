import { ANSWER_LIST } from '../data/answers';
import type { DuelPlayer, PlayerProgress, RoomState, WordProgress } from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
const time = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every(key => keys.includes(key));
const patterns = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= 6 && value.every(pattern => typeof pattern === 'string' && /^[012]{5}$/.test(pattern));

function isWordProgress(value: unknown): value is WordProgress {
  if (!isRecord(value) || !patterns(value.patterns) || !onlyKeys(value,
    ['index', 'solved', 'guessCount', 'startedAtMs', 'endedAtMs', 'timeMs', 'patterns'])) return false;
  const wordPatterns = value.patterns;
  return integer(value.index, ANSWER_LIST.length) && typeof value.solved === 'boolean' &&
    integer(value.guessCount, 6) && value.guessCount === wordPatterns.length &&
    time(value.startedAtMs) && time(value.endedAtMs) && value.endedAtMs <= 300000 && value.endedAtMs >= value.startedAtMs &&
    time(value.timeMs) && value.timeMs === value.endedAtMs - value.startedAtMs &&
    value.solved === wordPatterns.includes('22222') &&
    wordPatterns.every((pattern, index) => pattern !== '22222' || index === wordPatterns.length - 1);
}

export function isPlayerProgress(value: unknown): value is PlayerProgress {
  if (!isRecord(value) || !onlyKeys(value, ['seed', 'wordsSolved', 'guessesOnSolved', 'lastSolveMs',
    'totalGreens', 'totalYellows', 'totalGuesses', 'forfeited', 'currentWordIndex', 'currentWordStartedAtMs',
    'currentPatterns', 'words', 'finished', 'updatedAt']) ||
    !integer(value.seed, 0xffffffff) || !integer(value.currentWordIndex, ANSWER_LIST.length) ||
    !time(value.currentWordStartedAtMs) || value.currentWordStartedAtMs > 300000 ||
    !patterns(value.currentPatterns) || !Array.isArray(value.words) ||
    !value.words.every(isWordProgress) || value.words.length > ANSWER_LIST.length + 1 ||
    typeof value.finished !== 'boolean' || !time(value.updatedAt) ||
    (value.forfeited !== undefined && typeof value.forfeited !== 'boolean')) return false;
  const words = value.words as WordProgress[];
  if (words.length < value.currentWordIndex || words.some((word, index) => word.index !== index ||
    word.index > (value.currentWordIndex as number) ||
    (word.index < (value.currentWordIndex as number) && !word.solved && word.guessCount < 6) ||
    (index > 0 && word.startedAtMs < words[index - 1].endedAtMs))) return false;
  const allPatterns = words.flatMap(word => word.patterns);
  const solved = words.filter(word => word.solved);
  const totalGreens = allPatterns.reduce((count, pattern) => count + [...pattern].filter(color => color === '2').length, 0);
  const totalYellows = allPatterns.reduce((count, pattern) => count + [...pattern].filter(color => color === '1').length, 0);
  const current = words.find(word => word.index === value.currentWordIndex);
  if (current && current.startedAtMs !== value.currentWordStartedAtMs) return false;
  return value.wordsSolved === solved.length && value.guessesOnSolved === solved.reduce((count, word) => count + word.guessCount, 0) &&
    value.lastSolveMs === (solved.at(-1)?.endedAtMs ?? null) && value.totalGreens === totalGreens &&
    value.totalYellows === totalYellows && value.totalGuesses === allPatterns.length &&
    JSON.stringify(value.currentPatterns) === JSON.stringify(current?.patterns ?? []);
}

function isPlayer(value: unknown): value is DuelPlayer {
  if (!isRecord(value) || !onlyKeys(value, ['name', 'ready', 'readySeed', 'rematchSeed', 'joinedAt',
    'connected', 'lastSeen', 'forfeited', 'forfeitAt', 'forfeitClaim']) ||
    typeof value.name !== 'string' || value.name.length < 1 || value.name.length > 14 ||
    typeof value.ready !== 'boolean' || !integer(value.readySeed, 0xffffffff) ||
    !(value.rematchSeed === null || integer(value.rematchSeed, 0xffffffff)) ||
    !time(value.joinedAt) || typeof value.connected !== 'boolean' || !time(value.lastSeen) ||
    (value.forfeited !== undefined && typeof value.forfeited !== 'boolean') ||
    (value.forfeitAt !== undefined && !time(value.forfeitAt))) return false;
  return value.forfeitClaim === undefined || (isRecord(value.forfeitClaim) &&
    onlyKeys(value.forfeitClaim, ['uid', 'disconnectedAt', 'seed']) &&
    typeof value.forfeitClaim.uid === 'string' && time(value.forfeitClaim.disconnectedAt) && integer(value.forfeitClaim.seed, 0xffffffff));
}

export function isRoomState(value: unknown): value is RoomState {
  if (!isRecord(value) || !onlyKeys(value, ['meta', 'players', 'progress']) ||
    !isRecord(value.meta) || !isRecord(value.players) || !isRecord(value.progress)) return false;
  const meta = value.meta;
  if (!onlyKeys(meta, ['hostUid', 'guestUid', 'createdAt', 'durationSec', 'seed', 'status', 'startAt', 'endAt', 'forfeitUid', 'forfeitAt']) ||
    typeof meta.hostUid !== 'string' || !time(meta.createdAt) || ![60, 120, 300].includes(meta.durationSec as number) ||
    !integer(meta.seed, 0xffffffff) || !['lobby', 'countdown', 'playing', 'finished'].includes(meta.status as string) ||
    !(meta.startAt === null || time(meta.startAt)) || !(meta.endAt === null || time(meta.endAt)) ||
    (meta.guestUid !== undefined && typeof meta.guestUid !== 'string') ||
    (meta.forfeitUid !== undefined && typeof meta.forfeitUid !== 'string') ||
    (meta.forfeitAt !== undefined && !time(meta.forfeitAt))) return false;
  const players = Object.entries(value.players);
  return players.length <= 2 && players.every(([uid, player]) =>
    (uid === meta.hostUid || uid === meta.guestUid) && isPlayer(player)) &&
    Object.entries(value.progress).every(([uid, progress]) =>
      (uid === meta.hostUid || uid === meta.guestUid) && isPlayerProgress(progress));
}

/** RTDB omits nulls and empty arrays; normalize those before schema validation. */
export function parseRoom(value: unknown): RoomState | null {
  if (!isRecord(value) || !isRecord(value.meta)) return null;
  const meta = { ...value.meta, startAt: value.meta.startAt ?? null, endAt: value.meta.endAt ?? null };
  const players: Record<string, unknown> = {};
  for (const [uid, player] of Object.entries(isRecord(value.players) ? value.players : {})) {
    if (!isRecord(player)) return null;
    players[uid] = { ...player, rematchSeed: player.rematchSeed ?? null };
  }
  const progress: Record<string, unknown> = {};
  for (const [uid, entry] of Object.entries(isRecord(value.progress) ? value.progress : {})) {
    if (!isRecord(entry)) return null;
    const words = Array.isArray(entry.words) ? entry.words : [];
    progress[uid] = { ...entry, lastSolveMs: entry.lastSolveMs ?? null, currentPatterns: entry.currentPatterns ?? [],
      words: words.map(word => isRecord(word) ? { ...word, patterns: word.patterns ?? [] } : word) };
  }
  const room = { meta, players, progress };
  return isRoomState(room) ? room : null;
}
