import { createCamera } from './camera';
import { createControls } from './controls';
import { createState, update, type Command } from './state';

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

  const dispatch = (command: Command): void => {
    state = update(state, command);
    if (command.type === 'reset') camera.reset();
  };

  const controls = createControls(canvas, {
    dispatch,
    orbit: (dx, dy) => camera.orbit(dx, dy),
    zoom: (delta) => camera.zoom(delta),
    focus: () => camera.focus(),
  });

  return {
    dispose() {
      controls.dispose();
      camera.dispose();
      root.replaceChildren();
    },
  };
}
