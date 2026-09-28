import {
  SelfieSegmentation,
  type Results,
} from '@mediapipe/selfie_segmentation';
import type { SubjectRemover } from './subject-mask';

const CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/';
let segmenterPromise: Promise<SelfieSegmentation> | null = null;
let resolveResult: ((results: Results) => void) | null = null;
let inferenceQueue = Promise.resolve();

export function createModelSubjectRemover(): SubjectRemover {
  return (pixels, width, height) => {
    const inference = inferenceQueue.then(() =>
      removeSubject(pixels, width, height),
    );
    inferenceQueue = inference.then(
      () => undefined,
      () => undefined,
    );
    return inference;
  };
}

async function removeSubject(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Uint8ClampedArray> {
  segmenterPromise ??= createSegmenter();
  const segmenter = await segmenterPromise;
  const input = document.createElement('canvas');
  input.width = width;
  input.height = height;
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  source
    .getContext('2d')!
    .putImageData(
      new ImageData(new Uint8ClampedArray(pixels), width, height),
      0,
      0,
    );
  const cropX = Math.round(width * 0.275);
  const cropWidth = width - cropX * 2;
  const cropY = Math.round(height * 0.1);
  const cropHeight = height - cropY * 2;
  input
    .getContext('2d')!
    .drawImage(
      source,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      width,
      height,
    );
  const result = new Promise<Results>((resolve) => {
    resolveResult = resolve;
  });
  await segmenter.send({ image: input });
  const { segmentationMask } = await result;
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(
    segmentationMask,
    0,
    0,
    width,
    height,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
  );
  const rgba = context.getImageData(0, 0, width, height).data;
  const mask = new Uint8ClampedArray(width * height);
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = rgba[index * 4]!;
  }
  return mask;
}

async function createSegmenter(): Promise<SelfieSegmentation> {
  const segmenter = new SelfieSegmentation({
    locateFile: (file) => `${CDN}${file}`,
  });
  segmenter.setOptions({ modelSelection: 1, selfieMode: false });
  segmenter.onResults((results) => {
    resolveResult?.(results);
    resolveResult = null;
  });
  await segmenter.initialize();
  return segmenter;
}
