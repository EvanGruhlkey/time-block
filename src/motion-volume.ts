export interface Translation {
  x: number;
  y: number;
}

export function estimateTranslation(
  reference: Uint8ClampedArray,
  current: Uint8ClampedArray,
  width: number,
  height: number,
  maxShift: number,
): Translation {
  let best = { x: 0, y: 0 };
  let bestScore = Number.POSITIVE_INFINITY;
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 48));

  for (let yShift = -maxShift; yShift <= maxShift; yShift += 1) {
    for (let xShift = -maxShift; xShift <= maxShift; xShift += 1) {
      let error = 0;
      let samples = 0;
      for (let y = 0; y < height; y += stride) {
        const sourceY = y - yShift;
        if (sourceY < 0 || sourceY >= height) continue;
        for (let x = 0; x < width; x += stride) {
          const sourceX = x - xShift;
          if (sourceX < 0 || sourceX >= width) continue;
          const left = (y * width + x) * 4;
          const right = (sourceY * width + sourceX) * 4;
          const difference = luma(reference, left) - luma(current, right);
          error += Math.min(difference * difference, 900);
          samples += 1;
        }
      }
      const score =
        error / Math.max(1, samples) +
        (Math.abs(xShift) + Math.abs(yShift)) * 0.01;
      if (score < bestScore) {
        bestScore = score;
        best = { x: xShift, y: yShift };
      }
    }
  }
  return best;
}

export function translateFrame(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  xShift: number,
  yShift: number,
): Uint8ClampedArray {
  const translated = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < height; y += 1) {
    const sourceY = y - yShift;
    for (let x = 0; x < width; x += 1) {
      const sourceX = x - xShift;
      if (sourceX < 0 || sourceX >= width || sourceY < 0 || sourceY >= height) {
        continue;
      }
      const source = (sourceY * width + sourceX) * 4;
      translated.set(pixels.subarray(source, source + 4), (y * width + x) * 4);
    }
  }
  return translated;
}

export function stabilizeFrames(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
  maxShift: number,
): Uint8ClampedArray[] {
  if (frames.length === 0) return [];
  const offsets: Translation[] = [{ x: 0, y: 0 }];
  let totalX = 0;
  let totalY = 0;

  for (let index = 1; index < frames.length; index += 1) {
    const shift = estimateTranslation(
      frames[index - 1]!,
      frames[index]!,
      width,
      height,
      maxShift,
    );
    totalX += shift.x;
    totalY += shift.y;
    offsets.push({ x: totalX, y: totalY });
  }

  const minimumX = Math.min(0, ...offsets.map(({ x }) => x));
  const maximumX = Math.max(0, ...offsets.map(({ x }) => x));
  const minimumY = Math.min(0, ...offsets.map(({ y }) => y));
  const maximumY = Math.max(0, ...offsets.map(({ y }) => y));
  const panoramaWidth = width + maximumX - minimumX;
  const panoramaHeight = height + maximumY - minimumY;

  return frames.map((pixels, index) => {
    const { x, y } = offsets[index]!;
    return placeInPanorama(
      pixels,
      width,
      height,
      x - minimumX,
      y - minimumY,
      panoramaWidth,
      panoramaHeight,
    );
  });
}

export function buildMotionVolume(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
  maxShift = 10,
): Uint8Array {
  const stabilized = stabilizeFrames(frames, width, height, maxShift);
  if (stabilized.length === 0) return new Uint8Array();
  const background = medianBackground(stabilized, width, height);
  const volume = new Uint8Array(width * height * frames.length * 4);
  let target = 0;

  for (const pixels of stabilized) {
    for (let y = height - 1; y >= 0; y -= 1) {
      for (let x = 0; x < width; x += 1) {
        const source = (y * width + x) * 4;
        if (pixels[source + 3] === 0) {
          target += 4;
          continue;
        }
        const difference = Math.max(
          Math.abs(pixels[source]! - background[source]!),
          Math.abs(pixels[source + 1]! - background[source + 1]!),
          Math.abs(pixels[source + 2]! - background[source + 2]!),
        );
        volume[target] = pixels[source]!;
        volume[target + 1] = pixels[source + 1]!;
        volume[target + 2] = pixels[source + 2]!;
        volume[target + 3] = Math.round(smoothstep(40, 100, difference) * 255);
        target += 4;
      }
    }
  }
  return volume;
}

function placeInPanorama(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  panoramaWidth: number,
  panoramaHeight: number,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(pixels.length);
  const scale = Math.max(panoramaWidth / width, panoramaHeight / height);
  const paddingX = (width * scale - panoramaWidth) / 2;
  const paddingY = (height * scale - panoramaHeight) / 2;
  for (let y = 0; y < height; y += 1) {
    const panoramaY = Math.floor((y + 0.5) * scale - paddingY);
    const sourceY = panoramaY - offsetY;
    if (sourceY < 0 || sourceY >= height) continue;
    for (let x = 0; x < width; x += 1) {
      const panoramaX = Math.floor((x + 0.5) * scale - paddingX);
      const sourceX = panoramaX - offsetX;
      if (sourceX < 0 || sourceX >= width) continue;
      const source = (sourceY * width + sourceX) * 4;
      output.set(pixels.subarray(source, source + 4), (y * width + x) * 4);
    }
  }
  return output;
}

function medianBackground(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
): Uint8ClampedArray {
  const background = new Uint8ClampedArray(width * height * 4);
  const interval = Math.max(1, Math.floor(frames.length / 15));
  const sampled = frames
    .filter((_, index) => index % interval === 0)
    .slice(0, 15);
  for (let offset = 0; offset < background.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const values = sampled
        .filter((frame) => frame[offset + 3]! > 0)
        .map((frame) => frame[offset + channel]!)
        .sort((left, right) => left - right);
      background[offset + channel] = values[Math.floor(values.length / 2)] ?? 0;
    }
    background[offset + 3] = 255;
  }
  return background;
}

function luma(pixels: Uint8ClampedArray, offset: number): number {
  return (
    pixels[offset]! * 0.299 +
    pixels[offset + 1]! * 0.587 +
    pixels[offset + 2]! * 0.114
  );
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const unit = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return unit * unit * (3 - 2 * unit);
}
