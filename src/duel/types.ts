export type DurationSec = 60 | 120 | 300;
export type RoomStatus = 'lobby' | 'countdown' | 'playing' | 'finished';

export interface PlayerSummary {
  wordsSolved: number;
  guessesOnSolved: number;
  lastSolveMs: number | null;
  totalGreens: number;
  totalYellows: number;
  totalGuesses: number;
  forfeited?: boolean;
}

export interface WordProgress {
  index: number;
  solved: boolean;
  guessCount: number;
  startedAtMs: number;
  endedAtMs: number;
  timeMs: number;
  patterns: string[];
}

/** Shared progress contains colors and timing only, never answers or guesses. */
export interface PlayerProgress extends PlayerSummary {
  seed: number;
  currentWordIndex: number;
  currentWordStartedAtMs: number;
  currentPatterns: string[];
  words: WordProgress[];
  finished: boolean;
  updatedAt: number;
}

export interface DuelPlayer {
  name: string;
  ready: boolean;
  readySeed: number;
  rematchSeed: number | null;
  joinedAt: number;
  connected: boolean;
  lastSeen: number;
  forfeited?: boolean;
  forfeitAt?: number;
  forfeitClaim?: { uid: string; disconnectedAt: number; seed: number };
}

export interface RoomMeta {
  hostUid: string;
  guestUid?: string;
  createdAt: number;
  durationSec: DurationSec;
  seed: number;
  status: RoomStatus;
  startAt: number | null;
  endAt: number | null;
  forfeitUid?: string;
  forfeitAt?: number;
}

export interface RoomState {
  meta: RoomMeta;
  players: Record<string, DuelPlayer>;
  progress: Record<string, PlayerProgress>;
}

export interface DuelTransport {
  init(): Promise<{ uid: string }>;
  getServerTime(): number;
  createRoom(opts: { durationSec: DurationSec; displayName: string }): Promise<{ code: string }>;
  joinRoom(code: string, displayName: string): Promise<void>;
  subscribeRoom(code: string, cb: (room: RoomState | null) => void): () => void;
  subscribeConnection(cb: (connected: boolean) => void): () => void;
  setReady(code: string, ready: boolean): Promise<void>;
  setDuration(code: string, durationSec: DurationSec): Promise<void>;
  publishProgress(code: string, progress: PlayerProgress): Promise<void>;
  requestRematch(code: string): Promise<void>;
  reconcileRoom(code: string): Promise<void>;
  leaveRoom(code: string): Promise<void>;
  dispose(): void;
}

export type DuelErrorCode = 'NOT_FOUND' | 'ROOM_FULL' | 'ALREADY_STARTED' | 'EXPIRED' | 'CONFIGURATION' | 'OFFLINE';

export class DuelError extends Error {
  readonly code: DuelErrorCode;
  constructor(code: DuelErrorCode) {
    const messages: Record<DuelErrorCode, string> = {
      NOT_FOUND: 'Room not found. Check the code.',
      ROOM_FULL: 'Room is full.',
      ALREADY_STARTED: 'Duel already started.',
      EXPIRED: 'This room has expired.',
      CONFIGURATION: "Duel mode isn't configured yet.",
      OFFLINE: 'You are offline. Reconnect to continue.',
    };
    super(messages[code]);
    this.name = 'DuelError';
    this.code = code;
  }
}
