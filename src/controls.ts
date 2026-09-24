import type { Command } from './state';

export interface ControlHandlers {
  dispatch(command: Command): void;
  orbit(dx: number, dy: number): void;
  zoom(delta: number): void;
  focus(): void;
}

export interface Controls {
  dispose(): void;
}

const WHEEL_STEP = 40;

export function createControls(
  element: HTMLElement,
  handlers: ControlHandlers,
): Controls {
  const view = element.ownerDocument.defaultView;
  if (!view) throw new Error('Controls require a browser window');

  const abort = new view.AbortController();
  let wheelAccumulator = 0;
  let activePointer: number | null = null;
  let previousX = 0;
  let previousY = 0;

  element.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const lineScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
      const pageScale =
        event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? view.innerHeight : 1;
      wheelAccumulator += event.deltaY * lineScale * pageScale;
      const frames = Math.trunc(wheelAccumulator / WHEEL_STEP);

      if (frames !== 0) {
        wheelAccumulator -= frames * WHEEL_STEP;
        handlers.dispatch({ type: 'seek-by', frames });
      }
    },
    { passive: false, signal: abort.signal },
  );

  element.addEventListener(
    'pointerdown',
    (event) => {
      activePointer = event.pointerId;
      previousX = event.clientX;
      previousY = event.clientY;
      element.setPointerCapture?.(event.pointerId);
    },
    { signal: abort.signal },
  );

  element.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerId !== activePointer) return;
      const dx = event.clientX - previousX;
      const dy = event.clientY - previousY;
      previousX = event.clientX;
      previousY = event.clientY;
      handlers.orbit(dx, dy);
    },
    { signal: abort.signal },
  );

  const releasePointer = (event: PointerEvent): void => {
    if (event.pointerId === activePointer) activePointer = null;
  };
  element.addEventListener('pointerup', releasePointer, {
    signal: abort.signal,
  });
  element.addEventListener('pointercancel', releasePointer, {
    signal: abort.signal,
  });
  element.addEventListener('dblclick', () => handlers.focus(), {
    signal: abort.signal,
  });

  view.addEventListener(
    'keydown',
    (event) => {
      const command = commandForKey(event.key);
      if (!command) return;
      event.preventDefault();
      handlers.dispatch(command);
    },
    { signal: abort.signal },
  );

  return { dispose: () => abort.abort() };
}

function commandForKey(key: string): Command | null {
  switch (key.toLowerCase()) {
    case 'arrowleft':
    case 'arrowdown':
      return { type: 'seek-by', frames: -1 };
    case 'arrowright':
    case 'arrowup':
      return { type: 'seek-by', frames: 1 };
    case ' ':
      return { type: 'toggle-playback' };
    case 'h':
      return { type: 'toggle-ui' };
    case 'r':
      return { type: 'reset' };
    default:
      return null;
  }
}
