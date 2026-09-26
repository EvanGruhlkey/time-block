import type { VolumeAsset } from './volume';

const MAX_EDGE = 256;
const FRAME_COUNT = 120;
const MAX_DURATION_SECONDS = 5;

export interface VideoSampling {
  durationSeconds: number;
  frameRate: number;
  times: number[];
}

export interface VolumeDimensions {
  width: number;
  height: number;
}

export function fitVolumeDimensions(
  videoWidth: number,
  videoHeight: number,
): VolumeDimensions {
  if (videoWidth <= 0 || videoHeight <= 0) {
    throw new Error('The selected video does not have usable dimensions.');
  }
  const scale = MAX_EDGE / Math.max(videoWidth, videoHeight);
  return {
    width: Math.max(1, Math.round(videoWidth * scale)),
    height: Math.max(1, Math.round(videoHeight * scale)),
  };
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
      packed[offset] = pixels[index]!;
      packed[offset + 1] = pixels[index + 1]!;
      packed[offset + 2] = pixels[index + 2]!;
      packed[offset + 3] = pixels[index + 3]!;
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
    const { width, height } = fitVolumeDimensions(
      video.videoWidth,
      video.videoHeight,
    );
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas video processing is unavailable.');

    const voxels = new Uint8Array(width * height * FRAME_COUNT * 4);
    for (let index = 0; index < sampling.times.length; index += 1) {
      await seek(video, sampling.times[index]!);
      context.drawImage(video, 0, 0, width, height);
      const frame = context.getImageData(0, 0, width, height);
      const packed = packVideoFrame(frame.data, width, height);
      voxels.set(packed, index * width * height * 4);
      onProgress((index + 1) / FRAME_COUNT);
    }

    return {
      metadata: {
        width,
        height,
        depth: FRAME_COUNT,
        durationSeconds: sampling.durationSeconds,
        frameRate: sampling.frameRate,
        title: file.name,
        sourceUrl: 'https://local.invalid/user-video',
        license: 'User-provided local file',
      },
      voxels,
      presentation: { timeDepth: 1 },
    };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
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
