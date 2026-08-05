/* =========================================================================
   DELIGHT WATER SOLUTIONS — IMMERSIVE 3D / WebGL ENGINE
   -------------------------------------------------------------------------
   Apple-style cinematic scroll + 3D RO system.

   Three scenes, all on the same Lenis-driven scroll timeline:

     A) #bg-canvas       — full-viewport flowing-water background.
                           (Custom GLSL waterline + caustics + god-rays
                            + GPU rising bubbles + current particles.)

     B) #ro-canvas       — the hero pinned-3D moment.  Procedural
                           Reverse-Osmosis water-filter system with UV
                           chamber.  Auto-rotates, drag-to-orbit.  The
                           scene stays pinned while narrative text panels
                           scroll past, and the camera arcs through a path
                           that matches the visible text.

     C) #canister-canvas — a closer, slower-rotating glass canister
                           with a "water moment" feel (visible flowing
                           water + bubbles + caustic reflection).

     D) #pure-canvas     — a tight closeup of pure water flowing
                           through a clear tube (single beam of light,
                           water animation, minimal framing).

   The same GSAP + ScrollTrigger (loaded in ui3d.js) drives every
   scroll-bound animation so the camera moves and the text panels fade
   in perfect sync with the scroll position.
   ========================================================================= */

import * as THREE from 'three';
import { OrbitControls }   from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';

(() => {
  'use strict';

  /* ============================  CAPABILITY  ============================ */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile     = window.matchMedia('(max-width: 768px)').matches;
  const isLowPower   = isMobile || (navigator.hardwareConcurrency || 4) <= 4;

  function webglOK() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) ||
             !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
    } catch (e) { return false; }
  }
  if (!webglOK()) return;          // CSS water theme stays as the fallback
  document.body.classList.add('webgl');

  /* shared clock + time-scaler (reduced-motion => calm, slow water) */
  const clock     = new THREE.Clock();
  const timeScale = reduceMotion ? 0.18 : 1.0;
  const DPR_CAP   = isLowPower ? 1.25 : 1.75;
  const TEX = (s) => { s.colorSpace = THREE.SRGBColorSpace; return s; };

  /* ==========================  SCROLL PROGRESS  ========================= */
  const scroll = { progress: 0, velocity: 0 };
  let scrollLastY = window.scrollY;
  function updateScroll() {
    const y = window.scrollY;
    const h = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scroll.progress = Math.min(1, Math.max(0, y / h));
    scroll.velocity = y - scrollLastY;
    scrollLastY     = y;
  }
  window.addEventListener('scroll', updateScroll, { passive: true });
  updateScroll();

  /* ============================  SPRITE TEXTURES  ======================= */
  function bubbleTexture() {
    const s = 128, c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(s/2, s/2, 2, s/2, s/2, s/2 - 2);
    g.addColorStop(0.00, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.40, 'rgba(180,230,255,0.45)');
    g.addColorStop(1.00, 'rgba(80,160,220,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    const h = x.createRadialGradient(s*0.35, s*0.32, 1, s*0.35, s*0.32, s*0.18);
    h.addColorStop(0, 'rgba(255,255,255,0.9)');
    h.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = h; x.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function godRayTexture() {
    const s = 256, c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0,    'rgba(180,230,255,0.55)');
    g.addColorStop(0.5,  'rgba(120,200,255,0.18)');
    g.addColorStop(1,    'rgba(0,80,160,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(c);
  }

  /* ======================  A)  BACKGROUND SCENE  ======================= */
  function buildBackground() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return null;
    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: !isLowPower, alpha: true, powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(DPR_CAP, window.devicePixelRatio || 1));
    renderer.setClearColor(0x001a2e, 1.0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x001a2e, 0.025);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    camera.position.set(0, 0, 18);

    /* waterline */
    const waterlineMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2() },
        uTint: { value: new THREE.Color(0x66e0ff) },
        uIntensity: { value: 1.0 },
      },
      vertexShader: `varying vec2 vUv;
        void main() { vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `precision highp float;
        varying vec2 vUv;
        uniform float uTime, uIntensity;
        uniform vec2 uMouse; uniform vec3 uTint;
        float hash(vec2 p){return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){
          vec2 i=floor(p),f=fract(p);
          float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
          vec2 u=f*f*(3.0-2.0*f);
          return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;}
        void main(){
          float d=abs(vUv.y-0.5)*2.0;
          float band=smoothstep(1.0,0.0,d);
          float n=noise(vec2(vUv.x*30.0,uTime*0.4))*0.5
                  +noise(vec2(vUv.x*80.0,uTime*0.8))*0.5;
          band*=0.7+0.6*n;
          float m=exp(-12.0*length(vUv-vec2(0.5+uMouse.x*0.4,0.5+uMouse.y*0.3)));
          band+=m*0.4;
          gl_FragColor=vec4(uTint*band,band*uIntensity);}`,
    });
    const waterline = new THREE.Mesh(new THREE.PlaneGeometry(40, 0.5, 200, 1), waterlineMat);
    waterline.position.set(0, 1.5, 0);
    scene.add(waterline);

    /* caustics floor */
    const causticsMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uTint: { value: new THREE.Color(0x66e0ff) },
        uOpacity: { value: 0.85 },
      },
      vertexShader: `varying vec2 vUv;
        void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `precision highp float; varying vec2 vUv;
        uniform float uTime,uOpacity; uniform vec3 uTint;
        float caustic(vec2 uv,float t){
          vec2 p=uv*6.0; float c=0.0;
          for(int i=0;i<3;i++){float fi=float(i);
            vec2 q=p+vec2(sin(p.y*1.3+t*0.5+fi),cos(p.x*1.1-t*0.4+fi*1.7))*0.6;
            c+=abs(sin(q.x*1.7+t*0.6)*cos(q.y*1.5-t*0.3));}
          c=pow(c*0.33,3.0); return c;}
        void main(){
          float c=caustic(vUv,uTime);
          gl_FragColor=vec4(uTint*c*1.4,c*uOpacity);}`,
    });
    const caustics = new THREE.Mesh(new THREE.PlaneGeometry(60, 60, 1, 1), causticsMat);
    caustics.rotation.x = -Math.PI / 2;
    caustics.position.y = -8;
    scene.add(caustics);

    /* god-rays */
    const rayTex = godRayTexture();
    const rays = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2 + Math.random() * 4, 16),
        new THREE.MeshBasicMaterial({
          map: rayTex, transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, opacity: 0.35, color: 0x66e0ff,
        }));
      m.position.set(-10 + i * 5 + (Math.random() - 0.5) * 2, 0, -8 - Math.random() * 6);
      m.rotation.z = (Math.random() - 0.5) * 0.3;
      m.material.opacity = 0.15 + Math.random() * 0.25;
      m.userData = { phase: Math.random() * Math.PI * 2, base: m.material.opacity };
      rays.add(m);
    }
    scene.add(rays);

    /* GPU rising bubbles */
    const BUBBLE_COUNT = isLowPower ? 80 : 200;
    const bubbleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(BUBBLE_COUNT * 3);
    const sizes     = new Float32Array(BUBBLE_COUNT);
    const seeds     = new Float32Array(BUBBLE_COUNT);
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      positions[i*3]   = (Math.random() - 0.5) * 30;
      positions[i*3+1] = -8 + Math.random() * 16;
      positions[i*3+2] = (Math.random() - 0.5) * 20 - 2;
      sizes[i] = 0.3 + Math.random() * 1.4;
      seeds[i] = Math.random() * 1000;
    }
    bubbleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    bubbleGeo.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));
    bubbleGeo.setAttribute('aSeed',    new THREE.BufferAttribute(seeds, 1));
    const bubbleMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 }, uScale: { value: window.innerHeight * 0.5 },
        uMap:  { value: bubbleTexture() },
        uPixelRatio: { value: renderer.getPixelRatio() },
      },
      vertexShader: `attribute float aSize; attribute float aSeed;
        uniform float uTime,uScale,uPixelRatio; varying float vAlpha;
        void main(){
          vec3 p=position; float t=uTime*(0.4+0.2*sin(aSeed))+aSeed;
          p.y=mod(p.y+8.0+t*0.6,16.0)-8.0;
          p.x+=sin(t*0.7+aSeed)*0.4; p.z+=cos(t*0.5+aSeed)*0.3;
          vec4 mv=modelViewMatrix*vec4(p,1.0);
          gl_Position=projectionMatrix*mv;
          gl_PointSize=aSize*uScale*uPixelRatio/-mv.z;
          vAlpha=smoothstep(8.0,6.0,p.y)*(0.6+0.4*sin(t*1.3));}`,
      fragmentShader: `uniform sampler2D uMap; varying float vAlpha;
        void main(){
          vec4 t=texture2D(uMap,gl_PointCoord);
          gl_FragColor=vec4(t.rgb,t.a*vAlpha);}`,
    });
    const bubbles = new THREE.Points(bubbleGeo, bubbleMat);
    scene.add(bubbles);

    /* current particles */
    const P_COUNT = isLowPower ? 120 : 400;
    const pGeo = new THREE.BufferGeometry();
    const pp = new Float32Array(P_COUNT * 3), ps = new Float32Array(P_COUNT);
    for (let i = 0; i < P_COUNT; i++) {
      pp[i*3]   = (Math.random() - 0.5) * 40;
      pp[i*3+1] = (Math.random() - 0.5) * 18;
      pp[i*3+2] = (Math.random() - 0.5) * 30;
      ps[i] = Math.random();
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    pGeo.setAttribute('aSpeed',   new THREE.BufferAttribute(ps, 1));
    const pMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2() },
        uColor: { value: new THREE.Color(0x9be8ff) },
      },
      vertexShader: `attribute float aSpeed; uniform float uTime; uniform vec2 uMouse;
        varying float vAlpha;
        void main(){
          vec3 p=position;
          float t=uTime*0.15*(0.4+aSpeed);
          p.x=mod(p.x+20.0+t*(0.6+aSpeed),40.0)-20.0;
          p.y+=sin(t*0.3+aSpeed*6.0)*0.5; p.z+=cos(t*0.2+aSpeed*4.0)*0.3;
          p.x+=uMouse.x*0.6*(0.4+aSpeed); p.y+=uMouse.y*0.4*(0.4+aSpeed);
          vec4 mv=modelViewMatrix*vec4(p,1.0);
          gl_Position=projectionMatrix*mv;
          gl_PointSize=(1.0+aSpeed*2.0)*(240.0/-mv.z);
          vAlpha=0.18+0.5*aSpeed;}`,
      fragmentShader: `uniform vec3 uColor; varying float vAlpha;
        void main(){
          vec2 d=gl_PointCoord-0.5; float r=length(d);
          float a=smoothstep(0.5,0.0,r)*vAlpha;
          gl_FragColor=vec4(uColor,a);}`,
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    window.addEventListener('pointermove', (e) => {
      mouse.tx = (e.clientX / window.innerWidth)  * 2 - 1;
      mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });

    const onResize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      bubbleMat.uniforms.uScale.value      = h * 0.5;
      bubbleMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    };
    onResize();
    window.addEventListener('resize', onResize);

    function tick() {
      const t = clock.getElapsedTime() * timeScale;
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      waterlineMat.uniforms.uTime.value  = t;
      waterlineMat.uniforms.uMouse.value.set(mouse.x, mouse.y);
      causticsMat.uniforms.uTime.value   = t;
      bubbleMat.uniforms.uTime.value     = t;
      pMat.uniforms.uTime.value          = t;
      pMat.uniforms.uMouse.value.set(mouse.x, mouse.y);
      rays.children.forEach((m) => {
        m.material.opacity = m.userData.base * (0.85 + 0.15 * Math.sin(t * 0.6 + m.userData.phase));
        m.position.x += Math.sin(t * 0.1 + m.userData.phase) * 0.002;
      });
      camera.position.x = mouse.x * 0.6 + Math.sin(scroll.progress * Math.PI) * 1.4;
      camera.position.y = mouse.y * 0.4 - scroll.progress * 0.8;
      camera.position.z = 18 - scroll.progress * 4;
      camera.lookAt(scroll.progress * 0.5, -scroll.progress * 0.4, 0);
      renderer.render(scene, camera);
    }
    return { renderer, scene, camera, tick };
  }

  /* ======================  COMMON: build RO skid  ====================== */
  /* Build a procedural Reverse-Osmosis skid.  Returns a THREE.Group plus  */
  /* a few named references the calling scene can drive.                   */
  function buildROSkid() {
    const root = new THREE.Group();

    const steel     = new THREE.MeshStandardMaterial({ color: 0xd0d6dc, metalness: 0.9, roughness: 0.32 });
    const steelDark = new THREE.MeshStandardMaterial({ color: 0x6a7681, metalness: 0.85, roughness: 0.45 });
    const glass     = new THREE.MeshPhysicalMaterial({
      color: 0xbbdfff, metalness: 0, roughness: 0.05, transmission: 0.92,
      thickness: 0.5, ior: 1.45, clearcoat: 1.0, transparent: true, opacity: 0.55,
    });
    const blueLiquid= new THREE.MeshPhysicalMaterial({
      color: 0x66e0ff, metalness: 0, roughness: 0.15, transmission: 0.85,
      thickness: 0.8, ior: 1.33, emissive: 0x0a4a6a, emissiveIntensity: 0.15,
    });
    const uvGlow    = new THREE.MeshStandardMaterial({
      color: 0xa8eaff, emissive: 0x66e0ff, emissiveIntensity: 4.0,
      metalness: 0.1, roughness: 0.4,
    });
    const blackRubber = new THREE.MeshStandardMaterial({ color: 0x161a1f, metalness: 0.05, roughness: 0.85 });
    const redAccent   = new THREE.MeshStandardMaterial({ color: 0xc03030, metalness: 0.3, roughness: 0.5 });

    /* frame */
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 1.8), steelDark);
    base.position.y = -0.7; root.add(base);
    for (let i = 0; i < 4; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.2, 16), steel);
      post.position.set((i % 2 ? 1 : -1) * 1.7, 0.3, (i < 2 ? 1 : -1) * 0.85);
      root.add(post);
    }
    for (let i = 0; i < 2; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.4, 12), steel);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, 1.35, (i === 0 ? 0.85 : -0.85));
      root.add(bar);
    }

    /* canisters */
    const canisters = [];
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Group();
      c.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.4, 24, 1, true), glass));
      const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 24), steel);
      capTop.position.y = 0.76; c.add(capTop);
      const capBot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 24), steel);
      capBot.position.y = -0.76; c.add(capBot);
      const cart = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.2, 16), blueLiquid);
      c.add(cart);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0x66e0ff }));
      dot.position.set(0.22, 0.0, 0); c.add(dot);
      c.position.set(-1.0 + i * 0.8, 0.1, 0);
      canisters.push(c);
      root.add(c);
    }

    /* UV reactor */
    const uv = new THREE.Group();
    {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.2, 18, 1, true), glass);
      body.rotation.z = Math.PI / 2; uv.add(body);
      const capA = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.18, 18), steel);
      capA.rotation.z = Math.PI / 2; capA.position.x = 1.05; uv.add(capA);
      const capB = capA.clone(); capB.position.x = -1.05; uv.add(capB);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 12), uvGlow);
      tube.rotation.z = Math.PI / 2; uv.add(tube);
      const uvLight = new THREE.PointLight(0x66e0ff, 1.5, 4, 1.6); uv.add(uvLight);
      uv.userData.light = uvLight;
    }
    uv.position.set(0.4, 0.1, 0);
    root.add(uv);

    /* gauges */
    function makeGauge(x, z) {
      const g = new THREE.Group();
      const case_ = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 24), blackRubber);
      case_.rotation.x = Math.PI / 2; g.add(case_);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24),
        new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.8 }));
      face.position.z = 0.051; g.add(face);
      const needle = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.12, 0.005),
        new THREE.MeshStandardMaterial({ color: 0xc03030, metalness: 0.4, roughness: 0.4 }));
      needle.position.z = 0.052;
      needle.geometry.translate(0, 0.06, 0);
      g.add(needle);
      g.userData.needle = needle;
      g.position.set(x, 0.6, z);
      return g;
    }
    const gauge1 = makeGauge(1.4, 0.55);
    const gauge2 = makeGauge(1.4, -0.55);
    root.add(gauge1, gauge2);

    /* pump */
    const pump = new THREE.Group();
    {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 18), redAccent);
      body.rotation.z = Math.PI / 2; pump.add(body);
      const end1 = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 18), steelDark);
      end1.rotation.z = Math.PI / 2; end1.position.x = 0.27; pump.add(end1);
      const end2 = end1.clone(); end2.position.x = -0.27; pump.add(end2);
      const motor = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), steelDark);
      motor.position.set(0.55, 0, 0); pump.add(motor);
    }
    pump.position.set(-1.5, -0.3, 0);
    root.add(pump);

    /* sight-tubes with flowing water */
    const flowTex = (() => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 256;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0,   'rgba(102,224,255,0)');
      g.addColorStop(0.4, 'rgba(102,224,255,0.9)');
      g.addColorStop(0.6, 'rgba(180,240,255,0.9)');
      g.addColorStop(1,   'rgba(102,224,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 256);
      return new THREE.CanvasTexture(c);
    })();
    flowTex.wrapS = THREE.RepeatWrapping;
    flowTex.wrapT = THREE.RepeatWrapping;
    flowTex.colorSpace = THREE.SRGBColorSpace;
    const flowMat = new THREE.MeshBasicMaterial({
      map: flowTex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
    });
    function sightTube(p1, p2) {
      const a = new THREE.Vector3(...p1), b = new THREE.Vector3(...p2);
      const len = a.distanceTo(b);
      const geo = new THREE.CylinderGeometry(0.04, 0.04, len, 12, 1, true);
      const mesh = new THREE.Mesh(geo, flowMat.clone());
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      const dir = b.clone().sub(a).normalize();
      const up  = new THREE.Vector3(0, 1, 0);
      mesh.quaternion.setFromUnitVectors(up, dir);
      return mesh;
    }
    const tubes = [
      sightTube([-1.5, 0.0, 0], [-1.0, 0.5, 0]),
      sightTube([-1.0, 0.5, 0], [-0.6, 0.5, 0]),
      sightTube([-0.4, 0.5, 0], [ 0.4, 0.5, 0]),
      sightTube([ 0.4, 0.5, 0], [ 1.4, 0.6, 0.55]),
      sightTube([ 0.4, 0.5, 0], [ 1.4, 0.6, -0.55]),
      sightTube([ 1.4, 0.6, 0.55], [ 1.6, 0.0, 0.55]),
      sightTube([ 1.4, 0.6, -0.55], [ 1.6, 0.0, -0.55]),
    ];
    tubes.forEach((t) => root.add(t));

    /* faucet */
    const faucet = new THREE.Group();
    {
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.4, 14), steel);
      spout.position.y = -0.2; faucet.add(spout);
      const base_ = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.06, 18), steelDark);
      base_.position.y = 0.02; faucet.add(base_);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.4, 12), blueLiquid);
      water.position.y = -0.55; faucet.add(water);
    }
    faucet.position.set(1.7, 0.6, 0);
    root.add(faucet);

    return { root, canisters, uv, gauge1, gauge2, tubes, flowMat, uvGlow, glass, blueLiquid };
  }

  /* ======================  B)  HERO PINNED SCENE  ====================== */
  function buildHero() {
    const canvas = document.getElementById('ro-canvas');
    if (!canvas) return null;

    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: !isLowPower, alpha: true, powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(DPR_CAP, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const scene = new THREE.Scene();
    {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, '#0a3a5c'); g.addColorStop(1, '#001a2e');
      x.fillStyle = g; x.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      scene.background = t;
    }

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(5.5, 2.4, 6.0);
    camera.lookAt(0, 0.4, 0);

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(5, 8, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x66e0ff, 0.8);
    rim.position.set(-6, 3, -4); scene.add(rim);
    const fill = new THREE.PointLight(0xffaa66, 0.6, 14, 1.5);
    fill.position.set(0, 4, 4); scene.add(fill);

    const skid = buildROSkid();
    scene.add(skid.root);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.65, 0.6, 0.18);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan     = false;
    controls.minDistance   = 4.0;
    controls.maxDistance   = 11.0;
    controls.minPolarAngle = Math.PI * 0.18;
    controls.maxPolarAngle = Math.PI * 0.55;
    /* autoRotate is OFF — the scroll position drives the camera path
       now.  The user can still drag-to-orbit, but when they're not
       dragging, the camera follows the scroll step. */
    controls.autoRotate    = false;
    controls.enableZoom    = isMobile;
    controls.target.set(0, 0.3, 0);
    /* lock the orbit spherical so the user can only orbit (rotate)
       around the target — zoom is gated by enableZoom.  Auto-rotation
       is fully off so the scroll path is the only camera motion. */

    const onResize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      bloom.setSize(w, h);
    };
    onResize();
    window.addEventListener('resize', onResize);

    let visible = true;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { visible = e.isIntersecting; });
    }, { threshold: 0.02 });
    io.observe(canvas);

    /* hero scroll-driven camera path (set externally via setHeroStep) */
    const heroStep = { value: 0, target: 0 };
    function setHeroStep(v) { heroStep.target = v; }
    function getHeroStep()  { return heroStep.value; }

    function tick() {
      if (!visible) return;
      const t = clock.getElapsedTime() * timeScale;
      /* smooth toward target */
      heroStep.value += (heroStep.target - heroStep.value) * 0.10;

      /* the camera follows a path through 5 keyframes that line up with
         the 5 hero text panels.  The path is dramatic enough to be
         visible — sweeping an arc around the system, dropping in height
         to reveal the canisters up close, and rising back up. */
      const p   = heroStep.value;             // 0..4
      const pn  = p / 4;                       // 0..1 normalised
      /* base angle orbits a full half-revolution as the user scrolls,
         plus a slow continuous rotation. */
      const baseAngle = -Math.PI * 0.5 + p * 0.85;
      const driftAngle = clock.getElapsedTime() * 0.06;
      const angle = baseAngle + driftAngle;
      /* radius pulls in closer for the middle panels (intimate closeups)
         then back out for the final panel (heroic wide). */
      const r     = 6.2 - Math.sin(pn * Math.PI) * 2.0;
      /* height drops from a high hero shot down to eye level for the
         middle panels, then back up for the finale. */
      const y     = 3.0 - Math.sin(pn * Math.PI) * 1.8;
      const target = new THREE.Vector3(
        Math.cos(angle) * r,
        y,
        Math.sin(angle) * r,
      );
      const lookY = 0.2 + pn * 0.1;

      /* When the user isn't actively dragging, drive the camera and
         target from the scroll path.  When the user IS dragging, leave
         OrbitControls alone and just keep the water/UV/gauge anims
         running. */
      if (!controls._isDragging) {
        camera.position.lerp(target, 0.10);
        controls.target.lerp(new THREE.Vector3(0, lookY, 0), 0.10);
        /* re-derive OrbitControls' internal spherical from our position
           so user-drag picks up smoothly from wherever the scroll left
           the camera.  OrbitControls reads camera.position - target on
           update(), so this is enough. */
      }

      /* tubes flow */
      skid.tubes.forEach((m) => {
        if (m.material.map) m.material.map.offset.y = -t * 0.6;
      });
      /* gauges */
      const a1 = -Math.PI * 0.25 + Math.sin(t * 0.8) * 0.25;
      const a2 = -Math.PI * 0.25 + Math.sin(t * 0.8 + 1.3) * 0.25;
      skid.gauge1.userData.needle.rotation.z = a1;
      skid.gauge2.userData.needle.rotation.z = a2;
      /* UV pulse */
      skid.uv.userData.light.intensity = 1.4 + Math.sin(t * 2.0) * 0.2;
      skid.uvGlow.emissiveIntensity = 3.0 + Math.sin(t * 2.0) * 0.5;
      /* canisters bob */
      skid.canisters.forEach((c, i) => {
        c.position.y = 0.1 + Math.sin(t * 0.6 + i) * 0.012;
      });

      controls.update();
      composer.render();
    }
    /* OrbitControls drag detection (we don't want to fight the user) */
    controls.addEventListener('start', () => { controls._isDragging = true; });
    controls.addEventListener('end',   () => { setTimeout(() => { controls._isDragging = false; }, 400); });

    return { renderer, scene, camera, tick, setHeroStep, getHeroStep };
  }

  /* =====================  C)  CANISTER WATER MOMENT  =================== */
  function buildCanister() {
    const canvas = document.getElementById('canister-canvas');
    if (!canvas) return null;

    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true, powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(DPR_CAP, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    const scene = new THREE.Scene();
    {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(128, 100, 30, 128, 128, 200);
      g.addColorStop(0, '#1a5a8a');
      g.addColorStop(1, '#001020');
      x.fillStyle = g; x.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      scene.background = t;
    }

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0.4, 4.0);
    camera.lookAt(0, 0, 0);

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(2, 4, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0x66e0ff, 1.0);
    rim.position.set(-3, 1, -2); scene.add(rim);
    const underGlow = new THREE.PointLight(0x66e0ff, 0.8, 4, 1.5);
    underGlow.position.set(0, -1.0, 1.0); scene.add(underGlow);

    /* build a single, large glass canister with visible flowing water */
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xbbdfff, metalness: 0, roughness: 0.05, transmission: 0.95,
      thickness: 0.6, ior: 1.45, clearcoat: 1.0, transparent: true, opacity: 0.5,
    });
    const water = new THREE.MeshPhysicalMaterial({
      color: 0x66e0ff, metalness: 0, roughness: 0.15, transmission: 0.85,
      thickness: 0.8, ior: 1.33, emissive: 0x0a4a6a, emissiveIntensity: 0.25,
    });
    const steel = new THREE.MeshStandardMaterial({ color: 0xd0d6dc, metalness: 0.9, roughness: 0.3 });

    const group = new THREE.Group();
    /* glass tube */
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 3.2, 48, 1, true), glass);
    group.add(tube);
    /* caps */
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.25, 36), steel);
    capTop.position.y = 1.7; group.add(capTop);
    const capBot = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.25, 36), steel);
    capBot.position.y = -1.7; group.add(capBot);
    /* inner cartridge */
    const cart = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 2.7, 32),
      water);
    cart.position.y = 0.0;
    group.add(cart);

    /* water "level" sphere (a small bright droplet) */
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x9be8ff }));
    dot.position.set(0.85, 0, 0); group.add(dot);

    /* rising bubbles inside the canister */
    const BUBBLE_COUNT = 60;
    const bGeo = new THREE.BufferGeometry();
    const bpos = new Float32Array(BUBBLE_COUNT * 3);
    const bsz  = new Float32Array(BUBBLE_COUNT);
    const bsd  = new Float32Array(BUBBLE_COUNT);
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const r = Math.random() * 0.5;
      const a = Math.random() * Math.PI * 2;
      bpos[i*3]   = Math.cos(a) * r;
      bpos[i*3+1] = -1.4 + Math.random() * 3.0;
      bpos[i*3+2] = Math.sin(a) * r;
      bsz[i] = 0.05 + Math.random() * 0.2;
      bsd[i] = Math.random() * 1000;
    }
    bGeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
    bGeo.setAttribute('aSize',    new THREE.BufferAttribute(bsz, 1));
    bGeo.setAttribute('aSeed',    new THREE.BufferAttribute(bsd, 1));
    const bMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: window.innerHeight * 0.5 },
        uMap: { value: bubbleTexture() },
        uPixelRatio: { value: renderer.getPixelRatio() },
      },
      vertexShader: `attribute float aSize,aSeed;
        uniform float uTime,uScale,uPixelRatio;
        varying float vAlpha;
        void main(){
          vec3 p=position; float t=uTime*(0.3+0.2*sin(aSeed))+aSeed;
          p.y=mod(p.y+1.6+t*0.7,3.2)-1.6;
          p.x+=sin(t*0.7+aSeed)*0.05; p.z+=cos(t*0.5+aSeed)*0.05;
          vec4 mv=modelViewMatrix*vec4(p,1.0);
          gl_Position=projectionMatrix*mv;
          gl_PointSize=aSize*uScale*uPixelRatio/-mv.z;
          vAlpha=smoothstep(1.6,1.4,p.y)*(0.4+0.4*sin(t));}`,
      fragmentShader: `uniform sampler2D uMap; varying float vAlpha;
        void main(){
          vec4 t=texture2D(uMap,gl_PointCoord);
          gl_FragColor=vec4(t.rgb,t.a*vAlpha);}`,
    });
    const bubs = new THREE.Points(bGeo, bMat);
    group.add(bubs);

    scene.add(group);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.8, 0.7, 0.2);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const onResize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      bloom.setSize(w, h);
    };
    onResize();
    window.addEventListener('resize', onResize);

    let visible = true;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { visible = e.isIntersecting; });
    }, { threshold: 0.05 });
    io.observe(canvas);

    const step = { value: 0, target: 0 };
    function tick() {
      if (!visible) return;
      const t = clock.getElapsedTime() * timeScale;
      step.value += (step.target - step.value) * 0.10;
      /* slow continuous rotation, plus a scroll-driven sweep so the
         canister visibly responds to scrolling.  step.value is 0..1. */
      group.rotation.y = t * 0.18 + step.value * 1.4;
      bMat.uniforms.uTime.value = t;
      composer.render();
    }
    function setStep(v) { step.target = v; }
    return { tick, setStep, onResize };
  }

  /* ======================  D)  PURE WATER MOMENT  ====================== */
  function buildPure() {
    const canvas = document.getElementById('pure-canvas');
    if (!canvas) return null;

    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true, powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(DPR_CAP, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    const scene = new THREE.Scene();
    {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(128, 128, 0, 128, 128, 200);
      g.addColorStop(0, '#0a3a6a');
      g.addColorStop(1, '#000814');
      x.fillStyle = g; x.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      scene.background = t;
    }

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(2, 3, 4); scene.add(key);
    const accent = new THREE.PointLight(0x66e0ff, 1.0, 4, 1.4);
    accent.position.set(-2, 0, 1); scene.add(accent);

    /* a single clear horizontal tube with water flowing through it */
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xddffff, metalness: 0, roughness: 0.05, transmission: 0.95,
      thickness: 0.4, ior: 1.45, clearcoat: 1.0, transparent: true, opacity: 0.4,
    });
    const group = new THREE.Group();

    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 4.0, 36, 1, true), glass);
    tube.rotation.z = Math.PI / 2;
    group.add(tube);

    /* steel fittings at each end */
    const steel = new THREE.MeshStandardMaterial({ color: 0xd0d6dc, metalness: 0.9, roughness: 0.3 });
    [-2.0, 2.0].forEach((x) => {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 24), steel);
      cap.rotation.z = Math.PI / 2; cap.position.x = x;
      group.add(cap);
    });

    /* water inside — a tighter, fatter cylinder with a flowing gradient */
    const waterTex = (() => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 256, 0);
      g.addColorStop(0,    'rgba(102,224,255,0.0)');
      g.addColorStop(0.45, 'rgba(102,224,255,0.95)');
      g.addColorStop(0.55, 'rgba(180,240,255,0.95)');
      g.addColorStop(1,    'rgba(102,224,255,0.0)');
      x.fillStyle = g; x.fillRect(0, 0, 256, 64);
      return new THREE.CanvasTexture(c);
    })();
    waterTex.wrapS = THREE.RepeatWrapping;
    waterTex.wrapT = THREE.RepeatWrapping;
    waterTex.colorSpace = THREE.SRGBColorSpace;
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x88e8ff, metalness: 0, roughness: 0.1, transmission: 0.85,
      thickness: 0.4, ior: 1.33, emissive: 0x0a4a6a, emissiveIntensity: 0.3,
    });
    const inner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 3.8, 28, 1, true),
      waterMat,
    );
    inner.rotation.z = Math.PI / 2;
    group.add(inner);

    /* bubbles inside the tube */
    const BUBBLE_COUNT = 30;
    const bGeo = new THREE.BufferGeometry();
    const bpos = new Float32Array(BUBBLE_COUNT * 3);
    const bsz  = new Float32Array(BUBBLE_COUNT);
    const bsd  = new Float32Array(BUBBLE_COUNT);
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const r = Math.random() * 0.25;
      const a = Math.random() * Math.PI * 2;
      bpos[i*3]   = -1.8 + Math.random() * 3.6;
      bpos[i*3+1] = Math.cos(a) * r;
      bpos[i*3+2] = Math.sin(a) * r;
      bsz[i] = 0.05 + Math.random() * 0.18;
      bsd[i] = Math.random() * 1000;
    }
    bGeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
    bGeo.setAttribute('aSize',    new THREE.BufferAttribute(bsz, 1));
    bGeo.setAttribute('aSeed',    new THREE.BufferAttribute(bsd, 1));
    const bMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: window.innerHeight * 0.5 },
        uMap: { value: bubbleTexture() },
        uPixelRatio: { value: renderer.getPixelRatio() },
      },
      vertexShader: `attribute float aSize,aSeed;
        uniform float uTime,uScale,uPixelRatio; varying float vAlpha;
        void main(){
          vec3 p=position; float t=uTime*(0.4+0.3*sin(aSeed))+aSeed;
          p.x=mod(p.x+1.8+t*0.7,3.6)-1.8;
          p.y+=sin(t*0.7+aSeed)*0.05; p.z+=cos(t*0.5+aSeed)*0.05;
          vec4 mv=modelViewMatrix*vec4(p,1.0);
          gl_Position=projectionMatrix*mv;
          gl_PointSize=aSize*uScale*uPixelRatio/-mv.z;
          vAlpha=smoothstep(1.8,1.5,p.x)*(0.5+0.4*sin(t*1.2));}`,
      fragmentShader: `uniform sampler2D uMap; varying float vAlpha;
        void main(){
          vec4 t=texture2D(uMap,gl_PointCoord);
          gl_FragColor=vec4(t.rgb,t.a*vAlpha);}`,
    });
    const bubs = new THREE.Points(bGeo, bMat);
    group.add(bubs);

    scene.add(group);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.7, 0.18);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const onResize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      bloom.setSize(w, h);
    };
    onResize();
    window.addEventListener('resize', onResize);

    let visible = true;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { visible = e.isIntersecting; });
    }, { threshold: 0.05 });
    io.observe(canvas);

    const step = { value: 0, target: 0 };
    function tick() {
      if (!visible) return;
      const t = clock.getElapsedTime() * timeScale;
      step.value += (step.target - step.value) * 0.10;
      /* very gentle camera drift, plus a scroll-driven arc so the
         camera actually responds to scrolling through the section. */
      const p = step.value;                       // 0..1
      const pn = Math.max(0, Math.min(1, p));
      /* base position is a slow arc on the X axis as the user scrolls. */
      const baseX = (pn - 0.5) * 1.4;
      const baseY = 0.0;
      camera.position.x = baseX + Math.sin(t * 0.15) * 0.15;
      camera.position.y = baseY + Math.cos(t * 0.18) * 0.08;
      camera.position.z = 5;
      camera.lookAt(0, 0, 0);
      bMat.uniforms.uTime.value = t;
      composer.render();
    }
    function setStep(v) { step.target = v; }
    return { tick, setStep, onResize };
  }

  /* ============================  BOOT  ================================= */
  const bg       = buildBackground();
  const hero     = buildHero();
  const canister = buildCanister();
  const pure     = buildPure();

  if (!bg && !hero && !canister && !pure) return;

  let running = true;
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) clock.start();
  });
  function frame() {
    if (running) {
      if (bg)       bg.tick();
      if (hero)     hero.tick();
      if (canister) canister.tick();
      if (pure)     pure.tick();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* expose for ui3d.js (it'll drive heroStep from ScrollTrigger) */
  window.__delight3d = { bg, hero, canister, pure, scroll };
})();
