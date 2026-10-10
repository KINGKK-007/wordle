import React from 'react';
import type { LetterState } from '../utils/evaluateGuess';

interface TileProps {
  letter?: string;
  state: LetterState;
  evaluatedState?: LetterState; // the "final" state shown after flip midpoint
  isFlipping?: boolean;
  flipDelay?: number;
  isBouncing?: boolean;
  bounceDelay?: number;
}

export const Tile: React.FC<TileProps> = ({
  letter,
  state,
  evaluatedState,
  isFlipping = false,
  flipDelay = 0,
  isBouncing = false,
  bounceDelay = 0,
}) => {
  // During flip: outer tile shows the evaluated color so it's visible on flip-out.
  // The inner content (flip animation) handles the rotation.
  const displayState = isFlipping ? (evaluatedState ?? state) : state;

  const tileClass = [
    'tile',
    displayState === 'tbd' && letter ? 'tile--filled' : '',
    displayState === 'correct' ? 'tile--correct' : '',
    displayState === 'present' ? 'tile--present' : '',
    displayState === 'absent'  ? 'tile--absent'  : '',
    isBouncing ? 'tile--bounce' : '',
  ].filter(Boolean).join(' ');

  const innerStyle: React.CSSProperties = {};

  if (isFlipping) {
    innerStyle.animationName = 'flip-in, flip-out';
    innerStyle.animationDuration = '250ms, 250ms';
    innerStyle.animationDelay = `${flipDelay}ms, ${flipDelay + 250}ms`;
    innerStyle.animationFillMode = 'both, both';
    innerStyle.animationTimingFunction = 'ease-in, ease-out';
  }

  if (isBouncing) {
    innerStyle.animationDelay = `${bounceDelay}ms`;
  }

  return (
    <div
      className={tileClass}
      aria-label={letter ? `${letter} ${displayState}` : 'empty'}
      data-state={displayState}
      data-animation={isFlipping ? 'flip' : isBouncing ? 'bounce' : undefined}
    >
      <div className="tile__inner" style={innerStyle}>
        {letter?.toUpperCase()}
      </div>
    </div>
  );
};
