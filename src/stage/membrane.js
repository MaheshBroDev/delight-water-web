/**
 * THE MEMBRANE — the governing operator of the stage.
 *
 * Every particle carries a hidden scalar (solute load) decided by its seed.
 * At the membrane plane a verdict is rendered: below threshold it permeates
 * — cooling, slowing, laminarising into the bright aqua of clean water.
 * Above threshold it is rejected tangentially into the brine channel, where
 * it darkens and accelerates out of frame.
 *
 * Position is never integrated, only evaluated: a pure function of (seed, t)
 * resolved entirely in the vertex stage. Scrub time backwards and the water
 * un-mixes perfectly. See docs/PERMEATE.md §II–III.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  BufferAttribute,
  Color,
  Points,
  ShaderMaterial,
  Vector2,
} from 'three';
import { glsl, SIMPLEX_3D, CURL_NOISE, HASH } from './glsl.js';
import { PALETTE } from './palette.js';

const vertexShader = glsl`
precision highp float;

attribute float aSeed;

uniform float uTime;
uniform float uFlux;
uniform float uRecovery;
uniform float uPolarisation;
uniform float uOctaves;
uniform float uSize;
uniform float uPixelRatio;
uniform float uScroll;
uniform vec2  uPointer;
uniform float uPointerForce;
uniform float uFaceX;

varying float vSolute;     // hidden scalar, revealed only through behaviour
varying float vPermeated;  // 1.0 once the particle has crossed
varying float vSpeed;
varying float vDepth;
varying float vPressure;   // concentration polarisation at the face
varying float vAlive;

${SIMPLEX_3D}
${CURL_NOISE}
${HASH}

void main(){
  vec3 rnd = hash31(aSeed * 7.13 + 1.7);

  // --- solute load: invisible, decides everything -------------------
  float solute = hash11(aSeed * 3.77 + 9.1);
  vSolute = solute;

  // Particles below the recovery threshold are destined to permeate.
  float passes = step(solute, uRecovery);
  vPermeated = passes;

  // --- lifetime: each particle re-enters on its own phase -----------
  float life = 15.0 + rnd.z * 9.0;
  float phase = fract((uTime + rnd.x * life) / life);

  // Birth: a slab on the FEED side, upstream of the membrane.
  //
  // The membrane is a vertical plane at x = 0, so the whole process reads
  // left-to-right across the viewport: murky feed on the left (where the
  // headline sits, and where low luminance aids legibility), clean permeate
  // breaking into the open space on the right. The composition *is* the
  // process — see docs/PERMEATE.md §III.
  vec3 birth = vec3(
    -20.0 - rnd.z * 8.0,
    (rnd.y - 0.5) * 19.0,
    (rnd.x - 0.5) * 13.0
  );

  float t = phase * life;
  vec3 p = birth;

  // Bulk cross-flow toward the face. Feed water is pushed, not drifting.
  p.x += t * (1.55 + solute * 0.35) * uFlux;

  // Curl advection — incompressible, so it reads as liquid, not smoke.
  vec3 field = flowField(p * 0.11 + vec3(aSeed * 0.001), uTime, uOctaves);

  // --- concentration polarisation ----------------------------------
  // Approaching the face, particles compress: spacing tightens, velocity
  // rises, and a bright meniscus of pressure forms. Every RO engineer
  // knows this layer; the viewer only feels it.
  float toFace = abs(p.x);
  float pressure = exp(-toFace * 0.42) * uPolarisation;
  vPressure = pressure;

  // Rejected water is still turbulent; permeate laminarises past the face.
  float crossed = smoothstep(-1.0, 2.5, p.x);
  float turbulence = mix(1.0, 0.14, passes * crossed);
  p += field * (1.5 + solute * 1.4) * turbulence * uFlux;

  // Pressure piles material up against the face and slows it there.
  p.x -= pressure * 1.1 * (1.0 - passes * 0.35);
  p.y += pressure * (rnd.y - 0.5) * 1.6;

  // --- the verdict --------------------------------------------------
  // Rejected: never crosses. Swept tangentially down the face into the
  // brine channel, accelerating as it goes.
  vec3 brine = p;
  brine.x = min(p.x, 0.4) - crossed * (1.0 + solute * 2.2);
  brine.y -= crossed * (4.5 + solute * 7.0) * uFlux;
  brine.z += sin(uTime * 0.3 + aSeed) * crossed * 0.8;

  // Permeated: transfigured. Collapses onto a small number of laminar
  // streamlines and runs clean to the permeate side.
  vec3 clean = p;
  clean.x = p.x + crossed * 7.0 * uFlux;
  // Collapse toward discrete streamlines — the ordered signature of
  // water that has been through the membrane.
  float lane = floor(rnd.y * 5.0) - 2.0;
  clean.y = mix(p.y, lane * 2.3 + sin(uTime * 0.5 + lane) * 0.35, crossed * 0.72);
  clean.z = mix(p.z, p.z * 0.55, crossed * 0.6);

  p = mix(brine, clean, passes);

  // Shift the whole process so the membrane plane coincides with the
  // pressure vessel: feed enters the element from the left, permeate
  // leaves it to the right. The vessel is not decoration next to the
  // simulation — it is the thing the simulation passes through.
  p.x += uFaceX;

  // --- pointer: a hand disturbing the surface -----------------------
  vec2 d = p.xy - uPointer * vec2(13.0, 8.0);
  float dist = length(d);
  float push = uPointerForce * exp(-dist * dist * 0.018);
  p.xy += normalize(d + 1e-4) * push * 2.4;

  // --- scroll: the camera descends the treatment train --------------
  p.y += uScroll * 5.0;

  // Fade in at birth, out at death — no popping.
  float alive = smoothstep(0.0, 0.06, phase) * (1.0 - smoothstep(0.86, 1.0, phase));

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  vSpeed = clamp(length(field) * uFlux * 0.45 + pressure * 0.6, 0.0, 1.5);

  gl_Position = projectionMatrix * mv;

  // Near-field cull: particles that drift between the camera and the
  // subject read as dirt on the lens, not as water. Fade them out well
  // before they can bloom into foreground blobs.
  float nearFade = smoothstep(2.5, 8.0, vDepth);
  vAlive = alive * nearFade;

  float size = uSize * (0.55 + solute * 0.35) * (1.0 + pressure * 0.9);
  size *= mix(1.0, 1.3, passes); // permeate reads slightly larger, brighter
  // Perspective scaling, clamped so nothing becomes a saucer up close.
  float persp = min(34.0 / max(vDepth, 1.0), 3.2);
  gl_PointSize = clamp(size * uPixelRatio * persp, 0.0, 9.0 * uPixelRatio) * step(0.001, vAlive);
}
`;

const fragmentShader = glsl`
precision highp float;

uniform vec3  uBrine;
uniform vec3  uMineral;
uniform vec3  uAqua;
uniform vec3  uPermeate;
uniform float uOpacity;

varying float vSolute;
varying float vPermeated;
varying float vSpeed;
varying float vDepth;
varying float vPressure;
varying float vAlive;

void main(){
  // Soft round sprite, no texture fetch.
  vec2 uv = gl_PointCoord - 0.5;
  float r = dot(uv, uv);
  if (r > 0.25) discard;
  float core = exp(-r * 11.0);
  float halo = exp(-r * 3.4) * 0.42;

  // Hue reports solute load; luminance reports velocity.
  vec3 dirty = mix(uMineral, uBrine, vSolute);
  vec3 pure  = mix(uAqua, uPermeate, 0.35 + vSpeed * 0.4);
  vec3 col   = mix(dirty, pure, vPermeated);

  // Pressure at the membrane face burns brighter.
  col += uPermeate * vPressure * 0.35;
  col *= 0.72 + vSpeed * 0.85;

  // Alpha reports depth below the surface.
  float depthFade = smoothstep(52.0, 9.0, vDepth);
  float a = (core * 0.55 + halo * 0.34) * uOpacity * depthFade * vAlive;
  // Rejected particles sit back in the image; only permeate is allowed to
  // read as bright. Purity is the brightest fact on screen (§IV) — and it
  // keeps the murky feed side from competing with the headline over it.
  a *= mix(0.2, 1.0, vPermeated);

  gl_FragColor = vec4(col, a);
}
`;

export class Membrane {
  constructor({ count = 18000, seed = 20080517 } = {}) {
    this.count = count;
    this.seed = seed;

    const geometry = new BufferGeometry();
    const seeds = new Float32Array(count);
    // Deterministic per-particle identity from a single origin seed.
    let s = seed >>> 0;
    for (let i = 0; i < count; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      seeds[i] = (s / 4294967296) * 1000;
    }
    geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
    // Dummy position attribute — real position is evaluated in the shader.
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
    geometry.boundingSphere = null;
    geometry.frustumCulled = false;

    this.uniforms = {
      uTime: { value: 0 },
      uFlux: { value: 1 },
      uRecovery: { value: 0.62 }, // brackish-water RO recovery — see §III
      uPolarisation: { value: 1.15 },
      uOctaves: { value: 3 },
      uSize: { value: 2.6 },
      uPixelRatio: { value: 1 },
      uScroll: { value: 0 },
      uPointer: { value: new Vector2(0, 0) },
      uPointerForce: { value: 0 },
      uFaceX: { value: 0 },
      uOpacity: { value: 0.95 },
      uBrine: { value: new Color(PALETTE.brine) },
      uMineral: { value: new Color(PALETTE.mineral) },
      uAqua: { value: new Color(PALETTE.aqua) },
      uPermeate: { value: new Color(PALETTE.permeate) },
    };

    this.material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
    });

    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  update(t, ctx) {
    const u = this.uniforms;
    u.uTime.value = t;
    u.uScroll.value = ctx.scroll;
    u.uPointer.value.set(ctx.pointer.x, ctx.pointer.y);
    u.uPointerForce.value = ctx.pointerForce;
    u.uFlux.value = ctx.flux;
    if (ctx.faceX != null) u.uFaceX.value = ctx.faceX;
  }

  setQuality({ pixelRatio, octaves, size }) {
    this.uniforms.uPixelRatio.value = pixelRatio;
    if (octaves != null) this.uniforms.uOctaves.value = octaves;
    if (size != null) this.uniforms.uSize.value = size;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
