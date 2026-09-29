import type { VolumeAsset } from './volume';
import {
  isolateMotion,
  isolateTemporalMotion,
  stabilizeFrames,
} from './motion-volume';
import { createModelSubjectRemover } from './background-remover';
import type { ShotRange } from './shot-detection';
import {
  fadeTemporalEdges,
  keepMovingSubject,
  maskSubjectFrames,
  resampleFrames,
  selectMovingSubject,
  type SubjectRemover,
} from './subject-mask';

const MAX_EDGE = 256;
const FRAME_COUNT = 120;
const SOURCE_FRAME_COUNT = 36;
const MAX_DURATION_SECONDS = 5;
const MASK_FRAMES = 24;
export const VIDEO_TIME_DEPTH = 1.6;

export interface VideoSampling {
  durationSeconds: number;
  frameRate: number;
  times: number[];
}

export interface VolumeDimensions {
  width: number;
  height: number;
}

export interface PreparedSubjectVolume {
  shot: ShotRange;
  voxels: Uint8Array;
  frames: Uint8Array;
}

export function stabilizationRadius(width: number, height: number): number {
  const edge = Math.min(width, height);
  return Math.min(Math.floor((edge - 1) / 2), Math.round(edge * 0.18));
}

export function centerOutIndices(count: number): number[] {
  if (count <= 0) return [];
  const center = Math.floor((count - 1) / 2);
  const indices = [center];
  for (let distance = 1; indices.length < count; distance += 1) {
    if (center - distance >= 0) indices.push(center - distance);
    if (center + distance < count) indices.push(center + distance);
  }
  return indices;
}

export function compactVisibleFrames(
  frames: Uint8ClampedArray[],
): Uint8ClampedArray[] {
  return frames.filter((frame) => {
    for (let offset = 3; offset < frame.length; offset += 4) {
      if (frame[offset]! > 32) return true;
    }
    return false;
  });
}

export function buildSubjectTrail(
  stabilizedFrames: Uint8ClampedArray[],
  width: number,
  height: number,
  depth: number,
): Uint8ClampedArray[] {
  const isolated = isolateMotion(stabilizedFrames, width, height);
  return fadeTemporalEdges(
    resampleFrames(isolated, depth),
    Math.max(1, Math.round(depth * 0.08)),
  );
}

export async function buildModelTrail(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
  depth: number,
  removeBackground: SubjectRemover,
  onProgress: (progress: number) => void = () => undefined,
): Promise<Uint8ClampedArray[]> {
  const motion = isolateTemporalMotion(frames);
  const order = centerOutIndices(frames.length);
  const orderedFrames = order.map((index) => frames[index]!);
  const orderedMotion = order.map((index) => motion[index]!);
  const orderedMasks = await maskSubjectFrames(
    orderedFrames,
    width,
    height,
    removeBackground,
    onProgress,
    orderedMotion,
  );
  const masked = Array<Uint8ClampedArray>(frames.length);
  order.forEach((frameIndex, orderIndex) => {
    masked[frameIndex] = orderedMasks[orderIndex]!;
  });
  const moving = selectMovingSubject(
    keepMovingSubject(masked, motion, width, height, 1),
    motion,
    width,
    height,
  );
  const refined = masked.map((frame, index) => {
    let foreground = 0;
    for (let offset = 3; offset < frame.length; offset += 4) {
      if (frame[offset]! > 32) foreground += 1;
    }
    return foreground / (frame.length / 4) > 0.15 ? moving[index]! : frame;
  });
  const visible = compactVisibleFrames(refined);
  const trailFrames = visible.length >= 2 ? visible : refined;
  return fadeTemporalEdges(
    resampleFrames(trailFrames, depth),
    Math.max(1, Math.round(depth * 0.08)),
  );
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
  const frameRate = SOURCE_FRAME_COUNT / durationSeconds;
  return {
    durationSeconds,
    frameRate,
    times: Array.from(
      { length: SOURCE_FRAME_COUNT },
      (_, index) => index / frameRate,
    ),
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

export async function prepareSubjectVolume(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
  depth: number,
  removeBackground: SubjectRemover = createModelSubjectRemover(),
  onProgress: (progress: number) => void = () => undefined,
): Promise<PreparedSubjectVolume> {
  const shot = { start: 0, end: frames.length };
  const selected = frames.slice(shot.start, shot.end);
  const stabilized = stabilizeFrames(
    selected,
    width,
    height,
    stabilizationRadius(width, height),
  );
  const inferenceFrames = resampleFrames(
    stabilized,
    Math.min(MASK_FRAMES, stabilized.length),
  );
  let sampledTrail: Uint8ClampedArray[];
  try {
    sampledTrail = await buildModelTrail(
      inferenceFrames,
      width,
      height,
      depth,
      removeBackground,
      onProgress,
    );
  } catch {
    sampledTrail = buildSubjectTrail(stabilized, width, height, depth);
  }
  const sampledFrames = resampleFrames(stabilized, depth);
  const voxels = new Uint8Array(width * height * depth * 4);
  const fullFrames = new Uint8Array(voxels.length);
  sampledTrail.forEach((pixels, index) => {
    voxels.set(packVideoFrame(pixels, width, height), index * pixels.length);
    fullFrames.set(
      packVideoFrame(sampledFrames[index]!, width, height),
      index * pixels.length,
    );
  });
  onProgress(1);
  return { shot, voxels, frames: fullFrames };
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

    const frames: Uint8ClampedArray[] = [];
    for (let index = 0; index < sampling.times.length; index += 1) {
      await seek(video, sampling.times[index]!);
      context.drawImage(video, 0, 0, width, height);
      const frame = context.getImageData(0, 0, width, height);
      frames.push(frame.data);
      onProgress(((index + 1) / sampling.times.length) * 0.35);
    }
    const prepared = await prepareSubjectVolume(
      frames,
      width,
      height,
      FRAME_COUNT,
      createModelSubjectRemover(),
      (progress) => onProgress(0.35 + progress * 0.65),
    );
    const shotFrameCount = prepared.shot.end - prepared.shot.start;
    const shotDuration = shotFrameCount / sampling.frameRate;
    onProgress(1);

    return {
      metadata: {
        width,
        height,
        depth: FRAME_COUNT,
        durationSeconds: shotDuration,
        frameRate: FRAME_COUNT / shotDuration,
        title: file.name,
        sourceUrl: 'https://local.invalid/user-video',
        license: 'User-provided local file',
      },
      voxels: prepared.voxels,
      frames: prepared.frames,
      presentation: { timeDepth: VIDEO_TIME_DEPTH },
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
