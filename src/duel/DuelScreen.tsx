import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '../components/Board';
import { Keyboard } from '../components/Keyboard';
import { Modal } from '../components/Modal';
import { SettingsModal } from '../components/SettingsModal';
import { StatsModal } from '../components/StatsModal';
import { useKeyboardInput } from '../hooks/useKeyboardInput';
import { VALID_GUESS_SET } from '../data/validGuesses';
import { getBestLetterState, type EvaluatedLetter, type LetterState } from '../utils/evaluateGuess';
import { copyToClipboard } from '../utils/shareResult';
import { createDuelTransport } from './transport';
import {
  advanceWord,
  finishProgress,
  getForfeitAt,
  getForfeitUid,
  getRoomPhase,
  isPlayerReady,
  isWordComplete,
  progressForPlayer,
  rankDuel,
  seededSequence,
  submitGuess,
} from './logic';
import {
  clearDuelSession,
  loadLocalDuel,
  loadNickname,
  markDuelHelpShown,
  saveDuelSession,
  saveLocalDuel,
  saveNickname,
  shouldShowDuelHelp,
  type LocalDuelState,
} from './localState';
import { recordDuelResult } from './stats';
import { DuelResults } from './DuelResults';
import { formatTimer } from './resultFormatting';
import { DUEL_TIMING } from './timing';
import type { DuelTransport, DurationSec, PlayerProgress, RoomState } from './types';
import './duel.css';

interface Settings {
  hardMode: boolean;
  highContrast: boolean;
}
export interface DuelScreenProps {
  code?: string;
  settings: Settings;
  onSettingsChange: (key: keyof Settings) => void;
  onToast: (message: string, duration?: number) => void;
  onBackToMenu: () => void;
}

const durationChoices = [60, 120, 300] as const;
const letterForPattern: Record<string, LetterState> = { 0: 'absent', 1: 'present', 2: 'correct' };
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Could not connect. Try again.';
const resultId = (room: RoomState, code: string, uid: string) =>
  `${code}:${room.meta.seed}:${room.meta.startAt}:${uid}`;

function DurationPicker({
  value,
  disabled,
  onChange,
}: {
  value: DurationSec;
  disabled?: boolean;
  onChange: (value: DurationSec) => void;
}) {
  return (
    <div className="duel-durations" role="group" aria-label="Time limit">
      {durationChoices.map((duration) => (
        <button
          type="button"
          key={duration}
          className={`duel-duration${value === duration ? ' duel-duration--selected' : ''}`}
          aria-pressed={value === duration}
          disabled={disabled}
          onClick={() => onChange(duration)}
        >
          {duration / 60} min
        </button>
      ))}
    </div>
  );
}

function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let stopped = false;
    let wakeLock: WakeLockSentinel | undefined;
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || (wakeLock && !wakeLock.released)) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (stopped) await lock.release();
        else wakeLock = lock;
      } catch {
        /* Unsupported power modes can reject the request. */
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', acquire);
      void wakeLock?.release().catch(() => {});
    };
  }, [active]);
}

export function DuelScreen({
  code,
  settings,
  onSettingsChange,
  onToast,
  onBackToMenu,
}: DuelScreenProps) {
  const [transport, setTransport] = useState<DuelTransport | null>(null);
  const [uid, setUid] = useState('');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [local, setLocal] = useState<LocalDuelState | null>(null);
  const [nickname, setNickname] = useState(() => loadNickname() ?? 'Player');
  const [nicknameConfirmed, setNicknameConfirmed] = useState(() => loadNickname() !== null);
  const [joinCode, setJoinCode] = useState('');
  const [duration, setDuration] = useState<DurationSec>(120);
  const [connected, setConnected] = useState(navigator.onLine);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [showHelp, setShowHelp] = useState(shouldShowDuelHelp);
  const [showStats, setShowStats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [flippingRow, setFlippingRow] = useState<number | null>(null);
  const [bouncingRow, setBouncingRow] = useState<number | null>(null);
  const [shakingRow, setShakingRow] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [milestone, setMilestone] = useState('');
  const localRef = useRef(local);
  const nicknameRef = useRef(nickname);
  const roomRef = useRef(room);
  const transportRef = useRef(transport);
  const mountedRef = useRef(true);
  const inputLockedRef = useRef(false);
  const pendingWriteRef = useRef<{ code: string; progress: PlayerProgress } | null>(null);
  const writingRef = useRef(false);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const previousPhase = useRef<string | null>(null);
  const finishingSeed = useRef<number | null>(null);

  roomRef.current = room;
  transportRef.current = transport;
  nicknameRef.current = nickname;

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      if (mountedRef.current) callback();
    }, delay);
    timers.current.add(timer);
    return timer;
  }, []);

  const commitLocal = useCallback((next: LocalDuelState) => {
    localRef.current = next;
    saveLocalDuel(next);
    setLocal(next);
  }, []);

  const flushProgress = useCallback(async () => {
    if (writingRef.current || !transportRef.current || !navigator.onLine) return;
    writingRef.current = true;
    try {
      while (pendingWriteRef.current && mountedRef.current) {
        const pending = pendingWriteRef.current;
        await transportRef.current.publishProgress(pending.code, pending.progress);
        if (pendingWriteRef.current === pending) pendingWriteRef.current = null;
      }
      if (mountedRef.current && navigator.onLine) setConnected(true);
    } catch {
      if (mountedRef.current) setConnected(false);
    } finally {
      writingRef.current = false;
    }
  }, []);

  const publish = useCallback(
    (progress: PlayerProgress) => {
      if (!code) return;
      pendingWriteRef.current = { code, progress };
      void flushProgress();
    },
    [code, flushProgress],
  );

  useEffect(() => {
    mountedRef.current = true;
    const pendingTimers = timers.current;
    let disposed = false;
    let instance: DuelTransport | null = null;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        instance = await createDuelTransport();
        const identity = await instance.init();
        if (disposed) {
          instance.dispose();
          return;
        }
        setTransport(instance);
        setUid(identity.uid);
        unsubscribe = instance.subscribeConnection((value) => {
          if (!disposed) {
            setConnected(value);
            if (value) void flushProgress();
          }
        });
      } catch (cause) {
        if (!disposed) setError(errorMessage(cause));
      }
    })();
    return () => {
      disposed = true;
      mountedRef.current = false;
      unsubscribe?.();
      instance?.dispose();
      pendingTimers.forEach(clearTimeout);
      pendingTimers.clear();
    };
  }, [flushProgress]);

  useEffect(() => {
    if (!transport) return;
    const tick = () => setNow(transport.getServerTime());
    tick();
    const clock = setInterval(tick, DUEL_TIMING.clockTickMs);
    const retry = setInterval(() => {
      void flushProgress();
      if (code) void transport.reconcileRoom(code).catch(() => {});
    }, DUEL_TIMING.retryMs);
    const handleOnline = () => {
      setConnected(navigator.onLine);
      void flushProgress();
      tick();
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOnline);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(clock);
      clearInterval(retry);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOnline);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [transport, code, flushProgress]);

  useEffect(() => {
    setRoom(null);
    setLocal(null);
    localRef.current = null;
    setShowResults(false);
    setFlippingRow(null);
    setBouncingRow(null);
    setError('');
    finishingSeed.current = null;
    previousPhase.current = null;
    inputLockedRef.current = false;
    pendingWriteRef.current = null;
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    if (!code || !transport || !uid || !nicknameConfirmed) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    setBusy(true);
    void transport
      .joinRoom(code, nicknameRef.current)
      .then(() => {
        if (cancelled) return;
        saveDuelSession(code, uid);
        unsubscribe = transport.subscribeRoom(code, (snapshot) => {
          if (cancelled) return;
          if (!snapshot) {
            setRoom(null);
            setError('Host left. This room is closed.');
            return;
          }
          setRoom(snapshot);
        // React immediately to readiness and presence; the interval also recovers missed ticks.
        void transport.reconcileRoom(code).catch(() => {});
        });
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [code, transport, uid, nicknameConfirmed]);

  useEffect(() => {
    if (!room || !code || !uid) return;
    const shared = progressForPlayer(room, uid);
    const current = localRef.current;
    if (!current || current.seed !== room.meta.seed) {
      const saved = loadLocalDuel(code, uid, room.meta.seed);
      const useSaved =
        saved &&
        (saved.progress.totalGuesses > shared.totalGuesses ||
          (saved.progress.totalGuesses === shared.totalGuesses &&
            saved.progress.currentWordIndex >= shared.currentWordIndex));
      const next: LocalDuelState = {
        version: 1,
        roomCode: code,
        uid,
        seed: room.meta.seed,
        progress: useSaved ? saved.progress : shared,
        guesses: saved?.guesses ?? {},
        currentGuess: useSaved ? saved.currentGuess : '',
      };
      if (
        getRoomPhase(room, transportRef.current?.getServerTime() ?? Date.now()) === 'playing' &&
        isWordComplete(next.progress)
      ) {
        next.progress = advanceWord(
          next.progress,
          transportRef.current?.getServerTime() ?? Date.now(),
          room.meta.startAt ?? Date.now(),
        );
        next.currentGuess = '';
      }
      commitLocal(next);
      setShowResults(false);
      setFlippingRow(null);
      setBouncingRow(null);
      finishingSeed.current = null;
      inputLockedRef.current = false;
      if (next.progress.updatedAt > shared.updatedAt) publish(next.progress);
    } else if (
      shared.totalGuesses > current.progress.totalGuesses ||
      (shared.totalGuesses === current.progress.totalGuesses &&
        shared.currentWordIndex > current.progress.currentWordIndex)
    ) {
      commitLocal({ ...current, progress: shared, currentGuess: '' });
    }
  }, [room, code, uid, commitLocal, publish]);

  const phase = room ? getRoomPhase(room, now) : null;
  const opponentId = room ? Object.keys(room.players).find((id) => id !== uid) : undefined;
  const opponentPlayer = opponentId && room ? room.players[opponentId] : undefined;
  const ownPlayer = room?.players[uid];
  const ownReady = room && ownPlayer ? isPlayerReady(room, ownPlayer) : false;
  const opponentProgress = room && opponentId ? progressForPlayer(room, opponentId) : null;
  const forfeitUid = room ? getForfeitUid(room, now) : null;
  const seed = room?.meta.seed;
  const sequence = useMemo(() => (seed === undefined ? [] : seededSequence(seed)), [seed]);
  const ownProgress = local?.progress;
  const remaining = room?.meta.endAt ? Math.max(0, room.meta.endAt - now) : 0;
  const countdown = room?.meta.startAt
    ? Math.max(1, Math.ceil((room.meta.startAt - now) / 1000))
    : 5;
  const remainingSeconds = Math.ceil(remaining / 1000);
  const finalAt = useMemo(() => {
    if (!room || phase !== 'finished') return null;
    if (!forfeitUid) return room.meta.endAt ?? room.meta.startAt ?? 0;
    const timestamp = getForfeitAt(room, now) ?? room.meta.endAt ?? 0;
    return Math.min(room.meta.endAt ?? timestamp, timestamp);
  }, [room, phase, forfeitUid, now]);
  const modalOpen = showHelp || showStats || showSettings || confirmLeave;
  const disabled =
    phase !== 'playing' ||
    modalOpen ||
    flippingRow !== null ||
    bouncingRow !== null ||
    !!ownProgress?.finished ||
    !!forfeitUid;
  useWakeLock(phase === 'playing' || phase === 'countdown');

  useEffect(() => {
    if (previousPhase.current === 'countdown' && phase === 'lobby')
      onToast('Countdown cancelled. Ready up again.');
    previousPhase.current = phase;
    if (phase === 'playing') setMilestone('Duel started.');
  }, [phase, onToast]);

  useEffect(() => {
    if (phase !== 'playing') return;
    if ([60, 30, 10, 5].includes(remainingSeconds))
      setMilestone(`${remainingSeconds} seconds left.`);
  }, [phase, remainingSeconds]);

  useEffect(() => {
    if (
      phase !== 'finished' ||
      !room ||
      !local ||
      !code ||
      finishingSeed.current === room.meta.seed
    )
      return;
    finishingSeed.current = room.meta.seed;
    inputLockedRef.current = true;
    const endedAt = finalAt ?? room.meta.endAt ?? now;
    const progress = finishProgress(local.progress, endedAt, room.meta.startAt ?? now);
    commitLocal({ ...local, progress, currentGuess: '' });
    publish(progress);
    setFlippingRow(null);
    setBouncingRow(null);
    setMilestone(forfeitUid ? 'Duel ended by forfeit.' : "Time's up!");
  }, [phase, room, local, code, forfeitUid, finalAt, now, commitLocal, publish]);

  useEffect(() => {
    if (phase !== 'finished') return;
    const pendingTimers = timers.current;
    const timer = schedule(() => setShowResults(true), forfeitUid ? 250 : DUEL_TIMING.timesUpMs);
    return () => {
      clearTimeout(timer);
      pendingTimers.delete(timer);
    };
  }, [phase, seed, forfeitUid, schedule]);

  const ownFinal = useMemo(
    () =>
      ownProgress
        ? { ...ownProgress, forfeited: ownProgress.forfeited || forfeitUid === uid }
        : null,
    [ownProgress, forfeitUid, uid],
  );
  const opponentFinal = useMemo(() => {
    if (!room || !opponentId) return null;
    const progress = progressForPlayer(room, opponentId);
    const completed =
      finalAt === null ? progress : finishProgress(progress, finalAt, room.meta.startAt ?? finalAt);
    return { ...completed, forfeited: completed.forfeited || forfeitUid === opponentId };
  }, [room, opponentId, finalAt, forfeitUid]);
  const scoresReady = !!ownFinal?.finished && !!opponentFinal?.finished;
  const ownShared = room && uid ? progressForPlayer(room, uid) : null;
  const scoresSynced = !!forfeitUid || !!(ownShared?.finished && opponentProgress?.finished);
  useEffect(() => {
    if (
      phase !== 'finished' ||
      !scoresReady ||
      !scoresSynced ||
      !room ||
      !code ||
      !ownFinal ||
      !opponentFinal
    )
      return;
    const result = rankDuel(ownFinal, opponentFinal);
    recordDuelResult(
      resultId(room, code, uid),
      result.winner === 'a' ? 'win' : result.winner === 'b' ? 'loss' : 'draw',
      room.meta.durationSec,
      ownFinal.wordsSolved,
    );
  }, [phase, scoresReady, scoresSynced, room, code, uid, ownFinal, opponentFinal]);

  const handleKey = useCallback(
    (key: string) => {
      const current = localRef.current;
      const snapshot = roomRef.current;
      const connection = transportRef.current;
      if (!current || !snapshot || !connection || disabled || inputLockedRef.current) return;
      const enteredAt = connection.getServerTime();
      if (
        getRoomPhase(snapshot, enteredAt) !== 'playing' ||
        enteredAt >= (snapshot.meta.endAt ?? 0)
      )
        return;
      if (key === 'Backspace') {
        commitLocal({ ...current, currentGuess: current.currentGuess.slice(0, -1) });
        return;
      }
      if (/^[a-z]$/i.test(key)) {
        if (current.currentGuess.length < 5)
          commitLocal({ ...current, currentGuess: current.currentGuess + key.toLowerCase() });
        return;
      }
      if (key !== 'Enter') return;
      const result = submitGuess(current.progress, {
        guess: current.currentGuess,
        answer: sequence[current.progress.currentWordIndex],
        now: enteredAt,
        startAt: snapshot.meta.startAt ?? enteredAt,
        endAt: snapshot.meta.endAt ?? enteredAt,
        validGuesses: VALID_GUESS_SET,
      });
      if (!result.accepted) {
        onToast(result.error ?? 'Try again.');
        setShakingRow(current.progress.currentPatterns.length);
        schedule(() => setShakingRow(null), 600);
        return;
      }
      inputLockedRef.current = true;
      const row = current.progress.currentPatterns.length;
      commitLocal({
        ...current,
        progress: result.progress,
        currentGuess: '',
        guesses: {
          ...current.guesses,
          [current.progress.currentWordIndex]: [
            ...(current.guesses[current.progress.currentWordIndex] ?? []),
            current.currentGuess,
          ],
        },
      });
      publish(result.progress);
      setFlippingRow(row);
      schedule(() => {
        setFlippingRow(null);
        if (!result.wordComplete) {
          inputLockedRef.current = false;
          return;
        }
        if (result.solved) {
          setBouncingRow(row);
          onToast('Solved!', 700);
        } else onToast(sequence[current.progress.currentWordIndex].toUpperCase(), 800);
        schedule(() => {
          setBouncingRow(null);
          const latest = localRef.current;
          const latestRoom = roomRef.current;
          const serverNow = connection.getServerTime();
          if (!latest || !latestRoom || getRoomPhase(latestRoom, serverNow) !== 'playing') return;
          const progress = advanceWord(
            latest.progress,
            serverNow,
            latestRoom.meta.startAt ?? serverNow,
          );
          commitLocal({ ...latest, progress, currentGuess: '' });
          publish(progress);
          inputLockedRef.current = false;
        }, DUEL_TIMING.wordPauseMs);
      }, DUEL_TIMING.revealMs);
    },
    [disabled, sequence, onToast, commitLocal, publish, schedule],
  );
  useKeyboardInput(handleKey, disabled);

  const runAction = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      try {
        await action();
      } catch (cause) {
        if (mountedRef.current) onToast(errorMessage(cause));
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [onToast],
  );

  const leave = useCallback(() => {
    const snapshot = roomRef.current;
    if (snapshot && code && transport) {
      if (getRoomPhase(snapshot, transport.getServerTime()) === 'playing' && localRef.current) {
        recordDuelResult(
          resultId(snapshot, code, uid),
          'loss',
          snapshot.meta.durationSec,
          localRef.current.progress.wordsSolved,
        );
      }
      void transport.leaveRoom(code).catch(() => {});
    }
    clearDuelSession();
    onBackToMenu();
  }, [code, transport, uid, onBackToMenu]);

  useEffect(() => {
    const handler = (event: Event) => {
      const action: unknown = (event as CustomEvent<{ action?: unknown }>).detail?.action;
      if (action === 'help') setShowHelp(true);
      if (action === 'stats') setShowStats(true);
      if (action === 'settings') setShowSettings(true);
      if (action === 'menu') {
        const snapshot = roomRef.current;
        if (
          snapshot &&
          transportRef.current &&
          getRoomPhase(snapshot, transportRef.current.getServerTime()) === 'playing'
        )
          setConfirmLeave(true);
        else leave();
      }
    };
    window.addEventListener('header-action', handler);
    return () => window.removeEventListener('header-action', handler);
  }, [leave]);

  const copy = async (value: string, success: string) => {
    onToast(
      (await copyToClipboard(value)) ? success : 'Copy unavailable. Select the code or link.',
    );
  };
  const roomLink = code ? `${window.location.origin}/#/duel/${code}` : '';
  const confirmNickname = () => {
    setNickname(saveNickname(nickname));
    setNicknameConfirmed(true);
  };
  const evaluatedRows: EvaluatedLetter[][] =
    ownProgress?.currentPatterns.map((pattern, row) =>
      pattern.split('').map((state, column) => ({
        letter: local?.guesses[ownProgress.currentWordIndex]?.[row]?.[column] ?? '',
        state: letterForPattern[state],
      })),
    ) ?? [];
  const revealedRows = evaluatedRows.filter((_, index) => index !== flippingRow);
  const letterStates: Record<string, LetterState> = {};
  for (const row of revealedRows)
    for (const { letter } of row) {
      const state = getBestLetterState(letter, revealedRows);
      if (letter && state) letterStates[letter] = state;
    }

  let content;
  if (error) {
    content = (
      <main className="duel-page duel-empty">
        <h1>{error.includes("isn't configured") ? 'Duel coming soon' : 'Could not join duel'}</h1>
        <p role="alert">{error}</p>
        <button className="btn btn--primary" onClick={leave}>
          Back to Menu
        </button>
      </main>
    );
  } else if (!code) {
    content = (
      <main className="duel-page duel-menu">
        <div className="duel-heading">
          <p className="duel-eyebrow">Same words. Same clock.</p>
          <h1>Duel (1v1)</h1>
          <p>Race a friend. Solve the most words before time runs out.</p>
        </div>
        <label className="duel-field">
          Nickname
          <input
            maxLength={14}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            autoComplete="nickname"
          />
        </label>
        <section className="duel-panel">
          <h2>Create a duel</h2>
          <DurationPicker value={duration} onChange={setDuration} disabled={busy} />
          <button
            className="btn btn--primary btn--full"
            disabled={busy || !transport}
            onClick={() =>
              void runAction(async () => {
                if (!transport) return;
                const displayName = saveNickname(nickname);
                setNickname(displayName);
                setNicknameConfirmed(true);
                const room = await transport.createRoom({ durationSec: duration, displayName });
                saveDuelSession(room.code, uid);
                window.location.hash = `/duel/${room.code}`;
              })
            }
          >
            Create Duel
          </button>
        </section>
        <section className="duel-panel">
          <h2>Join a duel</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (joinCode.length !== 5) {
                onToast('Enter a 5-character room code.');
                return;
              }
              confirmNickname();
              window.location.hash = `/duel/${joinCode}`;
            }}
          >
            <label className="duel-field">
              Room code
              <input
                aria-label="Room code"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={5}
                value={joinCode}
                placeholder="ABCDE"
                onPaste={(event) => {
                  const pasted = event.clipboardData.getData('text').trim();
                  const extracted =
                    pasted.match(/#\/duel\/([A-Z2-9]{5})(?:$|[?&#/])/i)?.[1] ?? pasted;
                  event.preventDefault();
                  setJoinCode(
                    extracted
                      .toUpperCase()
                      .replace(/[^A-Z2-9]/g, '')
                      .slice(0, 5),
                  );
                }}
                onChange={(event) =>
                  setJoinCode(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z2-9]/g, '')
                      .slice(0, 5),
                  )
                }
              />
              <button
                className="btn btn--outline btn--full"
                disabled={busy || !transport || joinCode.length !== 5}
              >
                Join Duel
              </button>
            </label>
          </form>
        </section>
        <p className="duel-menu-status" role="status">
          {transport ? (connected ? 'Connected' : 'Reconnecting…') : 'Connecting…'}
        </p>
      </main>
    );
  } else if (!nicknameConfirmed) {
    content = (
      <main className="duel-page duel-empty">
        <h1>Join {code}</h1>
        <p>Choose a nickname for this duel.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            confirmNickname();
          }}
        >
          <label className="duel-field">
            Nickname
            <input
              maxLength={14}
              value={nickname}
              autoComplete="nickname"
              onChange={(event) => setNickname(event.target.value)}
            />
          </label>
          <button className="btn btn--primary btn--full" disabled={!transport}>
            Join Duel
          </button>
        </form>
      </main>
    );
  } else if (!room || !local) {
    content = (
      <main className="duel-page duel-empty">
        <h1>Joining duel…</h1>
        <p role="status">{connected ? 'Finding your room.' : 'Reconnecting…'}</p>
      </main>
    );
  } else if (phase === 'lobby' || phase === 'countdown') {
    content = (
      <main className="duel-page duel-lobby">
        <div className="duel-heading">
          <p className="duel-eyebrow">Invite a friend</p>
          <h1 className="duel-room-code">{code}</h1>
          <p className="duel-room-link">{roomLink}</p>
        </div>
        <div className="duel-actions">
          <button className="btn btn--outline" onClick={() => void copy(code, 'Code copied')}>
            Copy Code
          </button>
          <button className="btn btn--outline" onClick={() => void copy(roomLink, 'Link copied')}>
            Copy Link
          </button>
          {typeof navigator.share === 'function' && (
            <button
              className="btn btn--outline"
              onClick={() =>
                void navigator
                  .share({
                    title: 'Custom Wordle Duel',
                    text: 'Race me in a Wordle duel!',
                    url: roomLink,
                  })
                  .catch(() => {})
              }
            >
              Share
            </button>
          )}
        </div>
        {room.meta.hostUid === uid ? (
          <div>
            <p className="duel-eyebrow">Time limit</p>
            <DurationPicker
              value={room.meta.durationSec}
              disabled={busy || phase === 'countdown'}
              onChange={(value) => void runAction(() => transport!.setDuration(code, value))}
            />
          </div>
        ) : (
          <p className="duel-duration-label">{room.meta.durationSec / 60}-minute duel</p>
        )}
        <div className="duel-players">
          {[uid, opponentId].map((id, index) => {
            const player = id ? room.players[id] : undefined;
            const ready = player && isPlayerReady(room, player);
            return (
              <div className="duel-player" key={index}>
                <span
                  className={`duel-connection-dot${player?.connected ? ' duel-connection-dot--online' : ''}`}
                  aria-label={player?.connected ? 'Connected' : 'Disconnected'}
                />
                <h2>{index === 0 ? 'You' : 'Opponent'}</h2>
                <p>{player?.name ?? 'Waiting for opponent…'}</p>
                <strong className={ready ? 'duel-solved' : undefined}>
                  {ready ? 'Ready ✓' : player ? 'Joined' : 'Not joined'}
                </strong>
              </div>
            );
          })}
        </div>
        <button
          className="btn btn--primary btn--full"
          disabled={busy || !ownPlayer || !opponentPlayer?.connected || !connected}
          onClick={() => void runAction(() => transport!.setReady(code, !ownReady))}
        >
          {ownReady ? 'Not ready' : 'Ready'}
        </button>
        <p className="duel-muted duel-centered" role="status">
          {opponentPlayer ? 'Both players must be ready.' : 'Waiting for opponent…'}
        </p>
        <p className="duel-menu-status" role="status">
          {connected ? 'Connected' : 'Reconnecting…'}
        </p>
        {phase === 'countdown' && (
          <div className="duel-countdown" aria-live="polite">
            <p>Get ready!</p>
            <strong key={countdown}>{countdown}</strong>
            <button
              className="btn btn--outline"
              onClick={() => void runAction(() => transport!.setReady(code, false))}
            >
              Not ready
            </button>
          </div>
        )}
      </main>
    );
  } else if (showResults && scoresReady && ownFinal && opponentFinal) {
    content = (
      <DuelResults
        room={room}
        uid={uid}
        own={ownFinal}
        opponent={opponentFinal}
        sequence={sequence}
        guesses={local.guesses}
        busy={busy}
        scoresSynced={scoresSynced}
        onRematch={() => void runAction(() => transport!.requestRematch(code))}
        onLeave={leave}
        onShare={() => {
          const result = rankDuel(ownFinal, opponentFinal);
          const text = `Custom Wordle Duel ⚔️ ${formatTimer(room.meta.durationSec * 1000)} — ${ownFinal.wordsSolved} words vs ${opponentFinal.wordsSolved} · ${result.winner === 'a' ? 'I won!' : result.winner === 'b' ? 'I lost' : 'Draw'} 🟩🟨\n${roomLink}`;
          void copy(text, 'Result copied');
        }}
      />
    );
  } else {
    content = (
      <main className="duel-game">
        <div className="duel-hud">
          <div>
            <p className="duel-score">
              You {ownProgress?.wordsSolved ?? 0} <span>—</span>{' '}
              {opponentProgress?.wordsSolved ?? 0} Opp
            </p>
            <p className="duel-word-number">Word #{(ownProgress?.currentWordIndex ?? 0) + 1}</p>
          </div>
          <strong
            className={`duel-timer${remaining <= 10_000 ? ' duel-timer--urgent' : ''}`}
            aria-label={`${formatTimer(remaining)} remaining`}
          >
            {formatTimer(remaining)}
          </strong>
        </div>
        <div className="duel-opponent" aria-label="Opponent progress">
          <div>
            <p>
              <span
                className={`duel-connection-dot${opponentPlayer?.connected ? ' duel-connection-dot--online' : ''}`}
              />
              {opponentPlayer?.name ?? 'Opponent'}
            </p>
            <small>
              {opponentPlayer?.connected
                ? `Word #${(opponentProgress?.currentWordIndex ?? 0) + 1} · ${opponentProgress?.wordsSolved ?? 0} solved`
                : 'Opponent disconnected, waiting…'}
            </small>
          </div>
          <div
            className="duel-mini-grid"
            role="img"
            aria-label={`Opponent current word: ${opponentProgress?.currentPatterns.length ?? 0} guesses`}
          >
            {Array.from({ length: 6 }, (_, row) =>
              Array.from({ length: 5 }, (_, col) => (
                <i
                  aria-hidden="true"
                  key={`${row}-${col}`}
                  className={`duel-mini-tile${opponentProgress?.currentPatterns[row]?.[col] ? ` duel-mini-tile--${opponentProgress.currentPatterns[row][col]}` : ''}`}
                />
              )),
            )}
          </div>
        </div>
        {!connected && (
          <div className="duel-offline" role="status">
            Reconnecting… Your guesses are saved.
          </div>
        )}
        <Board
          guesses={
            ownProgress?.currentPatterns.map(
              (_, index) => local.guesses[ownProgress.currentWordIndex]?.[index] ?? '',
            ) ?? []
          }
          currentGuess={local.currentGuess}
          evaluatedRows={evaluatedRows}
          shakingRow={shakingRow}
          flippingRow={flippingRow}
          bouncingRow={bouncingRow}
          flipStaggerMs={DUEL_TIMING.staggerMs}
          flipDurationMs={DUEL_TIMING.flipMs}
          bounceDurationMs={DUEL_TIMING.bounceMs}
        />
        <Keyboard letterStates={letterStates} onKey={handleKey} disabled={disabled} />
        <div className="visually-hidden" aria-live="polite">
          {milestone}
        </div>
        <div className="visually-hidden" aria-live="polite">
          Opponent has solved {opponentProgress?.wordsSolved ?? 0} words.
        </div>
        {phase === 'finished' && (
          <div className="duel-times-up" role="status">
            <h1>{forfeitUid ? 'Duel finished' : "Time's up!"}</h1>
            {showResults && !scoresReady && <p>Waiting for final scores…</p>}
          </div>
        )}
      </main>
    );
  }

  return (
    <>
      {content}
      <Modal
        isOpen={showHelp}
        onClose={() => {
          setShowHelp(false);
          markDuelHelpShown();
        }}
        title="How to Play Duel"
      >
        <p className="help-text">
          Create a room, share its code or link, and both tap <strong>Ready</strong>. The duel
          starts after a 5-second countdown.
        </p>
        <p className="help-text">
          You get <strong>the same words in the same order</strong>. Solve a word, or use all six
          guesses, to move to the next. Keep going until the timer ends.
        </p>
        <p className="help-text">
          <strong>Most words solved wins.</strong> Ties go to fewer guesses on solved words, an
          earlier final solve, more greens, then more yellows. An exact tie is a draw.
        </p>
        <p className="help-text">
          Hard Mode is off for both players. Leaving during play forfeits the duel. Reconnect within
          20 seconds to keep playing.
        </p>
        <button
          className="btn btn--primary btn--full"
          onClick={() => {
            setShowHelp(false);
            markDuelHelpShown();
          }}
        >
          Let's Duel
        </button>
      </Modal>
      <StatsModal isOpen={showStats} onClose={() => setShowStats(false)} mode="duel" />
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onToggle={onSettingsChange}
        hasStarted={true}
        duelMode
      />
      <Modal isOpen={confirmLeave} onClose={() => setConfirmLeave(false)} title="Leave duel?">
        <p className="help-text">You'll forfeit this duel.</p>
        <div className="duel-actions">
          <button className="btn btn--outline" onClick={() => setConfirmLeave(false)}>
            Keep Playing
          </button>
          <button className="btn btn--primary" onClick={leave}>
            Leave Duel
          </button>
        </div>
      </Modal>
    </>
  );
}

export default DuelScreen;
