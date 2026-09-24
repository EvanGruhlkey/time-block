import { spawn } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import { validateMetadata, type VolumeMetadata } from '../src/volume';

const WIDTH = 256;
const HEIGHT = 144;
const FRAME_RATE = 24;
const FRAME_COUNT = 120;
const SOURCE_URL =
  'https://mixkit.co/free-stock-video/dancing-in-the-dark-1026/';
const LICENSE = 'Mixkit Stock Video Free License';

export interface BuildOptions {
  input: string;
  start: string;
  duration: number;
  output: string;
}

export function parseArgs(args: string[]): BuildOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid argument near ${flag ?? 'end of command'}`);
    }
    if (!['--input', '--start', '--duration', '--output'].includes(flag)) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    values.set(flag, value);
  }

  const input = values.get('--input');
  if (!input) throw new Error('--input is required');
  const duration = Number(values.get('--duration') ?? '5');
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('--duration must be positive');
  }

  return {
    input,
    start: values.get('--start') ?? '00:00:04.000',
    duration,
    output: values.get('--output') ?? 'public/volume',
  };
}

export async function packFrames(
  framePaths: string[],
  width: number,
  height: number,
): Promise<Uint8Array> {
  const orderedFrames = [...framePaths].sort((left, right) =>
    basename(left).localeCompare(basename(right)),
  );
  const packed = new Uint8Array(width * height * orderedFrames.length * 4);
  let offset = 0;

  for (const framePath of orderedFrames) {
    const { data, info } = await sharp(framePath)
      .toColourspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== width || info.height !== height || info.channels !== 4) {
      throw new Error(
        `Unexpected frame shape ${info.width}x${info.height}x${info.channels}`,
      );
    }

    for (let row = height - 1; row >= 0; row -= 1) {
      for (let column = 0; column < width; column += 1) {
        const index = (row * width + column) * 4;
        const light = Math.max(
          data[index]!,
          data[index + 1]!,
          data[index + 2]!,
        );
        packed[offset] = data[index]!;
        packed[offset + 1] = data[index + 1]!;
        packed[offset + 2] = data[index + 2]!;
        packed[offset + 3] = Math.round(smoothstep(8, 52, light) * 255);
        offset += 4;
      }
    }
  }

  return packed;
}

export async function buildVolume(options: BuildOptions): Promise<void> {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not provide a binary');
  const framesDirectory = await mkdtemp(join(tmpdir(), 'time-volume-frames-'));
  const outputDirectory = resolve(options.output);
  const metadata = validateMetadata({
    width: WIDTH,
    height: HEIGHT,
    depth: FRAME_COUNT,
    durationSeconds: options.duration,
    frameRate: FRAME_RATE,
    title: 'Dancing in the dark',
    sourceUrl: SOURCE_URL,
    license: LICENSE,
  } satisfies VolumeMetadata);

  try {
    await run(ffmpegPath, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      options.start,
      '-i',
      resolve(options.input),
      '-t',
      String(options.duration),
      '-vf',
      `fps=${FRAME_RATE},scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
      '-frames:v',
      String(FRAME_COUNT),
      join(framesDirectory, 'frame-%04d.png'),
    ]);

    const framePaths = (await readdir(framesDirectory))
      .filter((name) => /^frame-\d{4}\.png$/.test(name))
      .sort()
      .map((name) => join(framesDirectory, name));
    if (framePaths.length !== FRAME_COUNT) {
      throw new Error(
        `Expected ${FRAME_COUNT} frames, received ${framePaths.length}`,
      );
    }

    const voxels = await packFrames(framePaths, WIDTH, HEIGHT);
    const expectedBytes = WIDTH * HEIGHT * FRAME_COUNT * 4;
    if (voxels.byteLength !== expectedBytes) {
      throw new Error(
        `Expected ${expectedBytes} packed bytes, received ${voxels.byteLength}`,
      );
    }

    await mkdir(outputDirectory, { recursive: true });
    const volumePath = join(outputDirectory, 'dancer.rgba');
    const metadataPath = join(outputDirectory, 'metadata.json');
    const volumeTemporary = `${volumePath}.${process.pid}.tmp`;
    const metadataTemporary = `${metadataPath}.${process.pid}.tmp`;
    await writeFile(volumeTemporary, voxels);
    await writeFile(
      metadataTemporary,
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
    await rm(volumePath, { force: true });
    await rm(metadataPath, { force: true });
    await rename(volumeTemporary, volumePath);
    await rename(metadataTemporary, metadataPath);
  } finally {
    await rm(framesDirectory, { recursive: true, force: true });
  }
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const normalized = Math.min(
    1,
    Math.max(0, (value - edge0) / (edge1 - edge0)),
  );
  return normalized * normalized * (3 - 2 * normalized);
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const process = spawn(command, args, { stdio: 'inherit' });
    process.once('error', reject);
    process.once('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`ffmpeg exited with code ${String(code)}`));
    });
  });
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  buildVolume(parseArgs(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
