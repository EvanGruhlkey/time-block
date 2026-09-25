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
  const pointers = new Map<number, { x: number; y: number }>();
  let previousPinchDistance: number | null = null;

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
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) previousPinchDistance = pinchDistance(pointers);
      element.setPointerCapture?.(event.pointerId);
    },
    { signal: abort.signal },
  );

  element.addEventListener(
    'pointermove',
    (event) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.size === 1) {
        handlers.orbit(event.clientX - previous.x, event.clientY - previous.y);
        return;
      }

      if (pointers.size === 2 && previousPinchDistance !== null) {
        const distance = pinchDistance(pointers);
        handlers.zoom(previousPinchDistance - distance);
        previousPinchDistance = distance;
      }
    },
    { signal: abort.signal },
  );

  const releasePointer = (event: PointerEvent): void => {
    pointers.delete(event.pointerId);
    previousPinchDistance =
      pointers.size === 2 ? pinchDistance(pointers) : null;
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

function pinchDistance(
  pointers: Map<number, { x: number; y: number }>,
): number {
  const [first, second] = [...pointers.values()];
  if (!first || !second) return 0;
  return Math.hypot(second.x - first.x, second.y - first.y);
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
    case 'r':
      return { type: 'reset' };
    default:
      return null;
  }
}
