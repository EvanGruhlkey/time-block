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

test('keeps the page background visibly above black', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto('/');
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-renderer',
    'ready',
  );

  const { data, info } = await sharp(await page.screenshot())
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cornerLuminance = pixelLuminance(data, info.width, 8, 8);

  expect(cornerLuminance).toBeGreaterThanOrEqual(9);
  expect(cornerLuminance).toBeLessThan(30);
});

test('draws a neutral outline around the time volume', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-renderer', 'ready');

  const { data } = await sharp(await canvas.screenshot())
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let outlinePixels = 0;
  for (let index = 0; index < data.length; index += 3) {
    const red = data[index]!;
    const green = data[index + 1]!;
    const blue = data[index + 2]!;
    const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
    if (red >= 35 && red <= 100 && spread <= 8) outlinePixels += 1;
  }

  expect(outlinePixels).toBeGreaterThan(2_500);
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

function pixelLuminance(
  data: Buffer,
  width: number,
  x: number,
  y: number,
): number {
  const index = (y * width + x) * 3;
  return (data[index]! + data[index + 1]! + data[index + 2]!) / 3;
}
