/**
 * Word Codec: Encodes/decodes a 5-letter word for URL sharing.
 * Uses XOR with a rotating salt + Base64 encoding.
 * The word is never readable in plain text in the URL.
 */

const SALT = [0x4b, 0x77, 0x31, 0x5a, 0x39]; // "Kw1Z9" - salt bytes
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars, no ambiguous 0/O, 1/I

/**
 * Encodes a 5-letter word to a Base64 URL-safe string
 */
export function encodeWord(word: string): string {
  const lower = word.toLowerCase();
  const bytes = new Uint8Array(5);
  for (let i = 0; i < 5; i++) {
    bytes[i] = lower.charCodeAt(i) ^ SALT[i % SALT.length];
  }
  // Convert to Base64
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Decodes a Base64 URL-safe string back to a 5-letter word
 * Returns null if decoding fails or result is invalid
 */
export function decodeWord(encoded: string): string | null {
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    if (binary.length !== 5) return null;
    let word = '';
    for (let i = 0; i < 5; i++) {
      const charCode = (binary.charCodeAt(i) ^ SALT[i % SALT.length]);
      if (charCode < 97 || charCode > 122) return null; // must be a-z
      word += String.fromCharCode(charCode);
    }
    return word;
  } catch {
    return null;
  }
}

/**
 * Encodes a 5-letter word to a short 7-character challenge code.
 * Uses base-32 encoding with the same XOR obfuscation.
 */
export function encodeToCode(word: string): string {
  const lower = word.toLowerCase();
  // XOR each char
  const xored: number[] = [];
  for (let i = 0; i < 5; i++) {
    xored.push(lower.charCodeAt(i) ^ SALT[i % SALT.length]);
  }
  // Pack 5 bytes (5*8=40 bits) into 8 groups of 5 bits (base32)
  // We only need 8 base-32 chars to encode 5 bytes (40 bits / 5 = 8)
  let bits = 0n;
  for (const b of xored) {
    bits = (bits << 8n) | BigInt(b);
  }
  let code = '';
  for (let i = 0; i < 8; i++) {
    const idx = Number(bits & 0x1fn);
    code = CODE_CHARS[idx] + code;
    bits >>= 5n;
  }
  return code;
}

/**
 * Decodes a 7-8 character challenge code back to a word
 * Returns null if decoding fails
 */
export function decodeFromCode(code: string): string | null {
  try {
    const upper = code.toUpperCase().trim();
    if (upper.length !== 8) return null;

    // Decode base-32
    let bits = 0n;
    for (const ch of upper) {
      const idx = CODE_CHARS.indexOf(ch);
      if (idx === -1) return null;
      bits = (bits << 5n) | BigInt(idx);
    }

    // Extract 5 bytes
    const bytes: number[] = [];
    for (let i = 4; i >= 0; i--) {
      bytes[i] = Number(bits & 0xffn);
      bits >>= 8n;
    }

    // XOR to get original chars
    let word = '';
    for (let i = 0; i < 5; i++) {
      const charCode = bytes[i] ^ SALT[i % SALT.length];
      if (charCode < 97 || charCode > 122) return null;
      word += String.fromCharCode(charCode);
    }
    return word;
  } catch {
    return null;
  }
}

/**
 * Build a challenge URL with encoded word
 */
export function buildChallengeUrl(word: string): string {
  const encoded = encodeWord(word);
  const base = window.location.origin + window.location.pathname;
  return `${base}#/play?w=${encoded}`;
}

/**
 * Extract encoded word from current URL hash
 */
export function getWordFromUrl(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/[?&]w=([^&]+)/);
  if (!match) return null;
  return decodeWord(match[1]);
}
