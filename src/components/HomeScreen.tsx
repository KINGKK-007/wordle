import type { ReactNode } from 'react';

interface HomeScreenProps {
  onUnlimited: () => void;
  onTwoPlayer: () => void;
  onDuel: () => void;
}

function ModeIcon({ kind }: { kind: 'duel' | 'secret' | 'solo' }) {
  const paths: Record<typeof kind, ReactNode> = {
    duel: (
      <>
        <path d="m5 4 15 15M19 4 4 19M4 4l4 1-3 3-1-4Zm16 0-4 1 3 3 1-4ZM3 17l4 4m10-4 4 4" />
      </>
    ),
    secret: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    solo: (
      <>
        <path
          d="M12 8c-2-3-3-4-5-4a5 5 0 0 0 0 10c2 0 3-1 5-4s3-4 5-4a5 5 0 0 1 0 10c-2 0-3-1-5-4"
          transform="translate(0 2)"
        />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  );
}

export function HomeScreen({ onUnlimited, onTwoPlayer, onDuel }: HomeScreenProps) {
  return (
    <main className="home-screen">
      <div className="home-screen__logo">
        <div className="home-screen__tiles" aria-hidden="true">
          {'RIVAL'.split('').map((letter, index) => (
            <span
              key={index}
              className={`home-tile home-tile--${['correct', 'correct', 'present', 'absent', 'correct'][index]}`}
            >
              {letter}
            </span>
          ))}
        </div>
        <p className="home-screen__eyebrow">The familiar puzzle. A little rivalry.</p>
        <h2 className="home-screen__logo-title">
          Five letters.
          <br />
          <span>Better together.</span>
        </h2>
        <p className="home-screen__logo-sub">Bring a friend. Find your next word.</p>
      </div>

      <div className="home-screen__modes" aria-label="Choose a game mode">
        <button
          className="mode-card mode-card--duel"
          onClick={onDuel}
          id="duel-mode-btn"
          aria-label="Live Duel: race a friend in real time"
        >
          <span className="mode-card__icon">
            <ModeIcon kind="duel" />
          </span>
          <span className="mode-card__body">
            <span className="mode-card__heading">
              <span className="mode-card__title">Live Duel</span>
              <span className="mode-card__badge">
                <span className="mode-card__live-dot" />
                Live · 1v1
              </span>
            </span>
            <span className="mode-card__desc">Same words. Same clock. Race a friend.</span>
            <span className="mode-card__detail">1, 2 or 5 minutes</span>
          </span>
          <span className="mode-card__arrow" aria-hidden="true">
            ↗
          </span>
        </button>
        <button
          className="mode-card mode-card--twoplayer"
          onClick={onTwoPlayer}
          id="twoplayer-mode-btn"
          aria-label="Secret Word: create or solve a personal word challenge"
        >
          <span className="mode-card__icon">
            <ModeIcon kind="secret" />
          </span>
          <span className="mode-card__body">
            <span className="mode-card__heading">
              <span className="mode-card__title">Secret Word</span>
              <span className="mode-card__badge">Play anytime</span>
            </span>
            <span className="mode-card__desc">Pick a word for a friend. Or solve theirs.</span>
            <span className="mode-card__detail">Your word. Their six guesses.</span>
          </span>
          <span className="mode-card__arrow" aria-hidden="true">
            →
          </span>
        </button>
        <button
          className="mode-card mode-card--unlimited"
          onClick={onUnlimited}
          id="unlimited-mode-btn"
          aria-label="Unlimited: play solo with random words"
        >
          <span className="mode-card__icon">
            <ModeIcon kind="solo" />
          </span>
          <span className="mode-card__body">
            <span className="mode-card__heading">
              <span className="mode-card__title">Unlimited</span>
              <span className="mode-card__badge">Solo</span>
            </span>
            <span className="mode-card__desc">A fresh word whenever you want one.</span>
            <span className="mode-card__detail">Practice at your own pace</span>
          </span>
          <span className="mode-card__arrow" aria-hidden="true">
            →
          </span>
        </button>
      </div>
      <div className="home-screen__footer">
        <p>
          Free to play <span aria-hidden="true">·</span> No sign-up
        </p>
        <div
          className="home-rules"
          aria-label="Five letters, six guesses. Green means right spot, yellow means wrong spot, gray means not in the word."
        >
          <span>5 letters · 6 guesses</span>
          <span className="home-rules__colors" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
    </main>
  );
}
