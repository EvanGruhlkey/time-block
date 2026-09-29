import {
  FilesetResolver,
  InteractiveSegmenter,
  ObjectDetector,
  type Detection,
} from '@mediapipe/tasks-vision';
import type { SubjectRemover } from './subject-mask';

const VERSION = '0.10.35';
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite';
const DETECTOR_MODEL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite';
let visionPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null =
  null;
let segmenterPromise: Promise<InteractiveSegmenter> | null = null;
let detectorPromise: Promise<ObjectDetector> | null = null;
let inferenceQueue = Promise.resolve();

export interface SubjectBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export function chooseSubjectBox(
  boxes: SubjectBox[],
  focus: { x: number; y: number },
  maximumDistance = Number.POSITIVE_INFINITY,
): SubjectBox | undefined {
  let best: SubjectBox | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const box of boxes) {
    const area = box.width * box.height;
    if (area <= 0 || area > 0.35) continue;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const distance = Math.hypot(centerX - focus.x, centerY - focus.y);
    if (distance > maximumDistance) continue;
    const score = box.confidence * Math.sqrt(area) - distance * 0.35;
    if (score > bestScore) {
      best = box;
      bestScore = score;
    }
  }
  return best;
}

export function clipMaskToSubject(
  confidence: Uint8ClampedArray,
  width: number,
  height: number,
  box?: SubjectBox,
): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(confidence.length);
  if (!box) return mask;
  for (let index = 0; index < confidence.length; index += 1) {
    const x = (index % width) / width;
    const y = Math.floor(index / width) / height;
    const inside =
      x >= box.x - box.width * 0.18 &&
      x <= box.x + box.width * 1.18 &&
      y >= box.y - box.height * 0.18 &&
      y <= box.y + box.height * 1.18;
    mask[index] = inside ? confidence[index]! : 0;
  }
  return mask;
}

export function createModelSubjectRemover(): SubjectRemover {
  const point = { x: 0.5, y: 0.5 };
  let trackedBox: SubjectBox | undefined;
  return (pixels, width, height, focus = point) => {
    const inference = inferenceQueue.then(() =>
      segmentScene(pixels, width, height, focus, trackedBox),
    );
    inferenceQueue = inference.then(
      () => undefined,
      () => undefined,
    );
    return inference.then(({ mask, box }) => {
      trackedBox = box ?? trackedBox;
      return mask;
    });
  };
}

async function segmentScene(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  point: { x: number; y: number },
  trackedBox?: SubjectBox,
): Promise<{ mask: Uint8ClampedArray; box?: SubjectBox }> {
  segmenterPromise ??= createSegmenter();
  const segmenter = await segmenterPromise;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas
    .getContext('2d')!
    .putImageData(new ImageData(pixels.slice(), width, height), 0, 0);
  detectorPromise ??= createDetector();
  const detections = (await detectorPromise).detect(canvas).detections;
  const people = detections.filter((detection) =>
    detection.categories.some(
      (category) => category.categoryName.toLowerCase() === 'person',
    ),
  );
  const trackedFocus = trackedBox
    ? {
        x: trackedBox.x + trackedBox.width / 2,
        y: trackedBox.y + trackedBox.height / 2,
      }
    : point;
  const boxes = detectionBoxes(
    people.length > 0 ? people : detections,
    width,
    height,
  );
  const detectedBox = chooseSubjectBox(
    boxes,
    trackedFocus,
    trackedBox ? 0.22 : Number.POSITIVE_INFINITY,
  );
  const box = detectedBox;
  if (!box) {
    return { mask: new Uint8ClampedArray(width * height) };
  }
  const region = {
    keypoint: {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    },
  };
  const result = segmenter.segment(canvas, region);
  const confidence = result.confidenceMasks?.at(-1)?.getAsFloat32Array();
  if (!confidence) throw new Error('Scene segmentation did not return a mask.');
  const confidenceBytes = new Uint8ClampedArray(confidence.length);
  for (let index = 0; index < confidence.length; index += 1) {
    confidenceBytes[index] = Math.round(confidence[index]! * 255);
  }
  result.close();
  return {
    mask: clipMaskToSubject(confidenceBytes, width, height, box),
    box,
  };
}

function detectionBoxes(
  detections: Detection[],
  width: number,
  height: number,
): SubjectBox[] {
  return detections.flatMap((detection) => {
    const box = detection.boundingBox;
    if (!box) return [];
    return [
      {
        x: box.originX / width,
        y: box.originY / height,
        width: box.width / width,
        height: box.height / height,
        confidence: detection.categories[0]?.score ?? 0,
      },
    ];
  });
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

async function createDetector(): Promise<ObjectDetector> {
  visionPromise ??= FilesetResolver.forVisionTasks(WASM);
  const vision = await visionPromise;
  return ObjectDetector.createFromOptions(vision, {
    baseOptions: { modelAssetPath: DETECTOR_MODEL },
    scoreThreshold: 0.18,
    runningMode: 'IMAGE',
  });
}

