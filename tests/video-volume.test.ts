import { describe, expect, it } from 'vitest';
import {
  buildSubjectTrail,
  buildModelTrail,
  alignSubjectFrames,
  fitVolumeDimensions,
  centerOutIndices,
  compactVisibleFrames,
  packVideoFrame,
  prepareSubjectVolume,
  sampleVideoTimes,
  stabilizationRadius,
  VIDEO_TIME_DEPTH,
} from '../src/video-volume';

describe('browser video sampling', () => {
  it('locks isolated subjects to one screen position before extrusion', () => {
    const left = new Uint8ClampedArray(3 * 4);
    const right = new Uint8ClampedArray(3 * 4);
    left.set([220, 160, 80, 255], 0);
    right.set([220, 160, 80, 255], 8);

    const aligned = alignSubjectFrames([left, right], 3, 1);

    expect(aligned.map((frame) => [...frame])).toEqual([
      [0, 0, 0, 0, 220, 160, 80, 255, 0, 0, 0, 0],
      [0, 0, 0, 0, 220, 160, 80, 255, 0, 0, 0, 0],
    ]);
  });

  it('uses an extended time axis for a readable subject trail', () => {
    expect(VIDEO_TIME_DEPTH).toBe(1.6);
  });

  it('removes undetected gaps before building the trail', () => {
    const empty = new Uint8ClampedArray([10, 20, 30, 0]);
    const subject = new Uint8ClampedArray([10, 20, 30, 255]);

    expect(compactVisibleFrames([subject, empty, subject])).toEqual([
      subject,
      subject,
    ]);
  });

  it('tracks outward from the clearest middle frame', () => {
    expect(centerOutIndices(5)).toEqual([2, 1, 3, 0, 4]);
    expect(centerOutIndices(4)).toEqual([1, 0, 2, 3]);
  });

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

  it('allows enough stabilization travel for fast camera pans', () => {
    expect(stabilizationRadius(256, 144)).toBe(26);
  });

  it('keeps a continuous maneuver across fast camera movement', async () => {
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

    expect(prepared.shot).toEqual({ start: 0, end: 7 });
    expect(prepared.voxels).toHaveLength(5 * 4);
    expect(prepared.voxels[3]).toBe(0);
    expect(prepared.voxels[19]).toBe(0);
    expect(prepared.frames).toHaveLength(5 * 4);
    expect(prepared.frames[3]).toBe(255);
    expect(prepared.frames[19]).toBe(255);
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

  it('builds the trail from moving pixels without model background fragments', () => {
    const makeFrame = (subject: number) => {
      const pixels = new Uint8ClampedArray(3 * 4);
      for (let index = 0; index < 3; index += 1) {
        pixels[index * 4] = index === subject ? 240 : 80;
        pixels[index * 4 + 1] = index === subject ? 180 : 80;
        pixels[index * 4 + 2] = index === subject ? 120 : 80;
        pixels[index * 4 + 3] = 255;
      }
      return pixels;
    };

    const trail = buildSubjectTrail(
      [makeFrame(0), makeFrame(1), makeFrame(2)],
      3,
      1,
      3,
    );

    expect(trail.map((frame) => [frame[3], frame[7], frame[11]])).toEqual([
      [0, 0, 0],
      [0, 255, 0],
      [0, 0, 0],
    ]);
  });

  it('keeps only pixels selected by the tracked subject mask', async () => {
    const frames = Array.from(
      { length: 3 },
      () => new Uint8ClampedArray(20 * 4).fill(80),
    );
    for (const frame of frames) {
      for (let offset = 3; offset < frame.length; offset += 4) frame[offset] = 255;
    }
    const focuses: Array<{ x: number; y: number } | undefined> = [];
    const trail = await buildModelTrail(
      frames,
      20,
      1,
      3,
      async (_pixels, _width, _height, focus) => {
        focuses.push(focus);
        const mask = new Uint8ClampedArray(20);
        mask[10] = 255;
        return mask;
      },
    );

    expect(trail.map((frame) => frame[10 * 4 + 3])).toEqual([0, 255, 0]);
    expect(focuses.every((focus) => focus !== undefined)).toBe(true);
  });

  it('rejects a broad static mask around a smaller moving subject', async () => {
    const makeFrame = (subject: number) => {
      const pixels = new Uint8ClampedArray(40 * 4);
      for (let index = 0; index < 40; index += 1) {
        const value = index === subject ? 240 : 60;
        pixels.set([value, value, value, 255], index * 4);
      }
      return pixels;
    };
    const frames = [20, 21, 22, 21, 20].map(makeFrame);
    const trail = await buildModelTrail(
      frames,
      40,
      1,
      5,
      async () => new Uint8ClampedArray(40).fill(255),
    );
    const middle = trail[2]!;

    expect(middle[3]).toBe(0);
    expect(middle[22 * 4 + 3]).toBe(255);
  });
});
