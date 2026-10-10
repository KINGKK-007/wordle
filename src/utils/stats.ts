export interface GameStats {
  played: number;
  wins: number;
  currentStreak: number;
  maxStreak: number;
  distribution: number[]; // index 0 = won in 1 guess, index 5 = won in 6
}

const DEFAULT_STATS: GameStats = {
  played: 0,
  wins: 0,
  currentStreak: 0,
  maxStreak: 0,
  distribution: [0, 0, 0, 0, 0, 0],
};

export function loadStats(mode: 'unlimited' | '2player'): GameStats {
  try {
    const key = `custom-wordle-stats-${mode}`;
    const raw = localStorage.getItem(key);
    if (!raw) return { ...DEFAULT_STATS, distribution: [0, 0, 0, 0, 0, 0] };
    const parsed = JSON.parse(raw) as Partial<GameStats>;
    return {
      played: parsed.played ?? 0,
      wins: parsed.wins ?? 0,
      currentStreak: parsed.currentStreak ?? 0,
      maxStreak: parsed.maxStreak ?? 0,
      distribution: parsed.distribution ?? [0, 0, 0, 0, 0, 0],
    };
  } catch {
    return { ...DEFAULT_STATS, distribution: [0, 0, 0, 0, 0, 0] };
  }
}

export function saveStats(mode: 'unlimited' | '2player', stats: GameStats): void {
  try {
    const key = `custom-wordle-stats-${mode}`;
    localStorage.setItem(key, JSON.stringify(stats));
  } catch {
    // ignore storage errors
  }
}

export function recordWin(mode: 'unlimited' | '2player', guessCount: number): GameStats {
  const stats = loadStats(mode);
  const newDist = [...stats.distribution];
  newDist[guessCount - 1] = (newDist[guessCount - 1] || 0) + 1;
  const newStreak = stats.currentStreak + 1;
  const updated: GameStats = {
    played: stats.played + 1,
    wins: stats.wins + 1,
    currentStreak: newStreak,
    maxStreak: Math.max(stats.maxStreak, newStreak),
    distribution: newDist,
  };
  saveStats(mode, updated);
  return updated;
}

export function recordLoss(mode: 'unlimited' | '2player'): GameStats {
  const stats = loadStats(mode);
  const updated: GameStats = {
    ...stats,
    played: stats.played + 1,
    currentStreak: 0,
  };
  saveStats(mode, updated);
  return updated;
}

export function getWinPercentage(stats: GameStats): number {
  if (stats.played === 0) return 0;
  return Math.round((stats.wins / stats.played) * 100);
}
