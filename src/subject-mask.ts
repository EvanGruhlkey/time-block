export function applySubjectMask(
  pixels: Uint8ClampedArray,
  mask: Uint8ClampedArray,
): Uint8ClampedArray {
  if (pixels.length !== mask.length * 4) {
    throw new Error('The subject mask does not match its video frame.');
  }
  const output = pixels.slice();
  for (let index = 0; index < mask.length; index += 1) {
    output[index * 4 + 3] = mask[index]!;
  }
  return output;
}

export function resampleFrames(
  frames: Uint8ClampedArray[],
  count: number,
): Uint8ClampedArray[] {
  if (frames.length === 0 || count <= 0) return [];
  if (count === 1) return [frames[0]!.slice()];
  return Array.from({ length: count }, (_, index) => {
    const source = Math.round((index * (frames.length - 1)) / (count - 1));
    return frames[source]!.slice();
  });
}

export type SubjectRemover = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) => Promise<Uint8ClampedArray>;

export async function maskSubjectFrames(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
  removeBackground: SubjectRemover,
  onFrame: (complete: number) => void = () => undefined,
): Promise<Uint8ClampedArray[]> {
  const masked: Uint8ClampedArray[] = [];
  for (let index = 0; index < frames.length; index += 1) {
    const pixels = frames[index]!;
    const mask = await removeBackground(pixels, width, height);
    masked.push(applySubjectMask(pixels, mask));
    onFrame((index + 1) / frames.length);
  }
  return masked;
}

export function mergeNearbyMotion(
  modelFrames: Uint8ClampedArray[],
  motionFrames: Uint8ClampedArray[],
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray[] {
  if (modelFrames.length !== motionFrames.length) {
    throw new Error('Subject masks have mismatched frame counts.');
  }
  return modelFrames.map((model, frameIndex) => {
    const motion = motionFrames[frameIndex]!;
    if (model.length !== motion.length) {
      throw new Error('Subject masks have mismatched dimensions.');
    }
    const merged = model.slice();
    const nearby = new Uint8Array(width * height);
    for (let index = 0; index < nearby.length; index += 1) {
      if (model[index * 4 + 3]! < 64) continue;
      const centerX = index % width;
      const centerY = Math.floor(index / width);
      for (
        let y = Math.max(0, centerY - radius);
        y <= Math.min(height - 1, centerY + radius);
        y += 1
      ) {
        for (
          let x = Math.max(0, centerX - radius);
          x <= Math.min(width - 1, centerX + radius);
          x += 1
        ) {
          nearby[y * width + x] = 1;
        }
      }
    }
    for (let index = 0; index < nearby.length; index += 1) {
      const offset = index * 4 + 3;
      if (nearby[index])
        merged[offset] = Math.max(merged[offset]!, motion[offset]!);
    }
    return merged;
  });
}

export function filterSubjectContrast(
  frames: Uint8ClampedArray[],
  maximumLuma: number,
  maximumCoverage = 0.25,
): Uint8ClampedArray[] {
  return frames.map((pixels) => {
    const output = pixels.slice();
    let foreground = 0;
    for (let offset = 3; offset < output.length; offset += 4) {
      if (output[offset]! > 32) foreground += 1;
    }
    if (foreground / (output.length / 4) <= maximumCoverage) return output;
    for (let offset = 0; offset < output.length; offset += 4) {
      const luma =
        output[offset]! * 0.299 +
        output[offset + 1]! * 0.587 +
        output[offset + 2]! * 0.114;
      if (luma > maximumLuma) output[offset + 3] = 0;
    }
    return output;
  });
}
