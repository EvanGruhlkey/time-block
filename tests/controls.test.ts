import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createCamera } from '../src/camera';
import { createControls, type ControlHandlers } from '../src/controls';

function setup() {
  const element = document.createElement('canvas');
  document.body.append(element);
  const handlers: ControlHandlers = {
    dispatch: vi.fn(),
    orbit: vi.fn(),
    zoom: vi.fn(),
    focus: vi.fn(),
  };
  const controls = createControls(element, handlers);
  return { controls, element, handlers };
}

describe('controls', () => {
  it.each([
    ['ArrowLeft', -1],
    ['ArrowDown', -1],
    ['ArrowRight', 1],
    ['ArrowUp', 1],
  ])('maps %s to a one-frame seek', (key, frames) => {
    const { controls, handlers } = setup();

    window.dispatchEvent(new KeyboardEvent('keydown', { key }));

    expect(handlers.dispatch).toHaveBeenCalledWith({ type: 'seek-by', frames });
    controls.dispose();
  });

  it('accumulates high-resolution wheel deltas into stable frame steps', () => {
    const { controls, element, handlers } = setup();

    element.dispatchEvent(new WheelEvent('wheel', { deltaY: 20 }));
    expect(handlers.dispatch).not.toHaveBeenCalled();
    element.dispatchEvent(new WheelEvent('wheel', { deltaY: 20 }));

    expect(handlers.dispatch).toHaveBeenCalledWith({
      type: 'seek-by',
      frames: 1,
    });
    controls.dispose();
  });

  it('emits only finite seeks under repeated large wheel input', () => {
    const { controls, element, handlers } = setup();

    for (let index = 0; index < 100; index += 1) {
      element.dispatchEvent(new WheelEvent('wheel', { deltaY: 1_000_000 }));
    }

    const commands = vi
      .mocked(handlers.dispatch)
      .mock.calls.map(([command]) => command);
    expect(commands).toHaveLength(100);
    expect(
      commands.every(
        (command) =>
          command.type === 'seek-by' && Number.isFinite(command.frames),
      ),
    ).toBe(true);
    controls.dispose();
  });

  it.each([
    [' ', { type: 'toggle-playback' }],
    ['h', { type: 'toggle-ui' }],
    ['r', { type: 'reset' }],
  ])('maps %s to an application command', (key, command) => {
    const { controls, handlers } = setup();
    const event = new KeyboardEvent('keydown', { key, cancelable: true });

    window.dispatchEvent(event);

    expect(handlers.dispatch).toHaveBeenCalledWith(command);
    expect(event.defaultPrevented).toBe(true);
    controls.dispose();
  });

  it('removes every listener when disposed', () => {
    const { controls, element, handlers } = setup();

    controls.dispose();
    element.dispatchEvent(new WheelEvent('wheel', { deltaY: 80 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));

    expect(handlers.dispatch).not.toHaveBeenCalled();
  });
});

describe('camera', () => {
  it('keeps orbit and zoom inside the approved bounds', () => {
    const camera = createCamera(document.createElement('canvas'), true);

    camera.orbit(0, 100_000);
    camera.zoom(100_000);
    camera.update();

    const distance = camera.camera.position.length();
    expect(distance).toBeGreaterThanOrEqual(1.7);
    expect(distance).toBeLessThanOrEqual(6);
    expect(Number.isFinite(camera.camera.position.y)).toBe(true);
    camera.dispose();
  });

  it('restores the same three-quarter view after reset', () => {
    const camera = createCamera(document.createElement('canvas'), true);
    const initial = camera.camera.position.clone();

    camera.orbit(400, 200);
    camera.zoom(500);
    camera.update();
    camera.reset();
    camera.update();

    expect(camera.camera.position.distanceTo(initial)).toBeLessThan(0.001);
    expect(camera.camera.getWorldDirection(new Vector3()).length()).toBeCloseTo(
      1,
    );
    camera.dispose();
  });
});
