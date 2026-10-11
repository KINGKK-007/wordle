import {
  createProgress,
  generateRoomCode,
  getForfeitAt,
  getForfeitUid,
  getRoomPhase,
  normalizeRoomCode,
  randomSeed,
  reconcileMeta,
  ROOM_EXPIRY_MS,
  sanitizeNickname,
} from './logic';
import { DuelError } from './types';
import type { DuelPlayer, DuelTransport, DurationSec, PlayerProgress, RoomState } from './types';
import { isPlayerProgress, parseRoom } from './validation';

const PREFIX = 'custom-wordle-mock-room-';
const UID_KEY = 'custom-wordle-mock-uid';
const memory = new Map<string, RoomState>();
const clients = new Set<MockTransport>();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export interface MockTransportOptions {
  uid?: string;
  now?: () => number;
  storage?: Storage | null;
  rooms?: Map<string, RoomState>;
  autoHeartbeat?: boolean;
}

/** Offline-capable tab transport. Web Locks serialize cross-tab room mutations. */
export class MockTransport implements DuelTransport {
  private uid: string;
  private now: () => number;
  private storage: Storage | null;
  private rooms: Map<string, RoomState>;
  private listeners = new Map<string, Set<(room: RoomState | null) => void>>();
  private connectionListeners = new Set<(connected: boolean) => void>();
  private channel: BroadcastChannel | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private connected = true;
  private activeCode: string | null = null;
  private disposed = false;
  private tracksHeartbeats: boolean;

  constructor(options: MockTransportOptions = {}) {
    this.now = options.now ?? Date.now;
    this.rooms = options.rooms ?? memory;
    this.storage = options.storage === undefined ? this.getStorage() : options.storage;
    this.uid = options.uid ?? this.tabUid();
    this.tracksHeartbeats = options.autoHeartbeat !== false && typeof window !== 'undefined';
    clients.add(this);
    if (typeof window !== 'undefined') {
      this.connected = navigator.onLine;
      if (typeof BroadcastChannel !== 'undefined') {
        this.channel = new BroadcastChannel('custom-wordle-duel');
        this.channel.onmessage = (event) => {
          const message = event.data as { code?: unknown; room?: unknown; persisted?: unknown };
          if (typeof message.code !== 'string') return;
          if (message.persisted === false) this.storage = null;
          const room = parseRoom(message.room);
          if (room) this.rooms.set(message.code, room);
          else this.rooms.delete(message.code);
          this.emit(message.code);
        };
      }
      window.addEventListener('storage', this.onStorage);
      window.addEventListener('online', this.onOnline);
      window.addEventListener('offline', this.onOffline);
      window.addEventListener('pagehide', this.onPageHide);
      if (options.autoHeartbeat !== false)
        this.timer = setInterval(() => {
          void this.heartbeat().catch(() => {});
        }, 1000);
    }
  }

  private getStorage(): Storage | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  }

  private tabUid(): string {
    try {
      const existing = sessionStorage.getItem(UID_KEY);
      if (existing && /^mock-[a-z0-9-]{8,}$/.test(existing)) return existing;
      const uid = `mock-${crypto.randomUUID()}`;
      sessionStorage.setItem(UID_KEY, uid);
      return uid;
    } catch {
      return `mock-${randomSeed().toString(36)}-${randomSeed().toString(36)}`;
    }
  }

  async init(): Promise<{ uid: string }> {
    return { uid: this.uid };
  }
  getServerTime(): number {
    return this.now();
  }

  private readRaw(code: string): RoomState | null {
    if (this.storage) {
      try {
        const raw = this.storage.getItem(PREFIX + code);
        if (raw) {
          const room = parseRoom(JSON.parse(raw) as unknown);
          if (room) {
            this.rooms.set(code, room);
            return clone(room);
          }
        }
        // An absent key is a room deletion, including one performed in another tab.
        this.rooms.delete(code);
        return null;
      } catch {
        this.storage =
          null; /* In-memory transport remains usable when browser storage is unavailable. */
      }
    }
    const room = this.rooms.get(code);
    return room ? clone(room) : null;
  }

  /** A vanished tab is observed locally; clients never write the other player's presence. */
  private withPresence(room: RoomState): RoomState {
    if (!this.tracksHeartbeats) return room;
    const observed = clone(room);
    for (const player of Object.values(observed.players)) {
      if (player.connected && this.now() - player.lastSeen > 10000) {
        player.connected = false;
        player.lastSeen += 10000;
      }
    }
    return observed;
  }

  private read(code: string): RoomState | null {
    const room = this.readRaw(code);
    return room ? this.withPresence(room) : null;
  }

  private async mutate(
    code: string,
    operation: (room: RoomState | null) => RoomState | null | undefined,
  ): Promise<void> {
    const apply = () => {
      const next = operation(this.readRaw(code));
      if (next === undefined) return;
      if (next) this.rooms.set(code, clone(next));
      else this.rooms.delete(code);
      try {
        if (next) this.storage?.setItem(PREFIX + code, JSON.stringify(next));
        else this.storage?.removeItem(PREFIX + code);
      } catch {
        this.storage = null; /* BroadcastChannel still synchronizes active tabs. */
      }
      this.channel?.postMessage({ code, room: next, persisted: this.storage !== null });
      for (const client of clients) if (client.rooms === this.rooms) client.emit(code);
    };
    if (this.storage && typeof navigator !== 'undefined' && navigator.locks) {
      await navigator.locks.request(PREFIX + code, apply);
    } else apply();
  }

  private required(room: RoomState | null): RoomState {
    if (!room) throw new DuelError('NOT_FOUND');
    if (this.now() - room.meta.createdAt >= ROOM_EXPIRY_MS) throw new DuelError('EXPIRED');
    return room;
  }

  private requireOnline(): void {
    if (!this.connected) throw new DuelError('OFFLINE');
  }

  private player(name: string, seed: number): DuelPlayer {
    return {
      name: sanitizeNickname(name),
      ready: false,
      readySeed: seed,
      rematchSeed: null,
      joinedAt: this.now(),
      connected: true,
      lastSeen: this.now(),
    };
  }

  async createRoom(opts: {
    durationSec: DurationSec;
    displayName: string;
  }): Promise<{ code: string }> {
    this.requireOnline();
    if (![60, 120, 300].includes(opts.durationSec)) throw new Error('Invalid duration');
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = generateRoomCode();
      let created = false;
      await this.mutate(code, (existing) => {
        if (existing) return undefined;
        const seed = randomSeed();
        created = true;
        return {
          meta: {
            hostUid: this.uid,
            createdAt: this.now(),
            durationSec: opts.durationSec,
            seed,
            status: 'lobby',
            startAt: null,
            endAt: null,
          },
          players: { [this.uid]: this.player(opts.displayName, seed) },
          progress: { [this.uid]: createProgress(seed, this.now()) },
        };
      });
      if (created) {
        this.activeCode = code;
        this.saveSession(code);
        return { code };
      }
    }
    throw new Error('Unable to create a room. Try again.');
  }

  async joinRoom(input: string, displayName: string): Promise<void> {
    this.requireOnline();
    const code = normalizeRoomCode(input);
    await this.mutate(code, (value) => {
      const room = this.required(value);
      const existing = room.players[this.uid];
      if (existing) {
        // Record a timeout before reconnecting so a late refresh cannot undo a forfeit.
        const forfeited = getForfeitUid(this.withPresence(room), this.now());
        const forfeitAt = getForfeitAt(this.withPresence(room), this.now());
        if (forfeited && room.meta.hostUid === this.uid && room.meta.status !== 'finished') {
          room.meta = { ...room.meta, status: 'finished', forfeitUid: forfeited, forfeitAt };
        }
        room.players[this.uid] = {
          ...existing,
          name: sanitizeNickname(displayName),
          connected: true,
          lastSeen: this.now(),
          ...(forfeited === this.uid ? { forfeited: true, forfeitAt } : {}),
          ...(forfeited && forfeited !== this.uid
            ? {
                forfeitClaim: {
                  uid: forfeited,
                  disconnectedAt: this.withPresence(room).players[forfeited].lastSeen,
                  seed: room.meta.seed,
                },
              }
            : {}),
        };
        return room;
      }
      if (getRoomPhase(room, this.now()) !== 'lobby') throw new DuelError('ALREADY_STARTED');
      if (Object.keys(room.players).length >= 2 || room.meta.guestUid)
        throw new DuelError('ROOM_FULL');
      room.meta.guestUid = this.uid;
      room.players[this.uid] = this.player(displayName, room.meta.seed);
      room.progress[this.uid] = createProgress(room.meta.seed, this.now());
      return room;
    });
    this.activeCode = code;
    this.saveSession(code);
  }

  private saveSession(code: string): void {
    try {
      this.storage?.setItem(
        'custom-wordle-duel-session',
        JSON.stringify({ roomCode: code, uid: this.uid }),
      );
    } catch {
      /* Optional persistence. */
    }
  }

  subscribeRoom(code: string, cb: (room: RoomState | null) => void): () => void {
    const listeners = this.listeners.get(code) ?? new Set();
    listeners.add(cb);
    this.listeners.set(code, listeners);
    cb(this.read(code));
    return () => {
      listeners.delete(cb);
      if (!listeners.size) this.listeners.delete(code);
    };
  }

  subscribeConnection(cb: (connected: boolean) => void): () => void {
    this.connectionListeners.add(cb);
    cb(this.connected);
    return () => {
      this.connectionListeners.delete(cb);
    };
  }

  private emit(code: string): void {
    const room = this.read(code);
    for (const listener of this.listeners.get(code) ?? []) listener(room ? clone(room) : null);
  }

  async setReady(code: string, ready: boolean): Promise<void> {
    this.requireOnline();
    await this.mutate(code, (value) => {
      const room = this.required(value);
      if (!room.players[this.uid]) throw new DuelError('NOT_FOUND');
      if (!['lobby', 'countdown'].includes(getRoomPhase(room, this.now()))) return undefined;
      if (ready && Object.keys(room.players).length !== 2) return undefined;
      room.players[this.uid] = {
        ...room.players[this.uid],
        ready,
        readySeed: room.meta.seed,
        forfeited: false,
      };
      delete room.players[this.uid].forfeitClaim;
      delete room.players[this.uid].forfeitAt;
      return room;
    });
    await this.reconcileRoom(code);
  }

  async setDuration(code: string, durationSec: DurationSec): Promise<void> {
    this.requireOnline();
    await this.mutate(code, (value) => {
      const room = this.required(value);
      if (
        room.meta.hostUid !== this.uid ||
        room.meta.status !== 'lobby' ||
        ![60, 120, 300].includes(durationSec)
      )
        return undefined;
      // A new seed invalidates both players' old ready flags without writing their nodes.
      room.meta = { ...room.meta, durationSec, seed: (room.meta.seed + 1) >>> 0 };
      return room;
    });
  }

  async publishProgress(code: string, progress: PlayerProgress): Promise<void> {
    this.requireOnline();
    if (!isPlayerProgress(progress)) throw new Error('Invalid duel progress');
    await this.mutate(code, (value) => {
      const room = this.required(value);
      if (!room.players[this.uid] || progress.seed !== room.meta.seed) return undefined;
      const previous = room.progress[this.uid];
      if (
        previous?.seed === progress.seed &&
        (previous.totalGuesses > progress.totalGuesses ||
          previous.updatedAt > progress.updatedAt ||
          previous.finished)
      )
        return undefined;
      room.progress[this.uid] = clone(progress);
      return room;
    });
  }

  async requestRematch(code: string): Promise<void> {
    this.requireOnline();
    await this.mutate(code, (value) => {
      const room = this.required(value);
      if (getRoomPhase(room, this.now()) !== 'finished' || !room.players[this.uid])
        return undefined;
      room.players[this.uid] = { ...room.players[this.uid], rematchSeed: room.meta.seed };
      return room;
    });
    await this.reconcileRoom(code);
  }

  async reconcileRoom(code: string): Promise<void> {
    if (!this.connected) return;
    await this.mutate(code, (value) => {
      if (!value || !value.players[this.uid]) return undefined;
      const room = value;
      const observed = this.withPresence(room);
      const forfeitUid = getForfeitUid(observed, this.now());
      if (room.meta.hostUid !== this.uid) {
        if (forfeitUid && !room.players[this.uid].forfeitClaim) {
          room.players[this.uid].forfeitClaim = {
            uid: forfeitUid,
            disconnectedAt: observed.players[forfeitUid]?.lastSeen ?? this.now(),
            seed: room.meta.seed,
          };
          return room;
        }
        return undefined;
      }
      const meta = reconcileMeta(observed, this.now());
      if (!meta) return undefined;
      room.meta = meta;
      return room;
    });
  }

  async leaveRoom(code: string): Promise<void> {
    await this.mutate(code, (value) => {
      if (!value || !value.players[this.uid]) return undefined;
      const phase = getRoomPhase(value, this.now());
      if (phase === 'lobby' || phase === 'countdown') {
        if (value.meta.hostUid === this.uid) return null;
        delete value.players[this.uid];
        delete value.progress[this.uid];
        delete value.meta.guestUid;
      } else if (phase === 'finished' && value.meta.hostUid === this.uid) return null;
      else
        value.players[this.uid] = {
          ...value.players[this.uid],
          connected: false,
          lastSeen: this.now(),
          ...(phase === 'playing' ? { forfeited: true, forfeitAt: this.now() } : {}),
        };
      return value;
    });
    this.activeCode = null;
    await this.reconcileRoom(code);
  }

  /** Test/dev hook and the browser's online/offline presence handler. */
  async setConnected(connected: boolean): Promise<void> {
    this.connected = connected;
    for (const listener of this.connectionListeners) listener(connected);
    if (this.activeCode) {
      await this.mutate(this.activeCode, (room) => {
        if (!room?.players[this.uid]) return undefined;
        const observed = this.withPresence(room);
        const forfeitUid = connected ? getForfeitUid(observed, this.now()) : undefined;
        const player = room.players[this.uid];
        room.players[this.uid] = {
          ...player,
          connected,
          lastSeen: this.now(),
          ...(forfeitUid === this.uid
            ? { forfeited: true, forfeitAt: getForfeitAt(observed, this.now()) }
            : {}),
          ...(forfeitUid && forfeitUid !== this.uid
            ? {
                forfeitClaim: {
                  uid: forfeitUid,
                  disconnectedAt: observed.players[forfeitUid].lastSeen,
                  seed: room.meta.seed,
                },
              }
            : {}),
        };
        return room;
      });
    }
  }

  private async heartbeat(): Promise<void> {
    if (!this.activeCode || !this.connected || this.disposed) return;
    const code = this.activeCode;
    await this.mutate(code, (room) => {
      if (!room?.players[this.uid]) return undefined;
      room.players[this.uid] = { ...room.players[this.uid], connected: true, lastSeen: this.now() };
      return room;
    });
    await this.reconcileRoom(code);
  }

  private onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(PREFIX)) this.emit(event.key.slice(PREFIX.length));
  };
  private onOnline = () => {
    void this.setConnected(true).catch(() => {});
  };
  private onOffline = () => {
    void this.setConnected(false).catch(() => {});
  };
  private onPageHide = () => {
    void this.setConnected(false).catch(() => {});
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    void this.setConnected(false).catch(() => {});
    if (this.timer) clearInterval(this.timer);
    this.channel?.close();
    this.channel = null;
    clients.delete(this);
    this.listeners.clear();
    this.connectionListeners.clear();
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', this.onStorage);
      window.removeEventListener('online', this.onOnline);
      window.removeEventListener('offline', this.onOffline);
      window.removeEventListener('pagehide', this.onPageHide);
    }
  }
}
