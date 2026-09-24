export function mountApp(root: HTMLElement): void {
  const canvas = document.createElement('canvas');
  canvas.className = 'experience';
  canvas.setAttribute('aria-label', 'Interactive dancer time volume');

  const status = document.createElement('p');
  status.className = 'loading';
  status.textContent = 'Loading time volume…';

  root.replaceChildren(canvas, status);
}
