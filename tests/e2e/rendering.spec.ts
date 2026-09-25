import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';

const sampleVideo = fileURLToPath(
  new URL('../fixtures/sample.mp4', import.meta.url),
);

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(sampleVideo);
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-renderer',
    'ready',
    {
      timeout: 60_000,
    },
  );
});

test('keeps the page background visibly above black', async ({ page }) => {
  const { data, info } = await sharp(await page.screenshot())
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cornerLuminance = pixelLuminance(data, info.width, 8, 8);

  expect(cornerLuminance).toBeGreaterThanOrEqual(9);
  expect(cornerLuminance).toBeLessThan(30);
});

test('does not draw a border around the time volume', async ({ page }) => {
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

  expect(outlinePixels).toBeLessThan(350);
});

test('renders the volume and survives one context loss cycle', async ({
  page,
}) => {
  const canvas = page.locator('canvas');
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
