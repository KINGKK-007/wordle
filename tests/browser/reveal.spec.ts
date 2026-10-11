import { test, expect } from '@playwright/test';
import { encodeWord } from '../../src/utils/wordCodec';

for (const highContrast of [false, true]) {
  test(`all five tiles reveal together at their midpoint (${highContrast ? 'high contrast' : 'standard colors'})`, async ({
    page,
  }) => {
    await page.addInitScript((contrast) => {
      localStorage.setItem('custom-wordle-help-shown', '1');
      localStorage.setItem(
        'custom-wordle-settings',
        JSON.stringify({ hardMode: false, highContrast: contrast }),
      );
    }, highContrast);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/#/play?w=${encodeWord('crane')}`);
    await page.keyboard.type('react');
    await page.keyboard.press('Enter');
    await expect(page.locator('.tile--flipping')).toHaveCount(5);

    // Seek the actual browser animation rather than relying on wall-clock sleeps.
    const samples = await page
      .locator('.row')
      .first()
      .locator('.tile')
      .evaluateAll((tiles) =>
        tiles.map((tile) => {
          const animations = tile.getAnimations();
          const animation = animations[0]!;
          animation.pause();
          const timing = animation.effect!.getTiming();
          const duration = Number(timing.duration);
          const delay = timing.delay ?? 0;
          const probe = document.createElement('span');
          probe.style.backgroundColor = 'var(--tile-flip-color)';
          probe.style.color = 'var(--tile-flip-text)';
          tile.appendChild(probe);
          const expectedColor = getComputedStyle(probe).backgroundColor;
          const expectedText = getComputedStyle(probe).color;
          probe.remove();
          const sample = (progress: number) => {
            animation.currentTime = delay + duration * progress;
            const style = getComputedStyle(tile);
            return {
              background: style.backgroundColor,
              border: style.borderTopColor,
              text: style.color,
            };
          };
          return {
            count: animations.length,
            name: (animation as CSSAnimation).animationName,
            duration,
            delay,
            expectedColor,
            expectedText,
            before: sample(0.49),
            after: sample(0.51),
            finished: sample(1),
          };
        }),
      );

    expect(samples.map(({ delay }) => delay)).toEqual([0, 80, 160, 240, 320]);
    expect(new Set(samples.map(({ expectedColor }) => expectedColor)).size).toBe(3);
    for (const sample of samples) {
      expect(sample.count).toBe(1);
      expect(sample.name).toBe('tile-reveal');
      expect(sample.duration).toBe(500);
      expect(sample.before.background).toBe('rgba(0, 0, 0, 0)');
      expect(sample.before.border).not.toBe(sample.expectedColor);
      for (const phase of [sample.after, sample.finished]) {
        expect(phase.background).toBe(sample.expectedColor);
        expect(phase.border).toBe(sample.expectedColor);
        expect(phase.text).toBe(sample.expectedText);
      }
    }
  });
}
