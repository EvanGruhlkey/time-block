export const fixtureMetadata = {
  width: 2,
  height: 2,
  depth: 120,
  durationSeconds: 5,
  frameRate: 24,
  title: 'Fixture dancer',
  sourceUrl: 'https://example.com/fixture-dancer',
  license: 'Fixture only',
};

export const fixtureVoxels = new Uint8Array(
  fixtureMetadata.width * fixtureMetadata.height * fixtureMetadata.depth * 4,
);

for (let index = 0; index < fixtureVoxels.length; index += 4) {
  fixtureVoxels[index] = 255;
  fixtureVoxels[index + 1] = (index / 4) % 255;
  fixtureVoxels[index + 2] = 180;
  fixtureVoxels[index + 3] = 255;
}
