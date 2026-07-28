/**
 * The water body: a full-screen atmospheric backdrop rendered behind the
 * membrane, plus the caustic light field.
 *
 * Caustics are the shadow of a surface. They are derived here from the same
 * wave function that displaces the surface itself, rather than faked with a
 * scrolling map — internal consistency that costs hours and reads, to the
 * casual eye, simply as *right*. See docs/PERMEATE.md §IV.
 */
import {
  BackSide,
  Color,
  DoubleSide,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
} from 'three';
import { glsl, SIMPLEX_3D, CAUSTICS, TONEMAP } from './glsl.js';
import { PALETTE } from './palette.js';

/* ------------------------------------------------------------------ *
 * Environment shell — a large inverted sphere holding the water column
 * gradient, depth haze and caustic filaments.
 * ------------------------------------------------------------------ */
const envVertex = glsl`
precision highp float;
varying vec3 vWorld;
varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const envFragment = glsl`
precision highp float;

uniform float uTime;
uniform float uScroll;
uniform float uCausticGain;
uniform float uIntensity;
uniform vec3  uAbyss;
uniform vec3  uDeep;
uniform vec3  uTeal;
uniform vec3  uAqua;
uniform vec2  uResolution;

varying vec3 vWorld;
varying vec2 vUv;

${SIMPLEX_3D}
${CAUSTICS}
${TONEMAP}

void main(){
  // Vertical position in the water column, offset by scroll: descending
  // the page is descending the treatment train.
  float column = clamp((vWorld.y * 0.018) + 0.5 - uScroll * 0.22, 0.0, 1.0);

  // Depth gradient: abyss below, lit water above.
  vec3 col = mix(uAbyss, uDeep, smoothstep(0.0, 0.62, column));
  col = mix(col, uTeal * 0.55, smoothstep(0.55, 1.0, column) * 0.75);

  // Surface light shafts — only in the upper column.
  float shafts = 0.0;
  float sy = smoothstep(0.45, 1.0, column);
  if (sy > 0.001) {
    float a = snoise(vec3(vWorld.x * 0.055, uTime * 0.06, vWorld.z * 0.04));
    float b = snoise(vec3(vWorld.x * 0.11 + 4.0, uTime * 0.09, vWorld.z * 0.07));
    shafts = pow(max(0.0, 0.55 + a * 0.5 + b * 0.28), 3.2) * sy;
  }
  col += uAqua * shafts * 0.16 * uIntensity;

  // Caustics — genuine two-system interference, sharpened by a power curve.
  vec2 cuv = vec2(vWorld.x * 0.03, vWorld.z * 0.03 + vWorld.y * 0.012);
  float c = caustic(cuv, uTime * 0.55, uCausticGain);
  col += uAqua * c * 0.085 * uIntensity * (0.35 + sy * 0.9);

  // Depth haze toward the horizon keeps the shell from reading as a box.
  float horizon = smoothstep(0.0, 1.0, abs(vWorld.y) * 0.02);
  col = mix(col, uAbyss, horizon * 0.35);

  col = filmic(col * 1.05);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class WaterEnvironment {
  constructor() {
    this.uniforms = {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uCausticGain: { value: 5.5 },
      uIntensity: { value: 1 },
      uAbyss: { value: new Color(PALETTE.abyss) },
      uDeep: { value: new Color(PALETTE.deep) },
      uTeal: { value: new Color(PALETTE.teal) },
      uAqua: { value: new Color(PALETTE.aqua) },
      uResolution: { value: new Vector2(1, 1) },
    };

    this.material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: envVertex,
      fragmentShader: envFragment,
      side: BackSide,
      depthWrite: false,
    });

    this.mesh = new Mesh(new SphereGeometry(120, 32, 24), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0;
  }

  update(t, ctx) {
    this.uniforms.uTime.value = t;
    this.uniforms.uScroll.value = ctx.scroll;
  }

  setQuality({ intensity = 1, causticGain = 5.5 } = {}) {
    this.uniforms.uIntensity.value = intensity;
    this.uniforms.uCausticGain.value = causticGain;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/* ------------------------------------------------------------------ *
 * The membrane surface itself — a subtly displaced plane marking the
 * boundary where the verdict is rendered. Deliberately near-invisible:
 * the membrane is a law, not an object (docs/PERMEATE.md §III).
 * ------------------------------------------------------------------ */
const faceVertex = glsl`
precision highp float;
uniform float uTime;
uniform float uScroll;
uniform float uFaceX;
varying vec2 vUv;
varying float vRipple;

${SIMPLEX_3D}

void main(){
  vUv = uv;
  vec3 p = position;
  float r = snoise(vec3(p.x * 0.09, p.y * 0.09, uTime * 0.14));
  vRipple = r;
  p.z += r * 0.5;
  p.y += uScroll * 5.0;
  p.x += uFaceX;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const faceFragment = glsl`
precision highp float;
uniform vec3  uAqua;
uniform float uOpacity;
varying vec2 vUv;
varying float vRipple;

void main(){
  // Fine vertical striation: the spiral-wound element, read edge-on.
  float weave = smoothstep(0.42, 0.5, abs(fract(vUv.x * 190.0) - 0.5));
  float edge = smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.86, vUv.y);
  float body = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
  float a = weave * edge * body * uOpacity * (0.5 + vRipple * 0.5);
  gl_FragColor = vec4(uAqua * (0.7 + vRipple * 0.3), a);
}
`;

export class MembraneFace {
  constructor() {
    this.uniforms = {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uAqua: { value: new Color(PALETTE.aqua) },
      uOpacity: { value: 0.2 },
      uFaceX: { value: 0 },
    };
    this.material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: faceVertex,
      fragmentShader: faceFragment,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    // The face stands vertically at x = 0: feed on the left, permeate on
    // the right, matching the transport direction in membrane.js.
    this.mesh = new Mesh(new PlaneGeometry(22, 26, 40, 40), this.material);
    this.mesh.rotation.y = Math.PI / 2;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  update(t, ctx) {
    this.uniforms.uTime.value = t;
    this.uniforms.uScroll.value = ctx.scroll;
    if (ctx.faceX != null) this.uniforms.uFaceX.value = ctx.faceX;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
