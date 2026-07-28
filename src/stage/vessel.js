/**
 * The pressure vessel — a spiral-wound RO element rendered as real geometry
 * with physically-based glass, so the product itself is the hero object
 * rather than a photograph of one.
 *
 * Built from primitives (no external asset to download): an outer glass
 * shell with transmission + IOR, the wound membrane leaf inside it, end
 * caps, and the permeate tube running the axis.
 */
import {
  CylinderGeometry,
  Color,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  TorusGeometry,
  AdditiveBlending,
  ShaderMaterial,
  DoubleSide,
} from 'three';
import { glsl, SIMPLEX_3D } from './glsl.js';
import { PALETTE } from './palette.js';

/* The wound leaf — an animated spiral sheet, additive so it glows through
 * the shell without needing a second refraction pass. */
const leafVertex = glsl`
precision highp float;
uniform float uTime;
varying vec2 vUv;
varying float vFlow;
${SIMPLEX_3D}
void main(){
  vUv = uv;
  vec3 p = position;
  float n = snoise(vec3(p.x * 1.4, p.y * 0.7, uTime * 0.3));
  vFlow = n;
  p += normal * n * 0.012;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const leafFragment = glsl`
precision highp float;
uniform float uTime;
uniform vec3  uAqua;
uniform vec3  uPermeate;
uniform float uOpacity;
varying vec2 vUv;
varying float vFlow;
void main(){
  // Feed spacer mesh — the diamond weave of a real leaf.
  vec2 g = fract(vUv * vec2(60.0, 14.0)) - 0.5;
  float mesh = smoothstep(0.44, 0.5, max(abs(g.x), abs(g.y)));

  // Permeate travelling inward along the spiral toward the tube.
  float travel = fract(vUv.x * 2.0 - uTime * 0.22);
  float pulse = smoothstep(0.0, 0.14, travel) * smoothstep(0.45, 0.16, travel);

  vec3 col = mix(uAqua * 0.55, uPermeate, pulse * 0.85 + vFlow * 0.1);
  float a = (mesh * 0.32 + pulse * 0.5) * uOpacity;
  a *= smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
  gl_FragColor = vec4(col, a);
}
`;

export class Vessel {
  constructor({ quality = 'high' } = {}) {
    this.group = new Group();
    const seg = quality === 'low' ? 24 : quality === 'mid' ? 40 : 64;

    // --- outer pressure shell: real glass -----------------------------
    this.shellMaterial = new MeshPhysicalMaterial({
      color: new Color(0x9fe8ff),
      metalness: 0,
      roughness: 0.05,
      transmission: 1.0, // glass
      thickness: 0.9, // volume for refraction
      ior: 1.34, // water-filled, not air
      attenuationColor: new Color(PALETTE.teal),
      attenuationDistance: 2.2,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      // Iridescence gives the shell a thin-film edge sheen, which is what
      // actually sells "glass cylinder" at a silhouette level — without it
      // a transmissive tube reads as flat plastic.
      iridescence: 0.55,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [120, 420],
      envMapIntensity: 2.2,
      transparent: true,
      side: DoubleSide,
    });

    const shell = new Mesh(new CylinderGeometry(1.5, 1.5, 6.2, seg, 1, true), this.shellMaterial);
    shell.rotation.z = Math.PI / 2;
    this.group.add(shell);

    // --- wound membrane leaf -----------------------------------------
    this.leafUniforms = {
      uTime: { value: 0 },
      uAqua: { value: new Color(PALETTE.aqua) },
      uPermeate: { value: new Color(PALETTE.permeate) },
      uOpacity: { value: 1 },
    };
    this.leafMaterial = new ShaderMaterial({
      uniforms: this.leafUniforms,
      vertexShader: leafVertex,
      fragmentShader: leafFragment,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });

    // Three nested wound layers read as a spiral without the vertex cost
    // of an actual involute sheet.
    for (let i = 0; i < 3; i++) {
      const r = 0.55 + i * 0.32;
      const leaf = new Mesh(
        new CylinderGeometry(r, r, 5.6, seg, quality === 'low' ? 6 : 14, true),
        this.leafMaterial
      );
      leaf.rotation.z = Math.PI / 2;
      leaf.rotation.x = i * 0.5;
      this.group.add(leaf);
    }

    // --- permeate tube along the axis ---------------------------------
    const tubeMat = new MeshStandardMaterial({
      color: new Color(0x0e2a38),
      metalness: 0.85,
      roughness: 0.32,
      emissive: new Color(PALETTE.aqua),
      emissiveIntensity: 0.18,
    });
    const tube = new Mesh(new CylinderGeometry(0.26, 0.26, 7.1, seg, 1), tubeMat);
    tube.rotation.z = Math.PI / 2;
    this.group.add(tube);

    // --- end caps and anti-telescoping rings --------------------------
    const capMat = new MeshStandardMaterial({
      color: new Color(0x16313f),
      metalness: 0.9,
      roughness: 0.28,
    });
    for (const x of [-3.1, 3.1]) {
      const cap = new Mesh(new CylinderGeometry(1.62, 1.5, 0.42, seg, 1), capMat);
      cap.rotation.z = Math.PI / 2;
      cap.position.x = x;
      this.group.add(cap);

      const ring = new Mesh(
        new TorusGeometry(1.5, 0.075, quality === 'low' ? 6 : 12, seg),
        new MeshStandardMaterial({
          color: new Color(PALETTE.aqua),
          metalness: 0.6,
          roughness: 0.25,
          emissive: new Color(PALETTE.aqua),
          emissiveIntensity: 0.5,
        })
      );
      ring.rotation.y = Math.PI / 2;
      ring.position.x = x * 0.78;
      this.group.add(ring);
    }

    this.group.rotation.set(0.18, -0.45, 0.06);
  }

  update(t, ctx) {
    this.leafUniforms.uTime.value = t;
    // Slow presentation spin, nudged by pointer — never fully hands-off,
    // never fully hands-on.
    this.group.rotation.y = -0.45 + Math.sin(t * 0.16) * 0.22 + ctx.pointer.x * 0.28;
    this.group.rotation.x = 0.18 + ctx.pointer.y * -0.16;
    this.group.position.y = Math.sin(t * 0.5) * 0.09;
  }

  /** Transmission is the single most expensive material feature — drop it first. */
  setQuality({ transmission = true }) {
    if (!transmission) {
      this.shellMaterial.transmission = 0;
      this.shellMaterial.opacity = 0.28;
      this.shellMaterial.roughness = 0.22;
    } else {
      this.shellMaterial.transmission = 1;
      this.shellMaterial.opacity = 1;
      this.shellMaterial.roughness = 0.08;
    }
    this.shellMaterial.needsUpdate = true;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
