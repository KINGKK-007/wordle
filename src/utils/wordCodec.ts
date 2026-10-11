import { VALID_GUESSES, VALID_GUESS_SET } from '../data/validGuesses';

const URL_SALT = [0x4b, 0x77, 0x31, 0x5a, 0x39];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INDEX_SALT = 0x5a7e;
const WORD_TO_INDEX = new Map(VALID_GUESSES.map((word, index) => [word, index]));

function cipher(word: string): string {
  return btoa(
    [...word]
      .map((letter, index) => String.fromCharCode(letter.charCodeAt(0) ^ URL_SALT[index]))
      .join(''),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/** Detects accidental changes and malformed links; obfuscation is not encryption. */
function checksum(value: string): string {
  let hash = 0x811c9dc5;
  for (const letter of value) hash = Math.imul(hash ^ letter.charCodeAt(0), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function encodeWord(word: string): string {
  const lower = word.toLowerCase();
  if (!VALID_GUESS_SET.has(lower)) throw new RangeError('Not in word list');
  const payload = cipher(lower);
  return `v2.${payload}.${checksum(payload)}`;
}

export function decodeWord(encoded: string): string | null {
  try {
    const parts = encoded.split('.');
    const payload =
      parts.length === 1
        ? encoded
        : parts.length === 3 && parts[0] === 'v2' && parts[2] === checksum(parts[1])
          ? parts[1]
          : null;
    if (!payload || !/^[A-Za-z0-9_-]{7}$/.test(payload)) return null;
    const bytes = atob(payload.replace(/-/g, '+').replace(/_/g, '/') + '=');
    if (bytes.length !== 5) return null;
    const word = [...bytes]
      .map((byte, index) => String.fromCharCode(byte.charCodeAt(0) ^ URL_SALT[index]))
      .join('');
    return /^[a-z]{5}$/.test(word) && VALID_GUESS_SET.has(word) && cipher(word) === payload
      ? word
      : null;
  } catch {
    return null;
  }
}

export function encodeToCode(word: string): string {
  const index = WORD_TO_INDEX.get(word.toLowerCase());
  if (index === undefined) throw new RangeError('Not in word list');
  let value = index ^ INDEX_SALT;
  let code = '';
  for (let i = 0; i < 4; i++) {
    code = CODE_CHARS[value & 31] + code;
    value >>>= 5;
  }
  return code;
}

export function decodeFromCode(code: string): string | null {
  const upper = code.trim().toUpperCase();
  if (upper.length !== 4) return null;
  let value = 0;
  for (const letter of upper) {
    const index = CODE_CHARS.indexOf(letter);
    if (index < 0) return null;
    value = (value << 5) | index;
  }
  return VALID_GUESSES[value ^ INDEX_SALT] ?? null;
}

export function buildChallengeUrl(word: string): string {
  return `${window.location.origin}${window.location.pathname}#/play?w=${encodeWord(word)}`;
}

export function getWordFromUrl(): string | null {
  if (!window.location.hash.startsWith('#/play?')) return null;
  const query = new URLSearchParams(window.location.hash.slice(7));
  const payloads = query.getAll('w');
  return payloads.length === 1 ? decodeWord(payloads[0]) : null;
}
