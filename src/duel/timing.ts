import { rowAnimationMs } from '../utils/revealTiming';

const flipMs = 250;
const staggerMs = 80;
const bounceMs = 280;
const bounceStaggerMs = 0;

export const DUEL_TIMING = {
  flipMs,
  staggerMs,
  revealMs: rowAnimationMs(flipMs, staggerMs),
  bounceMs,
  bounceStaggerMs,
  wordPauseMs: rowAnimationMs(bounceMs, bounceStaggerMs),
  timesUpMs: 1500,
  clockTickMs: 200,
  retryMs: 1500,
} as const;
