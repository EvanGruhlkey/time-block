export interface VideoChooser {
  show(message?: string): void;
  progress(value: number): void;
  hide(): void;
  dispose(): void;
}

export function createVideoChooser(
  root: HTMLElement,
  onFile: (file: File) => void,
): VideoChooser {
  const view = root.ownerDocument.defaultView;
  if (!view) throw new Error('Video chooser requires a browser window');
  const abort = new view.AbortController();
  const screen = document.createElement('section');
  screen.className = 'video-chooser';

  const title = document.createElement('h1');
  title.textContent = 'TIME VOLUME';
  const message = document.createElement('p');
  message.textContent = 'Choose a video to move through time.';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'video/*';
  input.className = 'video-input';
  input.setAttribute('aria-label', 'Choose video');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Choose video';
  button.addEventListener('click', () => input.click(), {
    signal: abort.signal,
  });
  input.addEventListener(
    'change',
    () => {
      const file = input.files?.[0];
      if (file) onFile(file);
      input.value = '';
    },
    { signal: abort.signal },
  );
  screen.append(title, message, input, button);
  root.append(screen);

  return {
    show(error) {
      screen.hidden = false;
      message.textContent = error ?? 'Choose a video to move through time.';
      message.toggleAttribute('role', Boolean(error));
      if (error) message.setAttribute('role', 'alert');
      button.hidden = false;
    },
    progress(value) {
      screen.hidden = false;
      message.removeAttribute('role');
      message.textContent = `Processing ${Math.round(value * 100)}%`;
      button.hidden = true;
    },
    hide() {
      screen.hidden = true;
    },
    dispose() {
      abort.abort();
      screen.remove();
    },
  };
}
