import {
  FilesetResolver,
  InteractiveSegmenter,
} from '@mediapipe/tasks-vision';
import type { SubjectRemover } from './subject-mask';

const VERSION = '0.10.35';
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite';
let visionPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null =
  null;
let segmenterPromise: Promise<InteractiveSegmenter> | null = null;
let inferenceQueue = Promise.resolve();

export function createModelSubjectRemover(): SubjectRemover {
  const point = { x: 0.5, y: 0.5 };
  return (pixels, width, height, focus = point) => {
    const inference = inferenceQueue.then(() =>
      segmentScene(pixels, width, height, focus),
    );
    inferenceQueue = inference.then(
      () => undefined,
      () => undefined,
    );
    return inference;
  };
}

async function segmentScene(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  point: { x: number; y: number },
): Promise<Uint8ClampedArray> {
  segmenterPromise ??= createSegmenter();
  const segmenter = await segmenterPromise;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas
    .getContext('2d')!
    .putImageData(new ImageData(pixels.slice(), width, height), 0, 0);
  const result = segmenter.segment(canvas, { keypoint: point });
  const confidence = result.confidenceMasks?.at(-1)?.getAsFloat32Array();
  if (!confidence) throw new Error('Scene segmentation did not return a mask.');
  const mask = new Uint8ClampedArray(confidence.length);
  for (let index = 0; index < confidence.length; index += 1) {
    mask[index] = Math.round(confidence[index]! * 255);
  }
  result.close();
  return mask;
}

async function createSegmenter(): Promise<InteractiveSegmenter> {
  visionPromise ??= FilesetResolver.forVisionTasks(WASM);
  const vision = await visionPromise;
  return InteractiveSegmenter.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL },
    outputCategoryMask: false,
    outputConfidenceMasks: true,
    runningMode: 'IMAGE',
  });
}

