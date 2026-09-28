export interface ShotRange {
  start: number;
  end: number;
}

export function selectActionShot(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
  cutThreshold = 45,
): ShotRange {
  if (frames.length === 0) return { start: 0, end: 0 };
  const cuts = [0];
  for (let index = 1; index < frames.length; index += 1) {
    if (
      frameDifference(frames[index - 1]!, frames[index]!, width, height) >=
      cutThreshold
    ) {
      cuts.push(index);
    }
  }
  cuts.push(frames.length);

  let selected = { start: 0, end: 0 };
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const candidate = { start: cuts[index]!, end: cuts[index + 1]! };
    let activity = 0;
    for (let frame = candidate.start + 1; frame < candidate.end; frame += 1) {
      activity += frameDifference(
        frames[frame - 1]!,
        frames[frame]!,
        width,
        height,
      );
    }
    const length = candidate.end - candidate.start;
    const score = activity / Math.max(1, length - 1) + length * 0.001;
    if (score > bestScore * 1.1) {
      bestScore = score;
      selected = candidate;
    }
  }
  return selected;
}

function frameDifference(
  first: Uint8ClampedArray,
  second: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 32));
  let difference = 0;
  let samples = 0;
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const offset = (y * width + x) * 4;
      difference += Math.abs(luma(first, offset) - luma(second, offset));
      samples += 1;
    }
  }
  return difference / Math.max(1, samples);
}

function luma(pixels: Uint8ClampedArray, offset: number): number {
  return (
    pixels[offset]! * 0.299 +
    pixels[offset + 1]! * 0.587 +
    pixels[offset + 2]! * 0.114
  );
}
