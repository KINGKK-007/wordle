/** A row finishes only after the final tile's animation has completed. */
export function rowAnimationMs(durationMs: number, staggerMs: number): number {
  return durationMs + 4 * staggerMs;
}

export const SOLO_ANIMATION = {
  flipMs: 500,
  staggerMs: 80,
  bounceMs: 1000,
  bounceStaggerMs: 100,
} as const;
