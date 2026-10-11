interface ChallengeScreenProps {
  onCreate: () => void;
  onJoin: () => void;
}

export function ChallengeScreen({ onCreate, onJoin }: ChallengeScreenProps) {
  return (
    <main className="challenge-screen">
      <div className="challenge-screen__intro">
        <span className="mode-eyebrow">Personal puzzles · Play anytime</span>
        <div className="challenge-screen__tiles" aria-hidden="true">
          {'YOURS'.split('').map((letter, index) => (
            <span
              className={`home-tile home-tile--${index === 2 ? 'present' : 'correct'}`}
              key={index}
            >
              {letter}
            </span>
          ))}
        </div>
        <h2>
          One word.
          <br />
          Picked just for them.
        </h2>
        <p>
          Send a friend a five-letter puzzle, or crack the one they chose for you. Six guesses. No
          timer.
        </p>
      </div>
      <div className="challenge-screen__choices">
        <button className="challenge-choice challenge-choice--create" onClick={onCreate}>
          <span className="challenge-choice__symbol" aria-hidden="true">
            ＋
          </span>
          <span>
            <strong>Create a word</strong>
            <small>Choose a word and share your puzzle</small>
          </span>
          <span aria-hidden="true">→</span>
        </button>
        <button className="challenge-choice" onClick={onJoin}>
          <span className="challenge-choice__symbol" aria-hidden="true">
            #
          </span>
          <span>
            <strong>Enter challenge code</strong>
            <small>Got a four-character code? Start here.</small>
          </span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <p className="challenge-screen__note">
        Want to play at the same time? Choose Live Duel from the menu.
      </p>
    </main>
  );
}
