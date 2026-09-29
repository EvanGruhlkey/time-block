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
    const position = (index * (frames.length - 1)) / (count - 1);
    const before = Math.floor(position);
    const after = Math.min(frames.length - 1, before + 1);
    const blend = position - before;
    const output = new Uint8ClampedArray(frames[before]!.length);
    for (let offset = 0; offset < output.length; offset += 1) {
      output[offset] =
        frames[before]![offset]! * (1 - blend) +
        frames[after]![offset]! * blend;
    }
    return output;
  });
}

export function fadeTemporalEdges(
  frames: Uint8ClampedArray[],
  edgeFrames: number,
): Uint8ClampedArray[] {
  if (edgeFrames <= 0) return frames.map((frame) => frame.slice());
  return frames.map((frame, index) => {
    const output = frame.slice();
    const fade = Math.min(
      1,
      index / edgeFrames,
      (frames.length - 1 - index) / edgeFrames,
    );
    for (let offset = 3; offset < output.length; offset += 4) {
      output[offset] = output[offset]! * fade;
    }
    return output;
  });
}

export function clearMaskEdges(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
  padding: number,
): Uint8ClampedArray[] {
  return frames.map((pixels) => {
    const output = pixels.slice();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (
          x >= padding &&
          x < width - padding &&
          y >= padding &&
          y < height - padding
        ) {
          continue;
        }
        output[(y * width + x) * 4 + 3] = 0;
      }
    }
    return output;
  });
}

export type SubjectRemover = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  focus?: { x: number; y: number },
) => Promise<Uint8ClampedArray>;

export async function maskSubjectFrames(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
  removeBackground: SubjectRemover,
  onFrame: (complete: number) => void = () => undefined,
  focusFrames?: Uint8ClampedArray[],
): Promise<Uint8ClampedArray[]> {
  const masked: Uint8ClampedArray[] = [];
  for (let index = 0; index < frames.length; index += 1) {
    const pixels = frames[index]!;
    const focus = focusFrames?.[index]
      ? motionFocus(focusFrames[index]!, width, height)
      : undefined;
    const mask = await removeBackground(pixels, width, height, focus);
    masked.push(applySubjectMask(pixels, mask));
    onFrame((index + 1) / frames.length);
  }
  return masked;
}

export function motionFocus(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): { x: number; y: number } {
  let weightedX = 0;
  let weightedY = 0;
  let weight = 0;
  for (
    let y = Math.floor(height * 0.08);
    y < Math.ceil(height * 0.92);
    y += 1
  ) {
    for (
      let x = Math.floor(width * 0.08);
      x < Math.ceil(width * 0.92);
      x += 1
    ) {
      const alpha = pixels[(y * width + x) * 4 + 3]!;
      if (alpha < 160) continue;
      const pixelWeight = alpha * alpha;
      weightedX += x * pixelWeight;
      weightedY += y * pixelWeight;
      weight += pixelWeight;
    }
  }
  return weight === 0
    ? { x: 0.5, y: 0.5 }
    : { x: weightedX / weight / width, y: weightedY / weight / height };
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

export function keepMovingSubject(
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
    const movingNearby = new Uint8Array(width * height);
    for (let index = 0; index < movingNearby.length; index += 1) {
      if (motion[index * 4 + 3]! < 40) continue;
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
          movingNearby[y * width + x] = 1;
        }
      }
    }
    const output = model.slice();
    for (let index = 0; index < movingNearby.length; index += 1) {
      if (!movingNearby[index]) output[index * 4 + 3] = 0;
    }
    return output;
  });
}

export function selectMovingSubject(
  modelFrames: Uint8ClampedArray[],
  motionFrames: Uint8ClampedArray[],
  width: number,
  height: number,
): Uint8ClampedArray[] {
  if (modelFrames.length !== motionFrames.length) {
    throw new Error('Subject masks have mismatched frame counts.');
  }
  return modelFrames.map((model, frameIndex) => {
    const motion = motionFrames[frameIndex]!;
    const visited = new Uint8Array(width * height);
    let best: number[] = [];
    let bestScore = 0;
    for (let start = 0; start < visited.length; start += 1) {
      if (visited[start] || model[start * 4 + 3]! < 40) continue;
      const component: number[] = [];
      const queue = [start];
      visited[start] = 1;
      let motionTotal = 0;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor]!;
        component.push(index);
        motionTotal += motion[index * 4 + 3]!;
        const x = index % width;
        const neighbors = [index - width, index + width];
        if (x > 0) neighbors.push(index - 1);
        if (x < width - 1) neighbors.push(index + 1);
        for (const neighbor of neighbors) {
          if (neighbor < 0 || neighbor >= visited.length) continue;
          if (visited[neighbor] || model[neighbor * 4 + 3]! < 40) continue;
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
      const coverage = component.length / visited.length;
      if (coverage > 0.15) continue;
      const score =
        (motionTotal / Math.max(1, component.length)) *
        Math.min(1, component.length / 12);
      if (score > bestScore) {
        bestScore = score;
        best = component;
      }
    }
    const output = model.slice();
    const keep = new Uint8Array(width * height);
    for (const index of best) keep[index] = 1;
    for (let index = 0; index < keep.length; index += 1) {
      if (!keep[index]) output[index * 4 + 3] = 0;
    }
    return output;
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
