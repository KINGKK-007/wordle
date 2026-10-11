import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Board } from '../src/components/Board';
import { DUEL_TIMING } from '../src/duel/timing';
import { SOLO_FLIP_TOTAL_MS, useGame } from '../src/hooks/useGame';
import { useReducedMotion } from '../src/hooks/useReducedMotion';
import { evaluateGuess } from '../src/utils/evaluateGuess';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function motionPreference(matches: boolean) {
  const listeners = new Set<() => void>();
  const preference = {
    matches,
    addEventListener: vi.fn((_name: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_name: string, listener: () => void) => listeners.delete(listener)),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => preference),
  );
  return {
    preference,
    change(next: boolean) {
      preference.matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

function mountGame() {
  const callbacks = { onToast: vi.fn(), onWin: vi.fn(), onLose: vi.fn() };
  return {
    ...renderHook(() =>
      useGame({ answer: 'crane', mode: 'unlimited', hardMode: false, ...callbacks }),
    ),
    callbacks,
  };
}

function submit(handleKey: (key: string) => void, word: string) {
  for (const letter of word.toUpperCase()) handleKey(letter);
  handleKey('Enter');
}

describe('row reveal completion', () => {
  it('keeps input and keyboard colors locked until the fifth tile completes', () => {
    const { result } = mountGame();
    act(() => {
      submit(result.current.handleKey, 'slate');
      result.current.handleKey('Enter');
      result.current.handleKey('B');
    });
    expect(result.current.state.guesses).toEqual(['slate']);
    expect(result.current.state.currentGuess).toBe('');
    expect(result.current.state.activeLetterStates).toEqual({});
    expect(result.current.isInputDisabled).toBe(true);
    act(() => vi.advanceTimersByTime(SOLO_FLIP_TOTAL_MS - 1));
    expect(result.current.state.flippingRow).toBe(0);
    expect(result.current.state.activeLetterStates).toEqual({});
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.state.flippingRow).toBeNull();
    expect(result.current.state.activeLetterStates.a).toBe('correct');
    expect(result.current.isInputDisabled).toBe(false);
    act(() => result.current.handleKey('B'));
    expect(result.current.state.currentGuess).toBe('b');
  });

  it('releases reduced-motion input immediately while preserving duplicate-submit protection', () => {
    motionPreference(true);
    const { result } = mountGame();
    act(() => {
      submit(result.current.handleKey, 'slate');
      result.current.handleKey('Enter');
    });
    expect(result.current.state.guesses).toHaveLength(1);
    expect(result.current.isInputDisabled).toBe(true);
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.state.flippingRow).toBeNull();
    expect(result.current.state.activeLetterStates.e).toBe('correct');
    expect(result.current.isInputDisabled).toBe(false);
  });

  it('skips the win bounce and its callback delay when reduced motion is requested', () => {
    motionPreference(true);
    const { result, callbacks } = mountGame();
    act(() => submit(result.current.handleKey, 'crane'));
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.state.status).toBe('won');
    expect(result.current.state.bouncingRow).toBeNull();
    expect(callbacks.onWin).toHaveBeenCalledExactlyOnceWith(1, 'Genius');
  });

  it('lets all five Duel win tiles finish before the next board replaces them', () => {
    const { container } = render(
      <Board
        guesses={['crane']}
        currentGuess=""
        evaluatedRows={[evaluateGuess('crane', 'crane')]}
        shakingRow={null}
        flippingRow={null}
        bouncingRow={0}
        bounceDurationMs={DUEL_TIMING.bounceMs}
        bounceStaggerMs={DUEL_TIMING.bounceStaggerMs}
      />,
    );
    const tiles = Array.from(container.querySelectorAll<HTMLElement>('.tile--bounce'));
    expect(tiles).toHaveLength(5);
    for (const tile of tiles) {
      const completesAt =
        parseFloat(tile.style.animationDelay) + parseFloat(tile.style.animationDuration);
      expect(completesAt).toBeLessThanOrEqual(DUEL_TIMING.wordPauseMs);
    }
  });
});

describe('motion preference subscription', () => {
  it('responds to preference changes and removes its listener on unmount', () => {
    const motion = motionPreference(false);
    const { result, unmount } = renderHook(useReducedMotion);
    expect(result.current).toBe(false);
    act(() => motion.change(true));
    expect(result.current).toBe(true);
    unmount();
    expect(motion.preference.removeEventListener).toHaveBeenCalledOnce();
  });
});
