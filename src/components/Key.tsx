import React from 'react';
import type { LetterState } from '../utils/evaluateGuess';

interface KeyProps {
  label: string;
  state?: LetterState;
  isWide?: boolean;
  isSpacer?: boolean;
  onPress: (key: string) => void;
  disabled?: boolean;
}

export const Key: React.FC<KeyProps> = ({
  label,
  state,
  isWide,
  isSpacer,
  onPress,
  disabled = false,
}) => {
  if (isSpacer) return <div className="key key--spacer" aria-hidden="true" />;

  const keyClass = [
    'key',
    isWide ? 'key--wide' : '',
    state === 'correct' ? 'key--correct' : '',
    state === 'present' ? 'key--present' : '',
    state === 'absent' ? 'key--absent' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = () => onPress(label);
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault(); // prevent focus stealing from board
  };

  const ariaLabel =
    label === 'Enter'
      ? 'Enter'
      : label === 'Backspace'
        ? 'Delete'
        : state && state !== 'empty' && state !== 'tbd'
          ? `${label}, ${state}`
          : label;

  return (
    <button
      type="button"
      disabled={disabled}
      className={keyClass}
      aria-label={ariaLabel}
      data-key={label}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      tabIndex={0}
    >
      {label === 'Backspace' ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
          <line x1="18" y1="9" x2="12" y2="15" />
          <line x1="12" y1="9" x2="18" y2="15" />
        </svg>
      ) : (
        label
      )}
    </button>
  );
};
