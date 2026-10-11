import { test, expect } from '@playwright/test';

test('a new mobile player can choose modes without an onboarding barrier', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.mode-card__title')).toHaveText([
    'Live Duel',
    'Secret Word',
    'Unlimited',
  ]);
  await expect(page.getByRole('button', { name: 'Enter a challenge code' })).toHaveCount(0);
  const cards = await page
    .locator('.mode-card')
    .evaluateAll((xs) =>
      xs.map((x) => ({
        left: x.getBoundingClientRect().left,
        right: x.getBoundingClientRect().right,
        bottom: x.getBoundingClientRect().bottom,
      })),
    );
  expect(cards.every((c) => c.left >= 0 && c.right <= 320 && c.bottom <= 740)).toBe(true);
  await page.getByRole('button', { name: /Secret Word:/ }).click();
  await page.getByRole('button', { name: /Enter challenge code/ }).click();
  await expect(page.getByLabel('Challenge code input')).toBeVisible();
  await page.getByRole('button', { name: /Secret Word/ }).click();
  await page.getByRole('button', { name: /Create a word/ }).click();
  await expect(page.getByRole('heading', { name: 'Create a secret word' })).toBeVisible();
});

test('a player joins through a pasted room link and recovers from the wrong code type', async ({
  context,
}) => {
  const host = await context.newPage(),
    guest = await context.newPage();
  for (const p of [host, guest])
    await p.addInitScript(() => localStorage.setItem('custom-wordle-duel-nickname', 'Friend'));
  await host.goto('/#/duel');
  await host.getByRole('button', { name: 'Create Duel', exact: true }).click();
  await expect(host.locator('.duel-room-code')).toBeVisible();
  const link = host.url();
  await guest.goto('/#/duel');
  await guest.getByLabel('Room code', { exact: true }).fill('ABCD');
  await guest.getByRole('button', { name: 'Join Duel', exact: true }).click();
  await expect(guest.getByRole('alert')).toContainText('5-character room code');
  await guest.getByLabel('Room code', { exact: true }).fill(link);
  await guest.getByRole('button', { name: 'Join Duel', exact: true }).click();
  await expect(guest.locator('.duel-room-code')).toHaveText(
    await host.locator('.duel-room-code').innerText(),
  );
  await expect(host.getByRole('button', { name: 'Ready to race', exact: true })).toBeEnabled();
  await host.getByRole('button', { name: 'Back to menu', exact: true }).click();
  await expect(guest.getByRole('alert')).toHaveText('Host left. This room is closed.');
});
