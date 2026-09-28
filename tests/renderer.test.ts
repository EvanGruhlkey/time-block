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

  it('rejects weak mask opacity before it accumulates through depth', () => {
    expect(fragmentShader).toContain(
      'sampleColor.a = smoothstep(0.18, 0.70, sampleColor.a);',
    );
  });

  it('renders the current complete video frame in front of its trail', () => {
    expect(fragmentShader).toContain('uniform sampler3D uFrames;');
    expect(fragmentShader).toContain(
      'texture(uFrames, vec3(framePosition.xy, uDepth))',
    );
  });
});
