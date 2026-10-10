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
        <p className="help-text">Guess the <strong>Wordle</strong> in 6 tries.</p>
        <ul className="help-text" style={{ paddingLeft: '1.25em', marginBottom: 0 }}>
          <li>Each guess must be a valid 5-letter word.</li>
          <li>The color of the tiles will change to show how close your guess was to the word.</li>
        </ul>
      </div>

      <hr className="help-divider" />

      <p className="help-text" style={{ fontWeight: 700, marginBottom: 12 }}>Examples</p>

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
        <p className="help-text"><strong>Unlimited Mode:</strong> Play as many games as you want. A new random word every time you click "Play Again".</p>
        <p className="help-text"><strong>2-Player Mode:</strong> Player 1 sets a secret 5-letter word and shares a link or challenge code. Player 2 opens the link and guesses the word — standard Wordle rules apply.</p>
      </div>
    </Modal>
  );
};
