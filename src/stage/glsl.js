/**
 * GLSL tagged-template helper + shared shader chunks.
 * The `glsl` tag is a no-op at runtime; the build step uses it to locate and
 * minify shader source. Keeping it a tag (not a plain string) means editors
 * still syntax-highlight the GLSL.
 */
export const glsl = (strings, ...values) =>
  strings.reduce((out, s, i) => out + s + (values[i] ?? ''), '');

/* ------------------------------------------------------------------ *
 * Simplex noise (Ashima / McEwan, MIT) — 3D.
 * Used as the scalar potential from which curl noise is derived.
 * ------------------------------------------------------------------ */
export const SIMPLEX_3D = glsl`
vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

/* ------------------------------------------------------------------ *
 * Curl of a layered simplex potential.
 *
 * curl(F) is divergence-free by construction, so the resulting field is
 * incompressible — it reads as liquid rather than smoke. Three octaves:
 * ocean drift, trackable eddies, close-inspection shimmer. A fourth was
 * tried and cut (reads as grain). See docs/PERMEATE.md §II.
 * ------------------------------------------------------------------ */
export const CURL_NOISE = glsl`
vec3 snoiseVec3(vec3 p){
  return vec3(
    snoise(p),
    snoise(p + vec3(123.456, 0.0, -78.9)),
    snoise(p + vec3(-45.6, 98.7, 21.3))
  );
}

vec3 curlNoise(vec3 p){
  const float e = 0.12;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);

  vec3 p_x0 = snoiseVec3(p - dx), p_x1 = snoiseVec3(p + dx);
  vec3 p_y0 = snoiseVec3(p - dy), p_y1 = snoiseVec3(p + dy);
  vec3 p_z0 = snoiseVec3(p - dz), p_z1 = snoiseVec3(p + dz);

  float x = (p_y1.z - p_y0.z) - (p_z1.y - p_z0.y);
  float y = (p_z1.x - p_z0.x) - (p_x1.z - p_x0.z);
  float z = (p_x1.y - p_x0.y) - (p_y1.x - p_y0.x);

  return normalize(vec3(x, y, z) / (2.0 * e));
}

/* Layered curl — amplitude halves as frequency doubles. */
vec3 flowField(vec3 p, float t, float octaves){
  vec3 v = curlNoise(p * 0.42 + vec3(0.0, t * 0.05, t * 0.02));
  if (octaves > 1.5) v += 0.5  * curlNoise(p * 0.95 + vec3(t * 0.06, 0.0, 0.0));
  if (octaves > 2.5) v += 0.25 * curlNoise(p * 1.90 - vec3(0.0, t * 0.09, 0.0));
  return v;
}
`;

/* ------------------------------------------------------------------ *
 * Deterministic hash — the origin of every particle's identity.
 * Same seed ⇒ same population, on every device, forever.
 * ------------------------------------------------------------------ */
export const HASH = glsl`
float hash11(float p){
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

vec3 hash31(float p){
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
`;

/* ------------------------------------------------------------------ *
 * Caustics — genuine interference of two counter-propagating wave
 * systems, sharpened by a power curve. Derived from the same wave
 * function that displaces the surface, never a scrolling texture.
 * ------------------------------------------------------------------ */
export const CAUSTICS = glsl`
float caustic(vec2 uv, float t, float gain){
  vec2 p = uv * 6.0;
  float a = sin(p.x * 1.3 + t * 0.7) + sin(p.y * 1.7 - t * 0.5);
  float b = sin((p.x + p.y) * 1.1 + t * 0.9) + sin((p.x - p.y) * 1.4 - t * 0.6);
  float c = sin(length(p - vec2(3.0)) * 2.1 - t * 1.1);
  float w = (a + b + c) / 5.0;
  return pow(max(0.0, 1.0 - abs(w)), gain);
}
`;

/* sRGB-ish tone shaping shared by the background passes. */
export const TONEMAP = glsl`
vec3 filmic(vec3 x){
  x = max(vec3(0.0), x);
  return (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
}
`;
