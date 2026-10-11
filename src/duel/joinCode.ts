import { normalizeRoomCode, ROOM_ALPHABET } from './logic';

/** Accept a room code or an invitation for this app, without truncating other links. */
export function parseDuelInvitation(value: string, origin: string): string | null {
  const code = normalizeRoomCode(value);
  if (code.length === 5 && [...code].every((letter) => ROOM_ALPHABET.includes(letter))) return code;
  try {
    const link = new URL(value.trim());
    if (
      !['https:', 'http:'].includes(link.protocol) ||
      link.origin !== origin ||
      link.pathname !== '/' ||
      link.search ||
      link.username ||
      link.password
    )
      return null;
    const invited = link.hash.match(/^#\/duel\/([a-z2-9]{5})$/i)?.[1];
    return invited ? parseDuelInvitation(invited, origin) : null;
  } catch {
    return null;
  }
}
