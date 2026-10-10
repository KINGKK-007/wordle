import { useState, useCallback, useRef, useEffect } from 'react';
import { evaluateGuess, type EvaluatedLetter, type LetterState } from '../utils/evaluateGuess';
import { VALID_GUESS_SET } from '../data/validGuesses';
import { recordWin, recordLoss } from '../utils/stats';

export type GameStatus = 'playing' | 'evaluating' | 'won' | 'lost';

export interface GameState {
  answer: string;
  guesses: string[];
  currentGuess: string;
  evaluatedRows: EvaluatedLetter[][];
  status: GameStatus;
  shakingRow: number | null;
  flippingRow: number | null;
  bouncingRow: number | null;
  activeLetterStates: Record<string, LetterState>;
  mode: 'unlimited' | '2player';
}

const WIN_MESSAGES = ['Genius', 'Magnificent', 'Impressive', 'Splendid', 'Great', 'Phew'];

export interface UseGameReturn {
  state: GameState;
  handleKey: (key: string) => void;
  resetGame: (newAnswer: string) => void;
  isInputDisabled: boolean;
}

interface UseGameOptions {
  answer: string;
  mode: 'unlimited' | '2player';
  hardMode: boolean;
  onToast: (msg: string, duration?: number) => void;
  onWin: (guessCount: number, message: string) => void;
  onLose: (answer: string) => void;
  persistKey?: string;
}

function buildLetterStates(rows: EvaluatedLetter[][]): Record<string, LetterState> {
  const states: Record<string, LetterState> = {};
  const priority: Record<LetterState, number> = {
    correct: 3, present: 2, absent: 1, empty: 0, tbd: 0,
  };
  for (const row of rows) {
    for (const { letter, state } of row) {
      if (!states[letter] || priority[state] > priority[states[letter]]) {
        states[letter] = state;
      }
    }
  }
  return states;
}

function getHardModeError(
  guess: string,
  evaluatedRows: EvaluatedLetter[][]
): string | null {
  if (evaluatedRows.length === 0) return null;
  const positions = ['1st', '2nd', '3rd', '4th', '5th'];

  for (const row of evaluatedRows) {
    for (let i = 0; i < row.length; i++) {
      if (row[i].state === 'correct' && guess[i] !== row[i].letter) {
        return `${positions[i]} letter must be ${row[i].letter.toUpperCase()}`;
      }
    }
  }

  const presentLetters: Record<string, boolean> = {};
  for (const row of evaluatedRows) {
    for (const { letter, state } of row) {
      if (state === 'present' || state === 'correct') presentLetters[letter] = true;
    }
  }
  for (const letter of Object.keys(presentLetters)) {
    if (!guess.includes(letter)) {
      return `Guess must contain ${letter.toUpperCase()}`;
    }
  }

  return null;
}

export function useGame({
  answer,
  mode,
  hardMode,
  onToast,
  onWin,
  onLose,
  persistKey,
}: UseGameOptions): UseGameReturn {
  const initialState: GameState = {
    answer,
    guesses: [],
    currentGuess: '',
    evaluatedRows: [],
    status: 'playing',
    shakingRow: null,
    flippingRow: null,
    bouncingRow: null,
    activeLetterStates: {},
    mode,
  };

  const [state, setState] = useState<GameState>(initialState);

  // Keep a ref to current state so handleKey can read it without stale closures
  // and WITHOUT triggering side effects inside setState updaters (StrictMode safe)
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── Persist in-progress game (Unlimited mode only) ──────────────────────

  useEffect(() => {
    if (!persistKey) return;
    try {
      const saved = localStorage.getItem(persistKey);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<GameState>;
      if (parsed.answer !== answer) {
        localStorage.removeItem(persistKey);
        return;
      }
      if (parsed.status && parsed.status !== 'playing' && parsed.status !== 'evaluating') {
        return; // game already over, start fresh
      }
      setState(prev => ({
        ...prev,
        guesses: parsed.guesses ?? [],
        currentGuess: parsed.currentGuess ?? '',
        evaluatedRows: parsed.evaluatedRows ?? [],
        status: 'playing', // always resume as playing
        activeLetterStates: buildLetterStates(parsed.evaluatedRows ?? []),
      }));
    } catch {
      // ignore corrupt data
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!persistKey) return;
    if (persistTimeout.current) clearTimeout(persistTimeout.current);
    persistTimeout.current = setTimeout(() => {
      try {
        localStorage.setItem(persistKey, JSON.stringify({
          answer: state.answer,
          guesses: state.guesses,
          currentGuess: state.currentGuess,
          evaluatedRows: state.evaluatedRows,
          status: state.status,
        }));
      } catch { /* ignore */ }
    }, 200);
  }, [state, persistKey]);

  // ── Row shake ────────────────────────────────────────────────────────────

  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shakeRow = useCallback((rowIndex: number) => {
    setState(prev => ({ ...prev, shakingRow: rowIndex }));
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, shakingRow: null }));
    }, 650);
  }, []);

  // ── handleKey ────────────────────────────────────────────────────────────
  // IMPORTANT: All side-effects (setTimeout, toast, etc.) run here in the
  // callback body — NOT inside setState updater functions — so React StrictMode's
  // double-invocation of updaters never causes duplicate toasts / timers.

  const handleKey = useCallback((key: string) => {
    const current = stateRef.current;

    if (current.status !== 'playing') return;

    // ── Backspace ────────────────────────────────────────────────────────
    if (key === 'Backspace') {
      setState(prev => ({ ...prev, currentGuess: prev.currentGuess.slice(0, -1) }));
      return;
    }

    // ── Letter ───────────────────────────────────────────────────────────
    if (/^[A-Z]$/.test(key)) {
      if (current.currentGuess.length < 5) {
        setState(prev => ({
          ...prev,
          currentGuess: prev.currentGuess + key.toLowerCase(),
        }));
      }
      return;
    }

    // ── Enter ────────────────────────────────────────────────────────────
    if (key === 'Enter') {
      const guess = current.currentGuess;
      const rowIndex = current.guesses.length;

      if (guess.length < 5) {
        onToast('Not enough letters');
        shakeRow(rowIndex);
        return;
      }

      if (!VALID_GUESS_SET.has(guess)) {
        onToast('Not in word list');
        shakeRow(rowIndex);
        return;
      }

      if (hardMode) {
        const error = getHardModeError(guess, current.evaluatedRows);
        if (error) {
          onToast(error);
          shakeRow(rowIndex);
          return;
        }
      }

      // ── Valid guess: evaluate and start flip animation ──────────────────

      const evaluated = evaluateGuess(guess, current.answer);
      const newGuesses = [...current.guesses, guess];
      const newEvaluatedRows = [...current.evaluatedRows, evaluated];
      const isWin = evaluated.every(e => e.state === 'correct');
      const isLoss = !isWin && newGuesses.length >= 6;

      // Transition to 'evaluating' (locks input) and start flip
      setState(prev => ({
        ...prev,
        guesses: newGuesses,
        currentGuess: '',
        evaluatedRows: newEvaluatedRows,
        status: 'evaluating',
        flippingRow: rowIndex,
      }));

      // Total time until all tiles have flipped:
      // tile i starts at i*300ms, each flip takes 500ms → last tile done at 4*300 + 500 = 1700ms
      const flipTotal = (5 - 1) * 300 + 500;

      setTimeout(() => {
        const newLetterStates = buildLetterStates(newEvaluatedRows);

        if (isWin) {
          setState(s => ({
            ...s,
            status: 'won',
            flippingRow: null,
            bouncingRow: rowIndex,
            activeLetterStates: newLetterStates,
          }));

          const msg = WIN_MESSAGES[rowIndex] ?? 'Genius';
          onToast(msg, 2000); // ← called once, here in the timeout, not in setState

          setTimeout(() => {
            setState(s => ({ ...s, bouncingRow: null }));
            onWin(newGuesses.length, msg);
          }, 1200);

          if (mode !== '2player') {
            recordWin(mode, newGuesses.length);
          }
        } else if (isLoss) {
          setState(s => ({
            ...s,
            status: 'lost',
            flippingRow: null,
            activeLetterStates: newLetterStates,
          }));
          onToast(current.answer.toUpperCase(), 3000);
          onLose(current.answer);
          if (mode !== '2player') {
            recordLoss(mode);
          }
        } else {
          setState(s => ({
            ...s,
            status: 'playing',
            flippingRow: null,
            activeLetterStates: newLetterStates,
          }));
        }
      }, flipTotal);
    }
  }, [hardMode, shakeRow, onToast, onWin, onLose, mode]);

  // ── Reset ────────────────────────────────────────────────────────────────

  const resetGame = useCallback((newAnswer: string) => {
    setState({
      answer: newAnswer,
      guesses: [],
      currentGuess: '',
      evaluatedRows: [],
      status: 'playing',
      shakingRow: null,
      flippingRow: null,
      bouncingRow: null,
      activeLetterStates: {},
      mode,
    });
    if (persistKey) localStorage.removeItem(persistKey);
  }, [mode, persistKey]);

  const isInputDisabled =
    state.status === 'evaluating' ||
    state.status === 'won' ||
    state.status === 'lost';

  return { state, handleKey, resetGame, isInputDisabled };
}
