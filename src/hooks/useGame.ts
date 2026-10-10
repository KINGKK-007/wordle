import { useState, useCallback, useRef, useEffect } from 'react';
import { evaluateGuess, type EvaluatedLetter, type LetterState } from '../utils/evaluateGuess';
import { VALID_GUESS_SET } from '../data/validGuesses';
import { recordWin, recordLoss } from '../utils/stats';

export type GameStatus = 'playing' | 'evaluating' | 'won' | 'lost';

export interface GameState {
  answer: string;
  guesses: string[];       // completed guesses
  currentGuess: string;    // current input (0-5 chars)
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
  persistKey?: string; // localStorage key for saving progress
}

function buildLetterStates(rows: EvaluatedLetter[][]): Record<string, LetterState> {
  const states: Record<string, LetterState> = {};
  const priority: Record<LetterState, number> = { correct: 3, present: 2, absent: 1, empty: 0, tbd: 0 };
  
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
  
  // Check all confirmed positions (green)
  for (const row of evaluatedRows) {
    for (let i = 0; i < row.length; i++) {
      if (row[i].state === 'correct') {
        if (guess[i] !== row[i].letter) {
          const positions = ['1st', '2nd', '3rd', '4th', '5th'];
          return `${positions[i]} letter must be ${row[i].letter.toUpperCase()}`;
        }
      }
    }
  }
  
  // Check all present letters (yellow) - must be used somewhere
  const presentLetters: Record<string, boolean> = {};
  for (const row of evaluatedRows) {
    for (const { letter, state } of row) {
      if (state === 'present') presentLetters[letter] = true;
      if (state === 'correct') presentLetters[letter] = true;
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
  const [state, setState] = useState<GameState>({
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
  });

  // Load persisted state on mount (only for unlimited mode)
  useEffect(() => {
    if (!persistKey) return;
    try {
      const saved = localStorage.getItem(persistKey);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<GameState>;
      // Only restore if the answer matches
      if (parsed.answer !== answer) {
        localStorage.removeItem(persistKey);
        return;
      }
      if (parsed.status && parsed.status !== 'playing' && parsed.status !== 'evaluating') {
        // Game was already over, start fresh
        return;
      }
      setState(prev => ({
        ...prev,
        guesses: parsed.guesses ?? [],
        currentGuess: parsed.currentGuess ?? '',
        evaluatedRows: parsed.evaluatedRows ?? [],
        status: parsed.status ?? 'playing',
        activeLetterStates: buildLetterStates(parsed.evaluatedRows ?? []),
      }));
    } catch {
      // ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist state on changes
  const persistTimeout = useRef<number | null>(null);
  useEffect(() => {
    if (!persistKey) return;
    if (persistTimeout.current) clearTimeout(persistTimeout.current);
    persistTimeout.current = window.setTimeout(() => {
      try {
        localStorage.setItem(persistKey, JSON.stringify({
          answer: state.answer,
          guesses: state.guesses,
          currentGuess: state.currentGuess,
          evaluatedRows: state.evaluatedRows,
          status: state.status,
        }));
      } catch {
        // ignore
      }
    }, 200);
  }, [state, persistKey]);

  const shakeRowRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shakeCurrentRow = useCallback((rowIndex: number) => {
    setState(prev => ({ ...prev, shakingRow: rowIndex }));
    if (shakeRowRef.current) clearTimeout(shakeRowRef.current);
    shakeRowRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, shakingRow: null }));
    }, 650);
  }, []);

  const handleKey = useCallback((key: string) => {
    setState(prev => {
      if (prev.status !== 'playing') return prev;
      
      if (key === 'Backspace') {
        return { ...prev, currentGuess: prev.currentGuess.slice(0, -1) };
      }
      
      if (key === 'Enter') {
        // Process submit synchronously (side effects after)
        return prev; // handled below to avoid stale closure
      }
      
      // Letter key
      if (/^[A-Z]$/.test(key) && prev.currentGuess.length < 5) {
        return { ...prev, currentGuess: prev.currentGuess + key.toLowerCase() };
      }
      
      return prev;
    });

    if (key === 'Enter') {
      setState(prev => {
        if (prev.status !== 'playing') return prev;
        
        const guess = prev.currentGuess;
        
        // Validation
        if (guess.length < 5) {
          setTimeout(() => {
            onToast('Not enough letters');
            shakeCurrentRow(prev.guesses.length);
          }, 0);
          return prev;
        }
        
        if (!VALID_GUESS_SET.has(guess)) {
          setTimeout(() => {
            onToast('Not in word list');
            shakeCurrentRow(prev.guesses.length);
          }, 0);
          return prev;
        }
        
        // Hard mode check
        if (hardMode) {
          const error = getHardModeError(guess, prev.evaluatedRows);
          if (error) {
            setTimeout(() => {
              onToast(error);
              shakeCurrentRow(prev.guesses.length);
            }, 0);
            return prev;
          }
        }
        
        // Start flip animation
        const rowIndex = prev.guesses.length;
        const evaluated = evaluateGuess(guess, prev.answer);
        const newGuesses = [...prev.guesses, guess];
        const newEvaluatedRows = [...prev.evaluatedRows, evaluated];
        const isWin = evaluated.every(e => e.state === 'correct');
        const isLoss = !isWin && newGuesses.length >= 6;
        
        // Begin flip animation
        const newState: GameState = {
          ...prev,
          guesses: newGuesses,
          currentGuess: '',
          evaluatedRows: newEvaluatedRows,
          status: 'evaluating',
          flippingRow: rowIndex,
        };
        
        // After all tiles flip (5 tiles * 300ms stagger + 500ms flip = ~2000ms total)
        const flipTotal = 5 * 300 + 500; // last tile starts at 1200ms + 500ms = 1700ms
        
        setTimeout(() => {
          // Update keyboard colors
          const newLetterStates = buildLetterStates(newEvaluatedRows);
          
          if (isWin) {
            // Bounce winning row
            setState(s => ({
              ...s,
              status: 'won',
              flippingRow: null,
              bouncingRow: rowIndex,
              activeLetterStates: newLetterStates,
            }));
            const msg = WIN_MESSAGES[rowIndex] || 'Genius';
            setTimeout(() => onToast(msg, 2000), 0);
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
            setTimeout(() => {
              onLose(prev.answer);
              onToast(prev.answer.toUpperCase(), 3000);
            }, 0);
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
        
        return newState;
      });
    }
  }, [hardMode, shakeCurrentRow, onToast, onWin, onLose, mode]);

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
    if (persistKey) {
      localStorage.removeItem(persistKey);
    }
  }, [mode, persistKey]);

  const isInputDisabled = state.status === 'evaluating' || state.status === 'won' || state.status === 'lost';

  return { state, handleKey, resetGame, isInputDisabled };
}
