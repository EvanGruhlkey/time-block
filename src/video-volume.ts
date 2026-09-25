import type { VolumeAsset } from './volume';

const WIDTH = 256;
const HEIGHT = 144;
const FRAME_COUNT = 120;
const MAX_DURATION_SECONDS = 5;

export interface VideoSampling {
  durationSeconds: number;
  frameRate: number;
  times: number[];
}

export function sampleVideoTimes(duration: number): VideoSampling {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('The selected video does not have a usable duration.');
  }
  const durationSeconds = Math.min(duration, MAX_DURATION_SECONDS);
  const frameRate = FRAME_COUNT / durationSeconds;
  return {
    durationSeconds,
    frameRate,
    times: Array.from({ length: FRAME_COUNT }, (_, index) => index / frameRate),
  };
}

export function packVideoFrame(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  if (pixels.length !== width * height * 4) {
    throw new Error('The decoded video frame has an unexpected size.');
  }
  const packed = new Uint8Array(pixels.length);
  let offset = 0;
  for (let row = height - 1; row >= 0; row -= 1) {
    for (let column = 0; column < width; column += 1) {
      const index = (row * width + column) * 4;
      const light = Math.max(
        pixels[index]!,
        pixels[index + 1]!,
        pixels[index + 2]!,
      );
      packed[offset] = pixels[index]!;
      packed[offset + 1] = pixels[index + 1]!;
      packed[offset + 2] = pixels[index + 2]!;
      packed[offset + 3] = Math.round(smoothstep(8, 52, light) * 255);
      offset += 4;
    }
  }
  return packed;
}

export async function buildVolumeFromVideo(
  file: File,
  onProgress: (progress: number) => void = () => undefined,
): Promise<VolumeAsset> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;

  try {
    await mediaEvent(video, 'loadedmetadata');
    const sampling = sampleVideoTimes(video.duration);
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas video processing is unavailable.');

    const voxels = new Uint8Array(WIDTH * HEIGHT * FRAME_COUNT * 4);
    for (let index = 0; index < sampling.times.length; index += 1) {
      await seek(video, sampling.times[index]!);
      drawContainedFrame(context, video);
      const frame = context.getImageData(0, 0, WIDTH, HEIGHT);
      voxels.set(
        packVideoFrame(frame.data, WIDTH, HEIGHT),
        index * WIDTH * HEIGHT * 4,
      );
      onProgress((index + 1) / FRAME_COUNT);
    }

    return {
      metadata: {
        width: WIDTH,
        height: HEIGHT,
        depth: FRAME_COUNT,
        durationSeconds: sampling.durationSeconds,
        frameRate: sampling.frameRate,
        title: file.name,
        sourceUrl: 'https://local.invalid/user-video',
        license: 'User-provided local file',
      },
      voxels,
    };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

function drawContainedFrame(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
): void {
  context.fillStyle = '#000';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  const scale = Math.min(WIDTH / video.videoWidth, HEIGHT / video.videoHeight);
  const width = video.videoWidth * scale;
  const height = video.videoHeight * scale;
  context.drawImage(
    video,
    (WIDTH - width) / 2,
    (HEIGHT - height) / 2,
    width,
    height,
  );
}

function mediaEvent(
  video: HTMLVideoElement,
  event: 'loadedmetadata',
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      video.removeEventListener(event, loaded);
      video.removeEventListener('error', failed);
    };
    const loaded = (): void => {
      cleanup();
      resolve();
    };
    const failed = (): void => {
      cleanup();
      reject(new Error('The selected video could not be decoded.'));
    };
    video.addEventListener(event, loaded, { once: true });
    video.addEventListener('error', failed, { once: true });
    video.load();
  });
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  if (
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    Math.abs(video.currentTime - time) < 0.0001
  ) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      video.removeEventListener('seeked', complete);
      video.removeEventListener('error', failed);
    };
    const complete = (): void => {
      cleanup();
      resolve();
    };
    const failed = (): void => {
      cleanup();
      reject(new Error('The selected video could not be decoded.'));
    };
    video.addEventListener('seeked', complete, { once: true });
    video.addEventListener('error', failed, { once: true });
    video.currentTime = time;
  });
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const normalized = Math.min(
    1,
    Math.max(0, (value - edge0) / (edge1 - edge0)),
  );
  return normalized * normalized * (3 - 2 * normalized);
}
