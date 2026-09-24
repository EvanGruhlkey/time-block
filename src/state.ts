export interface AppState {
  frame: number;
  frameCount: number;
  playing: boolean;
  uiVisible: boolean;
  density: number;
  sliceThickness: number;
  timeDepth: number;
}

export type Command =
  | { type: 'seek-by'; frames: number }
  | { type: 'seek-to'; frame: number }
  | { type: 'toggle-playback' }
  | { type: 'toggle-ui' }
  | { type: 'set-density'; value: number }
  | { type: 'set-slice-thickness'; value: number }
  | { type: 'set-time-depth'; value: number }
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
    uiVisible: true,
    density: 0.72,
    sliceThickness: 0.012,
    timeDepth: 1,
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
    case 'toggle-ui':
      return { ...state, uiVisible: !state.uiVisible };
    case 'set-density':
      return { ...state, density: clamp(command.value, 0.1, 2) };
    case 'set-slice-thickness':
      return { ...state, sliceThickness: clamp(command.value, 0.002, 0.08) };
    case 'set-time-depth':
      return { ...state, timeDepth: clamp(command.value, 0.35, 2) };
    case 'reset':
      return createState(state.frameCount, false);
  }
}
