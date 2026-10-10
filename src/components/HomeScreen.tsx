import React from 'react';

interface HomeScreenProps {
  onUnlimited: () => void;
  onTwoPlayer: () => void;
  onEnterCode: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onUnlimited,
  onTwoPlayer,
  onEnterCode,
}) => {
  return (
    <main className="home-screen" role="main">
      {/* Logo */}
      <div className="home-screen__logo">
        <div className="home-screen__tiles" aria-hidden="true">
          <div className="home-tile home-tile--correct">C</div>
          <div className="home-tile home-tile--absent">U</div>
          <div className="home-tile home-tile--present">S</div>
          <div className="home-tile home-tile--correct">T</div>
          <div className="home-tile home-tile--absent">O</div>
        </div>
        <h1 className="home-screen__logo-title">Custom Wordle</h1>
        <p className="home-screen__logo-sub">Choose a game mode</p>
      </div>

      {/* Mode cards */}
      <div className="home-screen__modes">
        <button
          className="mode-card mode-card--unlimited"
          onClick={onUnlimited}
          id="unlimited-mode-btn"
          aria-label="Unlimited Mode: play solo with random words"
        >
          <span className="mode-card__badge">Solo</span>
          <span className="mode-card__icon" aria-hidden="true">♾️</span>
          <div className="mode-card__title">Unlimited Mode</div>
          <div className="mode-card__desc">
            Play endlessly with random words. Track your stats, streaks, and guess distribution.
          </div>
        </button>

        <button
          className="mode-card mode-card--twoplayer"
          onClick={onTwoPlayer}
          id="twoplayer-mode-btn"
          aria-label="2-Player Mode: set a word for a friend to guess"
        >
          <span className="mode-card__badge">2 Players</span>
          <span className="mode-card__icon" aria-hidden="true">🤝</span>
          <div className="mode-card__title">2-Player Mode</div>
          <div className="mode-card__desc">
            Set a secret word and share a challenge link or code. Your friend guesses it — Wordle-style.
          </div>
        </button>
      </div>

      {/* Enter challenge code */}
      <button
        className="btn btn--outline btn--sm"
        onClick={onEnterCode}
        id="enter-code-btn"
        aria-label="Enter a challenge code"
        style={{ marginTop: 8 }}
      >
        Enter Challenge Code
      </button>
    </main>
  );
};
