import type { DurationSec } from './types';

export interface DuelStats {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  bestWords: Record<DurationSec, number>;
  recorded: string[];
}

const KEY = 'custom-wordle-stats-duel';
let memoryStats: DuelStats | null = null;
const emptyStats = (): DuelStats => ({
  played: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  bestWords: { 60: 0, 120: 0, 300: 0 },
  recorded: [],
});
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function loadDuelStats(): DuelStats {
  if (memoryStats) return memoryStats;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return memoryStats ?? emptyStats();
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return emptyStats();
    const stats = value as Partial<DuelStats>;
    if (
      !count(stats.played) ||
      !count(stats.wins) ||
      !count(stats.losses) ||
      !count(stats.draws) ||
      stats.played !== stats.wins + stats.losses + stats.draws ||
      !stats.bestWords ||
      ![60, 120, 300].every((duration) => count(stats.bestWords?.[duration as DurationSec])) ||
      !Array.isArray(stats.recorded) ||
      !stats.recorded.every((id) => typeof id === 'string')
    )
      return emptyStats();
    return stats as DuelStats;
  } catch {
    return memoryStats ?? emptyStats();
  }
}

/** Persist the result and its receipt together so a refresh cannot count it twice. */
export function recordDuelResult(
  id: string,
  outcome: 'win' | 'loss' | 'draw',
  duration: DurationSec,
  wordsSolved: number,
): DuelStats {
  const stats = loadDuelStats();
  if (!id || !count(wordsSolved) || stats.recorded.includes(id)) return stats;
  const updated: DuelStats = {
    ...stats,
    played: stats.played + 1,
    wins: stats.wins + Number(outcome === 'win'),
    losses: stats.losses + Number(outcome === 'loss'),
    draws: stats.draws + Number(outcome === 'draw'),
    bestWords: { ...stats.bestWords, [duration]: Math.max(stats.bestWords[duration], wordsSolved) },
    recorded: [...stats.recorded, id],
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(updated));
    memoryStats = null;
  } catch {
    memoryStats = updated;
  }
  return updated;
}
