import { isPlayerProgress, isRecord } from './validation';
import { ROOM_ALPHABET } from './logic';
import type { PlayerProgress } from './types';

export interface LocalDuelState {
  version: 1;
  roomCode: string;
  uid: string;
  seed: number;
  progress: PlayerProgress;
  guesses: Record<string, string[]>;
  currentGuess: string;
}

const localKey = (code: string, uid: string) => `custom-wordle-duel-${code}-${uid}`;
const NICKNAME_KEY = 'custom-wordle-duel-nickname';
const HELP_KEY = 'custom-wordle-duel-help-shown';

export function sanitizeNickname(value: string): string {
  return (
    value
      .replace(/[^\p{L}\p{N} _'-]/gu, '')
      .trim()
      .slice(0, 14) || 'Player'
  );
}

export function loadNickname(): string | null {
  try {
    const value = localStorage.getItem(NICKNAME_KEY);
    return value ? sanitizeNickname(value) : null;
  } catch {
    return null;
  }
}

export function saveNickname(value: string): string {
  const nickname = sanitizeNickname(value);
  try {
    localStorage.setItem(NICKNAME_KEY, nickname);
  } catch {
    /* Storage is optional. */
  }
  return nickname;
}

export function shouldShowDuelHelp(): boolean {
  try {
    return localStorage.getItem(HELP_KEY) !== '1';
  } catch {
    return true;
  }
}

export function markDuelHelpShown(): void {
  try {
    localStorage.setItem(HELP_KEY, '1');
  } catch {
    /* Storage is optional. */
  }
}

export function saveDuelSession(roomCode: string, uid: string): void {
  try {
    localStorage.setItem('custom-wordle-duel-session', JSON.stringify({ roomCode, uid }));
  } catch {
    /* Storage is optional. */
  }
}

export function loadDuelSession(): { roomCode: string; uid: string } | null {
  try {
    const raw = localStorage.getItem('custom-wordle-duel-session');
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (
      !isRecord(value) ||
      typeof value.roomCode !== 'string' ||
      value.roomCode.length !== 5 ||
      ![...value.roomCode].every((letter) => ROOM_ALPHABET.includes(letter)) ||
      typeof value.uid !== 'string' ||
      !value.uid ||
      value.uid.length > 128
    )
      return null;
    return { roomCode: value.roomCode, uid: value.uid };
  } catch {
    return null;
  }
}

export function clearDuelSession(): void {
  try {
    localStorage.removeItem('custom-wordle-duel-session');
  } catch {
    /* Storage is optional. */
  }
}

export function loadLocalDuel(code: string, uid: string, seed: number): LocalDuelState | null {
  try {
    const raw = localStorage.getItem(localKey(code, uid));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const saved = value as Partial<LocalDuelState>;
    const progress = saved.progress;
    if (
      saved.version !== 1 ||
      saved.roomCode !== code ||
      saved.uid !== uid ||
      saved.seed !== seed ||
      !isPlayerProgress(progress) ||
      progress.seed !== seed ||
      typeof saved.currentGuess !== 'string' ||
      !/^[a-z]{0,5}$/.test(saved.currentGuess) ||
      !saved.guesses ||
      typeof saved.guesses !== 'object' ||
      Array.isArray(saved.guesses) ||
      !Object.entries(saved.guesses).every(
        ([index, guesses]) =>
          /^\d+$/.test(index) &&
          Number(index) <= progress.currentWordIndex &&
          Array.isArray(guesses) &&
          guesses.length <= 6 &&
          guesses.length <=
            (progress.words.find((word) => word.index === Number(index))?.guessCount ?? 0) &&
          guesses.every((guess) => typeof guess === 'string' && /^[a-z]{5}$/.test(guess)),
      )
    )
      return null;
    return saved as LocalDuelState;
  } catch {
    return null;
  }
}

export function saveLocalDuel(state: LocalDuelState): void {
  try {
    localStorage.setItem(localKey(state.roomCode, state.uid), JSON.stringify(state));
  } catch {
    /* Storage is optional. */
  }
}
