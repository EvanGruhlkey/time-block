import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

export interface CameraController {
  camera: PerspectiveCamera;
  orbit(dx: number, dy: number): void;
  zoom(delta: number): void;
  focus(): void;
  resize(width: number, height: number): void;
  update(): void;
  reset(): void;
  dispose(): void;
}

interface OrbitState {
  azimuth: number;
  polar: number;
  distance: number;
}

const INITIAL: OrbitState = {
  azimuth: -0.62,
  polar: Math.PI * 0.42,
  distance: 3.35,
};

const MIN_POLAR = Math.PI * 0.18;
const MAX_POLAR = Math.PI * 0.82;
const MIN_DISTANCE = 1.7;
const MAX_DISTANCE = 6;

export function createCamera(
  canvas: HTMLCanvasElement,
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches,
): CameraController {
  const camera = new PerspectiveCamera(38, 1, 0.05, 100);
  const current = { ...INITIAL };
  const target = { ...INITIAL };
  const lookAt = new Vector3();
  let disposed = false;

  const apply = (): void => {
    camera.position.set(
      current.distance * Math.sin(current.polar) * Math.sin(current.azimuth),
      current.distance * Math.cos(current.polar),
      current.distance * Math.sin(current.polar) * Math.cos(current.azimuth),
    );
    camera.lookAt(lookAt);
    camera.updateMatrixWorld();
  };

  const controller: CameraController = {
    camera,
    orbit(dx, dy) {
      if (disposed) return;
      target.azimuth -= dx * 0.006;
      target.polar = MathUtils.clamp(
        target.polar + dy * 0.006,
        MIN_POLAR,
        MAX_POLAR,
      );
    },
    zoom(delta) {
      if (disposed) return;
      target.distance = MathUtils.clamp(
        target.distance + delta * 0.0025,
        MIN_DISTANCE,
        MAX_DISTANCE,
      );
    },
    focus() {
      if (disposed) return;
      target.distance = 2.45;
      if (reducedMotion) current.distance = target.distance;
      apply();
    },
    resize(width, height) {
      if (disposed || width <= 0 || height <= 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    update() {
      if (disposed) return;
      const damping = reducedMotion ? 1 : 0.12;
      current.azimuth = MathUtils.lerp(
        current.azimuth,
        target.azimuth,
        damping,
      );
      current.polar = MathUtils.lerp(current.polar, target.polar, damping);
      current.distance = MathUtils.lerp(
        current.distance,
        target.distance,
        damping,
      );
      apply();
    },
    reset() {
      Object.assign(current, INITIAL);
      Object.assign(target, INITIAL);
      apply();
    },
    dispose() {
      disposed = true;
    },
  };

  const width = canvas.clientWidth || canvas.width || 1;
  const height = canvas.clientHeight || canvas.height || 1;
  controller.resize(width, height);
  apply();
  return controller;
}
