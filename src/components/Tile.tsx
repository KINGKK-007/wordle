import React from 'react';
import type { LetterState } from '../utils/evaluateGuess';

interface TileProps {
  letter?: string;
  /** Visual state of the tile */
  state: LetterState;
  /** Only relevant when isFlipping=true: the target evaluated color */
  flipColor?: 'correct' | 'present' | 'absent';
  isFlipping?: boolean;
  flipDelay?: number;
  isBouncing?: boolean;
  bounceDelay?: number;
}

// Maps evaluated LetterState to the CSS variable that holds the colour
const FLIP_COLOR_VAR: Record<string, string> = {
  correct: 'var(--correct)',
  present: 'var(--present)',
  absent:  'var(--absent)',
};

export const Tile: React.FC<TileProps> = ({
  letter,
  state,
  flipColor,
  isFlipping = false,
  flipDelay = 0,
  isBouncing = false,
  bounceDelay = 0,
}) => {
  // During the flip animation we keep the tile looking "filled" (dark border,
  // no colour background) at the start. The CSS animation swaps the colour at
  // the midpoint (scaleY = 0) so it is never visible to the user.
  // The static tile--correct/present/absent classes are ONLY applied once the
  // flip is finished (isFlipping = false).
  const tileClass = [
    'tile',
    // filled: typed letter awaiting submission OR mid-flip (starts as filled)
    (state === 'tbd' && letter) || isFlipping ? 'tile--filled' : '',
    // colour classes — never during flip
    !isFlipping && state === 'correct' ? 'tile--correct' : '',
    !isFlipping && state === 'present' ? 'tile--present' : '',
    !isFlipping && state === 'absent'  ? 'tile--absent'  : '',
    // flip animation hook
    isFlipping ? 'tile--flipping' : '',
    // win bounce
    isBouncing ? 'tile--bounce' : '',
  ].filter(Boolean).join(' ');

  const tileStyle: React.CSSProperties = {};

  if (isFlipping && flipColor) {
    // These CSS custom properties are used by the tile-flip-color keyframe
    (tileStyle as Record<string, string>)['--tile-flip-color'] = FLIP_COLOR_VAR[flipColor];
    (tileStyle as Record<string, string>)['--flip-delay'] = `${flipDelay}ms`;
  }

  if (isBouncing) {
    tileStyle.animationDelay = `${bounceDelay}ms`;
  }

  return (
    <div
      className={tileClass}
      style={tileStyle}
      aria-label={letter ? `${letter.toUpperCase()} ${state}` : 'empty'}
      data-state={state}
    >
      <div className="tile__inner">
        {letter?.toUpperCase()}
      </div>
    </div>
  );
};
