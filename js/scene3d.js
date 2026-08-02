/* =========================================================================
   DELIGHT WATER SOLUTIONS — IMMERSIVE 3D / WebGL ENGINE
   -------------------------------------------------------------------------
   Two GPU-accelerated WebGL scenes (Three.js, vendored in /vendor):

     1. #bg-canvas   – a full-viewport "submerged in flowing water" scene.
                       Undulating flowing water surface (custom GLSL waves +
                       caustics), volumetric god-rays, GPU rising bubbles,
                       drifting current particles, bokeh light & parallax.
     2. #ro-canvas   – an interactive, auto-rotating 3D Reverse-Osmosis
                       water-filter system with a UV chamber (modelled on the
                       Sketchfab "RO Product Water Filter System with UV"),
                       built procedurally from polished steel, glass filter
                       canisters, a glowing UV reactor, pressure gauges, a
                       pump, and visibly *flowing* water through clear tubes.

   Design goals (client brief): fully-immersed WebGL, extremely fast rendering,
   clean flowing water, "million-dollar" finish.
   Performance: capped DPR, render-gated by IntersectionObserver / visibility,
   GPU-side particle animation (no per-frame CPU loops), reduced-motion mode,
   graceful fallback to the existing CSS water theme when WebGL is unavailable.
   ========================================================================= */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

(() => {
  'use strict';

  /* ----------------------- environment / capability ----------------------- */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const isLowPower = isMobile || (navigator.hardwareConcurrency || 4) <= 4;

  function webglOK() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) ||
             !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
    } catch (e) { return false; }
  }

  if (!webglOK()) return;                // CSS water theme stays as the fallback
  document.body.classList.add('webgl');

  /* shared clock + time-scaler (reduced-motion => calm, slow water) */
  const clock = new THREE.Clock();
  const timeScale = reduceMotion ? 0.12 : 1.0;
  const TEX = (s) => { s.colorSpace = THREE.SRGBColorSpace; return s; };

  /* =========================================================================
     PROCEDURAL SPRITE TEXTURES (drawn once on a canvas — zero network cost)
     ========================================================================= */
  function bubbleTexture() {
    const s = 128, c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');
    // soft body
    const g = x.createRadialGradient(s/2, s/2, 2, s/2, s/2, s/2 - 2);
    g.addColorStop(0.0, 'rgba(210,245,255,0.10)');
    g.addColorStop(0.62, 'rgba(150,220,255,0.06)');
    g.addColorStop(0.92, 'rgba(190,240,255,0.55)');
    g.addColorStop(1.0, 'rgba(120,200,255,0.0)');
    x.fillStyle = g; x.beginPath(); x.arc(s/2, s/2, s/2 - 1, 0, Math.PI*2); x.fill();
    // bright rim
    x.strokeStyle = 'rgba(220,247,255,0.85)';
    x.lineWidth = 2.4;
    x.beginPath(); x.arc(s/2, s/2, s/2 - 5, 0, Math.PI*2); x.stroke();
    // specular highlight
    const h = x.createRadialGradient(s*0.36, s*0.34, 0, s*0.36, s*0.34, s*0.16);
    h.addColorStop(0, 'rgba(255,255,255,0.95)');
    h.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = h; x.beginPath(); x.arc(s*0.36, s*0.34, s*0.16, 0, Math.PI*2); x.fill();
    return TEX(new THREE.CanvasTexture(c));
  }

  function softDiscTexture() {
    const s = 64, c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(200,240,255,0.7)');
    g.addColorStop(1, 'rgba(120,200,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    return TEX(new THREE.CanvasTexture(c));
  }

  function rayTexture() {
    const w = 64, h = 256, c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    // horizontal soft band (transparent edges -> bright core)
    const gh = x.createLinearGradient(0, 0, w, 0);
    gh.addColorStop(0.0, 'rgba(150,225,255,0)');
    gh.addColorStop(0.5, 'rgba(190,240,255,0.9)');
    gh.addColorStop(1.0, 'rgba(150,225,255,0)');
    x.fillStyle = gh; x.fillRect(0, 0, w, h);
    // vertical fade (bright top -> transparent bottom)
    x.globalCompositeOperation = 'destination-in';
    const gv = x.createLinearGradient(0, 0, 0, h);
    gv.addColorStop(0.0, 'rgba(255,255,255,1)');
    gv.addColorStop(0.55, 'rgba(255,255,255,0.5)');
    gv.addColorStop(1.0, 'rgba(255,255,255,0)');
    x.fillStyle = gv; x.fillRect(0, 0, w, h);
    return TEX(new THREE.CanvasTexture(c));
  }

  function verticalGradientTexture(top, bottom) {
    const w = 8, h = 256, c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function gaugeFaceTexture() {
    const s = 256, c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');
    x.fillStyle = '#0b2233'; x.beginPath(); x.arc(s/2, s/2, s/2 - 4, 0, Math.PI*2); x.fill();
    x.strokeStyle = '#9fe9ff'; x.lineWidth = 6; x.stroke();
    x.strokeStyle = '#cdeffb';
    for (let i = 0; i <= 10; i++) {
      const a = (-150 + i * 30) * Math.PI / 180;
      const r1 = s/2 - 16, r2 = s/2 - 34;
      x.lineWidth = i % 5 === 0 ? 5 : 2.5;
      x.beginPath();
      x.moveTo(s/2 + Math.cos(a) * r1, s/2 + Math.sin(a) * r1);
      x.lineTo(s/2 + Math.cos(a) * r2, s/2 + Math.sin(a) * r2);
      x.stroke();
    }
    x.fillStyle = '#dff4ff'; x.font = 'bold 26px Inter, Arial'; x.textAlign = 'center';
    x.fillText('PSI', s/2, s/2 + 30);
    x.fillText('bar', s/2, s/2 + 58);
    return TEX(new THREE.CanvasTexture(c));
  }

  /* =========================================================================
     SHARED GLSL — flowing caustic pattern
     ========================================================================= */
  const CAUSTIC_GLSL = `
    float caustic(vec2 p, float t){
      float c = 0.0;
      c += sin(p.x*1.0 + t)         * sin(p.y*1.2 - t*0.8);
      c += 0.6 * sin(p.x*1.7 - t*0.7 + p.y*0.9);
      c += 0.4 * sin((p.x + p.y)*1.3 + t*0.5);
      return c;
    }
  `;

  /* =========================================================================
     SCENE 1 — FLOWING-WATER BACKGROUND
     ========================================================================= */
  function initBackground() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return null;

    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: !isLowPower, alpha: false, powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
    renderer.setClearColor(0x012744, 1);   // deep-water clear (avoids any flash before frame 1)
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const FOG = new THREE.Color(0x012744);
    scene.background = verticalGradientTexture('#0a5a86', '#01182e');
    scene.fog = new THREE.Fog(0x013a5c, 18, 60);

    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 220);
    camera.position.set(0, 0, 12);

    /* ---- backdrop caustic light plane (fills whole frame with shimmer) ---- */
    const causticMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x6fd8ff) } },
      vertexShader: `
        varying vec2 vUv; varying float vDist;
        void main(){
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying float vDist;
        ${CAUSTIC_GLSL}
        void main(){
          vec2 p = vUv*5.5 + vec2(uTime*0.22, uTime*0.06);
          float c = pow(abs(caustic(p, uTime*0.45)), 2.2);
          float fade = smoothstep(48.0, 12.0, vDist);
          gl_FragColor = vec4(uColor, c * 0.55 * fade);
        }`
    });
    const causticPlane = new THREE.Mesh(new THREE.PlaneGeometry(120, 70), causticMat);
    causticPlane.position.set(0, 0, -34);
    scene.add(causticPlane);

    /* ---- flowing water surface (the "ceiling" above the viewer) ---- */
    const SEG = isMobile ? 150 : 240;
    const waterUniforms = {
      uTime: { value: 0 },
      uDeep:    { value: new THREE.Color(0x023e63) },
      uShallow: { value: new THREE.Color(0x7fe9ff) },
      uFog:     { value: FOG }
    };
    const waterMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: waterUniforms,
      vertexShader: `
        uniform float uTime; varying vec2 vUv; varying float vWave; varying float vDist;
        void main(){
          vUv = uv;
          vec3 p = position;
          float t = uTime;
          float w = 0.0;
          w += sin(p.x*0.55 + t*1.10)*0.30;
          w += sin(p.y*0.70 - t*0.85)*0.22;
          w += sin((p.x+p.y)*0.42 + t*1.50)*0.12;
          w += sin((p.x-p.y)*0.60 + t*0.60)*0.08;
          p.z += w;
          vWave = w;
          vec4 mv = viewMatrix * modelMatrix * vec4(p,1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFog;
        varying vec2 vUv; varying float vWave; varying float vDist;
        ${CAUSTIC_GLSL}
        void main(){
          vec3 col = mix(uDeep, uShallow, smoothstep(-0.35, 0.42, vWave));
          vec2 cuv = vUv*9.0 + vec2(uTime*0.25, uTime*0.07);
          float c = pow(clamp(abs(caustic(cuv, uTime*0.5)), 0.0, 1.0), 2.0);
          col += vec3(0.55, 0.95, 1.0) * c * 0.22;
          float peak = smoothstep(0.28, 0.45, vWave);
          col += vec3(1.0) * peak * 0.18;
          float fog = smoothstep(22.0, 58.0, vDist);
          col = mix(col, uFog, fog);
          gl_FragColor = vec4(col, 1.0);
        }`
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(120, 120, SEG, SEG), waterMat);
    water.rotation.x = -Math.PI / 2;     // lay it flat (horizontal ceiling)
    water.position.y = 9.5;
    scene.add(water);

    /* ---- a faint floor of water for depth symmetry ---- */
    const floorMat = waterMat.clone();
    floorMat.uniforms = {
      uTime: waterUniforms.uTime,
      uDeep: { value: new THREE.Color(0x011a2c) },
      uShallow: { value: new THREE.Color(0x0a4f72) },
      uFog: { value: FOG }
    };
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 140, 90, 90), floorMat);
    floor.rotation.x = Math.PI / 2;
    floor.position.y = -11;
    scene.add(floor);

    /* ---- volumetric god-ray shafts ---- */
    const rayTex = rayTexture();
    const rays = new THREE.Group();
    const RAY_COUNT = isMobile ? 4 : 7;
    for (let i = 0; i < RAY_COUNT; i++) {
      const m = new THREE.MeshBasicMaterial({
        map: rayTex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0.0, color: 0xbfefff
      });
      const w = 1.4 + Math.random() * 2.2;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, 26), m);
      mesh.position.set((i - RAY_COUNT/2) * 3.2 + (Math.random()-0.5)*2, 4.5, -8 - Math.random()*6);
      mesh.rotation.z = (Math.random() - 0.5) * 0.25;
      mesh.userData = { base: 0.05 + Math.random()*0.10, ph: Math.random()*Math.PI*2, sp: 0.4 + Math.random()*0.7 };
      rays.add(mesh);
    }
    scene.add(rays);

    /* ---- GPU rising bubbles ---- */
    function makeBubbles(count, area, yMin, yMax, sMin, sMax) {
      const pos = new Float32Array(count * 3);
      const scale = new Float32Array(count);
      const speed = new Float32Array(count);
      const phase = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        pos[i*3]   = (Math.random()-0.5) * area;
        pos[i*3+1] = yMin + Math.random() * (yMax - yMin);
        pos[i*3+2] = (Math.random()-0.5) * area * 0.8;
        scale[i]   = sMin + Math.random() * (sMax - sMin);
        speed[i]   = 0.05 + Math.random() * 0.12;
        phase[i]   = Math.random();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
      g.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
      g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uTime: { value: 0 }, uTex: { value: bubbleTexture() }, uPR: { value: renderer.getPixelRatio() } },
        vertexShader: `
          attribute float aScale; attribute float aSpeed; attribute float aPhase;
          uniform float uTime; uniform float uPR; varying float vA;
          void main(){
            vec3 p = position;
            float t = fract(uTime * aSpeed + aPhase);
            p.y = position.y + (t - 0.5) * 26.0;
            p.x += sin(uTime*0.5 + aPhase*6.2831) * 2.2;
            p.z += cos(uTime*0.4 + aPhase*6.2831) * 2.2;
            vec4 mv = modelViewMatrix * vec4(p,1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = aScale * uPR * (300.0 / -mv.z);
            vA = sin(t * 3.14159);
          }`,
        fragmentShader: `
          uniform sampler2D uTex; varying float vA;
          void main(){
            vec4 t = texture2D(uTex, gl_PointCoord);
            gl_FragColor = vec4(t.rgb, t.a * vA * 0.8);
          }`
      });
      return new THREE.Points(g, mat);
    }
    const bubbles = makeBubbles(isMobile ? 60 : 120, 46, -8, 8, 14, 60);
    scene.add(bubbles);

    /* ---- fine suspended current particles (drifting in +x) ---- */
    function makeParticles(count) {
      const pos = new Float32Array(count * 3);
      const seed = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        pos[i*3] = (Math.random()-0.5)*60;
        pos[i*3+1] = (Math.random()-0.5)*26;
        pos[i*3+2] = (Math.random()-0.5)*40 - 4;
        seed[i] = Math.random();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime:{value:0}, uTex:{value:softDiscTexture()}, uPR:{value:renderer.getPixelRatio()} },
        vertexShader: `
          attribute float aSeed; uniform float uTime; uniform float uPR; varying float vA;
          void main(){
            vec3 p = position;
            p.x = mod(position.x + uTime*(1.2 + aSeed*1.5) + 30.0, 60.0) - 30.0;
            p.y += sin(uTime*0.5 + aSeed*6.28)*0.6;
            vec4 mv = modelViewMatrix * vec4(p,1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = (1.5 + aSeed*2.5) * uPR * (120.0/-mv.z);
            vA = 0.4 + aSeed*0.5;
          }`,
        fragmentShader: `
          uniform sampler2D uTex; varying float vA;
          void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(t.rgb, t.a*vA); }`
      });
      return new THREE.Points(g, mat);
    }
    const particles = makeParticles(isMobile ? 160 : 360);
    scene.add(particles);

    /* ---- soft bokeh light discs (depth & luxury) ---- */
    const bokehTex = softDiscTexture();
    const bokeh = new THREE.Group();
    const BC = isMobile ? 5 : 9;
    for (let i = 0; i < BC; i++) {
      const m = new THREE.SpriteMaterial({ map: bokehTex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0.12 + Math.random()*0.14, color: 0x9fe8ff });
      const sp = new THREE.Sprite(m);
      const sc = 3 + Math.random()*7;
      sp.scale.set(sc, sc, 1);
      sp.position.set((Math.random()-0.5)*40, (Math.random()-0.5)*18, -6 - Math.random()*20);
      sp.userData = { ph: Math.random()*6.28, sp: 0.2 + Math.random()*0.4 };
      bokeh.add(sp);
    }
    scene.add(bokeh);

    /* ---- pointer parallax ---- */
    const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
    window.addEventListener('pointermove', (e) => {
      target.x = (e.clientX / window.innerWidth  - 0.5);
      target.y = (e.clientY / window.innerHeight - 0.5);
    }, { passive: true });

    function resize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    let t = 0;
    function render(dt) {
      t += dt * timeScale;
      waterUniforms.uTime.value = t;
      causticMat.uniforms.uTime.value = t;
      bubbles.material.uniforms.uTime.value = t;
      particles.material.uniforms.uTime.value = t;

      // god-rays shimmer
      rays.children.forEach(r => {
        r.material.opacity = r.userData.base + Math.sin(t*r.userData.sp + r.userData.ph)*0.05;
        r.rotation.z += dt * 0.02;
      });
      bokeh.children.forEach(b => { b.material.opacity = 0.10 + Math.sin(t*b.userData.sp + b.userData.ph)*0.05 + 0.06; });

      // camera parallax + gentle bob
      cur.x += (target.x - cur.x) * 0.04;
      cur.y += (target.y - cur.y) * 0.04;
      camera.position.x = cur.x * 3.2;
      camera.position.y = -cur.y * 2.0 + Math.sin(t*0.25)*0.4;
      camera.lookAt(cur.x*1.2, 1.6 + cur.y*1.0, 0);

      renderer.render(scene, camera);
    }
    return { render, canvas };
  }

  /* =========================================================================
     SCENE 2 — INTERACTIVE 3D RO WATER-FILTER SYSTEM (with UV)
     ========================================================================= */
  function initROViewer() {
    const canvas = document.getElementById('ro-canvas');
    if (!canvas) return null;
    const fallback = document.getElementById('ro-fallback');

    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true, powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 2 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();

    /* image-based lighting for premium metal/glass reflections */
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(6.2, 3.4, 7.2);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 6;
    controls.maxDistance = 12;
    controls.minPolarAngle = 0.5;
    controls.maxPolarAngle = Math.PI / 2 + 0.15;
    controls.autoRotate = !reduceMotion;
    controls.autoRotateSpeed = 1.1;
    controls.target.set(0, 1.35, 0);

    /* ------------------------------- lights -------------------------------- */
    scene.add(new THREE.HemisphereLight(0xbfeaff, 0x123a55, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(5, 9, 6); scene.add(key);
    const fill = new THREE.DirectionalLight(0x6fd8ff, 0.9);
    fill.position.set(-6, 4, -4); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 1.1);
    rim.position.set(-2, 6, -7); scene.add(rim);
    const uvGlow = new THREE.PointLight(0x66e6ff, 9, 7, 2);   // inside the UV chamber
    uvGlow.position.set(1.9, 1.55, 0); scene.add(uvGlow);

    /* ----------------------------- materials ------------------------------- */
    const M = {
      steel:   new THREE.MeshPhysicalMaterial({ color: 0xd3dee6, metalness: 0.95, roughness: 0.26, envMapIntensity: 1.3 }),
      darkSteel:new THREE.MeshPhysicalMaterial({ color: 0x6c7886, metalness: 0.9, roughness: 0.4, envMapIntensity: 1.0 }),
      black:   new THREE.MeshPhysicalMaterial({ color: 0x1b2733, metalness: 0.6, roughness: 0.5 }),
      cap:     new THREE.MeshPhysicalMaterial({ color: 0x143a52, metalness: 0.4, roughness: 0.35, clearcoat: 0.8 }),
      glass:   new THREE.MeshPhysicalMaterial({ color: 0xbfeaff, metalness: 0, roughness: 0.05, transparent: true,
                 opacity: 0.32, clearcoat: 1, clearcoatRoughness: 0.04, ior: 1.45, side: THREE.DoubleSide, envMapIntensity: 1.4 }),
      water:   new THREE.MeshPhysicalMaterial({ color: 0x2bb8ff, metalness: 0, roughness: 0.12, transparent: true,
                 opacity: 0.55, emissive: 0x0a3f63, emissiveIntensity: 0.4, clearcoat: 1 }),
      cartridge:new THREE.MeshPhysicalMaterial({ color: 0xeef6fb, metalness: 0, roughness: 0.6 }),
      uv:      new THREE.MeshStandardMaterial({ color: 0x9beeff, emissive: 0x6cf0ff, emissiveIntensity: 2.6 }),
      ring:    new THREE.MeshBasicMaterial({ color: 0x6fe6ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    };

    /* ----------------------------- helpers -------------------------------- */
    const group = new THREE.Group();
    scene.add(group);

    // oriented cylinder between two points
    function pipe(a, b, r, mat, seg = 18) {
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = Math.max(0.001, dir.length());
      const geo = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
      return m;
    }
    // capped cylinder (body + 2 rims)
    function can(r, h, mat) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 36, 1, true), mat);
      g.add(body);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06, 36), mat);
      top.position.y = h/2; g.add(top);
      const bot = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06, 36), mat);
      bot.position.y = -h/2; g.add(bot);
      return g;
    }
    // a glass filter canister with internal cartridge + blue water
    function filterCanister(x) {
      const g = new THREE.Group();
      const R = 0.46, H = 2.5;
      const housing = can(R, H, M.glass); g.add(housing);
      // end caps (blue)
      const capTop = new THREE.Mesh(new THREE.CylinderGeometry(R+0.04, R+0.04, 0.32, 36), M.cap);
      capTop.position.y = H/2 + 0.16; g.add(capTop);
      const capBot = new THREE.Mesh(new THREE.CylinderGeometry(R+0.04, R+0.04, 0.32, 36), M.cap);
      capBot.position.y = -H/2 - 0.16; g.add(capBot);
      // blue water column
      const water = new THREE.Mesh(new THREE.CylinderGeometry(R-0.05, R-0.05, H-0.2, 32), M.water);
      g.add(water);
      // white filter cartridge
      const cart = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, H-0.5, 28), M.cartridge);
      g.add(cart);
      // mounting collar on top cap
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.22, 18), M.steel);
      collar.position.y = H/2 + 0.42; g.add(collar);
      g.position.set(x, 1.55, 0);
      return g;
    }
    // clear flowing sight-tube (glass) along a CatmullRom path + animated rings
    function flowTube(points, r, store) {
      const curve = new THREE.CatmullRomCurve3(points);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, r, 16, false), M.glass);
      group.add(tube);
      const len = curve.getLength();
      const RING_N = 5;
      const ringGeo = new THREE.TorusGeometry(r * 0.78, r * 0.28, 10, 20);
      for (let i = 0; i < RING_N; i++) {
        const ring = new THREE.Mesh(ringGeo, M.water.clone());
        ring.material.opacity = 0.85;
        store.push({ mesh: ring, curve, len, t: i / RING_N });
        group.add(ring);
      }
      return { curve, len };
    }
    // pressure gauge
    function gauge(x) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.16, 28), M.steel);
      body.rotation.x = Math.PI/2; g.add(body);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.17, 32),
        new THREE.MeshStandardMaterial({ map: gaugeFaceTexture(), roughness: 0.4, metalness: 0.1 }));
      face.position.z = 0.081; face.rotation.x = 0; g.add(face);
      // bezel ring
      const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 12, 32), M.steel);
      bezel.position.z = 0.08; g.add(bezel);
      // needle
      const needle = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.14, 0.01),
        new THREE.MeshStandardMaterial({ color: 0xff5a5a, emissive: 0x551111, emissiveIntensity: 0.4 }));
      needle.position.set(0.05, 0.02, 0.085); needle.rotation.z = -0.7;
      g.add(needle);
      // glass cover
      const cover = new THREE.Mesh(new THREE.CircleGeometry(0.18, 32),
        new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0.05, clearcoat: 1 }));
      cover.position.z = 0.095; g.add(cover);
      // riser
      const riser = pipe(new THREE.Vector3(0,-0.1,0), new THREE.Vector3(0,-1.0,0), 0.05, M.steel);
      g.add(riser);
      g.position.set(x, 3.1, 0.55);
      return g;
    }

    /* ----------------------------- build it ------------------------------- */
    const flowRings = [];

    // stainless skid frame
    const frame = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.16, 1.7), M.steel);
    slab.position.y = 0.18; frame.add(slab);
    // rails
    [-0.7, 0.7].forEach(z => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 0.12), M.darkSteel);
      rail.position.set(0, 0.30, z); frame.add(rail);
    });
    // legs
    [[-2.2,-0.7],[2.2,-0.7],[-2.2,0.7],[2.2,0.7]].forEach(([x,z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.16), M.darkSteel);
      leg.position.set(x, -0.02, z); frame.add(leg);
    });
    // feet pads
    [[-2.2,-0.7],[2.2,-0.7],[-2.2,0.7],[2.2,0.7]].forEach(([x,z]) => {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 18), M.black);
      pad.position.set(x, -0.24, z); frame.add(pad);
    });
    group.add(frame);

    // three filter canisters
    const cX = [-1.45, -0.5, 0.45];
    cX.forEach(x => group.add(filterCanister(x)));

    // top manifold (horizontal steel tube linking canister collars)
    const manifoldY = 2.62;
    group.add(pipe(new THREE.Vector3(cX[0], manifoldY, 0), new THREE.Vector3(cX[2], manifoldY, 0), 0.09, M.steel, 24));
    // risers from each canister collar to manifold
    cX.forEach(x => group.add(pipe(new THREE.Vector3(x, 2.42, 0), new THREE.Vector3(x, manifoldY, 0), 0.07, M.steel)));

    // ---- UV reactor (horizontal stainless cylinder with glowing tube) ----
    const uv = new THREE.Group();
    const uvBody = can(0.36, 1.5, M.steel);
    uvBody.rotation.z = Math.PI / 2;      // lay the chamber horizontally along X
    uv.add(uvBody);
    // glowing inner quartz tube (oriented along X)
    const quartz = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.46, 24), M.uv);
    quartz.rotation.z = Math.PI / 2; uv.add(quartz);
    // end bells (oriented along X, just past each end)
    [-0.8, 0.8].forEach(x => {
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.36, 0.2, 28), M.steel);
      bell.rotation.z = Math.PI / 2; bell.position.x = x; uv.add(bell);
    });
    // mounting brackets below the chamber
    [-0.5, 0.5].forEach(x => {
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), M.darkSteel);
      br.position.set(x, -0.45, 0); uv.add(br);
    });
    uv.position.set(1.9, 1.55, 0);
    group.add(uv);

    // pipe: manifold right end -> up -> into UV inlet (front bell)
    group.add(pipe(new THREE.Vector3(cX[2], manifoldY, 0), new THREE.Vector3(1.9, manifoldY, 0), 0.07, M.steel));
    group.add(pipe(new THREE.Vector3(1.9, manifoldY, 0), new THREE.Vector3(1.9, 2.3, 0), 0.07, M.steel));

    // ---- clear FLOWING sight-tubes (visibly moving water) ----
    // tube A: from last canister top, looping into the UV reactor
    flowTube([
      new THREE.Vector3(cX[2], 2.5, 0.0),
      new THREE.Vector3(1.0, 2.55, 0.0),
      new THREE.Vector3(1.7, 2.1, 0.0),
      new THREE.Vector3(1.9, 1.9, 0.0)
    ], 0.085, flowRings);
    // tube B: UV outlet rising to the clean-water faucet
    flowTube([
      new THREE.Vector3(1.9, 1.2, 0.0),
      new THREE.Vector3(1.9, 0.7, 0.0),
      new THREE.Vector3(1.7, 0.45, 0.0)
    ], 0.085, flowRings);

    // ---- clean-water faucet + falling stream ----
    const faucet = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.2, 20), M.steel);
    faucet.add(base);
    const arm = pipe(new THREE.Vector3(0,0.1,0), new THREE.Vector3(0,0.7,0), 0.06, M.steel);
    faucet.add(arm);
    const arm2 = pipe(new THREE.Vector3(0,0.7,0), new THREE.Vector3(-0.45,0.7,0), 0.06, M.steel);
    faucet.add(arm2);
    const spout = pipe(new THREE.Vector3(-0.45,0.7,0), new THREE.Vector3(-0.45,0.35,0), 0.05, M.steel);
    faucet.add(spout);
    faucet.position.set(1.7, 0.45, 0);
    group.add(faucet);
    // water stream below the spout
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.5, 12), M.water);
    stream.position.set(1.25, 0.55, 0); group.add(stream);
    // collection basin (glass) under the stream
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.18, 28), M.glass);
    basin.position.set(1.25, 0.02, 0); group.add(basin);
    const basinWater = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.23, 0.12, 24), M.water);
    basinWater.position.set(1.25, 0.03, 0); group.add(basinWater);

    // ---- feed pump (front-left) ----
    const pump = new THREE.Group();
    const pBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.5), M.darkSteel); pump.add(pBody);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 24), M.steel);
    motor.rotation.z = Math.PI/2; motor.position.set(0.36, 0, 0); pump.add(motor);
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 20), M.black);
    flange.rotation.z = Math.PI/2; flange.position.set(0.62, 0, 0); pump.add(flange);
    // bolts
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), M.steel);
      bolt.rotation.z = Math.PI/2;
      bolt.position.set(0.66, Math.cos(a)*0.1, Math.sin(a)*0.1); pump.add(bolt);
    }
    pump.position.set(-2.0, 0.62, 0.4); group.add(pump);
    // pump -> first canister pipe
    group.add(pipe(new THREE.Vector3(-1.85, 0.62, 0.4), new THREE.Vector3(-1.85, 0.62, 0), 0.06, M.steel));
    group.add(pipe(new THREE.Vector3(-1.85, 0.62, 0), new THREE.Vector3(-1.45, 0.62, 0), 0.06, M.steel));
    group.add(pipe(new THREE.Vector3(-1.45, 0.62, 0), new THREE.Vector3(-1.45, 0.3, 0), 0.06, M.steel));

    // ---- two pressure gauges on top ----
    group.add(gauge(-1.0));
    group.add(gauge(0.1));

    // ---- decorative glow ring + rotating accent ----
    const glowRing = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.015, 8, 120), M.ring);
    glowRing.rotation.x = Math.PI/2; glowRing.position.y = -0.26; group.add(glowRing);

    // contact shadow disc (fake AO under the unit)
    const shadowTex = (() => {
      const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
      g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.2)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0,0,s,s);
      return new THREE.CanvasTexture(c);
    })();
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(7, 7),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI/2; shadow.position.y = -0.27; scene.add(shadow);

    // water droplet points falling from the faucet spout into the basin
    const dropPos = new Float32Array(40*3);
    for (let i = 0; i < 40; i++) {
      dropPos[i*3]   = 1.25 + (Math.random()-0.5)*0.05;
      dropPos[i*3+1] = 0.1 + Math.random()*0.7;
      dropPos[i*3+2] = (Math.random()-0.5)*0.05;
    }
    const dropsGeo = new THREE.BufferGeometry();
    dropsGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
    const drops = new THREE.Points(dropsGeo, new THREE.PointsMaterial({
      size: 0.05, map: softDiscTexture(), transparent: true, depthWrite: false,
      color: 0x9fe0ff, blending: THREE.AdditiveBlending, sizeAttenuation: true
    }));
    scene.add(drops);
    const dropSeed = Array.from({length:40}, () => Math.random());

    // gently float the whole unit
    group.position.y = 0;

    /* --------------------------- sizing / loop ---------------------------- */
    function resize() {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, r.width), h = Math.max(1, r.height);
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    let t = 0, visible = true;
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; },
      { threshold: 0.05 });
    io.observe(canvas);

    function render(dt) {
      if (!visible) return;
      t += dt * timeScale;

      // flowing water rings travel along the sight-tubes
      for (const fr of flowRings) {
        fr.t = (fr.t + dt * 0.22) % 1;
        const p = fr.curve.getPointAt(fr.t);
        fr.mesh.position.copy(p);
        const tan = fr.curve.getTangentAt(fr.t);
        fr.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), tan);
      }
      // pulse the UV glow
      uvGlow.intensity = 7.5 + Math.sin(t*3.0)*1.6;
      M.uv.emissiveIntensity = 2.3 + Math.sin(t*3.0)*0.5;
      // subtle shimmer in the canister water
      M.water.opacity = 0.5 + Math.sin(t*1.4)*0.05;
      // falling droplets
      const pa = drops.geometry.attributes.position.array;
      for (let i = 0; i < 40; i++) {
        pa[i*3+1] -= dt * (0.5 + dropSeed[i]*0.6);
        if (pa[i*3+1] < 0.1) pa[i*3+1] = 0.8;
      }
      drops.geometry.attributes.position.needsUpdate = true;
      // accent ring
      glowRing.rotation.z += dt * 0.4;

      controls.update();
      renderer.render(scene, camera);
    }

    if (fallback) fallback.style.display = 'none';
    return { render, canvas };
  }

  /* =========================================================================
     BOOTSTRAP — single rAF loop drives both scenes; pauses when tab hidden
     ========================================================================= */
  function boot() {
    let bg = null, ro = null;
    try { bg = initBackground(); } catch (e) { console.warn('[bg water] disabled:', e); }
    try { ro = initROViewer(); }   catch (e) { console.warn('[ro viewer] disabled:', e); }
    if (!bg && !ro) return;

    // hide the lightweight CSS-bubble layer once the WebGL water is live
    const cssBubbles = document.getElementById('bubbles');
    if (bg && cssBubbles) cssBubbles.style.display = 'none';

    let running = true;
    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      if (running) clock.start();
    });

    let last = performance.now();
    function loop(now) {
      requestAnimationFrame(loop);
      if (!running) { last = now; return; }
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.1) dt = 0.1;                 // clamp after tab-switch spikes
      if (bg) bg.render(dt);
      if (ro) ro.render(dt);
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
