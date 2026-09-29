import {
  FilesetResolver,
  InteractiveSegmenter,
  ObjectDetector,
  type Detection,
  type RegionOfInterest,
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

export function createModelSubjectRemover(): SubjectRemover {
  const point = { x: 0.5, y: 0.5 };
  return (pixels, width, height) => {
    const inference = inferenceQueue.then(() =>
      segmentScene(pixels, width, height, point),
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
  detectorPromise ??= createDetector();
  const detector = await detectorPromise;
  const detections = detector.detect(canvas).detections;
  const region = chooseDetectionRegion(detections, width, height, point);
  const result = segmenter.segment(canvas, region);
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

async function createDetector(): Promise<ObjectDetector> {
  visionPromise ??= FilesetResolver.forVisionTasks(WASM);
  const vision = await visionPromise;
  return ObjectDetector.createFromOptions(vision, {
    baseOptions: { modelAssetPath: DETECTOR_MODEL },
    scoreThreshold: 0.2,
    runningMode: 'IMAGE',
  });
}

function chooseDetectionRegion(
  detections: Detection[],
  width: number,
  height: number,
  focus: { x: number; y: number },
): RegionOfInterest {
  let best: Detection | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  const people = detections.filter((detection) =>
    detection.categories.some(
      (category) => category.categoryName.toLowerCase() === 'person',
    ),
  );
  for (const detection of people.length > 0 ? people : detections) {
    const box = detection.boundingBox;
    const confidence = detection.categories[0]?.score ?? 0;
    if (!box) continue;
    const x = (box.originX + box.width / 2) / width;
    const y = (box.originY + box.height / 2) / height;
    const distance = Math.hypot(x - focus.x, y - focus.y);
    const area = (box.width * box.height) / (width * height);
    const score = confidence - distance * 0.75 - area * 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = detection;
    }
  }
  const box = best?.boundingBox;
  if (!box) return { keypoint: focus };
  const x = (box.originX + box.width / 2) / width;
  const centerY = (box.originY + box.height / 2) / height;
  const verticalOffset = box.height / height / 5;
  return {
    scribble: [
      { x, y: centerY - verticalOffset },
      { x, y: centerY },
      { x, y: centerY + verticalOffset },
    ],
  };
}
