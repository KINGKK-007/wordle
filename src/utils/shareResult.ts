import type { EvaluatedLetter } from './evaluateGuess';

const STATE_EMOJIS: Record<string, string> = {
  correct: '🟩',
  present: '🟨',
  absent: '⬛',
};

const STATE_EMOJIS_HC: Record<string, string> = {
  correct: '🟧',  // orange for high contrast
  present: '🟦',  // blue for high contrast
  absent: '⬛',
};

/**
 * Generates a shareable emoji grid in standard Wordle format
 */
export function generateShareText(
  evaluatedRows: EvaluatedLetter[][],
  attemptCount: number | 'X',
  mode: 'unlimited' | '2player',
  highContrast = false
): string {
  const emojis = highContrast ? STATE_EMOJIS_HC : STATE_EMOJIS;
  const title = mode === 'unlimited' ? 'Custom Wordle' : 'Custom Wordle – 2P';
  const score = `${attemptCount}/6`;

  const grid = evaluatedRows
    .map(row => row.map(cell => emojis[cell.state] || '⬛').join(''))
    .join('\n');

  return `${title} ${score}\n\n${grid}`;
}

/**
 * Copy text to clipboard with fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* Fall back for browsers without clipboard permissions. */ }
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement('textarea');
  try {
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.setAttribute('aria-hidden', 'true');
    document.body.appendChild(textarea);
    textarea.select();
    return typeof document.execCommand === 'function' && document.execCommand('copy');
  } catch { return false; }
  finally { textarea.remove(); if (previousFocus?.isConnected) previousFocus.focus(); }
}

/**
 * Share via Web Share API if available, otherwise copy to clipboard
 */
export async function shareOrCopy(text: string, title: string): Promise<'shared' | 'copied' | 'failed'> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch {
      // User cancelled or share failed, try clipboard
    }
  }
  const copied = await copyToClipboard(text);
  return copied ? 'copied' : 'failed';
}
