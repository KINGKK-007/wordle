import React, { useState } from 'react';
import { decodeFromCode } from '../utils/wordCodec';
import { ANSWER_SET } from '../data/answers';
import { VALID_GUESS_SET } from '../data/validGuesses';

interface CodeInputScreenProps {
  onCodeEntered: (word: string) => void;
  onToast?: (msg: string) => void;
  onCancel: () => void;
}

export const CodeInputScreen: React.FC<CodeInputScreenProps> = ({
  onCodeEntered,
  onCancel,
}) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 4) {
      setError('Challenge codes are 4 characters long');
      return;
    }
    const word = decodeFromCode(trimmed);
    if (!word) {
      setError('Invalid code — please check and try again');
      return;
    }
    // Validate word is in the dictionary
    if (!VALID_GUESS_SET.has(word) && !ANSWER_SET.has(word)) {
      setError('Invalid code — the word was not recognized');
      return;
    }
    setError('');
    onCodeEntered(word);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <main className="code-input-screen" role="main">
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: '0.7rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          color: 'var(--present)',
          marginBottom: 8,
        }}>
          2-Player Mode
        </div>
        <h2 className="code-input-screen__title">Enter Challenge Code</h2>
        <p className="code-input-screen__desc">
          Type the 8-character code shared by Player 1
        </p>
      </div>

      <input
        type="text"
        className="code-input"
        value={code}
        onChange={e => {
          setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 4));
          setError('');
        }}
        onKeyDown={handleKeyDown}
        maxLength={4}
        placeholder="XXXX"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        aria-label="Challenge code input"
        id="challenge-code-input"
        // Allow text selection for this input
        style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
      />

      {error && (
        <p style={{
          color: '#ff6b6b',
          fontSize: '0.875rem',
          textAlign: 'center',
          maxWidth: 260,
        }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 260 }}>
        <button
          className="btn btn--primary btn--full"
          onClick={handleSubmit}
          disabled={code.length < 4}
          id="submit-code-btn"
        >
          Start Game →
        </button>
        <button
          className="btn btn--outline btn--full"
          onClick={onCancel}
          id="cancel-code-btn"
        >
          ← Back
        </button>
      </div>
    </main>
  );
};
