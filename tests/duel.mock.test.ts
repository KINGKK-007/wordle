import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockTransport } from '../src/duel/MockTransport';
import {
  advanceWord,
  createProgress,
  finishProgress,
  getForfeitAt,
  getRoomPhase,
  rankDuel,
  seededSequence,
  submitGuess,
} from '../src/duel/logic';
import type { RoomState } from '../src/duel/types';

const active: MockTransport[] = [];
afterEach(() => {
  for (const client of active.splice(0)) client.dispose();
  vi.useRealTimers();
});
function setup() {
  let clock = 100000;
  const rooms = new Map<string, RoomState>();
  const make = (uid: string) => {
    const client = new MockTransport({
      uid,
      rooms,
      now: () => clock,
      storage: null,
      autoHeartbeat: false,
    });
    active.push(client);
    return client;
  };
  const host = make('host');
  const guest = make('guest');
  const value = (code: string) => rooms.get(code)!;
  const advance = (ms: number) => {
    clock += ms;
  };
  const start = async () => {
    const { code } = await host.createRoom({ durationSec: 60, displayName: 'Host' });
    await guest.joinRoom(code, 'Guest');
    await host.setReady(code, true);
    await guest.setReady(code, true);
    await host.reconcileRoom(code);
    return code;
  };
  return { host, guest, make, value, advance, start, now: () => clock };
}

describe('MockTransport two-client room lifecycle', () => {
  it('create → join → ready → simultaneous start → both play → same final ranking', async () => {
    const s = setup();
    const code = await s.start();
    expect(s.value(code).meta).toMatchObject({
      status: 'countdown',
      startAt: 105000,
      endAt: 165000,
    });
    s.advance(4999);
    expect(getRoomPhase(s.value(code), s.host.getServerTime())).toBe('countdown');
    s.advance(1);
    expect(getRoomPhase(s.value(code), s.guest.getServerTime())).toBe('playing');
    const room = s.value(code);
    const answer = seededSequence(room.meta.seed)[0];
    const one = submitGuess(createProgress(room.meta.seed), {
      guess: answer,
      answer,
      now: s.now() + 1000,
      startAt: room.meta.startAt!,
      endAt: room.meta.endAt!,
    }).progress;
    await s.host.publishProgress(code, one);
    const two = submitGuess(createProgress(room.meta.seed), {
      guess: answer,
      answer,
      now: s.now() + 2000,
      startAt: room.meta.startAt!,
      endAt: room.meta.endAt!,
    }).progress;
    await s.guest.publishProgress(code, two);
    const hostSnapshot: RoomState[] = [];
    const guestSnapshot: RoomState[] = [];
    const offHost = s.host.subscribeRoom(code, (value) => {
      if (value) hostSnapshot.push(value);
    });
    const offGuest = s.guest.subscribeRoom(code, (value) => {
      if (value) guestSnapshot.push(value);
    });
    s.advance(60000);
    await s.host.publishProgress(code, finishProgress(one, s.now(), room.meta.startAt!));
    await s.guest.publishProgress(code, finishProgress(two, s.now(), room.meta.startAt!));
    await s.host.reconcileRoom(code);
    expect(s.value(code).meta.status).toBe('finished');
    const a = hostSnapshot.at(-1)!;
    const b = guestSnapshot.at(-1)!;
    expect(a).toEqual(b);
    expect(rankDuel(a.progress.host, a.progress.guest)).toEqual({
      winner: 'a',
      decidedBy: 'finalSolveTime',
    });
    expect(rankDuel(b.progress.host, b.progress.guest)).toEqual(
      rankDuel(a.progress.host, a.progress.guest),
    );
    expect(JSON.stringify(a.progress)).not.toContain(answer);
    offHost();
    offGuest();
  });
  it('un-ready and disconnection abort countdown and reset timestamps', async () => {
    const s = setup();
    const code = await s.start();
    await s.guest.setReady(code, false);
    await s.host.reconcileRoom(code);
    expect(s.value(code).meta).toMatchObject({ status: 'lobby', startAt: null, endAt: null });
    await s.guest.setReady(code, true);
    await s.host.reconcileRoom(code);
    await s.guest.setConnected(false);
    await s.host.reconcileRoom(code);
    expect(s.value(code).meta.status).toBe('lobby');
  });
  it('rejects missing, full, already-started, and six-hour-expired rooms', async () => {
    const s = setup();
    const third = s.make('third');
    await expect(third.joinRoom('ABCDE', 'Third')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const { code } = await s.host.createRoom({ durationSec: 120, displayName: 'Host' });
    await s.guest.joinRoom(code.toLowerCase(), 'Guest');
    await expect(third.joinRoom(code, 'Third')).rejects.toMatchObject({ code: 'ROOM_FULL' });
    await s.host.setReady(code, true);
    await s.guest.setReady(code, true);
    await s.host.reconcileRoom(code);
    await expect(third.joinRoom(code, 'Third')).rejects.toMatchObject({ code: 'ALREADY_STARTED' });
    s.advance(6 * 60 * 60 * 1000);
    await expect(third.joinRoom(code, 'Third')).rejects.toMatchObject({ code: 'EXPIRED' });
  });
  it('same-uid refresh rejoins during play and preserves shared progress', async () => {
    const s = setup();
    const code = await s.start();
    s.advance(6000);
    const room = s.value(code);
    const answer = seededSequence(room.meta.seed)[0];
    const progress = submitGuess(createProgress(room.meta.seed), {
      guess: answer,
      answer,
      now: s.now(),
      startAt: room.meta.startAt!,
      endAt: room.meta.endAt!,
    }).progress;
    await s.guest.publishProgress(code, progress);
    await s.guest.setConnected(false);
    s.advance(5000);
    const reloaded = s.make('guest');
    await reloaded.joinRoom(code, 'Guest');
    expect(s.value(code).progress.guest).toEqual(progress);
    expect(getRoomPhase(s.value(code), s.now())).toBe('playing');
    expect(s.value(code).players.guest.connected).toBe(true);
  });
  it('forfeits at exactly twenty seconds and a late reconnect cannot undo the result', async () => {
    const s = setup();
    const code = await s.start();
    s.advance(6000);
    await s.guest.setConnected(false);
    s.advance(19999);
    await s.host.reconcileRoom(code);
    expect(getRoomPhase(s.value(code), s.now())).toBe('playing');
    s.advance(1);
    await s.guest.setConnected(true);
    await s.host.reconcileRoom(code);
    expect(s.value(code).meta).toMatchObject({ status: 'finished', forfeitUid: 'guest' });
    expect(getForfeitAt(s.value(code), s.now())).toBe(126000);
    s.advance(5000);
    await s.guest.setConnected(true);
    expect(getForfeitAt(s.value(code), s.now())).toBe(126000);
  });
  it('guest can record an overdue host timeout without writing host metadata or player nodes', async () => {
    const s = setup();
    const code = await s.start();
    s.advance(6000);
    await s.host.setConnected(false);
    const hostBefore = { ...s.value(code).players.host };
    s.advance(20000);
    await s.guest.reconcileRoom(code);
    expect(s.value(code).players.host).toEqual(hostBefore);
    expect(s.value(code).meta.status).toBe('countdown');
    expect(s.value(code).players.guest.forfeitClaim?.uid).toBe('host');
    expect(getRoomPhase(s.value(code), s.now())).toBe('finished');
    await s.host.setConnected(true);
    await s.host.reconcileRoom(code);
    expect(s.value(code).meta.forfeitUid).toBe('host');
  });
  it('mutual rematch retains the room and duration and resets with a new seed', async () => {
    const s = setup();
    const code = await s.start();
    const previous = s.value(code).meta.seed;
    s.advance(65000);
    await s.host.reconcileRoom(code);
    await s.guest.requestRematch(code);
    expect(s.value(code).meta.status).toBe('finished');
    await s.host.requestRematch(code);
    expect(s.value(code).meta).toMatchObject({
      durationSec: 60,
      status: 'lobby',
      startAt: null,
      endAt: null,
    });
    expect(s.value(code).meta.seed).not.toBe(previous);
    await s.host.reconcileRoom(code);
    expect(s.value(code).meta.status).toBe('lobby');
  });
  it('host duration change invalidates both old ready flags without changing guest data', async () => {
    const s = setup();
    const { code } = await s.host.createRoom({ durationSec: 120, displayName: 'Host' });
    await s.guest.joinRoom(code, 'Guest');
    await s.guest.setReady(code, true);
    const before = { ...s.value(code).players.guest };
    await s.host.setDuration(code, 300);
    expect(s.value(code).players.guest).toEqual(before);
    await s.host.setReady(code, true);
    expect(s.value(code).meta.status).toBe('lobby');
    await s.guest.setReady(code, true);
    await s.host.reconcileRoom(code);
    expect(s.value(code).meta.status).toBe('countdown');
  });
  it('a lobby guest can leave and free the seat; host closure broadcasts a missing room', async () => {
    const s = setup();
    const { code } = await s.host.createRoom({ durationSec: 60, displayName: 'Host' });
    await s.guest.joinRoom(code, 'Guest');
    await s.guest.leaveRoom(code);
    expect(s.value(code).meta.guestUid).toBeUndefined();
    expect(s.value(code).players.guest).toBeUndefined();
    const third = s.make('third');
    await third.joinRoom(code, 'Third');
    let closed = false;
    third.subscribeRoom(code, (value) => {
      closed = value === null;
    });
    await s.host.leaveRoom(code);
    expect(closed).toBe(true);
  });
  it('a deleted storage room cannot be resurrected from another tab cache', async () => {
    const storage = localStorage;
    storage.clear();
    const host = new MockTransport({
      uid: 'host',
      rooms: new Map(),
      storage,
      autoHeartbeat: false,
    });
    const guest = new MockTransport({
      uid: 'guest',
      rooms: new Map(),
      storage,
      autoHeartbeat: false,
    });
    active.push(host, guest);
    const { code } = await host.createRoom({ durationSec: 60, displayName: 'Host' });
    await guest.joinRoom(code, 'Guest');
    await host.leaveRoom(code);
    await guest.reconcileRoom(code);
    await guest.setConnected(true);
    let observed: RoomState | null | undefined;
    const off = guest.subscribeRoom(code, (value) => {
      observed = value;
    });
    expect(observed).toBeNull();
    expect(storage.getItem(`custom-wordle-mock-room-${code}`)).toBeNull();
    off();
    storage.clear();
  });
  it('observes a vanished tab heartbeat without writing its player node', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100000);
    const rooms = new Map<string, RoomState>();
    const host = new MockTransport({ uid: 'host', rooms, storage: null });
    const vanished = new MockTransport({
      uid: 'guest',
      rooms,
      storage: null,
      autoHeartbeat: false,
    });
    active.push(host, vanished);
    const { code } = await host.createRoom({ durationSec: 60, displayName: 'Host' });
    await vanished.joinRoom(code, 'Guest');
    await host.setReady(code, true);
    await vanished.setReady(code, true);
    await host.reconcileRoom(code);
    const guestNode = { ...rooms.get(code)!.players.guest };
    await vi.advanceTimersByTimeAsync(29999);
    expect(rooms.get(code)!.meta.status).not.toBe('finished');
    await vi.advanceTimersByTimeAsync(1);
    expect(rooms.get(code)!.meta).toMatchObject({
      status: 'finished',
      forfeitUid: 'guest',
      forfeitAt: 130000,
    });
    expect(rooms.get(code)!.players.guest).toEqual(guestNode);
  });
  it('rejects regressions, corrupt snapshots and old-seed progress after rematch', async () => {
    const s = setup();
    const code = await s.start();
    s.advance(6000);
    const room = s.value(code);
    const answer = seededSequence(room.meta.seed)[0];
    const progress = submitGuess(createProgress(room.meta.seed), {
      guess: answer,
      answer,
      now: s.now(),
      startAt: room.meta.startAt!,
      endAt: room.meta.endAt!,
    }).progress;
    await s.host.publishProgress(code, progress);
    await s.host.publishProgress(code, createProgress(room.meta.seed));
    expect(s.value(code).progress.host.totalGuesses).toBe(1);
    await expect(s.host.publishProgress(code, { ...progress, totalGreens: 99 })).rejects.toThrow(
      'Invalid duel progress',
    );
    const advanced = advanceWord(progress, s.now() + 1000, room.meta.startAt!);
    await s.host.publishProgress(code, advanced);
    expect(s.value(code).progress.host.currentWordIndex).toBe(1);
  });
});
