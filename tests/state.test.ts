import { describe, expect, it } from 'vitest';
import { createState, update } from '../src/state';

describe('timeline state', () => {
  it('clamps repeated wheel movement to the available frames', () => {
    let state = createState(120, false);

    state = update(state, { type: 'seek-by', frames: 500 });
    expect(state.frame).toBe(119);

    state = update(state, { type: 'seek-by', frames: -500 });
    expect(state.frame).toBe(0);
  });

  it('starts paused when reduced motion is requested', () => {
    expect(createState(120, true).playing).toBe(false);
  });

  it('starts with the complete time block visible', () => {
    expect(createState(120, false)).toEqual({
      frame: 119,
      frameCount: 120,
      playing: false,
      timeDepth: 1,
    });
  });

  it('rejects a frame count that cannot describe a timeline', () => {
    expect(() => createState(0, false)).toThrow(RangeError);
    expect(() => createState(-4, false)).toThrow(RangeError);
    expect(() => createState(2.5, false)).toThrow(RangeError);
  });

  it('updates immutably and supports direct seeking', () => {
    const state = createState(120, false);
    const next = update(state, { type: 'seek-to', frame: 18 });

    expect(next.frame).toBe(18);
    expect(next).not.toBe(state);
    expect(state.frame).toBe(119);
  });

  it('toggles playback', () => {
    const state = createState(120, false);

    expect(update(state, { type: 'toggle-playback' }).playing).toBe(true);
  });

  it('resets all timeline and visual state', () => {
    const state = update(createState(120, false), {
      type: 'seek-to',
      frame: 4,
    });

    expect(update(state, { type: 'reset' })).toEqual(createState(120, false));
  });
});
