export interface AppState {
  frame: number;
  frameCount: number;
  playing: boolean;
  density: number;
  sliceThickness: number;
  timeDepth: number;
}

export type Command =
  | { type: 'seek-by'; frames: number }
  | { type: 'seek-to'; frame: number }
  | { type: 'toggle-playback' }
  | { type: 'reset' };

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function createState(
  frameCount: number,
  _reducedMotion: boolean,
): AppState {
  if (!Number.isInteger(frameCount) || frameCount <= 0) {
    throw new RangeError('frameCount must be a positive integer');
  }

  return {
    frame: Math.floor(frameCount / 2),
    frameCount,
    playing: false,
    density: 2,
    sliceThickness: 0.08,
    timeDepth: 2,
  };
}

export function update(state: AppState, command: Command): AppState {
  switch (command.type) {
    case 'seek-by':
      return update(state, {
        type: 'seek-to',
        frame: state.frame + command.frames,
      });
    case 'seek-to':
      return {
        ...state,
        frame: clamp(Math.round(command.frame), 0, state.frameCount - 1),
      };
    case 'toggle-playback':
      return { ...state, playing: !state.playing };
    case 'reset':
      return createState(state.frameCount, false);
  }
}
