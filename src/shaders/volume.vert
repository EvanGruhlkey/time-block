in vec3 position;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;

out vec3 vPosition;
out vec3 vOrigin;

void main() {
  vPosition = position + 0.5;
  vOrigin = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz + 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
