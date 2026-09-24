import { expect, test, type Page } from '@playwright/test';
import { fixtureMetadata, fixtureVoxels } from '../fixtures/volume';

async function routeVolume(page: Page): Promise<void> {
  await page.route('**/volume/metadata.json', (route) =>
    route.fulfill({ json: fixtureMetadata }),
  );
  await page.route('**/volume/dancer.rgba', (route) =>
    route.fulfill({
      body: Buffer.from(fixtureVoxels),
      contentType: 'application/octet-stream',
    }),
  );
}

test('slices, plays, hides, resets, and exposes labeled controls', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 640, height: 360 });
  await routeVolume(page);
  await page.goto('/');

  const readout = page.getByTestId('time-readout');
  const panel = page.locator('.control-panel');
  const play = page.getByRole('button', { name: 'Play' });
  await expect(readout).toHaveText('FRAME 061 / 120 · 00:02.50');

  await page.keyboard.press('ArrowLeft');
  await expect(readout).toHaveText('FRAME 060 / 120 · 00:02.46');

  const canvas = page.locator('canvas');
  await canvas.hover();
  await page.mouse.wheel(0, 40);
  await expect(readout).toHaveText('FRAME 061 / 120 · 00:02.50');

  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(play).toBeVisible();

  await page.keyboard.press('h');
  await expect(panel).toHaveAttribute('aria-hidden', 'true');
  await page.keyboard.press('h');
  await expect(panel).toHaveAttribute('aria-hidden', 'false');

  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('r');
  await expect(readout).toHaveText('FRAME 061 / 120 · 00:02.50');

  await canvas.hover();
  await page.mouse.wheel(0, 58 * 40);
  await expect(readout).toHaveText('FRAME 119 / 120 · 00:04.92');
  await page.keyboard.press('Space');
  await expect(play).toBeVisible({ timeout: 1500 });
  await expect(readout).toHaveText('FRAME 120 / 120 · 00:04.96');

  await page.getByText('SHAPE', { exact: true }).click();
  await expect(
    page.getByRole('slider', { name: 'Volume density' }),
  ).toBeVisible();
  await expect(
    page.getByRole('slider', { name: 'Slice thickness' }),
  ).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Time depth' })).toBeVisible();
});

test('offers a working retry after the volume fails to load', async ({
  page,
}) => {
  let attempts = 0;
  await page.route('**/volume/metadata.json', (route) => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({ status: 503 })
      : route.fulfill({ json: fixtureMetadata });
  });
  await page.route('**/volume/dancer.rgba', (route) =>
    route.fulfill({ body: Buffer.from(fixtureVoxels) }),
  );

  await page.goto('/');
  await expect(
    page.getByText('The dancer volume could not be loaded.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();

  await expect(page.locator('canvas')).toHaveAttribute(
    'data-renderer',
    'ready',
  );
  await expect(page.getByTestId('time-readout')).toBeVisible();
});

test('fits mobile, reserves touch gestures for the canvas, and honors reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await routeVolume(page);
  await page.goto('/');

  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-renderer', 'ready');
  expect(
    await canvas.evaluate((node) => getComputedStyle(node).touchAction),
  ).toBe('none');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();

  const before = await canvas.getAttribute('data-camera');
  await page.waitForTimeout(500);
  expect(await canvas.getAttribute('data-camera')).toBe(before);

  const panel = await page
    .getByRole('region', { name: 'Time controls' })
    .boundingBox();
  expect(panel).not.toBeNull();
  expect(panel!.x).toBeGreaterThanOrEqual(0);
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(390);
});
