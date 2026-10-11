import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  apps: [] as { name: string }[],
  auth: { currentUser: null as { uid: string } | null, authStateReady: vi.fn(async () => {}) },
  signIn: vi.fn<() => Promise<{ user: { uid: string } }>>(),
  persistence: vi.fn(async () => {}),
  readySignIns: [] as ((credential: { user: { uid: string } }) => void)[],
  unsubscribe: [] as ReturnType<typeof vi.fn>[],
}));

vi.mock('firebase/app', () => ({
  getApps: () => state.apps,
  initializeApp: (_config: unknown, name: string) => {
    const app = { name };
    state.apps.push(app);
    return app;
  },
}));
vi.mock('firebase/auth', () => ({
  getAuth: () => state.auth,
  browserSessionPersistence: { type: 'SESSION' },
  setPersistence: state.persistence,
  signInAnonymously: state.signIn,
}));
vi.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_database: unknown, path: string) => ({ path }),
  onValue: (reference: { path: string }, callback: (snapshot: { val: () => unknown }) => void) => {
    callback({ val: () => (reference.path === '.info/serverTimeOffset' ? 1250 : true) });
    const unsubscribe = vi.fn();
    state.unsubscribe.push(unsubscribe);
    return unsubscribe;
  },
}));

import { FirebaseTransport } from '../src/duel/FirebaseTransport';

beforeEach(async () => {
  // Resolve the mocked lazy modules before deliberately overlapping two initializations.
  await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/database')]);
  state.apps = [];
  state.auth = { currentUser: null, authStateReady: vi.fn(async () => {}) };
  state.persistence.mockReset().mockResolvedValue(undefined);
  state.signIn.mockReset().mockImplementation(
    () =>
      new Promise((resolve) => {
        state.readySignIns.push((credential) => {
          state.auth.currentUser = credential.user;
          resolve(credential);
        });
      }),
  );
  state.readySignIns = [];
  state.unsubscribe = [];
});

describe('Firebase anonymous identity initialization', () => {
  it('shares one sign-in across a discarded StrictMode instance and its replacement', async () => {
    const discarded = new FirebaseTransport({ projectId: 'test' });
    const firstInit = discarded.init();
    discarded.dispose();
    const active = new FirebaseTransport({ projectId: 'test' });
    const secondInit = active.init();
    await vi.waitFor(() => expect(state.signIn).toHaveBeenCalled());
    expect(state.persistence).toHaveBeenCalledTimes(1);
    expect(state.auth.authStateReady).toHaveBeenCalledTimes(1);
    expect(state.signIn).toHaveBeenCalledTimes(1);
    state.readySignIns[0]({ user: { uid: 'same-tab-user' } });
    expect(await firstInit).toEqual({ uid: 'same-tab-user' });
    expect(await secondInit).toEqual({ uid: 'same-tab-user' });
    expect(state.unsubscribe).toHaveLength(4);
    expect(
      state.unsubscribe.filter((unsubscribe) => unsubscribe.mock.calls.length === 1),
    ).toHaveLength(2);
    active.dispose();
    expect(state.unsubscribe.every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(
      true,
    );
  });

  it('reuses the restored anonymous identity without signing in again', async () => {
    state.auth.currentUser = { uid: 'restored-user' };
    const first = new FirebaseTransport({ projectId: 'test' });
    const second = new FirebaseTransport({ projectId: 'test' });
    expect(await Promise.all([first.init(), second.init()])).toEqual([
      { uid: 'restored-user' },
      { uid: 'restored-user' },
    ]);
    expect(state.persistence).toHaveBeenCalledTimes(1);
    expect(state.auth.authStateReady).toHaveBeenCalledTimes(1);
    expect(state.signIn).not.toHaveBeenCalled();
    first.dispose();
    second.dispose();
  });

  it('allows a fresh transport to retry after failed identity initialization', async () => {
    state.signIn
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce({ user: { uid: 'recovered-user' } });
    const failed = new FirebaseTransport({ projectId: 'test' });
    await expect(failed.init()).rejects.toThrow('Network unavailable');
    failed.dispose();
    const recovered = new FirebaseTransport({ projectId: 'test' });
    expect(await recovered.init()).toEqual({ uid: 'recovered-user' });
    expect(state.signIn).toHaveBeenCalledTimes(2);
    recovered.dispose();
  });
});
