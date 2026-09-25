import { createCamera } from './camera';
import { createVideoChooser } from './chooser';
import { createControls } from './controls';
import {
  createVolumeRenderer,
  type VolumeRenderer,
  WebGLUnavailableError,
} from './renderer';
import { createState, update, type Command } from './state';
import { buildVolumeFromVideo } from './video-volume';

export interface AppHandle {
  dispose(): void;
}

export function mountApp(root: HTMLElement): AppHandle {
  const canvas = document.createElement('canvas');
  canvas.className = 'experience';
  canvas.hidden = true;
  canvas.setAttribute('aria-label', 'Interactive video time volume');
  root.replaceChildren(canvas);

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const camera = createCamera(canvas, reducedMotion);
  let state = createState(120, reducedMotion);
  let renderer: VolumeRenderer | null = null;
  let disposed = false;
  let loadGeneration = 0;
  let playbackRequest = 0;
  let lastPlaybackTime = 0;
  let playbackCarry = 0;
  let frameRate = 24;

  const sync = (): void => renderer?.render(state);

  const playbackTick = (now: number): void => {
    if (!state.playing || disposed) return;
    if (lastPlaybackTime === 0) lastPlaybackTime = now;
    playbackCarry += now - lastPlaybackTime;
    lastPlaybackTime = now;
    const frames = Math.floor(playbackCarry / (1000 / frameRate));
    if (frames > 0) {
      playbackCarry -= frames * (1000 / frameRate);
      const nextFrame = Math.min(state.frame + frames, state.frameCount - 1);
      state = update(state, { type: 'seek-to', frame: nextFrame });
      if (nextFrame === state.frameCount - 1)
        state = { ...state, playing: false };
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
  const chooser = createVideoChooser(root, (file) => void loadFile(file));

  const loadFile = async (file: File): Promise<void> => {
    const generation = ++loadGeneration;
    canvas.dataset.renderer = 'processing';
    chooser.progress(0);
    try {
      const asset = await buildVolumeFromVideo(file, (progress) => {
        if (generation === loadGeneration) chooser.progress(progress);
      });
      if (disposed || generation !== loadGeneration) return;
      renderer?.dispose();
      frameRate = asset.metadata.frameRate;
      state = createState(asset.metadata.depth, reducedMotion);
      renderer = createVolumeRenderer(canvas, asset, camera);
      canvas.hidden = false;
      renderer.resize();
      sync();
      renderer.start();
      chooser.hide();
    } catch (error: unknown) {
      if (disposed || generation !== loadGeneration) return;
      const message =
        error instanceof WebGLUnavailableError
          ? 'WebGL 2 is required to view this time volume.'
          : error instanceof Error
            ? error.message
            : 'The selected video could not be decoded.';
      canvas.dataset.renderer = 'error';
      chooser.show(message);
    }
  };

  const resize = (): void => renderer?.resize();
  window.addEventListener('resize', resize);

  return {
    dispose() {
      disposed = true;
      loadGeneration += 1;
      cancelAnimationFrame(playbackRequest);
      window.removeEventListener('resize', resize);
      controls.dispose();
      chooser.dispose();
      renderer?.dispose();
      if (!renderer) camera.dispose();
      root.replaceChildren();
    },
  };
}
