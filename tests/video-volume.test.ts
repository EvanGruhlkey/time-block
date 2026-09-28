import { describe, expect, it } from 'vitest';
import {
  fitVolumeDimensions,
  packVideoFrame,
  prepareSubjectVolume,
  sampleVideoTimes,
} from '../src/video-volume';

describe('browser video sampling', () => {
  it('samples 36 source frames from the first five seconds', () => {
    const sampling = sampleVideoTimes(12);

    expect(sampling.durationSeconds).toBe(5);
    expect(sampling.frameRate).toBe(7.2);
    expect(sampling.times).toHaveLength(36);
    expect(sampling.times[0]).toBe(0);
    expect(sampling.times[35]).toBeCloseTo(35 / 7.2);
  });

  it('spreads 36 source frames across a shorter video', () => {
    const sampling = sampleVideoTimes(2);

    expect(sampling.durationSeconds).toBe(2);
    expect(sampling.frameRate).toBe(18);
    expect(sampling.times[35]).toBeCloseTo(35 / 18);
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

  it('builds temporal depth from only the longest camera shot', async () => {
    const frames = [10, 12, 220, 218, 216, 40, 42].map(
      (value) => new Uint8ClampedArray([value, value, value, 255]),
    );
    const prepared = await prepareSubjectVolume(
      frames,
      1,
      1,
      5,
      async () => new Uint8ClampedArray([255]),
    );

    expect(prepared.shot).toEqual({ start: 0, end: 2 });
    expect(prepared.voxels).toHaveLength(5 * 4);
  });

  it('preserves output depth after preprocessing fewer source frames', async () => {
    const frames = Array.from(
      { length: 40 },
      (_, value) => new Uint8ClampedArray([value, value, value, 255]),
    );
    const prepared = await prepareSubjectVolume(
      frames,
      1,
      1,
      120,
      async () => new Uint8ClampedArray([255]),
    );

    expect(prepared.voxels).toHaveLength(120 * 4);
  });
});
