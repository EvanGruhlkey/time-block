precision highp float;
precision highp sampler3D;

uniform sampler3D uVolume;
uniform float uConversionDepth;
uniform float uMode;

in vec2 vUv;
flat in float vTime;
out vec4 outColor;

void main() {
  bool converted = vTime <= uConversionDepth;
  if (uMode < 0.5 && converted) discard;
  if (uMode > 0.5 && !converted) discard;

  vec4 color = texture(uVolume, vec3(vUv, vTime));
  color.a *= uMode < 0.5 ? 0.96 : uMode < 1.5 ? 0.42 : 0.035;
  if (color.a < 0.025) discard;
  outColor = color;
}
