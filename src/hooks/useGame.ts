import { useState, useCallback, useRef, useEffect } from 'react';
import { evaluateGuess, type EvaluatedLetter, type LetterState } from '../utils/evaluateGuess';
import { VALID_GUESS_SET } from '../data/validGuesses';
import { recordWin, recordLoss } from '../utils/stats';
import { getHardModeError } from '../utils/hardMode';
import { createGameId, loadSavedGame, saveGame, type SoloMode } from '../utils/gamePersistence';
import { removeStorage } from '../utils/storage';
import { rowAnimationMs, SOLO_ANIMATION } from '../utils/revealTiming';
import { useReducedMotion } from './useReducedMotion';

export type GameStatus = 'playing' | 'evaluating' | 'won' | 'lost';
export const SOLO_FLIP_DURATION_MS = SOLO_ANIMATION.flipMs;
export const SOLO_FLIP_STAGGER_MS = SOLO_ANIMATION.staggerMs;
export const SOLO_FLIP_TOTAL_MS = rowAnimationMs(SOLO_FLIP_DURATION_MS, SOLO_FLIP_STAGGER_MS);

export interface GameState {
  gameId: string;
  answer: string;
  guesses: string[];
  currentGuess: string;
  evaluatedRows: EvaluatedLetter[][];
  status: GameStatus;
  shakingRow: number | null;
  flippingRow: number | null;
  bouncingRow: number | null;
  activeLetterStates: Record<string, LetterState>;
  mode: SoloMode;
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
  mode: SoloMode;
  hardMode: boolean;
  onToast: (msg: string, duration?: number) => void;
  onWin: (guessCount: number, message: string) => void;
  onLose: (answer: string) => void;
  persistKey?: string;
}

export function buildLetterStates(rows: EvaluatedLetter[][]): Record<string, LetterState> {
  const states: Record<string, LetterState> = {};
  const priority: Record<LetterState, number> = {
    correct: 3,
    present: 2,
    absent: 1,
    empty: 0,
    tbd: 0,
  };
  for (const row of rows)
    for (const cell of row) {
      if (!states[cell.letter] || priority[cell.state] > priority[states[cell.letter]])
        states[cell.letter] = cell.state;
    }
  return states;
}

function initialGame(answer: string, mode: SoloMode, persistKey?: string): GameState {
  const saved = persistKey ? loadSavedGame(persistKey, mode, answer) : null;
  const guesses = saved?.guesses ?? [];
  const evaluatedRows = guesses.map((guess) => evaluateGuess(guess, answer));
  const status: GameStatus =
    guesses[guesses.length - 1] === answer ? 'won' : guesses.length === 6 ? 'lost' : 'playing';
  return {
    gameId: saved?.gameId ?? createGameId(),
    answer,
    mode,
    guesses,
    currentGuess: saved?.currentGuess ?? '',
    evaluatedRows,
    status,
    shakingRow: null,
    flippingRow: null,
    bouncingRow: null,
    activeLetterStates: buildLetterStates(evaluatedRows),
  };
}

export function useGame(options: UseGameOptions): UseGameReturn {
  const { answer, mode, hardMode, persistKey } = options;
  const reducedMotion = useReducedMotion();
  const [state, setState] = useState<GameState>(() => initialGame(answer, mode, persistKey));
  const stateRef = useRef(state);
  const callbacksRef = useRef(options);
  callbacksRef.current = options;
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifiedGameRef = useRef<string | null>(null);

  const persist = useCallback(
    (next: GameState) => {
      if (persistKey)
        saveGame(persistKey, {
          version: 1,
          gameId: next.gameId,
          mode: next.mode,
          answer: next.answer,
          guesses: next.guesses,
          currentGuess: next.currentGuess,
        });
    },
    [persistKey],
  );

  // Update the ref synchronously: two Enter presses in one render can only submit once.
  const update = useCallback(
    (next: GameState) => {
      stateRef.current = next;
      setState(next);
      persist(next);
    },
    [persist],
  );

  const later = useCallback((callback: () => void, duration: number) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, duration);
    timersRef.current.add(timer);
    return timer;
  }, []);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current.clear();
    shakeTimerRef.current = null;
  }, []);

  const notifyResult = useCallback((finished: GameState) => {
    if (notifiedGameRef.current === finished.gameId) return;
    notifiedGameRef.current = finished.gameId;
    if (finished.status === 'won')
      callbacksRef.current.onWin(
        finished.guesses.length,
        WIN_MESSAGES[finished.guesses.length - 1],
      );
    else if (finished.status === 'lost') callbacksRef.current.onLose(finished.answer);
  }, []);

  useEffect(() => {
    persist(stateRef.current);
    // Recover an Enter submission that was persisted before its reveal finished.
    const current = stateRef.current;
    if (current.status === 'won') recordWin(mode, current.guesses.length, current.gameId);
    if (current.status === 'lost') recordLoss(mode, current.gameId);
    if (current.status === 'won' || current.status === 'lost') notifyResult(current);
    return clearTimers;
  }, [clearTimers, mode, notifyResult, persist]);

  const shakeRow = useCallback(
    (index: number) => {
      update({ ...stateRef.current, shakingRow: index });
      if (shakeTimerRef.current) {
        clearTimeout(shakeTimerRef.current);
        timersRef.current.delete(shakeTimerRef.current);
      }
      shakeTimerRef.current = later(() => update({ ...stateRef.current, shakingRow: null }), 650);
    },
    [later, update],
  );

  const handleKey = useCallback(
    (key: string) => {
      const current = stateRef.current;
      if (current.status !== 'playing') return;
      if (key === 'Backspace') {
        update({ ...current, currentGuess: current.currentGuess.slice(0, -1) });
        return;
      }
      if (/^[A-Z]$/.test(key)) {
        if (current.currentGuess.length < 5)
          update({ ...current, currentGuess: current.currentGuess + key.toLowerCase() });
        return;
      }
      if (key !== 'Enter') return;
      const guess = current.currentGuess;
      const rowIndex = current.guesses.length;
      const error =
        guess.length !== 5
          ? 'Not enough letters'
          : !VALID_GUESS_SET.has(guess)
            ? 'Not in word list'
            : hardMode
              ? getHardModeError(guess, current.evaluatedRows)
              : null;
      if (error) {
        callbacksRef.current.onToast(error);
        shakeRow(rowIndex);
        return;
      }
      const evaluated = evaluateGuess(guess, current.answer);
      const guesses = [...current.guesses, guess];
      const evaluatedRows = [...current.evaluatedRows, evaluated];
      const won = guess === current.answer;
      const lost = !won && guesses.length === 6;
      update({
        ...current,
        guesses,
        evaluatedRows,
        currentGuess: '',
        status: 'evaluating',
        flippingRow: rowIndex,
      });
      // The accepted final submission is durable even if the player refreshes during the flip.
      if (won) recordWin(mode, guesses.length, current.gameId);
      else if (lost) recordLoss(mode, current.gameId);

      later(
        () => {
          const finished: GameState = {
            ...stateRef.current,
            status: won ? 'won' : lost ? 'lost' : 'playing',
            flippingRow: null,
            activeLetterStates: buildLetterStates(evaluatedRows),
            bouncingRow: won && !reducedMotion ? rowIndex : null,
          };
          update(finished);
          if (won) {
            callbacksRef.current.onToast(WIN_MESSAGES[rowIndex], 2000);
            later(
              () => {
                update({ ...stateRef.current, bouncingRow: null });
                notifyResult(finished);
              },
              reducedMotion
                ? 0
                : rowAnimationMs(SOLO_ANIMATION.bounceMs, SOLO_ANIMATION.bounceStaggerMs),
            );
          } else if (lost) {
            callbacksRef.current.onToast(current.answer.toUpperCase(), 3000);
            notifyResult(finished);
          }
        },
        reducedMotion ? 0 : SOLO_FLIP_TOTAL_MS,
      );
    },
    [hardMode, later, mode, notifyResult, reducedMotion, shakeRow, update],
  );

  const resetGame = useCallback(
    (newAnswer: string) => {
      clearTimers();
      if (persistKey) removeStorage(persistKey);
      notifiedGameRef.current = null;
      update(initialGame(newAnswer, mode));
    },
    [clearTimers, mode, persistKey, update],
  );

  return { state, handleKey, resetGame, isInputDisabled: state.status !== 'playing' };
}
