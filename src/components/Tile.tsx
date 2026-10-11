import React from 'react';
import type { LetterState } from '../utils/evaluateGuess';
import { SOLO_ANIMATION } from '../utils/revealTiming';

interface TileProps {
  letter?: string;
  /** Visual state of the tile */
  state: LetterState;
  /** Only relevant when isFlipping=true: the evaluated colour to reveal */
  flipColor?: 'correct' | 'present' | 'absent';
  isFlipping?: boolean;
  /** A regular offset between neighboring tiles. */
  flipDelay?: number;
  isBouncing?: boolean;
  bounceDelay?: number;
  flipDurationMs?: number;
  bounceDurationMs?: number;
}

// Maps evaluated LetterState → the CSS variable that holds that colour
const FLIP_COLOR_VAR: Record<string, string> = {
  correct: 'var(--correct)',
  present: 'var(--present)',
  absent: 'var(--absent)',
};

export const Tile: React.FC<TileProps> = ({
  letter,
  state,
  flipColor,
  isFlipping = false,
  flipDelay = 0,
  isBouncing = false,
  bounceDelay = 0,
  flipDurationMs = SOLO_ANIMATION.flipMs,
  bounceDurationMs = SOLO_ANIMATION.bounceMs,
}) => {
  const tileClass = [
    'tile',

    // "filled" border only when a letter is typed and NOT currently flipping
    // (during flip the animation handles its own border styling)
    state === 'tbd' && letter && !isFlipping ? 'tile--filled' : '',

    // Static evaluated colour classes – ONLY after flip completes
    !isFlipping && state === 'correct' ? 'tile--correct' : '',
    !isFlipping && state === 'present' ? 'tile--present' : '',
    !isFlipping && state === 'absent' ? 'tile--absent' : '',

    // Flip animation applied via animations.css (.tile--flipping)
    isFlipping ? 'tile--flipping' : '',

    // Win-bounce
    isBouncing ? 'tile--bounce' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Build inline style — CSS custom properties used by keyframe animations
  const tileStyle: React.CSSProperties = {};

  if (isFlipping) {
    // The same keyframe reveals the color and border while the tile is edge-on.
    // --flip-delay      : per-tile stagger so tiles flip one by one
    (tileStyle as Record<string, string>)['--tile-flip-color'] = flipColor
      ? FLIP_COLOR_VAR[flipColor]
      : 'var(--absent)';
    (tileStyle as Record<string, string>)['--flip-delay'] = `${flipDelay}ms`;
    (tileStyle as Record<string, string>)['--tile-flip-text'] =
      `var(--${flipColor ?? 'absent'}-text)`;
    (tileStyle as Record<string, string>)['--flip-duration'] = `${flipDurationMs}ms`;
  }

  if (isBouncing) {
    // The bounce animation in animations.css reads animationDelay
    tileStyle.animationDelay = `${bounceDelay}ms`;
    tileStyle.animationDuration = `${bounceDurationMs}ms`;
  }

  return (
    <div
      className={tileClass}
      style={tileStyle}
      role="gridcell"
      aria-label={
        letter ? `${letter.toUpperCase()}, ${state === 'tbd' ? 'not evaluated' : state}` : 'Empty'
      }
      data-state={state}
    >
      <div className="tile__inner">{letter?.toUpperCase()}</div>
    </div>
  );
};
