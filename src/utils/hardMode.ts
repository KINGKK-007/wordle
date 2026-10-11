import type { EvaluatedLetter } from './evaluateGuess';

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

export function getHardModeError(guess: string, rows: EvaluatedLetter[][]): string | null {
  const requiredCounts: Record<string, number> = {};
  for (const row of rows) {
    const rowCounts: Record<string, number> = {};
    for (const [index, cell] of row.entries()) {
      if (cell.state === 'correct' && guess[index] !== cell.letter) {
        return `${ORDINALS[index]} letter must be ${cell.letter.toUpperCase()}`;
      }
      if (cell.state === 'correct' || cell.state === 'present') {
        rowCounts[cell.letter] = (rowCounts[cell.letter] ?? 0) + 1;
      }
    }
    for (const [letter, count] of Object.entries(rowCounts)) {
      requiredCounts[letter] = Math.max(requiredCounts[letter] ?? 0, count);
    }
  }
  for (const [letter, count] of Object.entries(requiredCounts)) {
    if ([...guess].filter(value => value === letter).length < count) {
      return count === 1 ? `Guess must contain ${letter.toUpperCase()}` : `Guess must contain ${count} ${letter.toUpperCase()}s`;
    }
  }
  return null;
}
