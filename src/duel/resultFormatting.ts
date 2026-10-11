import { rankDuel } from './logic';
import type { PlayerSummary } from './types';

export function formatTimer(ms: number, tenths = false): string {
  const milliseconds = Math.max(0, ms);
  const seconds = milliseconds / 1000;
  const whole = tenths ? Math.floor(seconds) : Math.ceil(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}${tenths ? `.${Math.floor(milliseconds / 100) % 10}` : ''}`;
}

export function resultExplanation(a: PlayerSummary, b: PlayerSummary): string {
  const result = rankDuel(a, b);
  if (result.decidedBy === 'forfeit') {
    if (result.winner === 'draw') return 'Both players forfeited.';
    return result.winner === 'a' ? 'Opponent forfeited.' : 'You forfeited.';
  }
  if (result.winner === 'draw') return 'Every score tied. A perfect draw.';
  const winner = result.winner === 'a' ? a : b;
  const loser = result.winner === 'a' ? b : a;
  const subject = result.winner === 'a' ? 'You won' : 'Opponent won';
  switch (result.decidedBy) {
    case 'wordsSolved':
      return `${subject} on words solved (${winner.wordsSolved} vs ${loser.wordsSolved}).`;
    case 'guesses':
      return `${subject} on fewer guesses (${winner.guessesOnSolved} vs ${loser.guessesOnSolved}) after tying at ${a.wordsSolved} words.`;
    case 'finalSolveTime':
      return `${subject} on an earlier final solve (${formatTimer(winner.lastSolveMs ?? 0, true)} vs ${formatTimer(loser.lastSolveMs ?? 0, true)}).`;
    case 'greens':
      return `${subject} on more greens (${winner.totalGreens} vs ${loser.totalGreens}).`;
    case 'yellows':
      return `${subject} on more yellows (${winner.totalYellows} vs ${loser.totalYellows}).`;
    default:
      return 'Every score tied. A perfect draw.';
  }
}
