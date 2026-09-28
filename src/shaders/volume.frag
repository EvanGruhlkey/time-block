precision highp float;
precision highp sampler3D;

uniform sampler3D uVolume;
uniform float uStartDepth;
uniform float uDepth;
uniform float uFrameCount;

in vec3 vPosition;
in vec3 vOrigin;
out vec4 outColor;

vec2 intersectBox(vec3 origin, vec3 direction) {
  vec3 inverseDirection = 1.0 / direction;
  vec3 nearPlane = (vec3(0.0) - origin) * inverseDirection;
  vec3 farPlane = (vec3(1.0) - origin) * inverseDirection;
  vec3 lower = min(nearPlane, farPlane);
  vec3 upper = max(nearPlane, farPlane);
  return vec2(
    max(max(lower.x, lower.y), lower.z),
    min(min(upper.x, upper.y), upper.z)
  );
}

void main() {
  vec3 rayDirection = normalize(vPosition - vOrigin);
  vec2 bounds = intersectBox(vOrigin, rayDirection);
  float nearDistance = max(bounds.x, 0.0);
  float farDistance = bounds.y;
  if (nearDistance >= farDistance) discard;

  float stepLength = (farDistance - nearDistance) / 128.0;
  float includedFrames = abs(uDepth - uStartDepth) * uFrameCount + 1.0;
  float opacityScale = includedFrames / 128.0;
  vec4 accumulated = vec4(0.0);
  for (int stepIndex = 0; stepIndex < 128; stepIndex += 1) {
    float distance = nearDistance + (float(stepIndex) + 0.5) * stepLength;
    if (distance > farDistance || accumulated.a > 0.98) break;

    vec3 position = vOrigin + rayDirection * distance;
    float time = mix(uStartDepth, uDepth, position.z);
    vec4 sampleColor = texture(uVolume, vec3(position.xy, time));
    sampleColor.a = 1.0 - pow(1.0 - sampleColor.a, opacityScale);
    accumulated.rgb +=
      (1.0 - accumulated.a) * sampleColor.a * sampleColor.rgb;
    accumulated.a += (1.0 - accumulated.a) * sampleColor.a;
  }

  if (accumulated.a < 0.01) discard;
  outColor = vec4(accumulated.rgb / accumulated.a, accumulated.a);
}
