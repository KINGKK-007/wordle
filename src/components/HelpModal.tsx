import React from 'react';
import { Modal } from './Modal';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="How To Play" aria-label="How To Play">
      <div className="modal__section">
        <p className="help-text">
          Guess a <strong>five-letter word</strong> in six tries.
        </p>
        <ul className="help-text" style={{ paddingLeft: '1.25em', marginBottom: 0 }}>
          <li>Each guess must be a valid 5-letter word.</li>
          <li>The color of the tiles will change to show how close your guess was to the word.</li>
        </ul>
      </div>

      <hr className="help-divider" />

      <p className="help-text" style={{ fontWeight: 700, marginBottom: 12 }}>
        Examples
      </p>

      <div className="help-example">
        <div className="help-example__row">
          <div className="help-tile help-tile--correct">W</div>
          <div className="help-tile help-tile--empty">E</div>
          <div className="help-tile help-tile--empty">A</div>
          <div className="help-tile help-tile--empty">R</div>
          <div className="help-tile help-tile--empty">Y</div>
        </div>
        <p className="help-text">
          <strong>W</strong> is in the word and in the correct spot.
        </p>
      </div>

      <div className="help-example">
        <div className="help-example__row">
          <div className="help-tile help-tile--empty">P</div>
          <div className="help-tile help-tile--present">I</div>
          <div className="help-tile help-tile--empty">L</div>
          <div className="help-tile help-tile--empty">L</div>
          <div className="help-tile help-tile--empty">S</div>
        </div>
        <p className="help-text">
          <strong>I</strong> is in the word but in the wrong spot.
        </p>
      </div>

      <div className="help-example">
        <div className="help-example__row">
          <div className="help-tile help-tile--empty">V</div>
          <div className="help-tile help-tile--empty">A</div>
          <div className="help-tile help-tile--empty">G</div>
          <div className="help-tile help-tile--absent">U</div>
          <div className="help-tile help-tile--empty">E</div>
        </div>
        <p className="help-text">
          <strong>U</strong> is not in the word in any spot.
        </p>
      </div>

      <hr className="help-divider" />

      <div className="modal__section">
        <p className="help-text">
          <strong>Live Duel:</strong> Invite a friend and race the same words for 1, 2, or 5
          minutes. Both players tap Ready before the countdown. Solve the most words to win; you can
          see your friend's colors, but never their letters.
        </p>
        <p className="help-text">
          <strong>Secret Word:</strong> Create a word for a friend, or enter their four-character
          challenge code inside Secret Word. Shared puzzles have six guesses and no timer, so
          friends can play anytime.
        </p>
        <p className="help-text">
          <strong>Unlimited:</strong> Practice at your pace with a new random word after every game.
          Your current board and statistics are saved in this browser.
        </p>
      </div>
    </Modal>
  );
};
