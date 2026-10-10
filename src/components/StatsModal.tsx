import React from 'react';
import { Modal } from './Modal';
import type { GameStats } from '../utils/stats';
import { getWinPercentage } from '../utils/stats';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: GameStats;
  mode: 'unlimited' | '2player';
  currentGuessCount?: number; // highlight the current game's bar
  gameStatus: 'playing' | 'evaluating' | 'won' | 'lost';
  onPlayAgain?: () => void;
  onSetNewWord?: () => void;
}

export const StatsModal: React.FC<StatsModalProps> = ({
  isOpen,
  onClose,
  stats,
  mode,
  currentGuessCount,
  gameStatus,
  onPlayAgain,
  onSetNewWord,
}) => {
  const winPct = getWinPercentage(stats);
  const maxCount = Math.max(...stats.distribution, 1);
  const isGameOver = gameStatus === 'won' || gameStatus === 'lost';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Statistics" aria-label="Statistics">
      {/* Stats numbers */}
      <div className="stats-numbers">
        <div className="stat-item">
          <div className="stat-item__value">{stats.played}</div>
          <div className="stat-item__label">Played</div>
        </div>
        <div className="stat-item">
          <div className="stat-item__value">{winPct}</div>
          <div className="stat-item__label">Win %</div>
        </div>
        <div className="stat-item">
          <div className="stat-item__value">{stats.currentStreak}</div>
          <div className="stat-item__label">Current Streak</div>
        </div>
        <div className="stat-item">
          <div className="stat-item__value">{stats.maxStreak}</div>
          <div className="stat-item__label">Max Streak</div>
        </div>
      </div>

      {/* Guess distribution */}
      <div className="modal__section">
        <p className="distribution__title">Guess Distribution</p>
        {stats.distribution.map((count, idx) => {
          const guessNum = idx + 1;
          const isActive = gameStatus === 'won' && currentGuessCount === guessNum;
          const pct = maxCount > 0 ? Math.max(7, Math.round((count / maxCount) * 100)) : 7;
          
          return (
            <div key={guessNum} className="distribution__row">
              <span className="distribution__num">{guessNum}</span>
              <div className="distribution__bar-container">
                <div
                  className={`distribution__bar${isActive ? ' distribution__bar--active' : ''}`}
                  style={{ width: `${pct}%` }}
                  aria-label={`${guessNum} guess${guessNum !== 1 ? 'es' : ''}: ${count}`}
                >
                  {count}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions for game-over states */}
      {isGameOver && (
        <div className="result-modal__actions">
          {mode === 'unlimited' && onPlayAgain && (
            <button className="btn btn--primary btn--full" onClick={() => { onClose(); onPlayAgain(); }}>
              Play Again
            </button>
          )}
          {mode === '2player' && onSetNewWord && (
            <button className="btn btn--primary btn--full" onClick={() => { onClose(); onSetNewWord(); }}>
              Set a New Word
            </button>
          )}
        </div>
      )}
    </Modal>
  );
};
