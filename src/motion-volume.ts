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
  const isolated = isolateMotion(stabilized, width, height);
  const volume = new Uint8Array(width * height * frames.length * 4);
  let target = 0;

  for (const pixels of isolated) {
    for (let y = height - 1; y >= 0; y -= 1) {
      for (let x = 0; x < width; x += 1) {
        const source = (y * width + x) * 4;
        volume.set(pixels.subarray(source, source + 4), target);
        target += 4;
      }
    }
  }
  return volume;
}

export function isolateMotion(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
): Uint8ClampedArray[] {
  if (frames.length === 0) return [];
  const background = medianBackground(frames, width, height);
  return frames.map((pixels) => {
    const isolated = pixels.slice();
    for (let source = 0; source < pixels.length; source += 4) {
      if (pixels[source + 3] === 0) continue;
      const difference = Math.max(
        Math.abs(pixels[source]! - background[source]!),
        Math.abs(pixels[source + 1]! - background[source + 1]!),
        Math.abs(pixels[source + 2]! - background[source + 2]!),
      );
      isolated[source + 3] = Math.round(smoothstep(40, 100, difference) * 255);
    }
    return isolated;
  });
}

export function isolateTemporalMotion(
  frames: Uint8ClampedArray[],
): Uint8ClampedArray[] {
  return frames.map((pixels, frameIndex) => {
    const before = frames[frameIndex - 1];
    const after = frames[frameIndex + 1];
    const output = pixels.slice();
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const differenceBefore = before
        ? colorDifference(pixels, before, offset)
        : Number.POSITIVE_INFINITY;
      const differenceAfter = after
        ? colorDifference(pixels, after, offset)
        : Number.POSITIVE_INFINITY;
      const difference = Math.min(differenceBefore, differenceAfter);
      output[offset + 3] = Math.round(smoothstep(30, 90, difference) * 255);
    }
    return output;
  });
}

export function isolatePrimaryMotion(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
  radius = 2,
): Uint8ClampedArray[] {
  return frames.map((pixels) => {
    const active = new Uint8Array(width * height);
    for (let index = 0; index < active.length; index += 1) {
      if (pixels[index * 4 + 3]! < 40) continue;
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
          active[y * width + x] = 1;
        }
      }
    }

    const visited = new Uint8Array(active.length);
    let primary: number[] = [];
    for (let start = 0; start < active.length; start += 1) {
      if (!active[start] || visited[start]) continue;
      const component: number[] = [];
      const queue = [start];
      visited[start] = 1;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor]!;
        component.push(index);
        const x = index % width;
        const neighbors = [index - width, index + width];
        if (x > 0) neighbors.push(index - 1);
        if (x < width - 1) neighbors.push(index + 1);
        for (const neighbor of neighbors) {
          if (neighbor < 0 || neighbor >= active.length) continue;
          if (!active[neighbor] || visited[neighbor]) continue;
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
      if (component.length > primary.length) primary = component;
    }

    const keep = new Uint8Array(active.length);
    for (const index of primary) keep[index] = 1;
    const output = pixels.slice();
    for (let index = 0; index < keep.length; index += 1) {
      if (!keep[index]) output[index * 4 + 3] = 0;
    }
    return output;
  });
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

function colorDifference(
  left: Uint8ClampedArray,
  right: Uint8ClampedArray,
  offset: number,
): number {
  return Math.max(
    Math.abs(left[offset]! - right[offset]!),
    Math.abs(left[offset + 1]! - right[offset + 1]!),
    Math.abs(left[offset + 2]! - right[offset + 2]!),
  );
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const unit = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return unit * unit * (3 - 2 * unit);
}
