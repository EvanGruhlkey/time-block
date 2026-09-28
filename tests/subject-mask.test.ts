import { describe, expect, it } from 'vitest';
import {
  applySubjectMask,
  filterSubjectContrast,
  maskSubjectFrames,
  mergeNearbyMotion,
  resampleFrames,
} from '../src/subject-mask';

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
    const frames = [0, 1, 2].map(
      (value) => new Uint8ClampedArray([value, 0, 0, 255]),
    );

    expect(resampleFrames(frames, 5).map((frame) => frame[0])).toEqual([
      0, 1, 1, 2, 2,
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
