import { rankDuel } from './logic';
import { formatTimer, resultExplanation } from './resultFormatting';
import type { PlayerProgress, RoomState } from './types';

interface DuelResultsProps {
  room: RoomState;
  uid: string;
  own: PlayerProgress;
  opponent: PlayerProgress;
  sequence: string[];
  guesses: Record<string, string[]>;
  busy: boolean;
  scoresSynced: boolean;
  onRematch: () => void;
  onShare: () => void;
  onLeave: () => void;
}

export function DuelResults({
  room,
  uid,
  own,
  opponent,
  sequence,
  guesses,
  busy,
  scoresSynced,
  onRematch,
  onShare,
  onLeave,
}: DuelResultsProps) {
  const result = rankDuel(own, opponent);
  const opponentEntry = Object.entries(room.players).find(([id]) => id !== uid);
  const opponentPlayer = opponentEntry?.[1];
  const ownVote = room.players[uid]?.rematchSeed === room.meta.seed;
  const opponentVote = opponentPlayer?.rematchSeed === room.meta.seed;
  const rows = [
    ['wordsSolved', 'Words solved', own.wordsSolved, opponent.wordsSolved],
    ['guesses', 'Guesses to solve', own.guessesOnSolved, opponent.guessesOnSolved],
    [
      'finalSolveTime',
      'Final solve',
      own.lastSolveMs === null ? '—' : formatTimer(own.lastSolveMs, true),
      opponent.lastSolveMs === null ? '—' : formatTimer(opponent.lastSolveMs, true),
    ],
    ['greens', 'Greens', own.totalGreens, opponent.totalGreens],
    ['yellows', 'Yellows', own.totalYellows, opponent.totalYellows],
  ] as const;
  const indices = [
    ...new Set([
      ...own.words.map((word) => word.index),
      ...opponent.words.map((word) => word.index),
    ]),
  ].sort((a, b) => a - b);
  const wordCell = (progress: PlayerProgress, index: number) => {
    const word = progress.words.find((item) => item.index === index);
    if (!word) return <span className="duel-muted">—</span>;
    return (
      <>
        <strong className={word.solved ? 'duel-solved' : undefined}>
          {word.solved ? 'Solved' : word.guessCount === 6 ? 'Failed' : 'Unsolved'}
        </strong>
        <span>
          {word.guessCount} {word.guessCount === 1 ? 'guess' : 'guesses'} ·{' '}
          {formatTimer(word.timeMs, true)}
        </span>
      </>
    );
  };
  return (
    <main className="duel-page duel-results">
      <div
        className={`duel-result-banner${result.winner === 'a' ? ' duel-result-banner--win' : ''}`}
      >
        <p className="duel-eyebrow">Live Duel · {room.meta.durationSec / 60} min</p>
        <h1>
          {result.decidedBy === 'forfeit' && result.winner === 'a'
            ? 'Opponent forfeited'
            : result.winner === 'a'
              ? 'You win!'
              : result.winner === 'b'
                ? 'You lose'
                : 'Draw'}
        </h1>
        <p>{resultExplanation(own, opponent)}</p>
        {!scoresSynced && <p role="status">Reconnecting to confirm final scores…</p>}
      </div>
      <table className="duel-comparison">
        <caption className="visually-hidden">Live Duel scores</caption>
        <thead>
          <tr>
            <th scope="col">Score</th>
            <th scope="col">You</th>
            <th scope="col">{opponentPlayer?.name ?? 'Opponent'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([criterion, label, a, b]) => (
            <tr
              key={criterion}
              className={result.decidedBy === criterion ? 'duel-deciding-row' : undefined}
            >
              <th scope="row">{label}</th>
              <td>{a}</td>
              <td>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="duel-score-explainer">
        Most words wins. Ties use guesses to solve, final solve time, then green and yellow clues.
      </p>
      <div className="duel-breakdown" tabIndex={0} role="region" aria-label="Per-word breakdown">
        {indices.length ? (
          indices.map((index) => (
            <div className="duel-word-result" key={index}>
              <h2>
                Word #{index + 1} <span>{sequence[index]?.toUpperCase()}</span>
              </h2>
              <div className="duel-word-columns">
                <div>
                  <small>You</small>
                  {wordCell(own, index)}
                </div>
                <div>
                  <small>{opponentPlayer?.name ?? 'Opponent'}</small>
                  {wordCell(opponent, index)}
                </div>
              </div>
              {!!guesses[index]?.length && (
                <details>
                  <summary>Your guesses</summary>
                  <p>{guesses[index].map((guess) => guess.toUpperCase()).join(' · ')}</p>
                </details>
              )}
            </div>
          ))
        ) : (
          <p className="duel-muted">No words submitted.</p>
        )}
      </div>
      {(opponentVote || ownVote) && (
        <p className="duel-rematch-note" role="status">
          {ownVote ? 'Waiting for opponent to accept…' : 'Opponent wants a rematch'}
        </p>
      )}
      <div className="duel-results-actions">
        <p className="duel-rematch-help">
          Same friend. Fresh words. Both players accept to play again.
        </p>
        <button
          className="btn btn--primary btn--full"
          onClick={onRematch}
          disabled={busy || !scoresSynced || ownVote || !opponentPlayer?.connected}
        >
          {ownVote ? 'Rematch requested' : opponentVote ? 'Accept Rematch' : 'Rematch'}
        </button>
        <div className="duel-actions">
          <button className="btn btn--outline" onClick={onShare} disabled={!scoresSynced}>
            Share Result
          </button>
          <button className="btn btn--secondary" onClick={onLeave}>
            Back to Menu
          </button>
        </div>
      </div>
    </main>
  );
}
