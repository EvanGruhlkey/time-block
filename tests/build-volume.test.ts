import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { packFrames, parseArgs } from '../scripts/build-volume';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('volume build arguments', () => {
  it('parses the reproducible production command', () => {
    expect(
      parseArgs([
        '--input',
        'assets/source/dancer.mp4',
        '--start',
        '00:00:04.000',
        '--duration',
        '5',
      ]),
    ).toEqual({
      input: 'assets/source/dancer.mp4',
      start: '00:00:04.000',
      duration: 5,
      output: 'public/volume',
    });
  });

  it('rejects missing input and non-positive duration', () => {
    expect(() => parseArgs(['--duration', '5'])).toThrow('--input is required');
    expect(() => parseArgs(['--input', 'clip.mp4', '--duration', '0'])).toThrow(
      '--duration must be positive',
    );
  });
});

describe('RGBA frame packing', () => {
  it('preserves chronology, suppresses dark pixels, and is deterministic', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'volume-frames-'));
    temporaryDirectories.push(directory);
    const first = join(directory, 'frame-0001.png');
    const second = join(directory, 'frame-0002.png');

    await sharp({
      create: {
        width: 2,
        height: 1,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toFile(first);
    await sharp({
      create: {
        width: 2,
        height: 1,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toFile(second);

    const firstBuild = await packFrames([first, second], 2, 1);
    const secondBuild = await packFrames([first, second], 2, 1);

    expect(firstBuild).toHaveLength(2 * 1 * 2 * 4);
    expect([...firstBuild.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...firstBuild.subarray(8, 12)]).toEqual([0, 0, 0, 0]);
    expect(hash(firstBuild)).toBe(hash(secondBuild));
  });

  it('stores rows bottom-up for WebGL texture coordinates', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'volume-rows-'));
    temporaryDirectories.push(directory);
    const frame = join(directory, 'frame-0001.png');
    const topRedBottomBlue = Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]);

    await sharp(topRedBottomBlue, {
      raw: { width: 1, height: 2, channels: 4 },
    })
      .png()
      .toFile(frame);

    const packed = await packFrames([frame], 1, 2);

    expect([...packed.subarray(0, 4)]).toEqual([0, 0, 255, 255]);
    expect([...packed.subarray(4, 8)]).toEqual([255, 0, 0, 255]);
  });
});

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
