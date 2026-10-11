import React from 'react';
import { Key } from './Key';
import type { LetterState } from '../utils/evaluateGuess';

const ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['spacer','A','S','D','F','G','H','J','K','L','spacer'],
  ['Enter','Z','X','C','V','B','N','M','Backspace'],
];

interface KeyboardProps {
  letterStates: Record<string, LetterState>;
  onKey: (key: string) => void;
  disabled?: boolean;
}

export const Keyboard: React.FC<KeyboardProps> = ({ letterStates, onKey, disabled = false }) => {
  const handleKey = (key: string) => {
    if (!disabled) onKey(key);
  };

  return (
    <div className="keyboard" aria-label="On-screen keyboard" role="group">
      {ROWS.map((row, rowIdx) => (
        <div key={rowIdx} className="keyboard__row">
          {row.map((key, keyIdx) => {
            if (key === 'spacer') {
              return <Key key={`spacer-${keyIdx}`} label="" isSpacer onPress={handleKey} />;
            }
            const isWide = key === 'Enter' || key === 'Backspace';
            const state = /^[A-Z]$/.test(key) ? letterStates[key.toLowerCase()] : undefined;
            return (
              <Key
                key={key}
                label={key}
                state={state}
                isWide={isWide}
                onPress={handleKey}
                disabled={disabled}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};
