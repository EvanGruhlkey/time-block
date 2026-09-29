import { describe, expect, it } from 'vitest';
import { timeBlockTransform } from '../src/renderer';
import fragmentShader from '../src/shaders/volume.frag?raw';

describe('space-time block geometry', () => {
  it('keeps the complete block depth while conversion starts', () => {
    expect(timeBlockTransform(0, 120, 1)).toEqual({
      conversionDepth: 0.5 / 120,
      scaleDepth: 1,
      positionDepth: 0,
    });
  });

  it('shows the complete time block at the end of the timeline', () => {
    expect(timeBlockTransform(119, 120, 1)).toEqual({
      conversionDepth: 119.5 / 120,
      scaleDepth: 1,
      positionDepth: 0,
    });
  });

  it('converts rectangular frames into persistent trail slices', () => {
    expect(fragmentShader).toContain('uniform sampler3D uTrail;');
    expect(fragmentShader).toContain(
      'float frameTime = (floor(time * uFrameCount) + 0.5) / uFrameCount;',
    );
    expect(fragmentShader).toContain(
      'frameTime <= uConversionDepth ? texture(uTrail, samplePosition) : texture(uFrames, samplePosition)',
    );
  });
});
