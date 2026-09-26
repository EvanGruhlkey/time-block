import { describe, expect, it } from 'vitest';
import {
  fitVolumeDimensions,
  packVideoFrame,
  sampleVideoTimes,
} from '../src/video-volume';

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

  it('packs canvas rows bottom-up without changing frame opacity', () => {
    const topRedBottomBlack = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 0, 0, 255,
    ]);

    expect([...packVideoFrame(topRedBottomBlack, 1, 2)]).toEqual([
      0, 0, 0, 255, 255, 0, 0, 255,
    ]);
  });

  it('keeps portrait video portrait inside the volume', () => {
    expect(fitVolumeDimensions(1080, 1920)).toEqual({
      width: 144,
      height: 256,
    });
  });

  it('keeps landscape and square video proportions', () => {
    expect(fitVolumeDimensions(1920, 1080)).toEqual({
      width: 256,
      height: 144,
    });
    expect(fitVolumeDimensions(1000, 1000)).toEqual({
      width: 256,
      height: 256,
    });
  });

  it('rejects missing intrinsic video dimensions', () => {
    expect(() => fitVolumeDimensions(0, 1080)).toThrow('dimensions');
  });
});
