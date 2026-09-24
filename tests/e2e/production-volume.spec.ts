import { expect, test } from '@playwright/test';
import sharp from 'sharp';

test('keeps the active dancer visibly separated from the time volume', async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-renderer', 'ready');

  const { data } = await sharp(await canvas.screenshot())
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let luminousPixels = 0;
  for (let index = 0; index < data.length; index += 3) {
    if (data[index]! + data[index + 1]! + data[index + 2]! > 180) {
      luminousPixels += 1;
    }
  }

  expect(luminousPixels).toBeGreaterThan(2_500);
});
