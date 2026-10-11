import { isRecord, readJson, writeStorage } from './storage';
import type { SoloMode } from './gamePersistence';

export interface GameStats {
  played: number;
  wins: number;
  currentStreak: number;
  maxStreak: number;
  distribution: number[];
}

interface StoredStats extends GameStats {
  completedGameIds: string[];
}
const memoryStats = new Map<SoloMode, StoredStats>();
const freshStats = (): StoredStats => ({
  played: 0,
  wins: 0,
  currentStreak: 0,
  maxStreak: 0,
  distribution: [0, 0, 0, 0, 0, 0],
  completedGameIds: [],
});
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function isGameStats(value: unknown): value is GameStats {
  return (
    isRecord(value) &&
    isCount(value.played) &&
    isCount(value.wins) &&
    value.wins <= value.played &&
    isCount(value.currentStreak) &&
    isCount(value.maxStreak) &&
    value.currentStreak <= value.maxStreak &&
    value.maxStreak <= value.wins &&
    Array.isArray(value.distribution) &&
    value.distribution.length === 6 &&
    value.distribution.every(isCount) &&
    value.distribution.reduce((sum: number, count: number) => sum + count, 0) === value.wins
  );
}

function readStats(mode: SoloMode): StoredStats {
  // A quota failure can leave an older, readable snapshot behind. Keep counting
  // from the latest in-memory write until storage accepts it again.
  const unsaved = memoryStats.get(mode);
  if (unsaved) return unsaved;
  const value = readJson(`custom-wordle-stats-${mode}`, isGameStats);
  if (!value) return freshStats();
  const ids =
    isRecord(value) &&
    Array.isArray(value.completedGameIds) &&
    value.completedGameIds.every((id) => typeof id === 'string')
      ? (value.completedGameIds as string[])
      : [];
  return { ...value, distribution: [...value.distribution], completedGameIds: ids };
}

export function loadStats(mode: SoloMode): GameStats {
  const stats = readStats(mode);
  return {
    played: stats.played,
    wins: stats.wins,
    currentStreak: stats.currentStreak,
    maxStreak: stats.maxStreak,
    distribution: [...stats.distribution],
  };
}

export function saveStats(mode: SoloMode, stats: GameStats): void {
  if (!isGameStats(stats)) return;
  const stored = {
    ...stats,
    distribution: [...stats.distribution],
    completedGameIds: readStats(mode).completedGameIds,
  };
  if (!writeStorage(`custom-wordle-stats-${mode}`, JSON.stringify(stored)))
    memoryStats.set(mode, stored);
  else memoryStats.delete(mode);
}

function record(mode: SoloMode, guessCount: number | null, gameId?: string): GameStats {
  const previous = readStats(mode);
  if (gameId && previous.completedGameIds.includes(gameId)) return loadStats(mode);
  const won = guessCount !== null;
  const currentStreak = won ? previous.currentStreak + 1 : 0;
  const distribution = [...previous.distribution];
  if (guessCount !== null) distribution[guessCount - 1] += 1;
  const updated: StoredStats = {
    played: previous.played + 1,
    wins: previous.wins + Number(won),
    currentStreak,
    maxStreak: Math.max(previous.maxStreak, currentStreak),
    distribution,
    completedGameIds: gameId ? [...previous.completedGameIds, gameId] : previous.completedGameIds,
  };
  if (!writeStorage(`custom-wordle-stats-${mode}`, JSON.stringify(updated)))
    memoryStats.set(mode, updated);
  else memoryStats.delete(mode);
  return { ...updated, distribution: [...updated.distribution] };
}

export function recordWin(mode: SoloMode, guessCount: number, gameId?: string): GameStats {
  if (!Number.isInteger(guessCount) || guessCount < 1 || guessCount > 6) return loadStats(mode);
  return record(mode, guessCount, gameId);
}

export function recordLoss(mode: SoloMode, gameId?: string): GameStats {
  return record(mode, null, gameId);
}

export function getWinPercentage(stats: GameStats): number {
  return stats.played === 0 ? 0 : Math.round((stats.wins / stats.played) * 100);
}
