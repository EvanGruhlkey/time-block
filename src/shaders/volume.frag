precision highp float;
precision highp sampler3D;

uniform sampler3D uVolume;
uniform float uStartDepth;
uniform float uDepth;

in vec3 vPosition;
out vec4 outColor;

void main() {
  float time = mix(uStartDepth, uDepth, vPosition.z);
  vec3 samplePosition = vec3(vPosition.xy, time);
  outColor = vec4(texture(uVolume, samplePosition).rgb, 1.0);
}
