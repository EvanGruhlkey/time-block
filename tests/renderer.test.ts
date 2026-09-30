import { describe, expect, it } from 'vitest';
import { timeBlockLayers, timeBlockTransform } from '../src/renderer';
import fragmentShader from '../src/shaders/slices.frag?raw';
import vertexShader from '../src/shaders/slices.vert?raw';
import rendererSource from '../src/renderer.ts?raw';

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

  it('interpolates extra trail layers into a dense motion sculpture', () => {
    expect(timeBlockLayers(120)).toEqual({ cards: 32, trail: 240, glow: 120 });
    expect(timeBlockLayers(12)).toEqual({ cards: 12, trail: 24, glow: 12 });
  });

  it('positions every temporal layer as a separate plane', () => {
    expect(vertexShader).toContain('gl_InstanceID');
    expect(vertexShader).toContain('instanceMatrix');
  });

  it('switches cards into persistent cutouts at the conversion edge', () => {
    expect(fragmentShader).toContain('uniform float uMode;');
    expect(fragmentShader).toContain('bool converted = vTime <= uConversionDepth;');
    expect(fragmentShader).toContain('if (uMode < 0.5 && converted) discard;');
    expect(fragmentShader).toContain('if (uMode > 0.5 && !converted) discard;');
    expect(fragmentShader).toContain('uMode < 1.5 ? 0.42 : 0.035');
    expect(rendererSource).toContain(
      'blending: mode === 2 ? AdditiveBlending : NormalBlending',
    );
    expect(rendererSource).toContain('layers.glow, 2');
  });
});
