export interface VolumeMetadata {
  width: number;
  height: number;
  depth: number;
  durationSeconds: number;
  frameRate: number;
  title: string;
  sourceUrl: string;
  license: string;
}

export interface VolumeAsset {
  metadata: VolumeMetadata;
  voxels: Uint8Array;
  presentation?: import('./state').VolumePresentation;
}

export class VolumeLoadError extends Error {
  override readonly name = 'VolumeLoadError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const positiveFinite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

function invalid(field: string): never {
  throw new VolumeLoadError(`Invalid volume metadata: ${field}`);
}

export function validateMetadata(value: unknown): VolumeMetadata {
  if (!isRecord(value)) invalid('document');
  if (!positiveInteger(value.width)) invalid('width');
  if (!positiveInteger(value.height)) invalid('height');
  if (!positiveInteger(value.depth)) invalid('depth');
  if (!positiveFinite(value.durationSeconds)) invalid('durationSeconds');
  if (!positiveFinite(value.frameRate)) invalid('frameRate');
  if (!nonEmptyString(value.title)) invalid('title');
  if (!nonEmptyString(value.sourceUrl)) invalid('sourceUrl');
  if (!nonEmptyString(value.license)) invalid('license');

  let source: URL;
  try {
    source = new URL(value.sourceUrl);
  } catch {
    invalid('sourceUrl');
  }
  if (source.protocol !== 'https:') invalid('sourceUrl');

  return {
    width: value.width,
    height: value.height,
    depth: value.depth,
    durationSeconds: value.durationSeconds,
    frameRate: value.frameRate,
    title: value.title,
    sourceUrl: value.sourceUrl,
    license: value.license,
  };
}

export async function loadVolume(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<VolumeAsset> {
  let metadataResponse: Response;
  let volumeResponse: Response;

  try {
    [metadataResponse, volumeResponse] = await Promise.all([
      fetcher(`${baseUrl}/metadata.json`),
      fetcher(`${baseUrl}/dancer.rgba`),
    ]);
  } catch (cause) {
    throw new VolumeLoadError('The dancer volume could not be loaded.', {
      cause,
    });
  }

  if (!metadataResponse.ok || !volumeResponse.ok) {
    throw new VolumeLoadError('The dancer volume could not be loaded.');
  }

  let metadataValue: unknown;
  let buffer: ArrayBuffer;
  try {
    [metadataValue, buffer] = await Promise.all([
      metadataResponse.json() as Promise<unknown>,
      volumeResponse.arrayBuffer(),
    ]);
  } catch (cause) {
    throw new VolumeLoadError('The dancer volume could not be loaded.', {
      cause,
    });
  }

  const metadata = validateMetadata(metadataValue);
  const voxels = new Uint8Array(buffer);
  const expectedBytes = metadata.width * metadata.height * metadata.depth * 4;

  if (voxels.byteLength !== expectedBytes) {
    throw new VolumeLoadError(
      `Expected ${expectedBytes} volume bytes, received ${voxels.byteLength}`,
    );
  }

  return { metadata, voxels };
}
