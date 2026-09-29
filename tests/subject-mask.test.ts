import { describe, expect, it } from 'vitest';
import {
  applySubjectMask,
  clearMaskEdges,
  fadeTemporalEdges,
  filterSubjectContrast,
  keepMovingSubject,
  maskSubjectFrames,
  mergeNearbyMotion,
  resampleFrames,
  selectMovingSubject,
} from '../src/subject-mask';

it('removes stationary model detections while keeping nearby moving pixels', () => {
  const model = new Uint8ClampedArray(5 * 4);
  const motion = new Uint8ClampedArray(5 * 4);
  for (const index of [0, 1, 3, 4]) model[index * 4 + 3] = 255;
  motion[1 * 4 + 3] = 255;

  const kept = keepMovingSubject([model], [motion], 5, 1, 1)[0]!;

  expect([kept[3], kept[7], kept[11], kept[15], kept[19]]).toEqual([
    255, 255, 0, 0, 0,
  ]);
});

it('removes edge artifacts from subject masks', () => {
  const pixels = new Uint8ClampedArray(3 * 3 * 4);
  for (let offset = 3; offset < pixels.length; offset += 4)
    pixels[offset] = 255;

  const cleared = clearMaskEdges([pixels], 3, 3, 1)[0]!;

  expect(Array.from(cleared).filter((_, index) => index % 4 === 3)).toEqual([
    0, 0, 0, 0, 255, 0, 0, 0, 0,
  ]);
});

it('selects the model component with concentrated motion', () => {
  const model = new Uint8ClampedArray(8 * 2 * 4);
  const motion = new Uint8ClampedArray(model.length);
  for (const index of [0, 1, 8, 9, 6, 7]) model[index * 4 + 3] = 255;
  for (const index of [0, 1, 8, 9]) motion[index * 4 + 3] = 45;
  for (const index of [6, 7]) motion[index * 4 + 3] = 255;

  const selected = selectMovingSubject([model], [motion], 8, 2)[0]!;

  expect(selected[0 * 4 + 3]).toBe(0);
  expect(selected[6 * 4 + 3]).toBe(255);
  expect(selected[7 * 4 + 3]).toBe(255);
});

describe('subject masks', () => {
  it('replaces frame alpha with the soft model mask', () => {
    const pixels = new Uint8ClampedArray([
      100, 50, 25, 255, 200, 150, 100, 255,
    ]);

    expect([
      ...applySubjectMask(pixels, new Uint8ClampedArray([0, 192])),
    ]).toEqual([100, 50, 25, 0, 200, 150, 100, 192]);
  });

  it('resamples a selected shot to the requested temporal depth', () => {
    const frames = [0, 100, 200].map(
      (value) => new Uint8ClampedArray([value, 0, 0, 255]),
    );

    expect(resampleFrames(frames, 5).map((frame) => frame[0])).toEqual([
      0, 50, 100, 150, 200,
    ]);
  });

  it('fades the first and last temporal slices to transparent', () => {
    const frames = Array.from(
      { length: 5 },
      () => new Uint8ClampedArray([20, 30, 40, 255]),
    );

    expect(fadeTemporalEdges(frames, 2).map((frame) => frame[3])).toEqual([
      0, 128, 255, 128, 0,
    ]);
  });

  it('uses the remover alpha for every selected frame', async () => {
    const frames = [30, 60].map(
      (value) => new Uint8ClampedArray([value, value, value, 255]),
    );
    const seen: number[] = [];

    const masked = await maskSubjectFrames(frames, 1, 1, async (pixels) => {
      seen.push(pixels[0]!);
      return new Uint8ClampedArray([pixels[0]! + 10]);
    });

    expect(seen).toEqual([30, 60]);
    expect(masked.map((frame) => frame[3])).toEqual([40, 70]);
  });

  it('keeps nearby motion details without restoring the background', () => {
    const frame = (alphas: number[]): Uint8ClampedArray =>
      new Uint8ClampedArray(alphas.flatMap((alpha) => [10, 20, 30, alpha]));
    const model = [frame([0, 255, 0, 0, 0])];
    const motion = [frame([0, 0, 220, 0, 180])];

    expect(
      [...mergeNearbyMotion(model, motion, 5, 1, 1)[0]!].filter(
        (_, index) => index % 4 === 3,
      ),
    ).toEqual([0, 255, 220, 0, 0]);
  });

  it('removes bright false positives from a dark subject mask', () => {
    const frame = new Uint8ClampedArray([40, 50, 60, 255, 210, 190, 170, 255]);

    expect([...filterSubjectContrast([frame], 120)[0]!]).toEqual([
      40, 50, 60, 255, 210, 190, 170, 0,
    ]);
  });
});
