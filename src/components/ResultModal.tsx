import React from 'react';
import type { EvaluatedLetter } from '../utils/evaluateGuess';
import { generateShareText, copyToClipboard } from '../utils/shareResult';
import { Modal } from './Modal';

interface ResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: 'won' | 'lost' | null;
  answer: string;
  guessCount: number;
  evaluatedRows: EvaluatedLetter[][];
  mode: 'unlimited' | '2player';
  highContrast: boolean;
  onPlayAgain?: () => void; // Unlimited mode
  onSetNewWord?: () => void; // 2P mode
  onBackToMenu: () => void;
  onShowToast: (msg: string) => void;
}

export const ResultModal: React.FC<ResultModalProps> = ({
  isOpen,
  onClose,
  status,
  answer,
  guessCount,
  evaluatedRows,
  mode,
  highContrast,
  onPlayAgain,
  onSetNewWord,
  onBackToMenu,
  onShowToast,
}) => {
  if (!status) return null;

  const handleShare = async () => {
    const count = status === 'won' ? guessCount : 'X';
    const text = generateShareText(evaluatedRows, count, mode, highContrast);
    const ok = await copyToClipboard(text);
    if (ok) {
      onShowToast('Copied results to clipboard!');
    } else {
      onShowToast('Unable to copy to clipboard');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={status === 'won' ? '🎉 You Won!' : 'Game Over'}
      aria-label={status === 'won' ? 'You won!' : 'Game over'}
    >
      {/* Answer reveal */}
      <div className="result-modal__answer">
        {status === 'lost' && (
          <>
            <p className="result-modal__answer-label">The word was</p>
            <p className="result-modal__answer-word">{answer.toUpperCase()}</p>
          </>
        )}
        {status === 'won' && (
          <>
            <p className="result-modal__answer-label">
              Solved in {guessCount} {guessCount === 1 ? 'try' : 'tries'}
            </p>
            <p className="result-modal__answer-word">{answer.toUpperCase()}</p>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="result-modal__actions">
        <button className="btn btn--secondary btn--full" onClick={handleShare}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          Share Result
        </button>

        {mode === 'unlimited' && onPlayAgain && (
          <button
            className="btn btn--primary btn--full"
            onClick={() => {
              onClose();
              onPlayAgain();
            }}
          >
            Play Again
          </button>
        )}

        {mode === '2player' && onSetNewWord && (
          <button
            className="btn btn--primary btn--full"
            onClick={() => {
              onClose();
              onSetNewWord();
            }}
          >
            Set a New Word
          </button>
        )}

        <button
          className="btn btn--outline btn--full"
          onClick={() => {
            onClose();
            onBackToMenu();
          }}
        >
          Back to Menu
        </button>
      </div>
    </Modal>
  );
};
