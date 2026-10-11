import React from 'react';
import { Row } from './Row';
import type { EvaluatedLetter } from '../utils/evaluateGuess';

interface BoardProps {
  guesses: string[];
  currentGuess: string;
  evaluatedRows: EvaluatedLetter[][];
  shakingRow: number | null;
  flippingRow: number | null;
  bouncingRow: number | null;
  flipStaggerMs?: number;
  flipDurationMs?: number;
  bounceDurationMs?: number;
}

export const Board: React.FC<BoardProps> = ({
  guesses,
  currentGuess,
  evaluatedRows,
  shakingRow,
  flippingRow,
  bouncingRow,
  flipStaggerMs = 300,
  flipDurationMs = 500,
  bounceDurationMs = 1000,
}) => {
  const rows = Array(6)
    .fill(null)
    .map((_, i) => {
      const isCurrentRow = i === guesses.length && i < 6;
      const isSubmitted = i < guesses.length;
      const isShaking = shakingRow === i;
      const isFlipping = flippingRow === i;
      const isBouncing = bouncingRow === i;

      if (isSubmitted) {
        return (
          <Row
            key={i}
            letters={guesses[i].split('')}
            evaluated={evaluatedRows[i]}
            isShaking={isShaking}
            isFlipping={isFlipping}
            isBouncing={isBouncing}
            flipStaggerMs={flipStaggerMs}
            flipDurationMs={flipDurationMs}
            bounceDurationMs={bounceDurationMs}
          />
        );
      }

      if (isCurrentRow) {
        return (
          <Row key={i} letters={currentGuess.split('')} isCurrentRow={true} isShaking={isShaking} />
        );
      }

      return <Row key={i} letters={[]} />;
    });

  return (
    <div className="board-container">
      <div className="board" aria-label="Wordle game board" role="grid">
        {rows}
      </div>
    </div>
  );
};
