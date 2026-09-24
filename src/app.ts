import { createCamera } from './camera';
import { createControls } from './controls';
import {
  createVolumeRenderer,
  type VolumeRenderer,
  WebGLUnavailableError,
} from './renderer';
import { createState, update, type Command } from './state';
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
  let disposed = false;

  const dispatch = (command: Command): void => {
    state = update(state, command);
    if (command.type === 'reset') camera.reset();
    renderer?.render(state);
  };

  const controls = createControls(canvas, {
    dispatch,
    orbit: (dx, dy) => camera.orbit(dx, dy),
    zoom: (delta) => camera.zoom(delta),
    focus: () => camera.focus(),
  });

  const resize = (): void => renderer?.resize();
  window.addEventListener('resize', resize);

  void loadVolume('/volume')
    .then((asset) => {
      if (disposed) return;
      state = createState(asset.metadata.depth, reducedMotion);
      renderer = createVolumeRenderer(canvas, asset, camera);
      renderer.resize();
      renderer.render(state);
      renderer.start();
      status.remove();
    })
    .catch((error: unknown) => {
      if (disposed) return;
      status.textContent =
        error instanceof WebGLUnavailableError
          ? 'WebGL 2 is required to view this time volume.'
          : 'The dancer volume could not be loaded.';
      canvas.dataset.renderer = 'error';
    });

  return {
    dispose() {
      disposed = true;
      window.removeEventListener('resize', resize);
      controls.dispose();
      renderer?.dispose();
      if (!renderer) camera.dispose();
      root.replaceChildren();
    },
  };
}
