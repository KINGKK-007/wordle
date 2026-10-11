import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame, SOLO_FLIP_TOTAL_MS } from '../src/hooks/useGame';
import { useKeyboardInput } from '../src/hooks/useKeyboardInput';
import { useLocalStorage } from '../src/hooks/useLocalStorage';
import { useToast } from '../src/hooks/useToast';
import { Key } from '../src/components/Key';
import { Modal } from '../src/components/Modal';
import { SetWordScreen } from '../src/components/SetWordScreen';
import { ToastContainer } from '../src/components/Toast';
import { GameScreen } from '../src/components/GameScreen';
import { loadStats, recordWin, recordLoss, saveStats } from '../src/utils/stats';
import { createGameId, loadSavedGame, SOLO_GAME_STORAGE_KEY } from '../src/utils/gamePersistence';
import { getHardModeError } from '../src/utils/hardMode';
import { evaluateGuess } from '../src/utils/evaluateGuess';
import { copyToClipboard } from '../src/utils/shareResult';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const callbacks = () => ({ onToast: vi.fn(), onWin: vi.fn(), onLose: vi.fn() });

function enter(handleKey: (key: string) => void, word: string) {
  for (const key of word.toUpperCase()) handleKey(key);
  handleKey('Enter');
}

describe('solo game regression cases', () => {
  it('locks a valid Enter synchronously, delays keyboard colors, and records exactly once in StrictMode', () => {
    const options = callbacks();
    const { result, unmount } = renderHook(
      () =>
        useGame({
          answer: 'crane',
          mode: 'unlimited',
          hardMode: false,
          persistKey: SOLO_GAME_STORAGE_KEY,
          ...options,
        }),
      { wrapper: StrictMode },
    );
    act(() => {
      enter(result.current.handleKey, 'crane');
      result.current.handleKey('Enter');
      result.current.handleKey('A');
    });
    expect(result.current.state.guesses).toEqual(['crane']);
    expect(result.current.state.status).toBe('evaluating');
    expect(result.current.state.activeLetterStates).toEqual({});
    expect(loadStats('unlimited').played).toBe(1);
    act(() => vi.advanceTimersByTime(SOLO_FLIP_TOTAL_MS));
    expect(result.current.state.status).toBe('won');
    expect(result.current.state.activeLetterStates.c).toBe('correct');
    act(() => vi.advanceTimersByTime(1400));
    expect(options.onWin).toHaveBeenCalledOnce();
    unmount();
    const restored = renderHook(
      () =>
        useGame({
          answer: 'crane',
          mode: 'unlimited',
          hardMode: false,
          persistKey: SOLO_GAME_STORAGE_KEY,
          ...callbacks(),
        }),
      { wrapper: StrictMode },
    );
    expect(restored.result.current.state.status).toBe('won');
    expect(loadStats('unlimited').played).toBe(1);
  });

  it('counts challenge games separately, without counting invalid guesses', () => {
    const { result } = renderHook(() =>
      useGame({ answer: 'crane', mode: '2player', hardMode: false, ...callbacks() }),
    );
    act(() => {
      enter(result.current.handleKey, 'zzzzz');
    });
    expect(result.current.state.guesses).toHaveLength(0);
    act(() => {
      for (let i = 0; i < 5; i++) result.current.handleKey('Backspace');
      enter(result.current.handleKey, 'crane');
    });
    expect(loadStats('2player').played).toBe(1);
    expect(loadStats('unlimited').played).toBe(0);
  });

  it('restores submitted rows, typed input and keyboard state on refresh', () => {
    const options = callbacks();
    const first = renderHook(() =>
      useGame({
        answer: 'crane',
        mode: 'unlimited',
        hardMode: false,
        persistKey: SOLO_GAME_STORAGE_KEY,
        ...options,
      }),
    );
    act(() => enter(first.result.current.handleKey, 'slate'));
    act(() => vi.advanceTimersByTime(SOLO_FLIP_TOTAL_MS));
    act(() => {
      first.result.current.handleKey('C');
      first.result.current.handleKey('R');
    });
    first.unmount();
    const second = renderHook(() =>
      useGame({
        answer: 'crane',
        mode: 'unlimited',
        hardMode: false,
        persistKey: SOLO_GAME_STORAGE_KEY,
        ...options,
      }),
    );
    expect(second.result.current.state.guesses).toEqual(['slate']);
    expect(second.result.current.state.currentGuess).toBe('cr');
    expect(second.result.current.state.activeLetterStates.e).toBe('correct');
  });

  it('recovers a terminal submission during reveal and cleans pending callbacks on unmount', () => {
    const options = callbacks();
    const first = renderHook(() =>
      useGame({
        answer: 'crane',
        mode: 'unlimited',
        hardMode: false,
        persistKey: SOLO_GAME_STORAGE_KEY,
        ...options,
      }),
    );
    act(() => enter(first.result.current.handleKey, 'crane'));
    first.unmount();
    act(() => vi.runAllTimers());
    expect(options.onWin).not.toHaveBeenCalled();
    const restored = renderHook(() =>
      useGame({
        answer: 'crane',
        mode: 'unlimited',
        hardMode: false,
        persistKey: SOLO_GAME_STORAGE_KEY,
        ...callbacks(),
      }),
    );
    expect(restored.result.current.state.status).toBe('won');
    expect(loadStats('unlimited').wins).toBe(1);
    act(() => restored.result.current.handleKey('Enter'));
    expect(restored.result.current.state.guesses).toHaveLength(1);
  });

  it('loses after six attempts, never appends a seventh, and recovers loss during flip', () => {
    const first = renderHook(() =>
      useGame({
        answer: 'crane',
        mode: 'unlimited',
        hardMode: false,
        persistKey: SOLO_GAME_STORAGE_KEY,
        ...callbacks(),
      }),
    );
    for (let index = 0; index < 6; index++) {
      act(() => enter(first.result.current.handleKey, 'slate'));
      if (index < 5) act(() => vi.advanceTimersByTime(SOLO_FLIP_TOTAL_MS));
    }
    first.unmount();
    const restored = renderHook(() =>
      useGame({
        answer: 'crane',
        mode: 'unlimited',
        hardMode: false,
        persistKey: SOLO_GAME_STORAGE_KEY,
        ...callbacks(),
      }),
    );
    expect(restored.result.current.state.status).toBe('lost');
    act(() => enter(restored.result.current.handleKey, 'crane'));
    expect(restored.result.current.state.guesses).toHaveLength(6);
    expect(loadStats('unlimited').played).toBe(1);
  });

  it('reset cancels an old reveal and removes its saved rows', () => {
    const options = callbacks();
    const { result } = renderHook(() =>
      useGame({
        answer: 'crane',
        mode: 'unlimited',
        hardMode: false,
        persistKey: SOLO_GAME_STORAGE_KEY,
        ...options,
      }),
    );
    act(() => enter(result.current.handleKey, 'slate'));
    act(() => result.current.resetGame('abbey'));
    act(() => vi.runAllTimers());
    expect(result.current.state.answer).toBe('abbey');
    expect(result.current.state.guesses).toEqual([]);
    expect(loadSavedGame()?.answer).toBe('abbey');
    expect(loadSavedGame()?.guesses).toEqual([]);
    expect(options.onWin).not.toHaveBeenCalled();
  });

  it('rejects malformed snapshots and corrupt statistics', () => {
    localStorage.setItem(
      SOLO_GAME_STORAGE_KEY,
      JSON.stringify({ answer: 'crane', guesses: [8], evaluatedRows: [[]] }),
    );
    expect(loadSavedGame()).toBeNull();
    localStorage.setItem(
      'custom-wordle-stats-unlimited',
      JSON.stringify({ played: '4', wins: 8, distribution: {} }),
    );
    expect(loadStats('unlimited').distribution).toEqual([0, 0, 0, 0, 0, 0]);
    localStorage.setItem('custom-wordle-stats-unlimited', 'null');
    expect(loadStats('unlimited').played).toBe(0);
  });

  it('stats deduplicate a game ID and preserve distribution and streaks across modes', () => {
    const id = createGameId();
    recordWin('unlimited', 3, id);
    recordWin('unlimited', 3, id);
    recordLoss('unlimited', id);
    recordLoss('2player', createGameId());
    expect(loadStats('unlimited')).toEqual({
      played: 1,
      wins: 1,
      currentStreak: 1,
      maxStreak: 1,
      distribution: [0, 0, 1, 0, 0, 0],
    });
    expect(loadStats('2player').played).toBe(1);
  });

  it('keeps the latest counts when quota failures leave an older readable snapshot', () => {
    recordWin('unlimited', 1, 'first');
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    recordWin('unlimited', 2, 'second');
    recordWin('unlimited', 2, 'second');
    recordLoss('unlimited', 'third');
    expect(loadStats('unlimited')).toMatchObject({
      played: 3,
      wins: 2,
      distribution: [1, 1, 0, 0, 0, 0],
    });
    write.mockRestore();
    saveStats('unlimited', loadStats('unlimited'));
    expect(JSON.parse(localStorage.getItem('custom-wordle-stats-unlimited') ?? '{}').played).toBe(
      3,
    );
  });

  it('reschedules the result modal in StrictMode after restoring a finished board', () => {
    localStorage.setItem(
      SOLO_GAME_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        gameId: createGameId(),
        mode: 'unlimited',
        answer: 'crane',
        guesses: ['crane'],
        currentGuess: '',
      }),
    );
    render(
      <StrictMode>
        <GameScreen
          answer="crane"
          mode="unlimited"
          settings={{ hardMode: false, highContrast: false }}
          onSettingsChange={vi.fn()}
          onToast={vi.fn()}
          onBackToMenu={vi.fn()}
        />
      </StrictMode>,
    );
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('dialog', { name: 'You won!' })).toBeVisible();
    expect(loadStats('unlimited').played).toBe(1);
  });
});

describe('hard-mode hint regression cases', () => {
  it('uses the proper ordinal and requires revealed duplicate counts', () => {
    expect(getHardModeError('slice', [evaluateGuess('crane', 'crane')])).toBe(
      '1st letter must be C',
    );
    expect(getHardModeError('stale', [evaluateGuess('slate', 'crane')])).toBeNull();
    expect(getHardModeError('crane', [evaluateGuess('eerie', 'speed')])).toBe(
      'Guess must contain 2 Es',
    );
    expect(getHardModeError('cloud', [evaluateGuess('slate', 'crane')])).toBe(
      '3rd letter must be A',
    );
    expect(getHardModeError('clang', [evaluateGuess('react', 'speed')])).toBe(
      'Guess must contain E',
    );
  });
});

describe('input, modals and transient UI regression cases', () => {
  it('a pointer click submits one letter and disabled/color keys are accessible', () => {
    const onPress = vi.fn();
    const { rerender } = render(<Key label="A" state="correct" onPress={onPress} />);
    const key = screen.getByRole('button', { name: 'A, correct' });
    fireEvent.pointerDown(key);
    fireEvent.click(key);
    expect(onPress).toHaveBeenCalledExactlyOnceWith('A');
    rerender(<Key label="A" state="correct" onPress={onPress} disabled />);
    fireEvent.click(key);
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('the physical keyboard ignores modifiers, repeat, inputs and modals and removes its listener', () => {
    const onKey = vi.fn();
    const { unmount } = renderHook(() => useKeyboardInput(onKey));
    fireEvent.keyDown(window, { key: 'a' });
    expect(onKey).toHaveBeenCalledExactlyOnceWith('A');
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'c', metaKey: true });
    fireEvent.keyDown(window, { key: 'd', altKey: true });
    fireEvent.keyDown(window, { key: 'Enter', repeat: true });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: 'e' });
    input.remove();
    const dialog = render(
      <Modal isOpen onClose={vi.fn()} title="Example">
        Hello
      </Modal>,
    );
    fireEvent.keyDown(window, { key: 'f' });
    dialog.unmount();
    unmount();
    fireEvent.keyDown(window, { key: 'g' });
    expect(onKey).toHaveBeenCalledOnce();
  });

  it('traps focus, handles backdrop/Escape, and restores the opener', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    const view = render(
      <Modal isOpen onClose={onClose} title="Example">
        <button>Last action</button>
      </Modal>,
    );
    const close = screen.getByRole('button', { name: 'Close' });
    const last = screen.getByRole('button', { name: 'Last action' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('keeps physical letter input working after a dialog restores focus to its opener', () => {
    const onKey = vi.fn();
    const keyboard = renderHook(() => useKeyboardInput(onKey));
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const dialog = render(
      <Modal isOpen onClose={vi.fn()} title="Example">
        Hello
      </Modal>,
    );
    dialog.unmount();
    expect(opener).toHaveFocus();
    fireEvent.keyDown(opener, { key: 'c' });
    fireEvent.keyDown(opener, { key: 'Enter' });
    expect(onKey).toHaveBeenCalledExactlyOnceWith('C');
    keyboard.unmount();
    opener.remove();
  });

  it('validates the setter word and does not duplicate submission', () => {
    const onWordSet = vi.fn();
    const onToast = vi.fn();
    render(<SetWordScreen onWordSet={onWordSet} onToast={onToast} />);
    for (const key of 'ZZZZZ') fireEvent.keyDown(window, { key });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onToast).toHaveBeenCalledWith('Not in word list');
    expect(document.querySelector('.row--shake')).not.toBeNull();
    for (let index = 0; index < 5; index++) fireEvent.keyDown(window, { key: 'Backspace' });
    for (const key of 'CRANE') fireEvent.keyDown(window, { key });
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onWordSet).toHaveBeenCalledExactlyOnceWith('crane');
  });

  it('toasts expire independently without restarting old timers and clear timers on unmount', () => {
    const { result, unmount } = renderHook(useToast);
    const view = render(<ToastContainer toasts={result.current.toasts} />);
    act(() => {
      result.current.showToast('First', 1000);
      result.current.showToast('Second', 2000);
    });
    view.rerender(<ToastContainer toasts={result.current.toasts} />);
    expect(screen.getByText('First')).toBeVisible();
    expect(screen.getByText('Second')).toBeVisible();
    act(() => vi.advanceTimersByTime(1200));
    view.rerender(<ToastContainer toasts={result.current.toasts} />);
    expect(screen.queryByText('First')).toBeNull();
    expect(screen.getByText('Second')).toBeVisible();
    unmount();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settings reject old shapes and rapid updates use the latest value', () => {
    localStorage.setItem('settings', JSON.stringify({ hardMode: 'yes', highContrast: null }));
    const { result } = renderHook(() =>
      useLocalStorage('settings', { hardMode: false, highContrast: false }),
    );
    expect(result.current[0].hardMode).toBe(false);
    act(() => {
      result.current[1]((old) => ({ ...old, hardMode: !old.hardMode }));
      result.current[1]((old) => ({ ...old, highContrast: !old.highContrast }));
    });
    expect(result.current[0]).toEqual({ hardMode: true, highContrast: true });
  });

  it('clipboard fallback reports actual failure and removes its temporary textarea', async () => {
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
    });
    expect(await copyToClipboard('hello')).toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });
});
