import { useEffect, useId, useState } from 'react';
import { Modal } from './Modal';
import type { GameStats } from '../utils/stats';
import { getWinPercentage, loadStats } from '../utils/stats';
import { DuelStatsPanel } from '../duel/DuelStats';
import './statsTabs.css';

type StatsMode = 'unlimited' | '2player' | 'duel';
const modes: StatsMode[] = ['duel', '2player', 'unlimited'];

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats?: GameStats;
  mode: StatsMode;
  currentGuessCount?: number; // highlight the current game's bar
  gameStatus?: 'playing' | 'evaluating' | 'won' | 'lost';
  onPlayAgain?: () => void;
  onSetNewWord?: () => void;
}

export function StatsModal({
  isOpen,
  onClose,
  stats,
  mode,
  currentGuessCount,
  gameStatus = 'playing',
  onPlayAgain,
  onSetNewWord,
}: StatsModalProps) {
  const [tab, setTab] = useState(mode);
  const id = useId();
  useEffect(() => {
    if (isOpen) setTab(mode);
  }, [isOpen, mode]);
  const selected = tab === 'duel' ? null : tab === mode && stats ? stats : loadStats(tab);
  const winPct = selected ? getWinPercentage(selected) : 0;
  const maxCount = selected ? Math.max(...selected.distribution, 1) : 1;
  const isGameOver = gameStatus === 'won' || gameStatus === 'lost';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Statistics" aria-label="Statistics">
      <div className="stats-mode-tabs" role="tablist" aria-label="Game mode statistics">
        {modes.map((value, index) => (
          <button
            key={value}
            type="button"
            id={`${id}-${value}`}
            role="tab"
            aria-controls={`${id}-panel`}
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
              const next =
                event.key === 'Home'
                  ? modes[0]
                  : event.key === 'End'
                    ? modes.at(-1)
                    : offset
                      ? modes[(index + offset + modes.length) % modes.length]
                      : undefined;
              if (!next) return;
              event.preventDefault();
              setTab(next);
              document.getElementById(`${id}-${next}`)?.focus();
            }}
          >
            {value === 'duel' ? 'Live Duel' : value === '2player' ? 'Secret Word' : 'Unlimited'}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>
        {tab === 'duel' ? (
          <DuelStatsPanel />
        ) : (
          selected && (
            <>
              {/* Stats numbers */}
              <div className="stats-numbers">
                <div className="stat-item">
                  <div className="stat-item__value">{selected.played}</div>
                  <div className="stat-item__label">Played</div>
                </div>
                <div className="stat-item">
                  <div className="stat-item__value">{winPct}</div>
                  <div className="stat-item__label">Win %</div>
                </div>
                <div className="stat-item">
                  <div className="stat-item__value">{selected.currentStreak}</div>
                  <div className="stat-item__label">Current Streak</div>
                </div>
                <div className="stat-item">
                  <div className="stat-item__value">{selected.maxStreak}</div>
                  <div className="stat-item__label">Max Streak</div>
                </div>
              </div>

              {/* Guess distribution */}
              <div className="modal__section">
                <p className="distribution__title">Guess Distribution</p>
                {selected.distribution.map((count, idx) => {
                  const guessNum = idx + 1;
                  const isActive =
                    tab === mode && gameStatus === 'won' && currentGuessCount === guessNum;
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
            </>
          )
        )}
      </div>
      <p className="stats-local-note">Saved in this browser on this device.</p>

      {/* Actions for game-over states */}
      {isGameOver && tab === mode && (
        <div className="result-modal__actions">
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
              Create a word
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
