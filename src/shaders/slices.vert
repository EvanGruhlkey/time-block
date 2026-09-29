in vec3 position;
in vec2 uv;
in mat4 instanceMatrix;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uFrameCount;
uniform float uLayerCount;

out vec2 vUv;
flat out float vTime;

void main() {
  float layer = float(gl_InstanceID);
  float progress = uLayerCount <= 1.0 ? 0.0 : layer / (uLayerCount - 1.0);
  float frame = progress * (uFrameCount - 1.0);
  vTime = (frame + 0.5) / uFrameCount;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
