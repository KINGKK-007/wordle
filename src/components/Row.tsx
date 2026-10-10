import React from 'react';
import { Tile } from './Tile';
import type { EvaluatedLetter, LetterState } from '../utils/evaluateGuess';

interface RowProps {
  letters: string[];       // 0-5 letters for the current guess
  evaluated?: EvaluatedLetter[]; // evaluated results (if submitted)
  isCurrentRow?: boolean;
  isShaking?: boolean;
  isFlipping?: boolean;
  isBouncing?: boolean;
}

export const Row: React.FC<RowProps> = ({
  letters,
  evaluated,
  isCurrentRow = false,
  isShaking = false,
  isFlipping = false,
  isBouncing = false,
}) => {
  const tiles = Array(5).fill(null).map((_, i) => {
    let letter: string | undefined;
    let state: LetterState = 'empty';
    let evaluatedState: LetterState | undefined;

    if (evaluated) {
      letter = evaluated[i]?.letter;
      const evalState = evaluated[i]?.state ?? 'empty';

      if (isFlipping) {
        // During flip: show 'tbd' (filled tile style) before midpoint, evaluated color appears at midpoint
        state = 'tbd';
        evaluatedState = evalState;
      } else {
        state = evalState;
      }
    } else if (isCurrentRow && letters[i]) {
      letter = letters[i];
      state = 'tbd'; // typed but not submitted
    }

    return (
      <Tile
        key={i}
        letter={letter}
        state={state}
        evaluatedState={evaluatedState}
        isFlipping={isFlipping && !!evaluated}
        flipDelay={i * 300}
        isBouncing={isBouncing && !!evaluated}
        bounceDelay={i * 100}
      />
    );
  });

  return (
    <div
      className={`row${isShaking ? ' row--shake' : ''}`}
      role="group"
      aria-label={
        evaluated
          ? `Guess: ${evaluated.map(e => e.letter).join('').toUpperCase()}`
          : isCurrentRow
          ? 'Current guess'
          : 'Empty row'
      }
    >
      {tiles}
    </div>
  );
};
