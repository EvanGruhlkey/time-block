precision highp float;
precision highp sampler3D;

uniform sampler3D uVolume;
uniform float uSlice;
uniform float uDensity;
uniform float uSliceThickness;

in vec3 vPosition;
in vec3 vOrigin;
out vec4 outColor;

vec2 intersectBox(vec3 origin, vec3 direction) {
  vec3 inverseDirection = 1.0 / direction;
  vec3 nearPlane = (vec3(0.0) - origin) * inverseDirection;
  vec3 farPlane = (vec3(1.0) - origin) * inverseDirection;
  vec3 lower = min(nearPlane, farPlane);
  vec3 upper = max(nearPlane, farPlane);
  float nearDistance = max(max(lower.x, lower.y), lower.z);
  float farDistance = min(min(upper.x, upper.y), upper.z);
  return vec2(nearDistance, farDistance);
}

vec4 sampleVolume(vec3 p) {
  vec4 voxel = texture(uVolume, vec3(p.xy, p.z));
  float distanceToSlice = abs(p.z - uSlice);
  float sliceBand = 1.0 - smoothstep(
    uSliceThickness,
    uSliceThickness * 2.0,
    distanceToSlice
  );
  voxel.rgb *= mix(0.45, 0.75, sliceBand);
  voxel.a *= uDensity * mix(0.16, 0.28, sliceBand);
  return voxel;
}

void main() {
  vec3 rayDirection = normalize(vPosition - vOrigin);
  vec2 bounds = intersectBox(vOrigin, rayDirection);
  float nearDistance = max(bounds.x, 0.0);
  float farDistance = bounds.y;

  if (nearDistance >= farDistance) discard;

  float stepLength = (farDistance - nearDistance) / 128.0;
  vec4 accumulated = vec4(0.0);

  for (int stepIndex = 0; stepIndex < 128; stepIndex += 1) {
    float distance = nearDistance + (float(stepIndex) + 0.5) * stepLength;
    if (distance > farDistance || accumulated.a > 0.97) break;

    vec3 samplePosition = vOrigin + rayDirection * distance;
    vec4 sampleColor = sampleVolume(clamp(samplePosition, 0.0, 1.0));
    sampleColor.a = clamp(sampleColor.a * 0.05, 0.0, 1.0);
    accumulated.rgb += (1.0 - accumulated.a) * sampleColor.a * sampleColor.rgb;
    accumulated.a += (1.0 - accumulated.a) * sampleColor.a;
  }

  if (accumulated.a < 0.005) discard;
  outColor = accumulated;
}
