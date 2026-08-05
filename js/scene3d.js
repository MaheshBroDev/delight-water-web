/* =========================================================================
   DELIGHT WATER — 3D HERO (single scene, robust)
   -------------------------------------------------------------------------
   One single 3D scene: a clean Reverse-Osmosis water treatment skid.
   Renders into the #ro-canvas element.  If WebGL is unavailable, this
   module returns early and the page keeps using the static fallback
   image — there is no broken-canvas state.

   Design priorities:
     1. Render a clearly-visible 3D model even on the worst laptop
     2. No postprocessing (no EffectComposer / Bloom / OutputPass) — the
        plain WebGLRenderer is the most robust path
     3. No transmission / clearcoat materials — those can be expensive
        and can produce black pixels if the environment map fails
     4. Strong ambient + key lighting so the model reads even without
        HDRI environment
     5. Fails loudly in the console if something goes wrong, but never
        breaks the page
   ========================================================================= */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

(() => {
  'use strict';

  /* ============================  Capability  ============================ */
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

  const canvas = document.getElementById('ro-canvas');
  if (!webglOK() || !canvas) {
    console.log('[delight3d] no WebGL or no canvas — static fallback will be shown');
    return;
  }

  let errored = false;
  function fail(msg, err) {
    if (errored) return;
    errored = true;
    console.error('[delight3d] fatal:', msg, err);
  }
  window.addEventListener('error', (e) => {
    if (e.filename && e.filename.includes('scene3d.js')) {
      fail('runtime error: ' + e.message, e.error);
    }
  });

  /* ============================  Build scene  ============================ */
  let renderer, scene, camera, controls, skid;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: !isLowPower, alpha: true, powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(isLowPower ? 1.25 : 1.75, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeaf4fb);  /* matches CSS gradient */

    camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(4.5, 2.0, 5.0);
    camera.lookAt(0, 0.2, 0);

    /* Strong, simple lighting — no HDRI required. */
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(5, 7, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x66e0ff, 0.9);
    rim.position.set(-5, 3, -3);
    scene.add(rim);
    const underFill = new THREE.PointLight(0x66e0ff, 0.8, 6, 1.5);
    underFill.position.set(0, -1, 2);
    scene.add(underFill);

    /* Build the skid model and add it to the scene. */
    skid = buildROSkid();
    scene.add(skid.root);

    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minDistance = 4.0;
    controls.maxDistance = 8.0;
    controls.minPolarAngle = Math.PI * 0.25;
    controls.maxPolarAngle = Math.PI * 0.55;
    controls.autoRotate = !reduceMotion;
    controls.autoRotateSpeed = 0.8;
    controls.target.set(0, 0.2, 0);

    /* Resize handling. */
    const onResize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    onResize();
    window.addEventListener('resize', onResize);
  } catch (e) {
    fail('3D scene build failed', e);
    return;
  }

  /* ============================  Mark webgl ready  ====================== */
  document.body.classList.add('webgl');
  console.log('[delight3d] ready: hero scene');

  /* ============================  Render loop  ========================== */
  const clock = new THREE.Clock();
  let running = true;
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) clock.start();
  });

  function frame() {
    if (running) {
      try {
        const t = clock.getElapsedTime() * (reduceMotion ? 0.3 : 1.0);
        /* gentle ambient flow — keeps the model feeling alive even when
           the user isn't dragging. */
        skid.tubes.forEach((m) => {
          if (m.material.map) m.material.map.offset.y = -t * 0.6;
        });
        skid.gauges.forEach((g, i) => {
          g.userData.needle.rotation.z = -Math.PI * 0.25 + Math.sin(t * 0.8 + i * 1.3) * 0.25;
        });
        if (skid.uvGlow) skid.uvGlow.emissiveIntensity = 1.5 + Math.sin(t * 2) * 0.5;
        skid.canisters.forEach((c, i) => {
          c.position.y = 0.1 + Math.sin(t * 0.6 + i) * 0.012;
        });

        controls.update();
        renderer.render(scene, camera);
      } catch (e) {
        fail('render error', e);
        running = false;
      }
    }
    if (running) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ============================  Model  ================================= */
  function buildROSkid() {
    const root = new THREE.Group();

    const steel     = new THREE.MeshStandardMaterial({ color: 0xc8d0d8, metalness: 0.85, roughness: 0.4 });
    const steelDark = new THREE.MeshStandardMaterial({ color: 0x6a7681, metalness: 0.85, roughness: 0.5 });
    const glass     = new THREE.MeshStandardMaterial({
      color: 0xbbdfff, metalness: 0.1, roughness: 0.15,
      transparent: true, opacity: 0.55,
    });
    const blueLiquid = new THREE.MeshStandardMaterial({
      color: 0x66e0ff, metalness: 0.05, roughness: 0.4,
      emissive: 0x114a6a, emissiveIntensity: 0.25,
    });
    const uvGlow = new THREE.MeshStandardMaterial({
      color: 0xb8ecff, emissive: 0x66e0ff, emissiveIntensity: 2.0,
      metalness: 0.05, roughness: 0.4,
    });
    const blackRubber = new THREE.MeshStandardMaterial({ color: 0x161a1f, roughness: 0.85 });
    const redAccent   = new THREE.MeshStandardMaterial({ color: 0xc03030, metalness: 0.3, roughness: 0.5 });

    /* Base plate */
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.6), steelDark);
    base.position.y = -0.7;
    root.add(base);

    /* 4 frame posts */
    for (let i = 0; i < 4; i++) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 2.0, 12), steel);
      post.position.set((i % 2 ? 1 : -1) * 1.6, 0.2, (i < 2 ? 1 : -1) * 0.75);
      root.add(post);
    }

    /* Top crossbars */
    for (let i = 0; i < 2; i++) {
      const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 3.2, 10), steel);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, 1.2, i === 0 ? 0.75 : -0.75);
      root.add(bar);
    }

    /* 3 filter canisters */
    const canisters = [];
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Group();
      c.add(new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 1.3, 20, 1, true), glass));
      const capTop = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.1, 20), steel);
      capTop.position.y = 0.7; c.add(capTop);
      const capBot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.1, 20), steel);
      capBot.position.y = -0.7; c.add(capBot);
      c.add(new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 1.1, 14), blueLiquid));
      c.position.set(-1.0 + i * 0.8, 0.1, 0);
      canisters.push(c);
      root.add(c);
    }

    /* Horizontal UV reactor */
    const uv = new THREE.Group();
    {
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.13, 2.0, 16, 1, true), glass);
      body.rotation.z = Math.PI / 2; uv.add(body);
      const capA = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.17, 0.15, 16), steel);
      capA.rotation.z = Math.PI / 2; capA.position.x = 0.95; uv.add(capA);
      const capB = capA.clone(); capB.position.x = -0.95; uv.add(capB);
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 1.6, 10), uvGlow);
      tube.rotation.z = Math.PI / 2; uv.add(tube);
    }
    uv.position.set(0.3, 0.1, 0);
    root.add(uv);

    /* Pressure gauges (2) */
    const gauges = [];
    function makeGauge(x, z) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.08, 20), blackRubber));
      const face = new THREE.Mesh(
        new THREE.CircleGeometry(0.13, 20),
        new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.7 }));
      face.position.z = 0.041; g.add(face);
      const needle = new THREE.Mesh(
        new THREE.BoxGeometry(0.005, 0.10, 0.005),
        new THREE.MeshStandardMaterial({ color: 0xc03030 }));
      needle.position.z = 0.042;
      needle.geometry.translate(0, 0.05, 0);
      g.add(needle);
      g.userData.needle = needle;
      g.position.set(x, 0.5, z);
      return g;
    }
    const g1 = makeGauge(1.3, 0.5);
    const g2 = makeGauge(1.3, -0.5);
    root.add(g1); root.add(g2);
    gauges.push(g1, g2);

    /* Feed pump (red) */
    const pump = new THREE.Group();
    {
      pump.add(new THREE.Mesh(
        new THREE.CylinderGeometry(0.20, 0.20, 0.5, 14), redAccent));
      const end1 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.04, 14), steelDark);
      end1.rotation.z = Math.PI / 2; end1.position.x = 0.27; pump.add(end1);
      const end2 = end1.clone(); end2.position.x = -0.27; pump.add(end2);
      const motor = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.3, 0.3), steelDark);
      motor.position.set(0.5, 0, 0); pump.add(motor);
    }
    pump.position.set(-1.4, -0.3, 0);
    root.add(pump);

    /* Sight-tubes with flowing water */
    const flowTex = (() => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 256;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0,   'rgba(102,224,255,0)');
      g.addColorStop(0.45,'rgba(102,224,255,0.95)');
      g.addColorStop(0.55,'rgba(180,240,255,0.95)');
      g.addColorStop(1,   'rgba(102,224,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 256);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
      return t;
    })();
    const flowMat = new THREE.MeshBasicMaterial({
      map: flowTex, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    function tube(p1, p2) {
      const a = new THREE.Vector3(...p1), b = new THREE.Vector3(...p2);
      const len = a.distanceTo(b);
      const geo = new THREE.CylinderGeometry(0.035, 0.035, len, 10, 1, true);
      const m = new THREE.Mesh(geo, flowMat.clone());
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), b.clone().sub(a).normalize());
      return m;
    }
    const tubes = [
      tube([-1.4, 0, 0],   [-1.0, 0.5, 0]),
      tube([-1.0, 0.5, 0], [-0.4, 0.5, 0]),
      tube([-0.4, 0.5, 0], [ 0.4, 0.5, 0]),
      tube([ 0.4, 0.5, 0], [ 1.3, 0.55, 0.5]),
      tube([ 0.4, 0.5, 0], [ 1.3, 0.55, -0.5]),
    ];
    tubes.forEach((t) => root.add(t));

    /* Faucet */
    const faucet = new THREE.Group();
    faucet.add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.04, 0.35, 12), steel));
    faucet.children[0].position.y = -0.18;
    faucet.add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.16, 0.05, 14), steelDark));
    faucet.children[1].position.y = 0.02;
    faucet.add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.035, 0.4, 10), blueLiquid));
    faucet.children[2].position.y = -0.5;
    faucet.position.set(1.6, 0.55, 0);
    root.add(faucet);

    return { root, tubes, gauges, canisters, uvGlow };
  }
})();
