import React, { useState, useCallback } from 'react';
import { Keyboard } from './Keyboard';
import { VALID_GUESS_SET } from '../data/validGuesses';
import type { LetterState } from '../utils/evaluateGuess';

interface SetWordScreenProps {
  onWordSet: (word: string) => void;
  onToast: (msg: string) => void;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const SetWordScreen: React.FC<SetWordScreenProps> = ({ onWordSet, onToast }) => {
  const [word, setWord] = useState('');
  const [hidden, setHidden] = useState(true);
  const [shaking, setShaking] = useState(false);

  const shake = useCallback(() => {
    setShaking(true);
    setTimeout(() => setShaking(false), 650);
  }, []);

  const handleKey = useCallback((key: string) => {
    if (key === 'Backspace') {
      setWord(prev => prev.slice(0, -1));
      return;
    }
    if (key === 'Enter') {
      const lower = word.toLowerCase();
      if (lower.length < 5) {
        onToast('Not enough letters');
        shake();
        return;
      }
      if (!VALID_GUESS_SET.has(lower)) {
        onToast('Not in word list');
        shake();
        return;
      }
      onWordSet(lower);
      return;
    }
    if (LETTERS.includes(key) && word.length < 5) {
      setWord(prev => prev + key);
    }
  }, [word, onWordSet, onToast, shake]);

  // Physical keyboard support
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'Enter') handleKey('Enter');
      else if (e.key === 'Backspace') handleKey('Backspace');
      else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toUpperCase());
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleKey]);

  const emptyLetterStates: Record<string, LetterState> = {};

  return (
    <main className="set-word-screen" role="main">
      <div className="set-word-screen__heading">
        <div
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            color: 'var(--present)',
            marginBottom: 8,
          }}
        >
          2-Player Mode
        </div>
        <h2 className="set-word-screen__title">Player 1: Set a Secret Word</h2>
        <p className="set-word-screen__subtitle">
          Type a 5-letter word, then generate a challenge link for Player 2
        </p>
      </div>

      {/* Word tiles */}
      <div
        className={`set-word-tiles${shaking ? ' row--shake' : ''}`}
        aria-label="Secret word input"
        role="group"
      >
        {Array(5).fill(null).map((_, i) => {
          const letter = word[i];
          const isActive = i === word.length;
          const isFilled = !!letter;

          return (
            <div
              key={i}
              className={[
                'set-word-tile',
                isActive && word.length < 5 ? 'set-word-tile--active' : '',
                isFilled ? 'set-word-tile--filled' : '',
                isFilled && hidden ? 'set-word-tile--hidden' : '',
              ].filter(Boolean).join(' ')}
              aria-label={
                isFilled
                  ? hidden ? 'Hidden letter' : `Letter ${letter}`
                  : isActive ? 'Current position' : 'Empty'
              }
            >
              {isFilled && !hidden ? letter : isFilled && hidden ? '' : ''}
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="set-word__controls">
        <button
          className="toggle-visibility"
          onClick={() => setHidden(h => !h)}
          aria-label={hidden ? 'Show word' : 'Hide word'}
          aria-pressed={!hidden}
        >
          {hidden ? '👁 Show Word' : '🙈 Hide Word'}
        </button>
      </div>

      {/* Keyboard */}
      <Keyboard letterStates={emptyLetterStates} onKey={handleKey} />

      {/* Submit button */}
      <button
        className="btn btn--primary"
        onClick={() => handleKey('Enter')}
        disabled={word.length < 5}
        id="generate-challenge-btn"
        style={{ marginBottom: 16, minWidth: 220 }}
      >
        Generate Challenge Link →
      </button>
    </main>
  );
};
