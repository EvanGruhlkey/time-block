import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const sampleVideo = fileURLToPath(
  new URL('../fixtures/sample.mp4', import.meta.url),
);

test('turns a chosen local video into a UI-free time volume', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto('/');

  await expect(page.locator('.video-chooser button')).toHaveText(
    'Choose video',
  );
  await page.locator('input[type="file"]').setInputFiles(sampleVideo);

  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-renderer', 'ready', {
    timeout: 60_000,
  });
  await expect(page.locator('.video-chooser')).toBeHidden();
  await expect(page.locator('.control-panel')).toHaveCount(0);

  const before = await canvas.screenshot();
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(100);
  const after = await canvas.screenshot();
  expect(after.equals(before)).toBe(false);
});

test('returns to the chooser when a video cannot be decoded', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'broken.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('not a video'),
  });

  await expect(page.getByRole('alert')).toContainText(
    'The selected video could not be decoded.',
  );
  await expect(page.locator('.video-chooser button')).toHaveText(
    'Choose video',
  );
});

test('keeps the UI-free volume usable on a reduced-motion mobile screen', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(sampleVideo);

  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-renderer', 'ready', {
    timeout: 60_000,
  });
  expect(
    await canvas.evaluate((node) => getComputedStyle(node).touchAction),
  ).toBe('none');
  await expect(page.locator('.video-chooser')).toBeHidden();

  const before = await canvas.getAttribute('data-camera');
  await page.waitForTimeout(500);
  expect(await canvas.getAttribute('data-camera')).toBe(before);
});
