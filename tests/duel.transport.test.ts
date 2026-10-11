import { afterEach, describe, expect, it, vi } from 'vitest';
import { FirebaseTransport } from '../src/duel/FirebaseTransport';
import { MockTransport } from '../src/duel/MockTransport';
import { createDuelTransport } from '../src/duel/transport';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const clearConfig = () => {
  for (const key of [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_DATABASE_URL',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
    'VITE_DUEL_TRANSPORT',
  ])
    vi.stubEnv(key, '');
};
describe('Duel backend selection and clock', () => {
  it('defaults to credential-free MockTransport in development', async () => {
    clearConfig();
    vi.stubEnv('DEV', true);
    const client = await createDuelTransport();
    expect(client).toBeInstanceOf(MockTransport);
    expect((await client.init()).uid).toMatch(/^mock-/);
    client.dispose();
  });
  it('reports a friendly production configuration error before loading SDKs', async () => {
    clearConfig();
    vi.stubEnv('DEV', false);
    await expect(createDuelTransport()).rejects.toMatchObject({
      code: 'CONFIGURATION',
      message: "Duel mode isn't configured yet.",
    });
  });
  it('supports explicitly selected mock production previews', async () => {
    clearConfig();
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DUEL_TRANSPORT', 'mock');
    const client = await createDuelTransport();
    expect(client).toBeInstanceOf(MockTransport);
    client.dispose();
  });
  it('uses the server offset for every Firebase clock read', () => {
    const client = new FirebaseTransport({ projectId: 'demo-wordle-duel' });
    vi.spyOn(Date, 'now').mockReturnValue(10000);
    Object.assign(client, { offset: -1250 });
    expect(client.getServerTime()).toBe(8750);
    Object.assign(client, { offset: 2500 });
    expect(client.getServerTime()).toBe(12500);
    client.dispose();
  });
});
