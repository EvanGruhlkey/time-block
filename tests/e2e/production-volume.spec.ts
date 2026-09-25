import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';

const sampleVideo = fileURLToPath(
  new URL('../fixtures/sample.mp4', import.meta.url),
);

test('keeps the chosen frame visibly separated from the time volume', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(sampleVideo);
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-renderer', 'ready', {
    timeout: 60_000,
  });

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
