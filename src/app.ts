import { createCamera } from './camera';
import { createControls } from './controls';
import {
  createVolumeRenderer,
  type VolumeRenderer,
  WebGLUnavailableError,
} from './renderer';
import { createState, update, type Command } from './state';
import { createUi, type UiController } from './ui';
import { loadVolume } from './volume';

export interface AppHandle {
  dispose(): void;
}

export function mountApp(root: HTMLElement): AppHandle {
  const canvas = document.createElement('canvas');
  canvas.className = 'experience';
  canvas.setAttribute('aria-label', 'Interactive dancer time volume');

  const status = document.createElement('p');
  status.className = 'loading';
  status.textContent = 'Loading time volume…';

  root.replaceChildren(canvas, status);

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const camera = createCamera(canvas, reducedMotion);
  let state = createState(120, reducedMotion);
  let renderer: VolumeRenderer | null = null;
  let ui: UiController | null = null;
  let disposed = false;
  let playbackRequest = 0;
  let lastPlaybackTime = 0;
  let playbackCarry = 0;
  let frameRate = 24;

  const sync = (): void => {
    renderer?.render(state);
    ui?.render(state);
  };

  const playbackTick = (now: number): void => {
    if (!state.playing || disposed) return;
    if (lastPlaybackTime === 0) lastPlaybackTime = now;
    playbackCarry += now - lastPlaybackTime;
    lastPlaybackTime = now;
    const frameDuration = 1000 / frameRate;
    const frames = Math.floor(playbackCarry / frameDuration);

    if (frames > 0) {
      playbackCarry -= frames * frameDuration;
      const nextFrame = Math.min(state.frame + frames, state.frameCount - 1);
      state = update(state, { type: 'seek-to', frame: nextFrame });
      if (nextFrame === state.frameCount - 1) {
        state = { ...state, playing: false };
      }
      sync();
    }

    if (state.playing) playbackRequest = requestAnimationFrame(playbackTick);
  };

  const schedulePlayback = (): void => {
    cancelAnimationFrame(playbackRequest);
    lastPlaybackTime = 0;
    playbackCarry = 0;
    if (state.playing) playbackRequest = requestAnimationFrame(playbackTick);
  };

  const dispatch = (command: Command): void => {
    if (
      command.type === 'toggle-playback' &&
      !state.playing &&
      state.frame === state.frameCount - 1
    ) {
      state = update(state, { type: 'seek-to', frame: 0 });
    }
    state = update(state, command);
    if (command.type === 'reset') camera.reset();
    if (command.type === 'toggle-playback' || command.type === 'reset') {
      schedulePlayback();
    }
    sync();
  };

  const controls = createControls(canvas, {
    dispatch,
    orbit: (dx, dy) => camera.orbit(dx, dy),
    zoom: (delta) => camera.zoom(delta),
    focus: () => camera.focus(),
  });

  const resize = (): void => renderer?.resize();
  window.addEventListener('resize', resize);

  const showLoadError = (): void => {
    status.replaceChildren();
    status.append('The dancer volume could not be loaded.');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'retry-button';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => void initialize(), { once: true });
    status.append(retry);
    canvas.dataset.renderer = 'error';
  };

  const initialize = async (): Promise<void> => {
    status.className = 'loading';
    status.textContent = 'Loading time volume…';
    try {
      const asset = await loadVolume('/volume');
      if (disposed) return;
      frameRate = asset.metadata.frameRate;
      state = createState(asset.metadata.depth, reducedMotion);
      ui?.dispose();
      ui = createUi(root, asset.metadata, dispatch);
      renderer = createVolumeRenderer(canvas, asset, camera);
      renderer.resize();
      sync();
      renderer.start();
      status.remove();
    } catch (error: unknown) {
      if (disposed) return;
      if (error instanceof WebGLUnavailableError && ui) {
        ui.showError('WebGL 2 is required to view this time volume.');
        status.remove();
        canvas.dataset.renderer = 'error';
      } else {
        showLoadError();
      }
    }
  };

  void initialize();

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(playbackRequest);
      window.removeEventListener('resize', resize);
      controls.dispose();
      ui?.dispose();
      renderer?.dispose();
      if (!renderer) camera.dispose();
      root.replaceChildren();
    },
  };
}
