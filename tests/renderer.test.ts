import { describe, expect, it } from 'vitest';
import { timeBlockTransform } from '../src/renderer';
import fragmentShader from '../src/shaders/volume.frag?raw';

describe('space-time block geometry', () => {
  it('shows one frame of depth at the start of the timeline', () => {
    expect(timeBlockTransform(0, 120, 1)).toEqual({
      sampleStart: 0.5 / 120,
      sampleDepth: 0.5 / 120,
      scaleDepth: 1 / 120,
      positionDepth: -119 / 240,
    });
  });

  it('shows the complete time block at the end of the timeline', () => {
    expect(timeBlockTransform(119, 120, 1)).toEqual({
      sampleStart: 0.5 / 120,
      sampleDepth: 119.5 / 120,
      scaleDepth: 1,
      positionDepth: 0,
    });
  });

  it('renders discrete rectangular video slices throughout the block', () => {
    expect(fragmentShader).toContain(
      'float frameTime = (floor(time * uFrameCount) + 0.5) / uFrameCount;',
    );
    expect(fragmentShader).toContain(
      'vec4 sampleColor = texture(uFrames, vec3(position.xy, frameTime));',
    );
  });

  it('keeps the current complete frame opaque in front of prior slices', () => {
    expect(fragmentShader).toContain('uniform sampler3D uFrames;');
    expect(fragmentShader).toContain(
      'texture(uFrames, vec3(framePosition.xy, uDepth))',
    );
    expect(fragmentShader).not.toContain('frameColor.a *= 1.0 - smoothstep');
  });
});
