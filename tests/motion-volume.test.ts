import { describe, expect, it } from 'vitest';
import {
  buildMotionVolume,
  estimateTranslation,
  isolatePrimaryMotion,
  isolateMotion,
  stabilizeFrames,
  translateFrame,
} from '../src/motion-volume';

function frame(width: number, height: number, lit: Array<[number, number]>) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
  for (const [x, y] of lit) {
    const index = (y * width + x) * 4;
    pixels[index] = 255;
    pixels[index + 1] = 255;
    pixels[index + 2] = 255;
  }
  return pixels;
}

describe('motion volume preprocessing', () => {
  it('finds and removes camera translation between frames', () => {
    const reference = frame(7, 5, [
      [1, 1],
      [4, 1],
      [2, 3],
    ]);
    const shiftedRight = frame(7, 5, [
      [3, 1],
      [6, 1],
      [4, 3],
    ]);

    expect(estimateTranslation(reference, shiftedRight, 7, 5, 2)).toEqual({
      x: -2,
      y: 0,
    });
    const translated = translateFrame(shiftedRight, 7, 5, -2, 0);
    expect(translated.slice(0, 5 * 4)).toEqual(reference.slice(0, 5 * 4));
    expect(translated[(0 * 7 + 6) * 4 + 3]).toBe(0);
  });

  it('keeps a long steady pan aligned without freezing its offset', () => {
    const base = frame(15, 5, [
      [2, 1],
      [5, 1],
      [3, 3],
    ]);
    const frames = Array.from({ length: 7 }, (_, shift) =>
      translateFrame(base, 15, 5, shift, 0),
    );

    const stabilized = stabilizeFrames(frames, 15, 5, 2);
    const brightestX = stabilized.map((pixels) => {
      let best = { value: -1, x: -1 };
      for (let x = 0; x < 15; x += 1) {
        const value = pixels[(1 * 15 + x) * 4]!;
        if (value > best.value) best = { value, x };
      }
      return best.x;
    });

    expect(new Set(brightestX).size).toBe(1);
  });

  it('preserves subject proportions when a pan enlarges one axis', () => {
    const lit = Array.from({ length: 6 }, (_, y) =>
      Array.from({ length: 6 }, (_, x) => [x + 2, y + 1] as [number, number]),
    ).flat();
    const base = frame(15, 9, lit);
    const frames = Array.from({ length: 8 }, (_, shift) =>
      translateFrame(base, 15, 9, shift, 0),
    );

    const stabilized = stabilizeFrames(frames, 15, 9, 2)[0]!;
    const occupied: Array<[number, number]> = [];
    for (let y = 0; y < 9; y += 1) {
      for (let x = 0; x < 15; x += 1) {
        if (stabilized[(y * 15 + x) * 4]! > 0) occupied.push([x, y]);
      }
    }
    const xs = occupied.map(([x]) => x);
    const ys = occupied.map(([, y]) => y);
    const subjectWidth = Math.max(...xs) - Math.min(...xs) + 1;
    const subjectHeight = Math.max(...ys) - Math.min(...ys) + 1;

    expect(Math.abs(subjectWidth - subjectHeight)).toBeLessThanOrEqual(1);
  });

  it('removes a stable background but keeps a moving subject', () => {
    const first = frame(3, 2, [[0, 0]]);
    const second = frame(3, 2, [[1, 0]]);
    const third = frame(3, 2, [[2, 0]]);

    const volume = buildMotionVolume([first, second, third], 3, 2, 0);
    const alpha = Array.from(volume).filter((_, index) => index % 4 === 3);

    expect(alpha).toEqual([
      0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 255,
    ]);
  });

  it('returns transparent frames for a stable background', () => {
    const frames = [
      frame(3, 1, [[0, 0]]),
      frame(3, 1, [[1, 0]]),
      frame(3, 1, [[2, 0]]),
    ];

    const isolated = isolateMotion(frames, 3, 1);

    expect(
      isolated.map((pixels) => [pixels[3], pixels[7], pixels[11]]),
    ).toEqual([
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ]);
  });

  it('keeps the main moving subject and removes distant motion noise', () => {
    const pixels = frame(7, 3, []);
    pixels.fill(0);
    const alpha: Array<[number, number]> = [
      [1, 1],
      [2, 1],
      [2, 2],
      [6, 0],
    ];
    for (const [x, y] of alpha) pixels[(y * 7 + x) * 4 + 3] = 220;

    const isolated = isolatePrimaryMotion([pixels], 7, 3, 1)[0]!;

    expect(isolated[(1 * 7 + 1) * 4 + 3]).toBe(220);
    expect(isolated[(0 * 7 + 6) * 4 + 3]).toBe(0);
  });
});
