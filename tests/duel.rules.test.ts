import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/database';
import 'firebase/compat/database';
import type { Database } from 'firebase/database';
import { FirebaseTransport } from '../src/duel/FirebaseTransport';
import {
  createProgress,
  finishProgress,
  getRoomPhase,
  rankDuel,
  seededSequence,
  submitGuess,
} from '../src/duel/logic';
import type { RoomState } from '../src/duel/types';
import { parseRoom } from '../src/duel/validation';

let env: RulesTestEnvironment;
const transports: FirebaseTransport[] = [];
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-wordle-duel',
    database: { host: '127.0.0.1', port: 9000, rules: readFileSync('database.rules.json', 'utf8') },
  });
});
beforeEach(async () => {
  for (const transport of transports.splice(0)) transport.dispose();
  await env.clearDatabase();
});
afterAll(async () => {
  for (const transport of transports.splice(0)) transport.dispose();
  await env.cleanup();
});

function database(uid: string | null): Database {
  return (uid
    ? env.authenticatedContext(uid)
    : env.unauthenticatedContext()
  ).database() as unknown as Database;
}
function transport(uid: string): FirebaseTransport {
  const client = new FirebaseTransport({ projectId: 'demo-wordle-duel' });
  // Inject authenticated emulator clients to exercise the real transport without external Auth credentials.
  Object.assign(client, {
    database: database(uid),
    sdk,
    uid,
    connected: true,
    initialized: Promise.resolve({ uid }),
  });
  transports.push(client);
  return client;
}
async function read(code: string, uid = 'host'): Promise<RoomState> {
  const snapshot = await sdk.get(sdk.ref(database(uid), `rooms/${code}`));
  const value = parseRoom(snapshot.val() as unknown);
  expect(value).not.toBeNull();
  return value!;
}
async function adminSet(path: string, value: unknown) {
  await env.withSecurityRulesDisabled(async (context) => {
    await context.database().ref(path).set(value);
  });
}
async function eventually(predicate: () => boolean | Promise<boolean>, timeout = 2500) {
  const deadline = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error('Emulator condition timed out');
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}
function fixture(status: RoomState['meta']['status'] = 'lobby'): RoomState {
  const now = Date.now();
  const seed = 7;
  const player = {
    name: 'Player',
    ready: true,
    readySeed: seed,
    rematchSeed: null,
    joinedAt: now - 1000,
    connected: true,
    lastSeen: now,
  };
  return {
    meta: {
      hostUid: 'host',
      guestUid: 'guest',
      createdAt: now - 1000,
      durationSec: 60,
      seed,
      status,
      startAt: status === 'lobby' ? null : now - 1000,
      endAt: status === 'lobby' ? null : now + 59000,
    },
    players: { host: { ...player }, guest: { ...player } },
    progress: { host: createProgress(seed, now), guest: createProgress(seed, now) },
  };
}

describe('Firebase RTDB transport and security rules', () => {
  it('runs actual create/join/countdown/play/time-up/rematch with independent authenticated clients', async () => {
    const host = transport('host');
    const guest = transport('guest');
    const { code } = await host.createRoom({ durationSec: 60, displayName: 'Host' });
    let hostRoom: RoomState | null = null;
    let guestRoom: RoomState | null = null;
    const offHost = host.subscribeRoom(code, (value) => {
      hostRoom = value;
    });
    const offGuest = guest.subscribeRoom(code, (value) => {
      guestRoom = value;
    });
    await guest.joinRoom(code, 'Guest');
    await eventually(() => Boolean(hostRoom?.players.guest && guestRoom?.players.guest));
    await host.setReady(code, true);
    await guest.setReady(code, true);
    await eventually(async () => {
      await host.reconcileRoom(code);
      return (await read(code)).meta.status === 'countdown';
    });
    const countdown = await read(code);
    expect(countdown.meta.startAt).toBeGreaterThan(Date.now() + 3500);
    expect(countdown.meta.endAt! - countdown.meta.startAt!).toBe(60000);
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, countdown.meta.startAt! - Date.now()) + 20),
    );
    expect(getRoomPhase(countdown, host.getServerTime())).toBe('playing');
    expect(getRoomPhase(countdown, guest.getServerTime())).toBe('playing');
    await host.reconcileRoom(code);
    const answer = seededSequence(countdown.meta.seed)[0];
    const hostProgress = submitGuess(createProgress(countdown.meta.seed), {
      guess: answer,
      answer,
      now: Date.now(),
      startAt: countdown.meta.startAt!,
      endAt: countdown.meta.endAt!,
    }).progress;
    const guestProgress = submitGuess(createProgress(countdown.meta.seed), {
      guess: 'slate',
      answer,
      now: Date.now(),
      startAt: countdown.meta.startAt!,
      endAt: countdown.meta.endAt!,
    }).progress;
    await host.publishProgress(code, hostProgress);
    await guest.publishProgress(code, guestProgress);
    expect((await read(code)).progress.host.wordsSolved).toBe(1);
    await expect(transport('third').joinRoom(code, 'Third')).rejects.toMatchObject({
      code: 'ALREADY_STARTED',
    });
    // Advance the authoritative fixture clock without a minute-long wall-clock delay.
    const ended = await read(code);
    ended.meta.endAt = Date.now() + 50;
    ended.meta.startAt = ended.meta.endAt - 60000;
    await adminSet(`rooms/${code}/meta`, ended.meta);
    await eventually(() => Boolean(hostRoom?.meta.endAt === ended.meta.endAt));
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, ended.meta.endAt! - Date.now()) + 10),
    );
    await host.publishProgress(
      code,
      finishProgress(hostProgress, ended.meta.endAt, ended.meta.startAt),
    );
    await guest.publishProgress(
      code,
      finishProgress(guestProgress, ended.meta.endAt, ended.meta.startAt),
    );
    await host.reconcileRoom(code);
    await eventually(() =>
      Boolean(hostRoom?.meta.status === 'finished' && guestRoom?.meta.status === 'finished'),
    );
    const finalHost = await read(code, 'host');
    const finalGuest = await read(code, 'guest');
    expect(finalHost.progress.host.finished).toBe(true);
    expect(finalHost.progress.guest.finished).toBe(true);
    expect(rankDuel(finalHost.progress.host, finalHost.progress.guest)).toEqual(
      rankDuel(finalGuest.progress.host, finalGuest.progress.guest),
    );
    expect(JSON.stringify(finalHost.progress)).not.toContain(answer);
    await guest.requestRematch(code);
    await host.requestRematch(code);
    await eventually(async () => {
      await host.reconcileRoom(code);
      return (await read(code)).meta.status === 'lobby';
    });
    expect((await read(code)).meta.seed).not.toBe(countdown.meta.seed);
    offHost();
    offGuest();
    await host.leaveRoom(code);
    expect((await sdk.get(sdk.ref(database('guest'), `rooms/${code}`))).exists()).toBe(false);
  });
  it('authenticates individual rooms while preventing root enumeration', async () => {
    await adminSet('rooms/ABCDE', fixture());
    await assertSucceeds(sdk.get(sdk.ref(database('stranger'), 'rooms/ABCDE')));
    await assertFails(sdk.get(sdk.ref(database(null), 'rooms/ABCDE')));
    await assertFails(sdk.get(sdk.ref(database('host'), 'rooms')));
  });
  it('restricts the guest seat and prevents any third player', async () => {
    const host = transport('host');
    const { code } = await host.createRoom({ durationSec: 120, displayName: 'Host' });
    const guest = transport('guest');
    await guest.joinRoom(code, 'Guest');
    await expect(transport('third').joinRoom(code, 'Third')).rejects.toMatchObject({
      code: 'ROOM_FULL',
    });
    const thirdDb = database('third');
    await assertFails(sdk.set(sdk.ref(thirdDb, `rooms/${code}/meta/guestUid`), 'third'));
    await assertFails(
      sdk.set(sdk.ref(thirdDb, `rooms/${code}/players/third`), fixture().players.guest),
    );
    await guest.leaveRoom(code);
    await transport('third').joinRoom(code, 'Third');
    expect((await read(code)).meta.guestUid).toBe('third');
  });
  it('allows only own player and progress writes and host metadata transitions', async () => {
    const value = fixture('playing');
    await adminSet('rooms/ABCDE', value);
    const guestDb = database('guest');
    const hostDb = database('host');
    await assertFails(sdk.update(sdk.ref(guestDb, 'rooms/ABCDE/players/host'), { name: 'Hacked' }));
    await assertFails(
      sdk.set(sdk.ref(guestDb, 'rooms/ABCDE/progress/host'), createProgress(7, Date.now())),
    );
    await assertFails(sdk.update(sdk.ref(hostDb, 'rooms/ABCDE/players/guest'), { ready: false }));
    await assertFails(sdk.update(sdk.ref(guestDb, 'rooms/ABCDE/meta'), { durationSec: 300 }));
    await assertSucceeds(
      sdk.update(sdk.ref(guestDb, 'rooms/ABCDE/players/guest'), { name: 'Friend' }),
    );
    await assertSucceeds(
      sdk.set(sdk.ref(guestDb, 'rooms/ABCDE/progress/guest'), createProgress(7, Date.now())),
    );
  });
  it('validates names, durations, status, patterns and forbids guessed letters', async () => {
    const value = fixture('playing');
    await adminSet('rooms/ABCDE', value);
    const hostDb = database('host');
    const guestDb = database('guest');
    await assertFails(
      sdk.update(sdk.ref(guestDb, 'rooms/ABCDE/players/guest'), { name: 'Name far too long' }),
    );
    await assertFails(sdk.update(sdk.ref(hostDb, 'rooms/ABCDE/meta'), { durationSec: 90 }));
    await assertFails(sdk.update(sdk.ref(hostDb, 'rooms/ABCDE/meta'), { status: 'hacked' }));
    await assertFails(
      sdk.update(sdk.ref(guestDb, 'rooms/ABCDE/progress/guest'), { guesses: ['crane'] }),
    );
    await assertFails(
      sdk.update(sdk.ref(guestDb, 'rooms/ABCDE/progress/guest'), { currentPatterns: ['SECRET'] }),
    );
    await assertFails(
      sdk.update(sdk.ref(guestDb, 'rooms/ABCDE/progress/guest'), { totalGuesses: -1 }),
    );
  });
  it('prevents premature countdown/finish and guest lifecycle writes', async () => {
    const value = fixture();
    value.players.guest.ready = false;
    await adminSet('rooms/ABCDE', value);
    const hostDb = database('host');
    const guestDb = database('guest');
    const now = Date.now();
    await assertFails(
      sdk.update(sdk.ref(hostDb, 'rooms/ABCDE/meta'), {
        status: 'countdown',
        startAt: now + 5000,
        endAt: now + 65000,
      }),
    );
    value.players.guest.ready = true;
    await adminSet('rooms/ABCDE', value);
    await assertFails(
      sdk.update(sdk.ref(guestDb, 'rooms/ABCDE/meta'), {
        status: 'countdown',
        startAt: now + 5000,
        endAt: now + 65000,
      }),
    );
    await assertSucceeds(
      sdk.update(sdk.ref(hostDb, 'rooms/ABCDE/meta'), {
        status: 'countdown',
        startAt: now + 5000,
        endAt: now + 65000,
      }),
    );
    await assertFails(sdk.update(sdk.ref(hostDb, 'rooms/ABCDE/meta'), { status: 'finished' }));
    await assertSucceeds(
      sdk.update(sdk.ref(guestDb, 'rooms/ABCDE/players/guest'), { ready: false }),
    );
    await assertSucceeds(
      sdk.update(sdk.ref(hostDb, 'rooms/ABCDE/meta'), {
        status: 'lobby',
        startAt: null,
        endAt: null,
      }),
    );
  });
  it('accepts verified opponent-timeout claims on own node, rejects invented forfeits and preserves late reconnect', async () => {
    const value = fixture('playing');
    value.meta.startAt = Date.now() - 30000;
    value.meta.endAt = value.meta.startAt + 60000;
    value.players.host.connected = false;
    value.players.host.lastSeen = Date.now() - 21000;
    await adminSet('rooms/ABCDE', value);
    const guestDb = database('guest');
    await assertFails(
      sdk.set(sdk.ref(guestDb, 'rooms/ABCDE/players/guest/forfeitClaim'), {
        uid: 'host',
        disconnectedAt: 0,
        seed: 7,
      }),
    );
    const guest = transport('guest');
    await guest.joinRoom('ABCDE', 'Guest');
    await guest.reconcileRoom('ABCDE');
    expect((await read('ABCDE')).players.guest.forfeitClaim?.uid).toBe('host');
    const host = transport('host');
    await host.joinRoom('ABCDE', 'Host');
    await host.reconcileRoom('ABCDE');
    expect((await read('ABCDE')).meta).toMatchObject({ status: 'finished', forfeitUid: 'host' });
    expect((await read('ABCDE')).players.host.forfeited).toBe(true);
    expect((await read('ABCDE')).meta.forfeitAt).toBe(value.players.host.lastSeen + 20000);
  });
  it('host duration changes and mutual rematch invalidate readiness without writing guest nodes', async () => {
    const host = transport('host');
    const guest = transport('guest');
    const { code } = await host.createRoom({ durationSec: 120, displayName: 'Host' });
    await guest.joinRoom(code, 'Guest');
    await guest.setReady(code, true);
    const before = (await read(code)).players.guest;
    await host.setDuration(code, 300);
    expect((await read(code)).players.guest).toEqual(before);
    const changed = await read(code);
    expect(changed.meta.durationSec).toBe(300);
    expect(changed.meta.seed).not.toBe(before.readySeed);
    await assertFails(
      sdk.update(sdk.ref(database('host'), `rooms/${code}/players/guest`), { ready: false }),
    );
  });
  it('rejects nonexistent-player progress, mutable finished metadata and unilateral rematch', async () => {
    const value = fixture('finished');
    value.meta.startAt = Date.now() - 61000;
    value.meta.endAt = value.meta.startAt + 60000;
    await adminSet('rooms/ABCDE', value);
    const hostDb = database('host');
    await assertFails(
      sdk.set(
        sdk.ref(database('third'), 'rooms/ABCDE/progress/third'),
        createProgress(7, Date.now()),
      ),
    );
    await assertFails(
      sdk.update(sdk.ref(hostDb, 'rooms/ABCDE/meta'), {
        seed: 8,
        status: 'lobby',
        startAt: null,
        endAt: null,
      }),
    );
    await assertFails(sdk.update(sdk.ref(hostDb, 'rooms/ABCDE/meta'), { guestUid: null }));
    await assertFails(sdk.update(sdk.ref(hostDb, 'rooms/ABCDE/meta'), { createdAt: Date.now() }));
  });
  it('restores same-uid room progress after refresh and rejects expired rooms', async () => {
    const value = fixture('playing');
    const answer = seededSequence(7)[0];
    value.progress.guest = submitGuess(value.progress.guest, {
      guess: answer,
      answer,
      now: Date.now(),
      startAt: value.meta.startAt!,
      endAt: value.meta.endAt!,
    }).progress;
    await adminSet('rooms/ABCDE', value);
    const reloaded = transport('guest');
    await reloaded.joinRoom('ABCDE', 'Guest');
    expect((await read('ABCDE')).progress.guest).toEqual(value.progress.guest);
    value.meta.createdAt = Date.now() - 6 * 60 * 60 * 1000;
    await adminSet('rooms/ABCDE', value);
    await expect(transport('third').joinRoom('ABCDE', 'Third')).rejects.toMatchObject({
      code: 'EXPIRED',
    });
  });
});
