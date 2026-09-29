import {
  BackSide,
  BoxGeometry,
  ClampToEdgeWrapping,
  Data3DTexture,
  GLSL3,
  LinearFilter,
  Mesh,
  RawShaderMaterial,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  UnsignedByteType,
  WebGLRenderer,
} from 'three';
import type { CameraController } from './camera';
import fragmentShader from './shaders/volume.frag?raw';
import vertexShader from './shaders/volume.vert?raw';
import type { AppState } from './state';
import type { VolumeAsset } from './volume';

export interface VolumeRenderer {
  render(state: AppState): void;
  resize(): void;
  start(): void;
  stop(): void;
  dispose(): void;
}

export class WebGLUnavailableError extends Error {
  override readonly name = 'WebGLUnavailableError';
}

interface Resources {
  trail: Data3DTexture;
  frames: Data3DTexture;
  material: RawShaderMaterial;
  geometry: BoxGeometry;
  mesh: Mesh<BoxGeometry, RawShaderMaterial>;
}

export interface TimeBlockTransform {
  conversionDepth: number;
  scaleDepth: number;
  positionDepth: number;
}

export function timeBlockTransform(
  frame: number,
  frameCount: number,
  timeDepth: number,
): TimeBlockTransform {
  return {
    conversionDepth: (frame + 0.5) / frameCount,
    scaleDepth: timeDepth,
    positionDepth: 0,
  };
}

export function createVolumeRenderer(
  canvas: HTMLCanvasElement,
  asset: VolumeAsset,
  camera: CameraController,
): VolumeRenderer {
  const context = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  if (!context) {
    throw new WebGLUnavailableError('WebGL 2 is unavailable');
  }

  const scene = new Scene();
  const renderer = new WebGLRenderer({
    canvas,
    context,
    alpha: true,
    antialias: true,
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  let resources = createResources(asset);
  scene.add(resources.mesh);
  let currentState: AppState | null = null;
  let running = false;
  let resumeAfterRestore = false;
  let frameRequest = 0;
  let restoreCount = 0;
  let renderCount = 0;
  let disposed = false;

  const draw = (): boolean => {
    if (!currentState || disposed) return false;
    const cameraMoving = camera.update();
    const uniforms = resources.material.uniforms;
    const block = timeBlockTransform(
      currentState.frame,
      currentState.frameCount,
      currentState.timeDepth,
    );
    uniforms.uConversionDepth!.value = block.conversionDepth;
    resources.mesh.scale.set(
      asset.metadata.width / asset.metadata.height,
      1,
      block.scaleDepth,
    );
    resources.mesh.position.z = block.positionDepth;
    canvas.dataset.camera = camera.camera.position
      .toArray()
      .map((value) => value.toFixed(5))
      .join(',');
    renderer.render(scene, camera.camera);
    renderCount += 1;
    canvas.dataset.renderCount = String(renderCount);
    return cameraMoving;
  };

  const loop = (): void => {
    if (!running || disposed) return;
    if (draw()) frameRequest = requestAnimationFrame(loop);
    else running = false;
  };

  const stop = (): void => {
    running = false;
    cancelAnimationFrame(frameRequest);
  };

  const start = (): void => {
    if (running || disposed || document.hidden) return;
    running = true;
    canvas.dataset.renderer = 'ready';
    frameRequest = requestAnimationFrame(loop);
  };

  const onContextLost = (event: Event): void => {
    event.preventDefault();
    resumeAfterRestore = running;
    stop();
    canvas.dataset.renderer = 'lost';
  };

  const onContextRestored = (): void => {
    if (disposed) return;
    scene.remove(resources.mesh);
    disposeResources(resources);
    resources = createResources(asset);
    scene.add(resources.mesh);
    restoreCount += 1;
    canvas.dataset.restores = String(restoreCount);
    canvas.dataset.renderer = 'ready';
    draw();
    if (resumeAfterRestore) start();
  };

  const onVisibilityChange = (): void => {
    if (document.hidden) {
      resumeAfterRestore = running;
      stop();
    } else if (resumeAfterRestore) {
      start();
    }
  };

  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return {
    render(state) {
      currentState = state;
      draw();
    },
    resize() {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      renderer.setSize(width, height, false);
      camera.resize(width, height);
      draw();
    },
    start,
    stop,
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      scene.remove(resources.mesh);
      disposeResources(resources);
      renderer.dispose();
      camera.dispose();
    },
  };
}

function createResources(asset: VolumeAsset): Resources {
  const { width, height, depth } = asset.metadata;
  const trail = createVolumeTexture(asset.voxels, width, height, depth);
  const frames = createVolumeTexture(
    asset.frames ?? asset.voxels,
    width,
    height,
    depth,
  );
  const material = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader,
    fragmentShader,
    side: BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTrail: { value: trail },
      uFrames: { value: frames },
      uConversionDepth: { value: 0 },
      uFrameCount: { value: depth },
    },
  });
  const geometry = new BoxGeometry(1, 1, 1);
  const mesh = new Mesh(geometry, material);

  return {
    trail,
    frames,
    material,
    geometry,
    mesh,
  };
}

function createVolumeTexture(
  voxels: Uint8Array,
  width: number,
  height: number,
  depth: number,
): Data3DTexture {
  const texture = new Data3DTexture(voxels, width, height, depth);
  texture.format = RGBAFormat;
  texture.type = UnsignedByteType;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.wrapR = ClampToEdgeWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

function disposeResources(resources: Resources): void {
  resources.trail.dispose();
  resources.frames.dispose();
  resources.material.dispose();
  resources.geometry.dispose();
}
