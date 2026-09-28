import { describe, expect, it } from 'vitest';
import { selectActionShot } from '../src/shot-detection';

function solidFrame(value: number, width = 4, height = 2) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels.fill(value, offset, offset + 3);
    pixels[offset + 3] = 255;
  }
  return pixels;
}

describe('shot detection', () => {
  it('keeps the longest continuous shot between hard cuts', () => {
    const frames = [
      solidFrame(10),
      solidFrame(12),
      solidFrame(220),
      solidFrame(218),
      solidFrame(216),
      solidFrame(40),
      solidFrame(42),
    ];

    expect(selectActionShot(frames, 4, 2)).toEqual({ start: 0, end: 2 });
  });

  it('does not mistake ordinary frame motion for a new shot', () => {
    const frames = [20, 30, 40, 50].map((value) => solidFrame(value));

    expect(selectActionShot(frames, 4, 2)).toEqual({ start: 0, end: 4 });
  });

  it('prefers a shorter active shot over a longer quiet shot', () => {
    const frames = [10, 35, 10, 220, 222, 220, 222].map((value) =>
      solidFrame(value),
    );

    expect(selectActionShot(frames, 4, 2, 100)).toEqual({ start: 0, end: 3 });
  });
});
