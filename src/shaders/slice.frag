precision highp float;
precision highp sampler3D;

uniform sampler3D uVolume;
uniform float uSlice;

in vec2 vUv;
out vec4 outColor;

void main() {
  vec4 voxel = texture(uVolume, vec3(vUv, uSlice));
  float alpha = smoothstep(0.08, 0.55, voxel.a);
  if (alpha < 0.01) discard;
  outColor = vec4(voxel.rgb * 1.45, alpha);
}
