import { describe, expect, it } from 'vitest';
import { packVideoFrame, sampleVideoTimes } from '../src/video-volume';

describe('browser video sampling', () => {
  it('samples 120 frames from the first five seconds', () => {
    const sampling = sampleVideoTimes(12);

    expect(sampling.durationSeconds).toBe(5);
    expect(sampling.frameRate).toBe(24);
    expect(sampling.times).toHaveLength(120);
    expect(sampling.times[0]).toBe(0);
    expect(sampling.times[119]).toBeCloseTo(119 / 24);
  });

  it('spreads 120 frames across a shorter video', () => {
    const sampling = sampleVideoTimes(2);

    expect(sampling.durationSeconds).toBe(2);
    expect(sampling.frameRate).toBe(60);
    expect(sampling.times[119]).toBeCloseTo(119 / 60);
  });

  it('rejects a video without a usable duration', () => {
    expect(() => sampleVideoTimes(0)).toThrow('usable duration');
    expect(() => sampleVideoTimes(Number.NaN)).toThrow('usable duration');
  });

  it('packs canvas rows bottom-up and removes black pixels', () => {
    const topRedBottomBlack = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 0, 0, 255,
    ]);

    expect([...packVideoFrame(topRedBottomBlack, 1, 2)]).toEqual([
      0, 0, 0, 0, 255, 0, 0, 255,
    ]);
  });
});
