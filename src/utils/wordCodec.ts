/**
 * Word Codec: Encodes/decodes a 5-letter word for URL and code sharing.
 *
 * URL encoding  – XOR + Base64 (same as before, unchanged)
 * Short code    – Word INDEX in the sorted valid-guess list, XOR'd with a
 *                 salt, encoded as 4 base-32 characters.
 *
 *   Why index-based for the code?
 *   There are ~14 854 valid words (≈14 bits).
 *   4 × 5-bit base-32 chars = 20 bits → more than enough, gives 4 chars exactly.
 */

import { VALID_GUESSES } from '../data/validGuesses';

// ── URL encoding: XOR + Base64 ──────────────────────────────────────────────

const URL_SALT = [0x4b, 0x77, 0x31, 0x5a, 0x39]; // "Kw1Z9"

/** Encodes a 5-letter word to a URL-safe Base64 string (never plaintext). */
export function encodeWord(word: string): string {
  const lower = word.toLowerCase();
  const bytes = new Uint8Array(5);
  for (let i = 0; i < 5; i++) {
    bytes[i] = lower.charCodeAt(i) ^ URL_SALT[i % URL_SALT.length];
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Decodes a URL-safe Base64 string back to a 5-letter word. Returns null on failure. */
export function decodeWord(encoded: string): string | null {
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    if (binary.length !== 5) return null;
    let word = '';
    for (let i = 0; i < 5; i++) {
      const charCode = binary.charCodeAt(i) ^ URL_SALT[i % URL_SALT.length];
      if (charCode < 97 || charCode > 122) return null; // must be a-z
      word += String.fromCharCode(charCode);
    }
    return word;
  } catch {
    return null;
  }
}

// ── 4-character challenge code: word index + XOR + base-32 ─────────────────

/** 32 unambiguous characters (no 0/O, no 1/I) */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** XOR salt for the word index (prevents trivial reverse-engineering). */
const INDEX_SALT = 0x5A7E;

/**
 * Lookup map: word → 0-based index in VALID_GUESSES.
 * Built once at module load time; O(1) encode lookups.
 */
const WORD_TO_INDEX = new Map<string, number>(
  VALID_GUESSES.map((w, i) => [w, i])
);

/**
 * Encodes a 5-letter word to a 4-character challenge code.
 *
 * Algorithm:
 *   1. Look up the word's index in the sorted VALID_GUESSES list.
 *   2. XOR with INDEX_SALT to obfuscate.
 *   3. Encode the resulting 20-bit number as 4 base-32 chars (5 bits each).
 */
export function encodeToCode(word: string): string {
  const idx = WORD_TO_INDEX.get(word.toLowerCase());
  if (idx === undefined) {
    // Word not in list – fall back to a recognisable placeholder
    return '????';
  }
  const obfuscated = (idx ^ INDEX_SALT) & 0xfffff; // keep within 20 bits
  let code = '';
  let n = obfuscated;
  for (let i = 0; i < 4; i++) {
    code = CODE_CHARS[n & 0x1f] + code; // 5 LSBs → one base-32 char
    n >>= 5;
  }
  return code; // always exactly 4 chars
}

/**
 * Decodes a 4-character challenge code back to a word.
 * Returns null if the code is invalid or out of range.
 */
export function decodeFromCode(code: string): string | null {
  try {
    const upper = code.toUpperCase().trim();
    if (upper.length !== 4) return null;

    let n = 0;
    for (const ch of upper) {
      const charIdx = CODE_CHARS.indexOf(ch);
      if (charIdx === -1) return null; // invalid character
      n = (n << 5) | charIdx;
    }

    const wordIdx = (n ^ INDEX_SALT) & 0xfffff;
    if (wordIdx < 0 || wordIdx >= VALID_GUESSES.length) return null;
    return VALID_GUESSES[wordIdx];
  } catch {
    return null;
  }
}

// ── URL helpers ──────────────────────────────────────────────────────────────

/** Builds a shareable challenge URL with the word encoded in the hash. */
export function buildChallengeUrl(word: string): string {
  const encoded = encodeWord(word);
  const base = window.location.origin + window.location.pathname;
  return `${base}#/play?w=${encoded}`;
}

/** Extracts and decodes a word from the current page URL hash. Returns null if absent. */
export function getWordFromUrl(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/[?&]w=([^&]+)/);
  if (!match) return null;
  return decodeWord(match[1]);
}
