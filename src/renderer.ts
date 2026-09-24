import {
  BackSide,
  BoxGeometry,
  ClampToEdgeWrapping,
  Data3DTexture,
  EdgesGeometry,
  GLSL3,
  LinearFilter,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  PlaneGeometry,
  RawShaderMaterial,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  UnsignedByteType,
  WebGLRenderer,
} from 'three';
import type { CameraController } from './camera';
import sliceFragmentShader from './shaders/slice.frag?raw';
import sliceVertexShader from './shaders/slice.vert?raw';
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
  texture: Data3DTexture;
  material: RawShaderMaterial;
  geometry: BoxGeometry;
  mesh: Mesh<BoxGeometry, RawShaderMaterial>;
  sliceMaterial: RawShaderMaterial;
  sliceGeometry: PlaneGeometry;
  sliceMesh: Mesh<PlaneGeometry, RawShaderMaterial>;
  boundsGeometry: EdgesGeometry;
  boundsMaterial: LineBasicMaterial;
  bounds: LineSegments<EdgesGeometry, LineBasicMaterial>;
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
  scene.add(resources.mesh, resources.sliceMesh, resources.bounds);
  let currentState: AppState | null = null;
  let running = false;
  let resumeAfterRestore = false;
  let frameRequest = 0;
  let restoreCount = 0;
  let disposed = false;

  const draw = (): void => {
    if (!currentState || disposed) return;
    camera.update();
    const uniforms = resources.material.uniforms;
    const slice = currentState.frame / Math.max(1, currentState.frameCount - 1);
    uniforms.uSlice!.value = slice;
    uniforms.uDensity!.value = currentState.density;
    uniforms.uSliceThickness!.value = currentState.sliceThickness;
    resources.mesh.scale.set(
      asset.metadata.width / asset.metadata.height,
      1,
      currentState.timeDepth,
    );
    resources.bounds.scale.copy(resources.mesh.scale);
    resources.sliceMaterial.uniforms.uSlice!.value = slice;
    resources.sliceMesh.scale.set(
      asset.metadata.width / asset.metadata.height,
      1,
      1,
    );
    resources.sliceMesh.position.z = (slice - 0.5) * currentState.timeDepth;
    canvas.dataset.camera = camera.camera.position
      .toArray()
      .map((value) => value.toFixed(5))
      .join(',');
    renderer.render(scene, camera.camera);
  };

  const loop = (): void => {
    if (!running || disposed) return;
    draw();
    frameRequest = requestAnimationFrame(loop);
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
    scene.remove(resources.mesh, resources.sliceMesh, resources.bounds);
    disposeResources(resources);
    resources = createResources(asset);
    scene.add(resources.mesh, resources.sliceMesh, resources.bounds);
    restoreCount += 1;
    canvas.dataset.restores = String(restoreCount);
    canvas.dataset.renderer = 'ready';
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
      scene.remove(resources.mesh, resources.sliceMesh, resources.bounds);
      disposeResources(resources);
      renderer.dispose();
      camera.dispose();
    },
  };
}

function createResources(asset: VolumeAsset): Resources {
  const { width, height, depth } = asset.metadata;
  const texture = new Data3DTexture(asset.voxels, width, height, depth);
  texture.format = RGBAFormat;
  texture.type = UnsignedByteType;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.wrapR = ClampToEdgeWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  const material = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader,
    fragmentShader,
    side: BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uVolume: { value: texture },
      uSlice: { value: 0.5 },
      uDensity: { value: 0.72 },
      uSliceThickness: { value: 0.012 },
    },
  });
  const geometry = new BoxGeometry(1, 1, 1);
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 1;

  const sliceMaterial = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: sliceVertexShader,
    fragmentShader: sliceFragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uVolume: { value: texture },
      uSlice: { value: 0.5 },
    },
  });
  const sliceGeometry = new PlaneGeometry(1, 1);
  const sliceMesh = new Mesh(sliceGeometry, sliceMaterial);
  sliceMesh.renderOrder = 2;

  const boundsGeometry = new EdgesGeometry(geometry);
  const boundsMaterial = new LineBasicMaterial({
    color: 0x77736b,
    transparent: true,
    opacity: 0.26,
    depthTest: false,
  });
  const bounds = new LineSegments(boundsGeometry, boundsMaterial);
  bounds.renderOrder = 3;
  return {
    texture,
    material,
    geometry,
    mesh,
    sliceMaterial,
    sliceGeometry,
    sliceMesh,
    boundsGeometry,
    boundsMaterial,
    bounds,
  };
}

function disposeResources(resources: Resources): void {
  resources.texture.dispose();
  resources.material.dispose();
  resources.geometry.dispose();
  resources.sliceMaterial.dispose();
  resources.sliceGeometry.dispose();
  resources.boundsMaterial.dispose();
  resources.boundsGeometry.dispose();
}
