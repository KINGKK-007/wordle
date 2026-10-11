import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { encodeWord } from '../src/utils/wordCodec';
import { SOLO_FLIP_TOTAL_MS } from '../src/hooks/useGame';
import { createGameId, loadSavedGame, SOLO_GAME_STORAGE_KEY } from '../src/utils/gamePersistence';
import { loadStats } from '../src/utils/stats';
import { ANSWER_LIST } from '../src/data/answers';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  localStorage.setItem('custom-wordle-help-shown', '1');
  window.history.replaceState({}, '', '/');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.history.replaceState({}, '', '/');
});

function setHash(hash: string, dispatch = false): void {
  window.history.replaceState({}, '', `/${hash}`);
  if (dispatch) fireEvent(window, new HashChangeEvent('hashchange'));
}

function openApp(hash: string) {
  setHash(hash);
  return render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

function typeGuess(word: string, submit = true): void {
  for (const key of word) fireEvent.keyDown(window, { key });
  if (submit) fireEvent.keyDown(window, { key: 'Enter' });
}

function firstRow(): HTMLElement {
  return within(screen.getByRole('grid', { name: 'Wordle game board' })).getAllByRole('row')[0];
}

function legacyPayload(word: string): string {
  const salt = [0x4b, 0x77, 0x31, 0x5a, 0x39];
  return btoa(
    [...word]
      .map((letter, index) => String.fromCharCode(letter.charCodeAt(0) ^ salt[index]))
      .join(''),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

describe('challenge routes and fresh boards', () => {
  const valid = encodeWord('crane');
  it.each([
    '#/play',
    '#/play?w=',
    '#/play?w=garbage!',
    `#/play?w=${valid.slice(0, -1)}`,
    `#/play?w=${valid.slice(0, -1)}A`,
    `#/play?w=${legacyPayload('zzzzz')}`,
    `#/play?w=${legacyPayload('12345')}`,
    `#/play?w=${valid}&w=${valid}`,
    `#/play/extra?w=${valid}`,
  ])('shows a friendly error for %s', (hash) => {
    openApp(hash);
    expect(screen.getByRole('heading', { name: 'Invalid Challenge' })).toBeVisible();
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to Menu' })).toBeEnabled();
  });

  it('loads a valid link in StrictMode without consuming an existing solo board', () => {
    localStorage.setItem(
      SOLO_GAME_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        gameId: createGameId(),
        mode: 'unlimited',
        answer: 'abbey',
        guesses: ['slate'],
        currentGuess: 'ab',
      }),
    );
    const view = openApp(`#/play?w=${valid}`);
    expect(firstRow().textContent).toBe('');
    expect(screen.getByLabelText('Secret Word · A puzzle from your friend')).toBeVisible();
    typeGuess('slate');
    act(() => vi.advanceTimersByTime(SOLO_FLIP_TOTAL_MS));
    expect(firstRow()).toHaveTextContent('SLATE');
    expect(loadSavedGame()).toMatchObject({
      answer: 'abbey',
      guesses: ['slate'],
      currentGuess: 'ab',
    });
    expect(loadStats('2player').played).toBe(0);
    view.unmount();
    openApp(`#/play?w=${valid}`);
    expect(firstRow().textContent).toBe('');
    expect(
      within(screen.getByRole('grid'))
        .getAllByRole('gridcell')
        .every((cell) => cell.textContent === ''),
    ).toBe(true);
  });

  it('freshens a challenge on a hashchange and completes role swapping', () => {
    openApp(`#/play?w=${valid}`);
    typeGuess('slate');
    act(() => vi.advanceTimersByTime(SOLO_FLIP_TOTAL_MS));
    act(() => setHash('#/code', true));
    expect(screen.getByRole('heading', { name: 'Enter Challenge Code' })).toBeVisible();
    act(() => setHash(`#/play?w=${valid}`, true));
    expect(firstRow().textContent).toBe('');
    typeGuess('crane');
    act(() => vi.advanceTimersByTime(SOLO_FLIP_TOTAL_MS));
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('dialog', { name: 'You won!' })).toBeVisible();
    expect(loadStats('2player').played).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Create a word' }));
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByRole('heading', { name: 'Create a secret word' })).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('replaces a playable link with a friendly error when the hash is corrupted', () => {
    openApp(`#/play?w=${valid}`);
    typeGuess('cr', false);
    act(() => setHash('#/play?w=invalid', true));
    expect(screen.getByRole('heading', { name: 'Invalid Challenge' })).toBeVisible();
    expect(screen.queryByRole('grid')).toBeNull();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(loadStats('2player').played).toBe(0);
  });
});

describe('restored Unlimited games and first-use help', () => {
  it('never picks the previous word again after a StrictMode initial render', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    openApp('#/unlimited');
    const firstAnswer = loadSavedGame()?.answer;
    expect(firstAnswer).toBe(ANSWER_LIST[0]);
    typeGuess(firstAnswer!);
    act(() => vi.advanceTimersByTime(SOLO_FLIP_TOTAL_MS));
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.click(screen.getByRole('button', { name: 'Play Again' }));
    expect(loadSavedGame()?.answer).not.toBe(firstAnswer);
    expect(loadSavedGame()?.guesses).toEqual([]);
  });

  it.each([
    { guesses: ['crane'], result: 'You won!', wins: 1 },
    {
      guesses: ['slate', 'slate', 'slate', 'slate', 'slate', 'slate'],
      result: 'Game over',
      wins: 0,
    },
  ])(
    'restores a terminal board and records it once after repeated StrictMode refreshes: $result',
    ({ guesses, result, wins }) => {
      const saved = {
        version: 1,
        gameId: createGameId(),
        mode: 'unlimited',
        answer: 'crane',
        guesses,
        currentGuess: '',
      };
      localStorage.setItem(SOLO_GAME_STORAGE_KEY, JSON.stringify(saved));
      const view = openApp('#/unlimited');
      act(() => vi.advanceTimersByTime(2000));
      expect(screen.getByRole('dialog', { name: result })).toBeVisible();
      expect(firstRow()).toHaveTextContent(guesses[0].toUpperCase());
      expect(loadStats('unlimited')).toMatchObject({ played: 1, wins });
      view.unmount();
      openApp('#/unlimited');
      act(() => vi.advanceTimersByTime(2000));
      expect(screen.getByRole('dialog', { name: result })).toBeVisible();
      expect(loadStats('unlimited')).toMatchObject({ played: 1, wins });
      fireEvent.click(screen.getByRole('button', { name: 'Play Again' }));
      expect(loadSavedGame()?.guesses).toEqual([]);
      expect(firstRow().textContent).toBe('');
      expect(screen.queryByRole('dialog')).toBeNull();
    },
  );

  it('restores submitted rows and pending letters after a full App refresh', () => {
    localStorage.setItem(
      SOLO_GAME_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        gameId: createGameId(),
        mode: 'unlimited',
        answer: 'crane',
        guesses: ['slate'],
        currentGuess: 'cr',
      }),
    );
    openApp('#/unlimited');
    const rows = within(screen.getByRole('grid')).getAllByRole('row');
    expect(rows[0]).toHaveTextContent('SLATE');
    expect(rows[1]).toHaveTextContent('CR');
    expect(screen.getByRole('button', { name: 'E, correct' })).toBeVisible();
  });

  it('keeps the first home visit open and shows help only when requested', () => {
    localStorage.setItem('custom-wordle-help-shown', '{broken-json');
    openApp('');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'How to play' }));
    expect(screen.getByRole('dialog', { name: 'How To Play' })).toBeVisible();
    expect(localStorage.getItem('custom-wordle-help-shown')).toBe('1');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('multiplayer-first mode navigation', () => {
  it('offers live, personal and solo modes in that order without home code entry', () => {
    openApp('');
    expect(
      screen
        .getAllByRole('button')
        .filter((button) => button.classList.contains('mode-card'))
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      'Live Duel: race a friend in real time',
      'Secret Word: create or solve a personal word challenge',
      'Unlimited: play solo with random words',
    ]);
    expect(screen.queryByRole('button', { name: 'Enter a challenge code' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('keeps create and code entry within the Secret Word hub', () => {
    openApp('#/challenge');
    expect(screen.getByRole('button', { name: /Create a word/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Enter challenge code/ })).toBeVisible();
    act(() => setHash('#/challenge/join', true));
    expect(screen.getByLabelText('Challenge code input')).toBeVisible();
    act(() => setHash('#/challenge/create', true));
    expect(screen.getByRole('heading', { name: 'Create a secret word' })).toBeVisible();
  });
});
