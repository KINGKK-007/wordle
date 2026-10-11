import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DuelScreen } from '../src/duel/DuelScreen';
import { StatsModal } from '../src/components/StatsModal';
import { createProgress, finishProgress, seededSequence, submitGuess } from '../src/duel/logic';
import {
  clearDuelSession,
  loadDuelSession,
  loadLocalDuel,
  loadNickname,
  markDuelHelpShown,
  saveDuelSession,
  saveLocalDuel,
  saveNickname,
  sanitizeNickname,
  shouldShowDuelHelp,
  type LocalDuelState,
} from '../src/duel/localState';
import { loadDuelStats, recordDuelResult } from '../src/duel/stats';
import { formatTimer, resultExplanation } from '../src/duel/resultFormatting';
import { DUEL_TIMING } from '../src/duel/timing';
import type { DuelTransport, PlayerProgress, RoomState } from '../src/duel/types';

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../src/duel/transport', () => ({ createDuelTransport: mocks.create }));
const UID = 'host';
const CODE = 'ABCDE';
const SEED = 42;
const START = 1_900_000_000_000;

function makeRoom(): RoomState {
  return {
    meta: {
      hostUid: UID,
      guestUid: 'guest',
      seed: SEED,
      status: 'playing',
      durationSec: 120,
      createdAt: START,
      startAt: START,
      endAt: START + 120_000,
    },
    players: Object.fromEntries(
      [UID, 'guest'].map((uid) => [
        uid,
        {
          name: uid === UID ? 'Player' : 'Friend',
          ready: true,
          readySeed: SEED,
          rematchSeed: null,
          connected: true,
          joinedAt: START,
          lastSeen: START,
        },
      ]),
    ),
    progress: { host: createProgress(SEED), guest: createProgress(SEED) },
  };
}

class UiTransport implements DuelTransport {
  room = makeRoom();
  listeners = new Set<(room: RoomState | null) => void>();
  init = vi.fn(async () => ({ uid: UID }));
  getServerTime = () => Date.now();
  createRoom = vi.fn<DuelTransport['createRoom']>(async () => ({ code: CODE }));
  joinRoom = vi.fn<DuelTransport['joinRoom']>(async () => {});
  subscribeRoom = (_code: string, callback: (room: RoomState | null) => void) => {
    this.listeners.add(callback);
    callback(structuredClone(this.room));
    return () => {
      this.listeners.delete(callback);
    };
  };
  subscribeConnection = (callback: (connected: boolean) => void) => {
    callback(true);
    return () => {};
  };
  setReady = vi.fn<DuelTransport['setReady']>(async () => {});
  setDuration = vi.fn<DuelTransport['setDuration']>(async () => {});
  publishProgress = vi.fn(async (_code: string, progress: PlayerProgress) => {
    this.room.progress[UID] = structuredClone(progress);
    this.emit();
  });
  requestRematch = vi.fn<DuelTransport['requestRematch']>(async () => {});
  reconcileRoom = vi.fn<DuelTransport['reconcileRoom']>(async () => {});
  leaveRoom = vi.fn<DuelTransport['leaveRoom']>(async () => {});
  dispose = vi.fn();
  emit() {
    for (const listener of this.listeners) listener(structuredClone(this.room));
  }
}

let transport: UiTransport;
const callbacks = () => ({
  settings: { hardMode: true, highContrast: false },
  onSettingsChange: vi.fn(),
  onToast: vi.fn(),
  onBackToMenu: vi.fn(),
});
async function mountDuel(code: string | null = CODE, strict = false) {
  const props = callbacks();
  const component = <DuelScreen code={code ?? undefined} {...props} />;
  const view = render(strict ? <StrictMode>{component}</StrictMode> : component);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return { ...view, props };
}
function type(word: string) {
  for (const key of word) fireEvent.keyDown(window, { key });
}
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START + 10_000);
  localStorage.clear();
  saveNickname('Player');
  markDuelHelpShown();
  transport = new UiTransport();
  mocks.create.mockResolvedValue(transport);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Duel input and refresh regressions', () => {
  it('shows first-entry help once and explains shared rules in Duel settings', async () => {
    localStorage.removeItem('custom-wordle-duel-help-shown');
    await mountDuel(null);
    expect(screen.getByRole('dialog', { name: 'How to Play Duel' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: "Let's Duel" }));
    expect(shouldShowDuelHelp()).toBe(false);
    act(() =>
      window.dispatchEvent(new CustomEvent('header-action', { detail: { action: 'settings' } })),
    );
    const settings = screen.getByRole('dialog', { name: 'Settings' });
    expect(
      within(settings).getByText('Hard Mode is off in Duel. Both players use the same rules.'),
    ).toBeVisible();
    expect(within(settings).getByRole('checkbox', { name: 'Toggle hard mode' })).toBeDisabled();
    expect(within(settings).getByRole('checkbox', { name: 'Toggle hard mode' })).not.toBeChecked();
  });

  it('shows friendly setup errors without rendering a broken board', async () => {
    mocks.create.mockRejectedValueOnce(new Error("Duel mode isn't configured yet."));
    await mountDuel(null);
    expect(screen.getByRole('heading', { name: 'Duel coming soon' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent("Duel mode isn't configured yet.");
    expect(screen.queryByRole('grid')).toBeNull();
  });

  it('retries a failed progress write from its saved snapshot and clears the reconnect banner', async () => {
    transport.publishProgress.mockRejectedValueOnce(new Error('temporary connection failure'));
    await mountDuel();
    act(() => {
      type('crane');
      fireEvent.keyDown(window, { key: 'Enter' });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Reconnecting… Your guesses are saved.')).toBeVisible();
    expect(loadLocalDuel(CODE, UID, SEED)?.progress.totalGuesses).toBe(1);
    await tick(DUEL_TIMING.retryMs);
    expect(transport.publishProgress).toHaveBeenCalledTimes(2);
    expect(transport.room.progress.host.totalGuesses).toBe(1);
    expect(screen.queryByText('Reconnecting… Your guesses are saved.')).toBeNull();
  });

  it('timestamps Enter immediately, locks double-submit, publishes colors only, and delays keyboard color', async () => {
    await mountDuel();
    const answer = seededSequence(SEED)[0];
    act(() => {
      type(answer);
      fireEvent.keyDown(window, { key: 'Enter' });
      fireEvent.keyDown(window, { key: 'Enter' });
      fireEvent.keyDown(window, { key: 'x' });
    });
    expect(transport.publishProgress).toHaveBeenCalledOnce();
    const progress = transport.publishProgress.mock.calls[0][1];
    expect(progress.words[0].endedAtMs).toBe(10_000);
    expect(progress.totalGuesses).toBe(1);
    expect(JSON.stringify(progress)).not.toContain(answer);
    expect(screen.getByRole('button', { name: answer[0].toUpperCase() })).toBeDisabled();
    await tick(DUEL_TIMING.revealMs);
    expect(
      screen.getByRole('button', { name: `${answer[0].toUpperCase()}, correct` }),
    ).toBeDisabled();
    await tick(DUEL_TIMING.wordPauseMs);
    expect(screen.getByText('Word #2')).toBeVisible();
    expect(screen.getByRole('button', { name: answer[0].toUpperCase() })).toBeEnabled();
  });

  it('invalid guesses shake without consuming attempts, and sixth failures keep the reveal pause', async () => {
    const { props } = await mountDuel();
    act(() => {
      type('zzzzz');
      fireEvent.keyDown(window, { key: 'Enter' });
    });
    expect(props.onToast).toHaveBeenCalledWith('Not in word list');
    expect(transport.publishProgress).not.toHaveBeenCalled();
    expect(document.querySelector('.row--shake')).not.toBeNull();
    act(() => {
      for (let i = 0; i < 5; i++) fireEvent.keyDown(window, { key: 'Backspace' });
    });
    const wrong = seededSequence(SEED)[0] === 'crane' ? 'slate' : 'crane';
    for (let i = 0; i < 6; i++) {
      act(() => {
        type(wrong);
        fireEvent.keyDown(window, { key: 'Enter' });
      });
      await tick(DUEL_TIMING.revealMs);
    }
    expect(screen.getByText('Word #1')).toBeVisible();
    await tick(DUEL_TIMING.wordPauseMs - 1);
    expect(screen.getByText('Word #1')).toBeVisible();
    await tick(1);
    expect(screen.getByText('Word #2')).toBeVisible();
    expect(transport.room.progress.host.wordsSolved).toBe(0);
    expect(transport.room.progress.host.totalGuesses).toBe(6);
  });

  it('restores own letters, typed input and keyboard while keeping opponent letters hidden', async () => {
    const first = await mountDuel();
    act(() => {
      type('crane');
      fireEvent.keyDown(window, { key: 'Enter' });
    });
    await tick(DUEL_TIMING.revealMs);
    act(() => type('ab'));
    first.unmount();
    await mountDuel();
    const saved = loadLocalDuel(CODE, UID, SEED);
    expect(saved?.guesses[0]).toEqual(['crane']);
    expect(saved?.currentGuess).toBe('ab');
    expect(screen.getByRole('grid')).toHaveTextContent('CRANEAB');
    expect(document.querySelector('.duel-mini-grid')).toHaveTextContent('');
  });

  it('restores a complete word during reveal directly to its next board', async () => {
    const answer = seededSequence(SEED)[0];
    const progress = submitGuess(createProgress(SEED), {
      guess: answer,
      answer,
      now: START + 9000,
      startAt: START,
      endAt: START + 120_000,
    }).progress;
    saveLocalDuel({
      version: 1,
      roomCode: CODE,
      uid: UID,
      seed: SEED,
      progress,
      guesses: { 0: [answer] },
      currentGuess: '',
    });
    await mountDuel();
    expect(screen.getByText('Word #2')).toBeVisible();
    expect(screen.getByRole('grid')).toHaveTextContent('');
  });

  it('rejects Enter at the exact buzzer and shows results after the overlay even if the opponent is offline', async () => {
    transport.room.players.guest.connected = false;
    transport.room.players.guest.lastSeen = START + 119_000;
    await mountDuel();
    act(() => type('crane'));
    vi.setSystemTime(transport.room.meta.endAt!);
    act(() => fireEvent.keyDown(window, { key: 'Enter' }));
    expect(transport.publishProgress).not.toHaveBeenCalled();
    await tick(DUEL_TIMING.clockTickMs);
    expect(screen.getByRole('heading', { name: "Time's up!" })).toBeVisible();
    await tick(DUEL_TIMING.timesUpMs);
    expect(screen.getByRole('heading', { name: 'Draw' })).toBeVisible();
    expect(screen.getByText('Reconnecting to confirm final scores…')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Rematch' })).toBeDisabled();
    expect(loadDuelStats().played).toBe(0);
    transport.room.progress.guest = finishProgress(
      transport.room.progress.guest,
      transport.room.meta.endAt!,
      START,
    );
    act(() => transport.emit());
    expect(loadDuelStats().draws).toBe(1);
    act(() => transport.emit());
    expect(loadDuelStats().played).toBe(1);
  });

  it('records confirmed final scores before the time-up overlay ends so early menu navigation keeps the result', async () => {
    const endAt = transport.room.meta.endAt!;
    transport.room.progress.guest = finishProgress(transport.room.progress.guest, endAt, START);
    vi.setSystemTime(endAt);
    const view = await mountDuel();
    expect(screen.getByRole('heading', { name: "Time's up!" })).toBeVisible();
    expect(loadDuelStats().draws).toBe(1);
    act(() =>
      window.dispatchEvent(new CustomEvent('header-action', { detail: { action: 'menu' } })),
    );
    expect(view.props.onBackToMenu).toHaveBeenCalledOnce();
    expect(loadDuelStats().played).toBe(1);
  });

  it('keeps forfeit times fixed across re-renders and records one result in StrictMode', async () => {
    transport.room.players.guest.connected = false;
    transport.room.players.guest.lastSeen = START + 1000;
    vi.setSystemTime(START + 22_000);
    const first = await mountDuel(CODE, true);
    await tick(300);
    expect(screen.getByRole('heading', { name: 'Opponent forfeited' })).toBeVisible();
    expect(transport.room.progress.host.words[0].endedAtMs).toBe(21_000);
    expect(loadDuelStats().wins).toBe(1);
    transport.room.meta = {
      ...transport.room.meta,
      status: 'finished',
      forfeitUid: 'guest',
      forfeitAt: START + 21_000,
    };
    transport.room.players.guest.connected = true;
    transport.room.players.guest.lastSeen = Date.now();
    act(() => transport.emit());
    expect(screen.getAllByText('0 guesses · 0:21.0')).toHaveLength(2);
    await tick(2000);
    first.unmount();
    await mountDuel();
    await tick(300);
    expect(loadDuelStats().played).toBe(1);
  });

  it('the header leave action confirms a forfeit and cleans intervals on unmount', async () => {
    const view = await mountDuel();
    act(() =>
      window.dispatchEvent(new CustomEvent('header-action', { detail: { action: 'menu' } })),
    );
    const dialog = screen.getByRole('dialog', { name: 'Leave duel?' });
    expect(view.props.onBackToMenu).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep Playing' }));
    act(() =>
      window.dispatchEvent(new CustomEvent('header-action', { detail: { action: 'menu' } })),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Leave Duel' }));
    expect(transport.leaveRoom).toHaveBeenCalledWith(CODE);
    expect(view.props.onBackToMenu).toHaveBeenCalledOnce();
    expect(loadDuelStats().losses).toBe(1);
    view.unmount();
    await tick(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('accepts a pasted full room link, uppercases its code, and prompts an unsaved nickname', async () => {
    const view = await mountDuel(null);
    const input = screen.getByRole('textbox', { name: 'Room code' });
    fireEvent.paste(input, {
      clipboardData: { getData: () => 'https://friends.example/#/duel/abcde' },
    });
    expect(input).toHaveValue(CODE);
    view.unmount();
    localStorage.removeItem('custom-wordle-duel-nickname');
    await mountDuel();
    expect(screen.getByRole('heading', { name: `Join ${CODE}` })).toBeVisible();
    expect(transport.joinRoom).not.toHaveBeenCalled();
  });
});

describe('Duel local data and all-mode statistics', () => {
  it('rejects corrupted, stale, and impossible local snapshots and sessions', () => {
    const local: LocalDuelState = {
      version: 1,
      roomCode: CODE,
      uid: UID,
      seed: SEED,
      progress: createProgress(SEED),
      guesses: {},
      currentGuess: 'ab',
    };
    saveLocalDuel(local);
    expect(loadLocalDuel(CODE, UID, SEED)?.currentGuess).toBe('ab');
    expect(loadLocalDuel(CODE, UID, SEED + 1)).toBeNull();
    saveLocalDuel({ ...local, guesses: { 0: ['crane'] } });
    expect(loadLocalDuel(CODE, UID, SEED)).toBeNull();
    localStorage.setItem(`custom-wordle-duel-${CODE}-${UID}`, '{');
    expect(loadLocalDuel(CODE, UID, SEED)).toBeNull();
    saveDuelSession(CODE, UID);
    expect(loadDuelSession()).toEqual({ roomCode: CODE, uid: UID });
    localStorage.setItem('custom-wordle-duel-session', '{"roomCode":"0O1IL","uid":3}');
    expect(loadDuelSession()).toBeNull();
    clearDuelSession();
    expect(loadDuelSession()).toBeNull();
  });

  it('sanitizes nickname, caps length, and safely handles blocked storage', () => {
    expect(sanitizeNickname('<script>')).toBe('script');
    expect(sanitizeNickname('  ')).toBe('Player');
    expect(saveNickname('longnicknamewithmanyletters')).toHaveLength(14);
    expect(loadNickname()).toBe('longnicknamewi');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadNickname()).toBeNull();
    expect(shouldShowDuelHelp()).toBe(true);
    expect(saveNickname('Friend')).toBe('Friend');
    expect(loadDuelSession()).toBeNull();
    expect(loadLocalDuel(CODE, UID, SEED)).toBeNull();
  });

  it('records each duel exactly once and stores independent duration records', () => {
    recordDuelResult('match-one', 'win', 60, 4);
    recordDuelResult('match-one', 'loss', 60, 9);
    recordDuelResult('match-two', 'draw', 120, 8);
    recordDuelResult('match-three', 'loss', 300, 11);
    expect(loadDuelStats()).toEqual({
      played: 3,
      wins: 1,
      losses: 1,
      draws: 1,
      bestWords: { 60: 4, 120: 8, 300: 11 },
      recorded: ['match-one', 'match-two', 'match-three'],
    });
    localStorage.setItem('custom-wordle-stats-duel', '{"played":"3"}');
    expect(loadDuelStats().played).toBe(0);
  });

  it('shows all three mode tabs from solo and supports keyboard tab navigation', () => {
    recordDuelResult('stats-modal', 'win', 120, 5);
    render(<StatsModal isOpen onClose={vi.fn()} mode="unlimited" />);
    const unlimited = screen.getByRole('tab', { name: 'Unlimited' });
    expect(unlimited).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(unlimited, { key: 'End' });
    const duel = screen.getByRole('tab', { name: 'Duel' });
    expect(duel).toHaveFocus();
    expect(duel).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Best words solved');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('5');
    fireEvent.keyDown(duel, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: '2-Player' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Guess Distribution');
  });

  it('formats clock/tiebreak explanations and safely treats a double forfeit as a draw', () => {
    expect(formatTimer(61_001)).toBe('1:02');
    expect(formatTimer(61_001, true)).toBe('1:01.0');
    expect(formatTimer(61_900, true)).toBe('1:01.9');
    expect(formatTimer(-1)).toBe('0:00');
    const a = createProgress(SEED),
      b = createProgress(SEED);
    expect(
      resultExplanation(
        { ...a, wordsSolved: 4, guessesOnSolved: 11 },
        { ...b, wordsSolved: 4, guessesOnSolved: 14 },
      ),
    ).toBe('You won on fewer guesses (11 vs 14) after tying at 4 words.');
    expect(resultExplanation({ ...a, forfeited: true }, { ...b, forfeited: true })).toBe(
      'Both players forfeited.',
    );
  });

  it('keeps cumulative statistics and receipts in memory when writes are blocked', async () => {
    vi.resetModules();
    const isolated = await import('../src/duel/stats');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    isolated.recordDuelResult('memory-one', 'win', 60, 2);
    isolated.recordDuelResult('memory-one', 'win', 60, 2);
    isolated.recordDuelResult('memory-two', 'loss', 60, 3);
    expect(isolated.loadDuelStats().played).toBe(2);
    expect(isolated.loadDuelStats().wins).toBe(1);
    expect(isolated.loadDuelStats().losses).toBe(1);
  });
});
