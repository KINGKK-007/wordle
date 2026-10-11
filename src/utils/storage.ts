/** Storage can be disabled, full, or contain old data. Treat its contents as untrusted. */
export function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function writeStorage(key: string, value: string): boolean {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

export function removeStorage(key: string): void {
  try { localStorage.removeItem(key); } catch { /* Gameplay still works without storage. */ }
}

export function readJson<T>(key: string, validate: (value: unknown) => value is T): T | null {
  try {
    const raw = readStorage(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return validate(value) ? value : null;
  } catch { return null; }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
