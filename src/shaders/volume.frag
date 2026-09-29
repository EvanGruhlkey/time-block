precision highp float;
precision highp sampler3D;

uniform sampler3D uFrames;
uniform sampler3D uTrail;
uniform float uConversionDepth;
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

  const float frameThickness = 0.28;
  const float trailOpacity = 0.72;
  const float frameOpacity = 0.34;
  float stepLength = (farDistance - nearDistance) / 256.0;
  vec4 accumulated = vec4(0.0);
  for (int stepIndex = 0; stepIndex < 256; stepIndex += 1) {
    float distance = nearDistance + (float(stepIndex) + 0.5) * stepLength;
    if (distance > farDistance || accumulated.a > 0.98) break;

    vec3 position = vOrigin + rayDirection * distance;
    float time = position.z;
    float slicePhase = fract(time * uFrameCount);
    float sliceDistance = abs(slicePhase - 0.5);
    if (sliceDistance > frameThickness) continue;
    float frameTime = (floor(time * uFrameCount) + 0.5) / uFrameCount;
    vec3 samplePosition = vec3(position.xy, frameTime);
    bool converted = frameTime <= uConversionDepth;
    vec4 sampleColor = converted
      ? texture(uTrail, samplePosition)
      : texture(uFrames, samplePosition);
    float layerOpacity = converted ? trailOpacity : frameOpacity;
    sampleColor.a *= layerOpacity;
    accumulated.rgb +=
      (1.0 - accumulated.a) * sampleColor.a * sampleColor.rgb;
    accumulated.a += (1.0 - accumulated.a) * sampleColor.a;
  }

  if (accumulated.a < 0.01) discard;
  outColor = vec4(accumulated.rgb / accumulated.a, accumulated.a);
}
