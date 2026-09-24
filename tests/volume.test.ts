import { describe, expect, it } from 'vitest';
import { loadVolume, validateMetadata, VolumeLoadError } from '../src/volume';

const validMetadata = {
  width: 2,
  height: 2,
  depth: 2,
  durationSeconds: 1,
  frameRate: 2,
  title: 'Test dancer',
  sourceUrl: 'https://example.com/dancer',
  license: 'Test license',
};

function fixtureFetch(metadata: unknown, voxels: Uint8Array): typeof fetch {
  return async (input) => {
    const url = String(input);
    if (url.endsWith('metadata.json')) {
      return new Response(JSON.stringify(metadata), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(voxels.slice().buffer);
  };
}

describe('volume metadata', () => {
  it('accepts a complete metadata document', () => {
    expect(validateMetadata(validMetadata)).toEqual(validMetadata);
  });

  it('rejects missing fields', () => {
    expect(() =>
      validateMetadata({ ...validMetadata, title: undefined }),
    ).toThrow('Invalid volume metadata: title');
  });

  it('rejects non-integer dimensions', () => {
    expect(() => validateMetadata({ ...validMetadata, depth: 2.5 })).toThrow(
      'Invalid volume metadata: depth',
    );
  });

  it('rejects unsafe source protocols', () => {
    expect(() =>
      validateMetadata({ ...validMetadata, sourceUrl: 'javascript:alert(1)' }),
    ).toThrow('Invalid volume metadata: sourceUrl');
  });
});

describe('loadVolume', () => {
  it('loads a valid RGBA volume', async () => {
    const voxels = new Uint8Array(32).fill(12);

    await expect(
      loadVolume('/volume', fixtureFetch(validMetadata, voxels)),
    ).resolves.toEqual({ metadata: validMetadata, voxels });
  });

  it('rejects a truncated RGBA volume', async () => {
    const fetcher = fixtureFetch(validMetadata, new Uint8Array(31));

    await expect(loadVolume('/volume', fetcher)).rejects.toThrow(
      'Expected 32 volume bytes, received 31',
    );
  });

  it('wraps fetch failures with a stable asset error', async () => {
    const cause = new Error('offline');
    const fetcher: typeof fetch = async () => {
      throw cause;
    };

    const error = await loadVolume('/volume', fetcher).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(VolumeLoadError);
    expect(error).toMatchObject({
      message: 'The dancer volume could not be loaded.',
      cause,
    });
  });

  it('rejects unsuccessful responses', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(null, { status: 503 });

    await expect(loadVolume('/volume', fetcher)).rejects.toThrow(
      'The dancer volume could not be loaded.',
    );
  });
});
