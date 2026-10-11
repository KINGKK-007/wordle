import type { FirebaseOptions } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Database } from 'firebase/database';
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

type DatabaseSdk = typeof import('firebase/database');
type FirebaseSdks = [typeof import('firebase/app'), typeof import('firebase/auth'), DatabaseSdk];
let sdkInitialization: Promise<FirebaseSdks> | null = null;
const identityInitializations = new WeakMap<Auth, Promise<string>>();

function loadSdks(): Promise<FirebaseSdks> {
  sdkInitialization ??= Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/database'),
  ]).catch((error: unknown) => {
    sdkInitialization = null;
    throw error;
  });
  return sdkInitialization;
}

function initializeIdentity(auth: Auth, sdk: FirebaseSdks[1]): Promise<string> {
  const existing = identityInitializations.get(auth);
  if (existing) return existing;
  // StrictMode can replace a transport while sign-in is still in flight. Both
  // instances must wait for the same identity rather than create two users.
  const pending = (async () => {
    await sdk.setPersistence(auth, sdk.browserSessionPersistence);
    await auth.authStateReady();
    return auth.currentUser?.uid ?? (await sdk.signInAnonymously(auth)).user.uid;
  })().catch((error: unknown) => {
    identityInitializations.delete(auth);
    throw error;
  });
  identityInitializations.set(auth, pending);
  return pending;
}

/** Modular Firebase SDK is imported only when a player enters Duel. */
export class FirebaseTransport implements DuelTransport {
  private config: FirebaseOptions;
  private database: Database | null = null;
  private sdk: DatabaseSdk | null = null;
  private uid = '';
  private offset = 0;
  private connected = false;
  private activeCode: string | null = null;
  private rooms = new Map<string, RoomState>();
  private connectionListeners = new Set<(connected: boolean) => void>();
  private cleanup = new Set<() => void>();
  private initialized: Promise<{ uid: string }> | null = null;
  private disposed = false;

  constructor(config: FirebaseOptions) {
    this.config = config;
  }

  init(): Promise<{ uid: string }> {
    this.initialized ??= this.initialize();
    return this.initialized;
  }

  private async initialize(): Promise<{ uid: string }> {
    const [appSdk, authSdk, databaseSdk] = await loadSdks();
    const app =
      appSdk.getApps().find((candidate) => candidate.name === 'custom-wordle-duel') ??
      appSdk.initializeApp(this.config, 'custom-wordle-duel');
    const auth = authSdk.getAuth(app);
    // Session persistence survives refresh while keeping two testing tabs independent.
    this.uid = await initializeIdentity(auth, authSdk);
    this.database = databaseSdk.getDatabase(app);
    this.sdk = databaseSdk;
    this.cleanup.add(
      databaseSdk.onValue(databaseSdk.ref(this.database, '.info/serverTimeOffset'), (snapshot) => {
        const value: unknown = snapshot.val();
        if (typeof value === 'number' && Number.isFinite(value)) this.offset = value;
      }),
    );
    this.cleanup.add(
      databaseSdk.onValue(databaseSdk.ref(this.database, '.info/connected'), (snapshot) => {
        this.connected = snapshot.val() === true;
        for (const listener of this.connectionListeners) listener(this.connected);
        if (this.connected && this.activeCode && !this.disposed)
          void this.presence(this.activeCode).catch(() => {});
      }),
    );
    if (this.disposed) for (const unsubscribe of this.cleanup) unsubscribe();
    return { uid: this.uid };
  }

  getServerTime(): number {
    return Date.now() + this.offset;
  }

  private getDb(): { sdk: DatabaseSdk; db: Database } {
    if (!this.sdk || !this.database) throw new Error('Duel transport is not initialized');
    return { sdk: this.sdk, db: this.database };
  }

  private async read(code: string): Promise<RoomState> {
    const { sdk, db } = this.getDb();
    const room = parseRoom((await sdk.get(sdk.ref(db, `rooms/${code}`))).val() as unknown);
    if (!room) throw new DuelError('NOT_FOUND');
    if (this.getServerTime() - room.meta.createdAt >= ROOM_EXPIRY_MS)
      throw new DuelError('EXPIRED');
    this.rooms.set(code, room);
    return room;
  }

  private player(name: string, seed: number): DuelPlayer {
    return {
      name: sanitizeNickname(name),
      ready: false,
      readySeed: seed,
      rematchSeed: null,
      joinedAt: this.getServerTime(),
      connected: true,
      lastSeen: this.getServerTime(),
    };
  }

  private saveSession(code: string): void {
    try {
      localStorage.setItem(
        'custom-wordle-duel-session',
        JSON.stringify({ roomCode: code, uid: this.uid }),
      );
    } catch {
      /* Optional persistence. */
    }
  }

  private async presence(code: string): Promise<void> {
    const { sdk, db } = this.getDb();
    const playerRef = sdk.ref(db, `rooms/${code}/players/${this.uid}`);
    const room = await this.read(code);
    if (!room.players[this.uid]) return;
    const forfeitUid = getForfeitUid(room, this.getServerTime());
    if (forfeitUid === this.uid)
      await sdk.update(playerRef, {
        forfeited: true,
        forfeitAt: getForfeitAt(room, this.getServerTime()),
      });
    else if (forfeitUid) await this.claimForfeit(code, room, forfeitUid);
    // Register the server operation first, before publishing connected=true.
    await sdk.onDisconnect(playerRef).update({ connected: false, lastSeen: sdk.serverTimestamp() });
    await sdk.update(playerRef, { connected: true, lastSeen: sdk.serverTimestamp() });
  }

  async createRoom(opts: {
    durationSec: DurationSec;
    displayName: string;
  }): Promise<{ code: string }> {
    await this.init();
    if (![60, 120, 300].includes(opts.durationSec)) throw new Error('Invalid duration');
    const { sdk, db } = this.getDb();
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = generateRoomCode();
      const seed = randomSeed();
      const result = await sdk.runTransaction(
        sdk.ref(db, `rooms/${code}`),
        (existing) => {
          if (existing !== null) return undefined;
          return {
            meta: {
              hostUid: this.uid,
              createdAt: this.getServerTime(),
              durationSec: opts.durationSec,
              seed,
              status: 'lobby',
              startAt: null,
              endAt: null,
            },
            players: { [this.uid]: this.player(opts.displayName, seed) },
            progress: { [this.uid]: createProgress(seed, this.getServerTime()) },
          } satisfies RoomState;
        },
        { applyLocally: false },
      );
      if (!result.committed) continue;
      this.activeCode = code;
      this.saveSession(code);
      await this.presence(code);
      return { code };
    }
    throw new Error('Unable to create a room. Try again.');
  }

  async joinRoom(input: string, displayName: string): Promise<void> {
    await this.init();
    const code = normalizeRoomCode(input);
    if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/.test(code)) throw new DuelError('NOT_FOUND');
    const { sdk, db } = this.getDb();
    const room = await this.read(code);
    if (!room.players[this.uid]) {
      if (getRoomPhase(room, this.getServerTime()) !== 'lobby')
        throw new DuelError('ALREADY_STARTED');
      if (room.meta.guestUid && room.meta.guestUid !== this.uid) throw new DuelError('ROOM_FULL');
      const seatRef = sdk.ref(db, `rooms/${code}/meta/guestUid`);
      let reserved: boolean;
      try {
        const result = await sdk.runTransaction(
          seatRef,
          (value) => (value === null || value === this.uid ? this.uid : undefined),
          { applyLocally: false },
        );
        reserved = result.committed;
      } catch {
        const latest = await this.read(code);
        if (getRoomPhase(latest, this.getServerTime()) !== 'lobby')
          throw new DuelError('ALREADY_STARTED');
        throw new DuelError('ROOM_FULL');
      }
      if (!reserved) throw new DuelError('ROOM_FULL');
      // A tab closed between reservation and creation releases its reserved seat.
      await sdk.onDisconnect(seatRef).remove();
      try {
        await sdk.set(
          sdk.ref(db, `rooms/${code}/players/${this.uid}`),
          this.player(displayName, room.meta.seed),
        );
        await sdk.set(
          sdk.ref(db, `rooms/${code}/progress/${this.uid}`),
          createProgress(room.meta.seed, this.getServerTime()),
        );
        await sdk.onDisconnect(seatRef).cancel();
      } catch (error) {
        await sdk.remove(seatRef).catch(() => {});
        throw error;
      }
    } else {
      // Persist any overdue opponent timeout before presence resets this player's clock.
      const forfeitUid = getForfeitUid(room, this.getServerTime());
      if (forfeitUid && forfeitUid !== this.uid) await this.claimForfeit(code, room, forfeitUid);
      if (forfeitUid && room.meta.hostUid === this.uid) {
        await sdk.update(sdk.ref(db, `rooms/${code}/meta`), {
          status: 'finished',
          forfeitUid,
          forfeitAt: getForfeitAt(room, this.getServerTime()),
        });
      }
      await sdk.update(sdk.ref(db, `rooms/${code}/players/${this.uid}`), {
        name: sanitizeNickname(displayName),
      });
    }
    this.activeCode = code;
    this.saveSession(code);
    await this.presence(code);
  }

  subscribeRoom(code: string, cb: (room: RoomState | null) => void): () => void {
    const { sdk, db } = this.getDb();
    const unsubscribe = sdk.onValue(
      sdk.ref(db, `rooms/${code}`),
      (snapshot) => {
        const room = parseRoom(snapshot.val() as unknown);
        if (room) this.rooms.set(code, room);
        else this.rooms.delete(code);
        cb(room);
      },
      () => cb(null),
    );
    this.cleanup.add(unsubscribe);
    return () => {
      unsubscribe();
      this.cleanup.delete(unsubscribe);
    };
  }

  subscribeConnection(cb: (connected: boolean) => void): () => void {
    this.connectionListeners.add(cb);
    cb(this.connected);
    return () => {
      this.connectionListeners.delete(cb);
    };
  }

  async setReady(code: string, ready: boolean): Promise<void> {
    const room = await this.read(code);
    if (
      !['lobby', 'countdown'].includes(getRoomPhase(room, this.getServerTime())) ||
      !room.players[this.uid]
    )
      return;
    if (ready && Object.keys(room.players).length !== 2) return;
    const { sdk, db } = this.getDb();
    await sdk.update(sdk.ref(db, `rooms/${code}/players/${this.uid}`), {
      ready,
      readySeed: room.meta.seed,
      forfeited: false,
      forfeitClaim: null,
      forfeitAt: null,
    });
    await this.reconcileRoom(code);
  }

  async setDuration(code: string, durationSec: DurationSec): Promise<void> {
    const room = await this.read(code);
    if (
      room.meta.hostUid !== this.uid ||
      room.meta.status !== 'lobby' ||
      ![60, 120, 300].includes(durationSec)
    )
      return;
    const { sdk, db } = this.getDb();
    await sdk.update(sdk.ref(db, `rooms/${code}/meta`), {
      durationSec,
      seed: (room.meta.seed + 1) >>> 0,
    });
  }

  async publishProgress(code: string, progress: PlayerProgress): Promise<void> {
    if (!isPlayerProgress(progress)) throw new Error('Invalid duel progress');
    const { sdk, db } = this.getDb();
    // Cumulative snapshots queue in RTDB while offline; the UI also persists the newest locally.
    await sdk.runTransaction(
      sdk.ref(db, `rooms/${code}/progress/${this.uid}`),
      (current) => {
        const previous = current as Partial<PlayerProgress> | null;
        if (
          previous?.seed === progress.seed &&
          ((previous.totalGuesses ?? 0) > progress.totalGuesses ||
            (previous.updatedAt ?? 0) > progress.updatedAt ||
            previous.finished)
        )
          return undefined;
        return progress;
      },
      { applyLocally: false },
    );
  }

  async requestRematch(code: string): Promise<void> {
    const room = await this.read(code);
    if (getRoomPhase(room, this.getServerTime()) !== 'finished' || !room.players[this.uid]) return;
    const { sdk, db } = this.getDb();
    await sdk.update(sdk.ref(db, `rooms/${code}/players/${this.uid}`), {
      rematchSeed: room.meta.seed,
    });
    await this.reconcileRoom(code);
  }

  private async claimForfeit(code: string, room: RoomState, uid: string): Promise<void> {
    if (uid === this.uid || room.players[this.uid]?.forfeitClaim) return;
    const { sdk, db } = this.getDb();
    await sdk.set(sdk.ref(db, `rooms/${code}/players/${this.uid}/forfeitClaim`), {
      uid,
      disconnectedAt: room.players[uid]?.lastSeen ?? this.getServerTime(),
      seed: room.meta.seed,
    });
  }

  async reconcileRoom(code: string): Promise<void> {
    if (!this.connected) return;
    const room = this.rooms.get(code) ?? (await this.read(code));
    if (!room.players[this.uid]) return;
    const forfeitUid = getForfeitUid(room, this.getServerTime());
    if (room.meta.hostUid !== this.uid) {
      if (forfeitUid && forfeitUid !== this.uid) await this.claimForfeit(code, room, forfeitUid);
      return;
    }
    const next = reconcileMeta(room, this.getServerTime());
    if (!next) return;
    const { sdk, db } = this.getDb();
    await sdk.runTransaction(
      sdk.ref(db, `rooms/${code}/meta`),
      (current) => {
        if (!current || typeof current !== 'object') return undefined;
        const raw = current as Record<string, unknown>;
        // Do not overwrite a concurrent guest reservation, new match, or countdown.
        if (
          raw.seed !== room.meta.seed ||
          raw.status !== room.meta.status ||
          (raw.startAt ?? null) !== room.meta.startAt ||
          raw.guestUid !== room.meta.guestUid
        )
          return undefined;
        return next;
      },
      { applyLocally: false },
    );
  }

  async leaveRoom(code: string): Promise<void> {
    // Stop unmount/reconnect presence writes before asynchronous room cleanup.
    if (this.activeCode === code) this.activeCode = null;
    const { sdk, db } = this.getDb();
    const room = await this.read(code).catch(() => null);
    if (!room?.players[this.uid]) return;
    const phase = getRoomPhase(room, this.getServerTime());
    if (
      (phase === 'lobby' || phase === 'countdown' || phase === 'finished') &&
      room.meta.hostUid === this.uid
    ) {
      await sdk.remove(sdk.ref(db, `rooms/${code}`));
    } else if (phase === 'lobby' || phase === 'countdown') {
      await sdk.update(sdk.ref(db, `rooms/${code}`), {
        [`players/${this.uid}`]: null,
        [`progress/${this.uid}`]: null,
        'meta/guestUid': null,
      });
    } else {
      await sdk.update(sdk.ref(db, `rooms/${code}/players/${this.uid}`), {
        connected: false,
        lastSeen: sdk.serverTimestamp(),
        ...(phase === 'playing' ? { forfeited: true, forfeitAt: this.getServerTime() } : {}),
      });
    }
    await sdk.onDisconnect(sdk.ref(db, `rooms/${code}/players/${this.uid}`)).cancel();
  }

  dispose(): void {
    this.disposed = true;
    if (this.activeCode && this.sdk && this.database) {
      // Navigation/unmount updates presence; a refresh keeps the anonymous identity.
      void this.sdk
        .update(this.sdk.ref(this.database, `rooms/${this.activeCode}/players/${this.uid}`), {
          connected: false,
          lastSeen: this.sdk.serverTimestamp(),
        })
        .catch(() => {});
    }
    for (const unsubscribe of this.cleanup) unsubscribe();
    this.cleanup.clear();
    this.connectionListeners.clear();
  }
}
