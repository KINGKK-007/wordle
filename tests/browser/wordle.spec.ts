import { test, expect, type Page } from '@playwright/test';

async function prepare(page: Page, nickname = 'Player') {
  await page.addInitScript((name) => {
    localStorage.setItem('custom-wordle-help-shown', '1');
    localStorage.setItem('custom-wordle-duel-help-shown', '1');
    localStorage.setItem('custom-wordle-duel-nickname', name);
  }, nickname);
}
async function ready(host: Page, guest: Page) {
  await expect(host.getByRole('button', { name: 'Ready to race', exact: true })).toBeEnabled();
  await host.getByRole('button', { name: 'Ready to race', exact: true }).click();
  await guest.getByRole('button', { name: 'Ready to race', exact: true }).click();
  await expect(host.getByText('Get ready!', { exact: true })).toBeVisible();
  await expect(guest.getByText('Get ready!', { exact: true })).toBeVisible();
  await expect(host.locator('.duel-game')).toBeVisible();
  await expect(guest.locator('.duel-game')).toBeVisible();
}

for (const width of [320, 360, 1280]) {
  test(`solo, custom challenges, refresh and modal input at ${width}px`, async ({
    page,
    context,
  }) => {
    await prepare(page);
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 740 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: /Unlimited:/ }).click();
    await page.getByRole('button', { name: 'C', exact: true }).click();
    await expect(page.locator('.row').first()).toHaveText('C');
    await page.keyboard.type('rane');
    await page.keyboard.press('Enter');
    await expect(page.locator('.row').first()).toHaveText('CRANE');
    await page.reload();
    await expect(page.locator('.row').first()).toHaveText('CRANE');
    const bounds = await page.locator('.keyboard button').evaluateAll((keys) =>
      keys.map((key) => ({
        left: key.getBoundingClientRect().left,
        right: key.getBoundingClientRect().right,
      })),
    );
    expect(bounds.every((bound) => bound.left >= 0 && bound.right <= width)).toBe(true);
    await page.getByRole('button', { name: 'How to play', exact: true }).click();
    await page.keyboard.type('zzzzz');
    await page.keyboard.press('Escape');
    await expect(page.locator('.row').nth(1)).toHaveText('');
    await page.keyboard.type('slate');
    await expect(page.locator('.row').nth(1)).toHaveText('SLATE');
    await page.getByRole('button', { name: 'Back to menu', exact: true }).click();
    await page.getByRole('button', { name: /Secret Word:/ }).click();
    await page.getByRole('button', { name: /Create a word/ }).click();
    await expect(page.locator('.set-word-screen')).toBeVisible();
    await page.keyboard.type('crane');
    await page.getByRole('button', { name: /Create challenge/ }).click();
    const code = await page.locator('.share-block__code').innerText();
    const link = await page.locator('.share-block__url').innerText();
    expect(code).toHaveLength(4);
    expect(link).not.toContain('crane');
    const challenge = await context.newPage();
    await prepare(challenge);
    await challenge.goto(link);
    await expect(challenge.locator('.game-mode-label')).toHaveText(
      'Secret Word · A puzzle from your friend',
    );
    await challenge.keyboard.type('crane');
    await challenge.keyboard.press('Enter');
    await expect(challenge.locator('.row').first().locator('[data-state="correct"]')).toHaveCount(
      5,
    );
    await challenge.reload();
    await expect(challenge.locator('.row').first()).toHaveText('');
    await challenge.getByRole('button', { name: 'Back to menu', exact: true }).click();
    await challenge.getByRole('button', { name: /Secret Word:/ }).click();
    await challenge.getByRole('button', { name: /Enter challenge code/ }).click();
    await challenge.getByLabel('Challenge code input').fill(code);
    await challenge.getByRole('button', { name: /Solve their word/ }).click();
    await expect(challenge.locator('.game-mode-label')).toHaveText(
      'Secret Word · A puzzle from your friend',
    );
    await challenge.goto('/#/play?w=bad');
    await expect(challenge.getByRole('heading', { name: 'Invalid Challenge' })).toBeVisible();
    await challenge.close();
    expect(errors).toEqual([]);
  });
}

test('two mobile tabs finish the same timed duel, refresh and rematch', async ({ context }) => {
  const host = await context.newPage();
  const guest = await context.newPage();
  await prepare(host, 'Host');
  await prepare(guest, 'Guest');
  await host.setViewportSize({ width: 360, height: 740 });
  await guest.setViewportSize({ width: 360, height: 740 });
  const errors: string[] = [];
  for (const page of [host, guest]) page.on('pageerror', (error) => errors.push(error.message));
  await host.goto('/#/duel');
  for (const duration of [5, 2, 1]) {
    await host.getByRole('button', { name: `${duration} min`, exact: true }).click();
    await expect(
      host.getByRole('button', { name: `${duration} min`, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  }
  await host.getByRole('button', { name: 'Create Duel', exact: true }).click();
  await expect(host.locator('.duel-room-code')).toBeVisible();
  const code = await host.locator('.duel-room-code').innerText();
  await guest.goto(`/#/duel/${code}`);
  await expect(guest.locator('.duel-players')).toContainText('Host');
  await ready(host, guest);
  const seed = await host.evaluate(
    (roomCode) =>
      JSON.parse(localStorage.getItem(`custom-wordle-mock-room-${roomCode}`)!).meta.seed as number,
    code,
  );
  const { seededSequence } = await import('../../src/duel/logic');
  const answer = seededSequence(seed)[0]!;
  await host.keyboard.type(answer);
  await host.keyboard.press('Enter');
  await expect(guest.locator('.duel-opponent')).toContainText('1 solved');
  await expect(host.locator('.duel-word-number')).toHaveText('Word #2');
  const guestGuess = answer === 'crane' ? 'slate' : 'crane';
  await guest.keyboard.type(guestGuess);
  await guest.keyboard.press('Enter');
  await expect(
    host.locator(
      '.duel-mini-grid .duel-mini-tile--0, .duel-mini-grid .duel-mini-tile--1, .duel-mini-grid .duel-mini-tile--2',
    ),
  ).toHaveCount(5);
  await guest.reload();
  await expect(guest.locator('.row').first()).toHaveText(guestGuess.toUpperCase());
  const bounds = await host.locator('.keyboard').boundingBox();
  const board = await host.locator('.board').boundingBox();
  expect(board!.y + board!.height).toBeLessThanOrEqual(bounds!.y);
  await expect(host.locator('.duel-results')).toBeVisible({ timeout: 80000 });
  await expect(guest.locator('.duel-results')).toBeVisible();
  await expect(host.locator('.duel-result-banner')).toContainText('You win!');
  await expect(guest.locator('.duel-result-banner')).toContainText('You lose');
  await expect(host.locator('.duel-deciding-row')).toContainText('Words solved');
  await expect(guest.locator('.duel-deciding-row')).toContainText('Words solved');
  await host.getByRole('button', { name: 'Rematch', exact: true }).click();
  await expect(guest.getByText('Opponent wants a rematch', { exact: true })).toBeVisible();
  await guest.getByRole('button', { name: 'Accept Rematch', exact: true }).click();
  await expect(host.locator('.duel-room-code')).toHaveText(code);
  await expect(guest.locator('.duel-room-code')).toHaveText(code);
  const newSeed = await host.evaluate(
    (roomCode) =>
      JSON.parse(localStorage.getItem(`custom-wordle-mock-room-${roomCode}`)!).meta.seed as number,
    code,
  );
  expect(newSeed).not.toBe(seed);
  expect(errors).toEqual([]);
});

test('duration choices, room capacity and lobby cleanup work in browser tabs', async ({
  context,
}) => {
  const host = await context.newPage();
  const guest = await context.newPage();
  const third = await context.newPage();
  await prepare(host, 'Host');
  await prepare(guest, 'Guest');
  await prepare(third, 'Third');
  for (const duration of [1, 2, 5]) {
    await host.goto('/#/duel');
    await host.getByRole('button', { name: `${duration} min`, exact: true }).click();
    await host.getByRole('button', { name: 'Create Duel', exact: true }).click();
    await expect(host.locator('.duel-room-code')).toBeVisible();
    const code = await host.locator('.duel-room-code').innerText();
    await guest.goto(`/#/duel/${code}`);
    await expect(guest.getByText(`${duration}-minute Live Duel`, { exact: true })).toBeVisible();
    await third.goto(`/#/duel/${code}`);
    await expect(third.getByRole('alert')).toHaveText('Room is full.');
    await guest.getByRole('button', { name: 'Back to menu', exact: true }).click();
    await expect(host.getByText('Waiting for your friend…').first()).toBeVisible();
    await guest.goto(`/#/duel/${code}`);
    await expect(guest.locator('.duel-room-code')).toBeVisible();
    await host.getByRole('button', { name: 'Back to menu', exact: true }).click();
    await expect(guest.getByRole('alert')).toHaveText('Host left. This room is closed.');
  }
});

test('countdown cancellation, reconnect and twenty-second forfeit', async ({ context }) => {
  const host = await context.newPage();
  const guest = await context.newPage();
  const guestNetwork = await context.newCDPSession(guest);
  const setGuestOffline = async (offline: boolean) => {
    await guestNetwork.send('Network.enable');
    await guestNetwork.send('Network.emulateNetworkConditions', {
      offline,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  };
  await prepare(host, 'Host');
  await prepare(guest, 'Guest');
  await host.goto('/#/duel');
  await host.getByRole('button', { name: 'Create Duel', exact: true }).click();
  await expect(host.locator('.duel-room-code')).toBeVisible();
  const code = await host.locator('.duel-room-code').innerText();
  await guest.goto(`/#/duel/${code}`);
  await expect(host.getByRole('button', { name: 'Ready to race', exact: true })).toBeEnabled();
  await host.getByRole('button', { name: 'Ready to race', exact: true }).click();
  await guest.getByRole('button', { name: 'Ready to race', exact: true }).click();
  await expect(guest.locator('.duel-countdown')).toBeVisible();
  await guest
    .locator('.duel-countdown')
    .getByRole('button', { name: 'Not ready', exact: true })
    .click();
  await expect(host.locator('.duel-countdown')).toHaveCount(0);
  await expect(guest.locator('.duel-countdown')).toHaveCount(0);
  await guest.getByRole('button', { name: 'Ready to race', exact: true }).click();
  await expect(host.locator('.duel-game')).toBeVisible();
  await expect(guest.locator('.duel-game')).toBeVisible();
  await setGuestOffline(true);
  await expect(host.locator('.duel-opponent')).toContainText('Opponent disconnected');
  await setGuestOffline(false);
  await expect(host.locator('.duel-opponent')).not.toContainText('Opponent disconnected');
  await expect(guest.locator('.duel-game')).toBeVisible();
  await host.getByRole('button', { name: 'Back to menu', exact: true }).click();
  await expect(host.getByRole('dialog', { name: 'Leave Live Duel?' })).toBeVisible();
  await host.getByRole('button', { name: 'Keep Playing', exact: true }).click();
  await setGuestOffline(true);
  await expect(host.locator('.duel-results')).toBeVisible({ timeout: 30000 });
  await expect(host.locator('.duel-result-banner')).toContainText('Opponent forfeited');
  await setGuestOffline(false);
  await expect(guest.locator('.duel-result-banner')).toContainText('You lose');
});
