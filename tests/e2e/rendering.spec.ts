import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { fixtureMetadata, fixtureVoxels } from '../fixtures/volume';

test.beforeEach(async ({ page }) => {
  await page.route('**/volume/metadata.json', async (route) => {
    await route.fulfill({ json: fixtureMetadata });
  });
  await page.route('**/volume/dancer.rgba', async (route) => {
    await route.fulfill({
      body: Buffer.from(fixtureVoxels),
      contentType: 'application/octet-stream',
    });
  });
});

test('renders the volume and survives one context loss cycle', async ({
  page,
}) => {
  await page.goto('/');
  const canvas = page.locator('canvas');

  await expect(canvas).toHaveAttribute('data-renderer', 'ready');
  expect(
    await canvas.evaluate((element) =>
      Boolean((element as HTMLCanvasElement).getContext('webgl2')),
    ),
  ).toBe(true);

  const { data } = await sharp(await canvas.screenshot())
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect([...data].some((channel) => channel > 40)).toBe(true);

  await canvas.evaluate((element) => {
    element.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  });
  await expect(canvas).toHaveAttribute('data-renderer', 'lost');

  await canvas.evaluate((element) => {
    element.dispatchEvent(new Event('webglcontextrestored'));
  });
  await expect(canvas).toHaveAttribute('data-renderer', 'ready');
  await expect(canvas).toHaveAttribute('data-restores', '1');
});
