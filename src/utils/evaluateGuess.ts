// Evaluate a guess against the answer using the two-pass algorithm
// that correctly handles duplicate letters (matches NYT Wordle exactly)

export type LetterState = 'correct' | 'present' | 'absent' | 'empty' | 'tbd';

export interface EvaluatedLetter {
  letter: string;
  state: LetterState;
}

/**
 * Evaluates a 5-letter guess against the answer.
 * Uses two-pass algorithm for correct duplicate handling:
 * Pass 1: Mark all correct (green) positions
 * Pass 2: Mark present (yellow) for remaining letters (only up to remaining count)
 *
 * Example: answer "ABBEY", guess "BOBBY"
 * B: pos 0 - not green (A is at pos 0)
 * O: pos 1 - not green
 * B: pos 2 - not green (B is at pos 0 in answer? No, answer is ABBEY: A-B-B-E-Y)
 *   Actually answer ABBEY: A(0) B(1) B(2) E(3) Y(4)
 *   Guess BOBBY: B(0) O(1) B(2) B(3) Y(4)
 *   Pass 1 greens: pos2=B(green), pos4=Y(green)
 *   Remaining in answer after greens removed: A(0), B(1), E(3) → [A, B, E]
 *   Pass 2: B(0) → B in remaining? yes → yellow, remove B from remaining
 *            O(1) → O in remaining? no → absent
 *            B(3) → B in remaining? no (already used) → absent
 */
export function evaluateGuess(guess: string, answer: string): EvaluatedLetter[] {
  const result: EvaluatedLetter[] = Array(5)
    .fill(null)
    .map((_, i) => ({
      letter: guess[i],
      state: 'absent' as LetterState,
    }));

  // Count remaining letters in answer (for pass 2)
  const answerLetterCount: Record<string, number> = {};

  // Pass 1: find all correct (green) positions
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) {
      result[i].state = 'correct';
    } else {
      // Count this answer letter as available for pass 2
      answerLetterCount[answer[i]] = (answerLetterCount[answer[i]] || 0) + 1;
    }
  }

  // Pass 2: find present (yellow) letters
  for (let i = 0; i < 5; i++) {
    if (result[i].state === 'correct') continue;
    const letter = guess[i];
    if (answerLetterCount[letter] && answerLetterCount[letter] > 0) {
      result[i].state = 'present';
      answerLetterCount[letter]--;
    }
  }

  return result;
}

/**
 * Gets the best known state for a letter across all evaluated rows.
 * Priority: correct > present > absent
 */
export function getBestLetterState(
  letter: string,
  evaluatedRows: EvaluatedLetter[][],
): LetterState | undefined {
  let best: LetterState | undefined;
  for (const row of evaluatedRows) {
    for (const el of row) {
      if (el.letter === letter) {
        if (el.state === 'correct') return 'correct';
        if (el.state === 'present' && best !== 'correct') best = 'present';
        if (el.state === 'absent' && best === undefined) best = 'absent';
      }
    }
  }
  return best;
}
