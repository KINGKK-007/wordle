import { DuelError } from './types';
import type { DuelTransport } from './types';

export async function createDuelTransport(): Promise<DuelTransport> {
  const env = import.meta.env;
  const configured = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_AUTH_DOMAIN &&
    env.VITE_FIREBASE_DATABASE_URL && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);
  const mode = env.VITE_DUEL_TRANSPORT || (configured ? 'firebase' : env.DEV ? 'mock' : 'firebase');
  if (mode === 'mock') {
    const { MockTransport } = await import('./MockTransport');
    return new MockTransport();
  }
  if (mode !== 'firebase' || !configured) throw new DuelError('CONFIGURATION');
  const { FirebaseTransport } = await import('./FirebaseTransport');
  return new FirebaseTransport({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
}
