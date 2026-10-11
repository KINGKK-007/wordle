import { VALID_GUESS_SET } from '../data/validGuesses';
import { isRecord, readJson, writeStorage } from './storage';

export type SoloMode = 'unlimited' | '2player';
export const SOLO_GAME_STORAGE_KEY = 'custom-wordle-game-unlimited';

export interface SavedGame {
  version: 1;
  gameId: string;
  mode: SoloMode;
  answer: string;
  guesses: string[];
  currentGuess: string;
}

export function createGameId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `game-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isSavedGame(value: unknown): value is SavedGame {
  if (!isRecord(value) || value.version !== 1 || typeof value.gameId !== 'string' ||
      !/^[\w-]{1,100}$/.test(value.gameId) ||
      (value.mode !== 'unlimited' && value.mode !== '2player') ||
      typeof value.answer !== 'string' || !VALID_GUESS_SET.has(value.answer) ||
      typeof value.currentGuess !== 'string' || !/^[a-z]{0,5}$/.test(value.currentGuess) ||
      !Array.isArray(value.guesses) || value.guesses.length > 6 ||
      !value.guesses.every((guess: unknown) => typeof guess === 'string' && VALID_GUESS_SET.has(guess))) return false;
  // A solved game must end at the solving guess; terminal boards cannot have pending input.
  const solvedIndex = value.guesses.indexOf(value.answer);
  if (solvedIndex >= 0 && solvedIndex !== value.guesses.length - 1) return false;
  return !((solvedIndex >= 0 || value.guesses.length === 6) && value.currentGuess.length > 0);
}

export function loadSavedGame(key = SOLO_GAME_STORAGE_KEY, mode: SoloMode = 'unlimited', expectedAnswer?: string): SavedGame | null {
  const saved = readJson(key, isSavedGame);
  return saved && saved.mode === mode && (!expectedAnswer || saved.answer === expectedAnswer) ? saved : null;
}

export function saveGame(key: string, game: SavedGame): void {
  writeStorage(key, JSON.stringify(game));
}
