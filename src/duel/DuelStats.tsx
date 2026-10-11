import { loadDuelStats } from './stats';

export function DuelStatsPanel() {
  const stats = loadDuelStats();
  const items = [
    ['Played', stats.played],
    ['Wins', stats.wins],
    ['Losses', stats.losses],
    ['Draws', stats.draws],
    ['Win %', stats.played ? Math.round((stats.wins / stats.played) * 100) : 0],
  ] as const;
  return (
    <>
      <div className="stats-numbers duel-stats-numbers">
        {items.map(([label, value]) => (
          <div className="stat-item" key={label}>
            <div className="stat-item__value">{value}</div>
            <div className="stat-item__label">{label}</div>
          </div>
        ))}
      </div>
      <p className="distribution__title">Best words solved</p>
      <div className="duel-stats-best">
        {([60, 120, 300] as const).map((duration) => (
          <div key={duration}>
            <strong>{stats.bestWords[duration]}</strong>
            <span>{duration / 60} min</span>
          </div>
        ))}
      </div>
    </>
  );
}
