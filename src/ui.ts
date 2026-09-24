import type { AppState, Command } from './state';
import type { VolumeMetadata } from './volume';

export interface UiController {
  render(state: AppState): void;
  showError(message: string, retry?: () => void): void;
  dispose(): void;
}

export function createUi(
  root: HTMLElement,
  metadata: VolumeMetadata,
  dispatch: (command: Command) => void,
): UiController {
  const view = root.ownerDocument.defaultView;
  if (!view) throw new Error('UI requires a browser window');
  const abort = new view.AbortController();

  const panel = element('section', 'control-panel');
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Time controls');

  const identity = element('div', 'identity');
  const title = element('strong', 'title', 'TIME VOLUME');
  const instruction = element(
    'span',
    'instruction',
    'SCROLL / ARROWS TO SLICE',
  );
  identity.append(title, instruction);

  const timeline = element('div', 'timeline');
  const play = element('button', 'play-button');
  play.type = 'button';
  const readout = element('output', 'readout');
  readout.dataset.testid = 'time-readout';
  timeline.append(play, readout);

  const details = document.createElement('details');
  details.className = 'shape-controls';
  const summary = element('summary', 'shape-summary', 'SHAPE');
  const sliders = element('div', 'sliders');
  const density = slider('Volume density', 0.1, 2, 0.01, (value) =>
    dispatch({ type: 'set-density', value }),
  );
  const thickness = slider('Slice thickness', 0.002, 0.08, 0.001, (value) =>
    dispatch({ type: 'set-slice-thickness', value }),
  );
  const depth = slider('Time depth', 0.35, 2, 0.01, (value) =>
    dispatch({ type: 'set-time-depth', value }),
  );
  sliders.append(density.label, thickness.label, depth.label);
  details.append(summary, sliders);

  panel.append(identity, timeline, details);
  root.append(panel);

  play.addEventListener('click', () => dispatch({ type: 'toggle-playback' }), {
    signal: abort.signal,
  });

  return {
    render(state) {
      panel.classList.toggle('is-hidden', !state.uiVisible);
      panel.setAttribute('aria-hidden', String(!state.uiVisible));
      play.textContent = state.playing ? 'Ⅱ' : '▶';
      play.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
      readout.textContent = `${frameLabel(state.frame, state.frameCount)} · ${timeLabel(
        state.frame / metadata.frameRate,
      )}`;
      density.input.value = String(state.density);
      thickness.input.value = String(state.sliceThickness);
      depth.input.value = String(state.timeDepth);
    },
    showError(message, retry) {
      const error = element('div', 'panel-error');
      error.setAttribute('role', 'alert');
      error.append(element('span', 'error-message', message));
      if (retry) {
        const button = element('button', 'retry-button', 'Retry');
        button.type = 'button';
        button.addEventListener('click', retry, { once: true });
        error.append(button);
      }
      panel.replaceChildren(error);
    },
    dispose() {
      abort.abort();
      panel.remove();
    },
  };
}

function frameLabel(frame: number, count: number): string {
  const width = Math.max(3, String(count).length);
  return `FRAME ${String(frame + 1).padStart(width, '0')} / ${String(
    count,
  ).padStart(width, '0')}`;
}

function timeLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(2).padStart(5, '0')}`;
}

function slider(
  name: string,
  min: number,
  max: number,
  step: number,
  onInput: (value: number) => void,
): { label: HTMLLabelElement; input: HTMLInputElement } {
  const label = document.createElement('label');
  label.className = 'slider';
  const text = element('span', 'slider-label', name);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.setAttribute('aria-label', name);
  input.addEventListener('input', () => onInput(Number(input.value)));
  label.append(text, input);
  return { label, input };
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
