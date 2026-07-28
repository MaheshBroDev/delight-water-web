/**
 * The stage — one persistent WebGL layer behind the entire document.
 *
 * A single canvas, a single render loop, a single scene. Sections do not own
 * their own contexts; they own *waypoints* along one continuous camera path,
 * so scrolling the page is descending a treatment train rather than cutting
 * between unrelated widgets.
 *
 * Everything degrades: no WebGL, reduced-motion, low-power and hidden-tab
 * all have defined behaviour. The DOM is fully readable with the stage off.
 */
import {
  Vector3,
  ACESFilmicToneMapping,
  Clock,
  Color,
  DirectionalLight,
  AmbientLight,
  PointLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  FogExp2,
  PMREMGenerator,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { detect, TIER, prefersReducedMotion } from './capability.js';
import { Membrane } from './membrane.js';
import { WaterEnvironment, MembraneFace } from './water.js';
import { Vessel } from './vessel.js';
import { PALETTE } from './palette.js';

/* Camera waypoints: one per narrative beat. The camera never teleports —
 * it is damped toward the active waypoint, so a fast scroll produces a
 * sweep rather than a cut. */
/* Camera + vessel waypoints, one per narrative beat.
 *
 * The vessel is positioned in SCREEN space, not world space. A world offset
 * is only correct for one camera orientation and one viewport width — the
 * same coordinates that clear the copy on a 1512px desktop land squarely on
 * a paragraph once the camera yaws or the window narrows. So each beat
 * declares where the element should sit *on screen* as normalised device
 * coordinates, and the world position is unprojected from the live camera
 * every frame (see #vesselWorld).
 *
 *   screen: [ndcX, ndcY]  −1..1, origin centre, +y up
 *   dist:   distance from camera along that ray, in world units
 *   size:   apparent size, compensated for dist so it stays consistent
 *
 * Placement follows the empty half of each layout: hero copy sits left so
 * the element takes the right, services runs two columns so it drops into
 * the open bottom-left, and text-dense beats push it small and far.
 */
const WAYPOINTS = {
  home:     { pos: [0, 0, 15],      look: [0, 0, 0],      flux: 1.00, screen: [0.58, 0.04],   dist: 17, size: 0.80, show: true },
  about:    { pos: [4.5, -1.2, 13], look: [0.5, 0, 0],    flux: 0.85, screen: [-0.60, -0.66], dist: 26, size: 0.52, show: true },
  // Metrics, products, services and contact are content-dense: their copy
  // spans the full measure at every scroll offset, so there is no honest
  // place to put a solid object. Rather than tuck it behind a paragraph and
  // call that depth, the element withdraws and the water carries the beat.
  // Presence is earned by empty space, not asserted.
  metrics:  { pos: [0, -2.0, 17],   look: [0, -0.5, 0],   flux: 1.25, screen: [0.00, 0.78],   dist: 30, size: 0.52, show: false },
  products: { pos: [-1.0, -0.6, 10.5], look: [0, -0.2, 0], flux: 0.70, screen: [0.00, 0.86],  dist: 30, size: 0.48, show: false },
  services: { pos: [3.2, -1.6, 14], look: [-0.4, 0, 0],   flux: 0.95, screen: [-0.70, -0.86], dist: 26, size: 0.44, show: false },
  faq:      { pos: [-3.4, -1.0, 15.5], look: [0.3, 0, 0], flux: 0.80, screen: [0.74, 0.14],   dist: 23, size: 0.58, show: true },
  contact:  { pos: [0, -0.4, 12],   look: [0, 0, 0],      flux: 1.10, screen: [0.00, 0.90],   dist: 32, size: 0.46, show: false },
};

const damp = (current, target, lambda, dt) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));

/* Scratch vectors — reused every frame so the loop never allocates. */
const _ndc = new Vector3();
const _target = new Vector3();

export class Stage {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.caps = opts.caps || detect();
    this.reduced = prefersReducedMotion();
    this.running = false;
    this.destroyed = false;
    this.frame = 0;

    this.clock = new Clock();
    this.pointer = new Vector2(0, 0);
    this.pointerTarget = new Vector2(0, 0);
    this.pointerForce = 0;
    this.scroll = 0;
    this.scrollTarget = 0;
    this.flux = 1;
    this.fluxTarget = 1;

    this.waypoint = WAYPOINTS.home;
    this.camPos = [...WAYPOINTS.home.pos];
    this.camLook = [...WAYPOINTS.home.look];
    this.vesselPos = new Vector3(6, 0, 0);
    this.vesselScale = WAYPOINTS.home.size;
    // 0..1 — damped so the element withdraws and returns rather than popping.
    this.vesselPresence = 0;

    // --- perf governor state ---
    this.fpsSamples = [];
    this.degraded = false;

    this.#initRenderer();
    this.#initScene();
    this.#bind();
  }

  #initRenderer() {
    const { dpr } = this.caps;
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: this.caps.tier === TIER.HIGH,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setClearColor(new Color(PALETTE.abyss), 1);
  }

  #initScene() {
    const { tier } = this.caps;
    this.scene = new Scene();
    this.scene.fog = new FogExp2(new Color(PALETTE.abyss), 0.021);

    this.camera = new PerspectiveCamera(
      42,
      window.innerWidth / window.innerHeight,
      0.1,
      400
    );
    this.camera.position.set(...this.camPos);

    // --- environment for the glass shell to refract ------------------
    // A generated room IBL: no HDR file to download, but transmission
    // still has something real to sample.
    if (tier >= TIER.MID) {
      const pmrem = new PMREMGenerator(this.renderer);
      const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      this.scene.environment = envRT.texture;
      this.envRT = envRT;
      pmrem.dispose();
    }

    // --- lights -------------------------------------------------------
    this.scene.add(new AmbientLight(new Color(PALETTE.teal), 0.55));

    const key = new DirectionalLight(new Color(PALETTE.permeate), 2.1);
    key.position.set(4, 9, 6);
    this.scene.add(key);

    const rim = new DirectionalLight(new Color(PALETTE.aqua), 1.15);
    rim.position.set(-7, -3, -5);
    this.scene.add(rim);

    this.corePoint = new PointLight(new Color(PALETTE.permeate), 12, 22, 2);
    this.corePoint.position.set(0, 0, 3);
    this.scene.add(this.corePoint);

    // --- the world ----------------------------------------------------
    this.water = new WaterEnvironment();
    this.scene.add(this.water.mesh);

    this.face = new MembraneFace();
    this.scene.add(this.face.mesh);

    this.membrane = new Membrane({ count: this.caps.particles });
    this.membrane.setQuality({
      pixelRatio: this.renderer.getPixelRatio(),
      octaves: tier === TIER.LOW ? 1 : tier === TIER.MID ? 2 : 3,
      // Fewer witnesses need to be slightly larger to describe the same
      // field; the physics is unchanged (docs/PERMEATE.md §V).
      size: tier === TIER.LOW ? 2.3 : tier === TIER.MID ? 1.9 : 1.6,
    });
    this.scene.add(this.membrane.points);

    this.vessel = new Vessel({
      quality: tier === TIER.LOW ? 'low' : tier === TIER.MID ? 'mid' : 'high',
    });
    this.vessel.setQuality({ transmission: tier >= TIER.MID });
    this.vessel.group.position.copy(this.vesselPos);
    this.vessel.group.scale.setScalar(this.vesselScale);
    this.scene.add(this.vessel.group);
    this.vessel.group.visible = false;

    this.water.setQuality({
      intensity: tier === TIER.LOW ? 0.7 : 1,
      causticGain: tier === TIER.LOW ? 4 : 5.5,
    });
  }

  #bind() {
    this.onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
      this.membrane.setQuality({ pixelRatio: this.renderer.getPixelRatio() });
    };

    this.onPointer = (e) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -((e.clientY / window.innerHeight) * 2 - 1);
      this.pointerTarget.set(x, y);
      this.pointerForce = Math.min(this.pointerForce + 0.12, 1);
    };

    this.onVisibility = () => {
      if (document.hidden) this.pause();
      else this.play();
    };

    window.addEventListener('resize', this.onResize, { passive: true });
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Sections report their scroll progress; the stage owns the camera. */
  setWaypoint(name, progress = 0) {
    const wp = WAYPOINTS[name];
    if (!wp) return;
    this.waypoint = wp;
    this.fluxTarget = wp.flux;
    this.scrollTarget = progress;
    this.activeSection = name;
  }

  /**
   * Single-column layouts have no free gutter: every horizontal band of the
   * viewport is spoken for by text. Rather than hide the vessel behind a
   * paragraph and call it depth, it is dropped from the scene entirely below
   * the desktop breakpoint — the particle field and caustics carry the 3D on
   * small screens, which is also where the GPU budget is tightest. This is a
   * composition decision, not a performance fallback.
   */
  #vesselWanted() {
    // Below the desktop breakpoint the layout is a single column with no
    // free gutter at any scroll position, so the element never appears.
    if (window.innerWidth < 1024) return false;
    return this.waypoint.show !== false;
  }

  /**
   * Unproject a waypoint's screen intent into world space using the live
   * camera, so the vessel holds its position in the frame regardless of
   * camera yaw, viewport size or aspect ratio.
   *
   * Below the desktop breakpoint the layout collapses to a single column
   * with no free gutter, so the element is pulled toward centre, pushed
   * back and scaled down — present as atmosphere, never over the copy.
   */
  #vesselWorld(wp, out) {
    _ndc.set(wp.screen[0], wp.screen[1], 0.5).unproject(this.camera);
    _ndc.sub(this.camera.position).normalize();
    out.copy(this.camera.position).addScaledVector(_ndc, wp.dist);

    // Apparent size is held constant across beats: a fixed world scale
    // would make a distant vessel vanish and a near one dominate.
    return (wp.size * wp.dist) / 20;
  }

  play() {
    if (this.running || this.destroyed) return;
    this.running = true;
    this.clock.start();
    this.#loop();
  }

  pause() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  #loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.#loop);
    this.render();
  };

  render() {
    // The damping below is exponential (1 − e^−λΔt), which is unconditionally
    // stable, so Δt only needs clamping against pathological jumps such as a
    // tab returning from the background. Clamping it tightly (e.g. 0.05) would
    // silently couple convergence speed to frame rate: a 10fps device would
    // take five times longer to complete a camera move than a 60fps one, which
    // is precisely backwards for the devices that need to feel responsive.
    const dt = Math.min(this.clock.getDelta(), 0.25);
    const t = this.clock.getElapsedTime();
    this.frame++;

    // --- damped inputs: nothing in this world snaps ------------------
    const lam = this.reduced ? 24 : 3.2;
    this.pointer.x = damp(this.pointer.x, this.pointerTarget.x, lam, dt);
    this.pointer.y = damp(this.pointer.y, this.pointerTarget.y, lam, dt);
    this.pointerForce = damp(this.pointerForce, 0, 1.6, dt);
    this.scroll = damp(this.scroll, this.scrollTarget, 3.5, dt);
    this.flux = damp(this.flux, this.fluxTarget, 2.2, dt);

    const ctx = {
      dt,
      scroll: this.scroll,
      pointer: this.pointer,
      pointerForce: this.pointerForce,
      flux: this.flux,
      // The membrane plane tracks the vessel, so the separation always
      // happens *at* the element rather than beside it.
      faceX: this.vesselPos.x,
    };

    // --- camera: damped toward the active waypoint -------------------
    const wp = this.waypoint;
    const camLam = 2.4;
    for (let i = 0; i < 3; i++) {
      this.camPos[i] = damp(this.camPos[i], wp.pos[i], camLam, dt);
      this.camLook[i] = damp(this.camLook[i], wp.look[i], camLam, dt);
    }

    // Parallax breathing — the camera is handheld, not bolted down.
    const sway = this.reduced ? 0 : 1;
    this.camera.position.set(
      this.camPos[0] + this.pointer.x * 0.85 * sway,
      this.camPos[1] + this.pointer.y * 0.55 * sway - this.scroll * 1.2,
      this.camPos[2]
    );
    this.camera.lookAt(this.camLook[0], this.camLook[1], this.camLook[2]);
    // The vessel is placed relative to the *current* camera, so the matrix
    // must be current before unprojecting.
    this.camera.updateMatrixWorld();

    const targetScale = this.#vesselWorld(wp, _target);
    this.vesselPos.x = damp(this.vesselPos.x, _target.x, camLam, dt);
    this.vesselPos.y = damp(this.vesselPos.y, _target.y, camLam, dt);
    this.vesselPos.z = damp(this.vesselPos.z, _target.z, camLam, dt);
    this.vesselScale = damp(this.vesselScale, targetScale, camLam, dt);

    this.vesselPresence = damp(this.vesselPresence, this.#vesselWanted() ? 1 : 0, 3.0, dt);
    // Below a threshold it is dropped from the draw entirely rather than
    // rendered at a scale nobody can see.
    this.vessel.group.visible = this.vesselPresence > 0.02;
    this.vessel.group.position.copy(this.vesselPos);
    this.vessel.group.scale.setScalar(this.vesselScale * this.vesselPresence);

    this.corePoint.intensity = 12 + Math.sin(t * 0.9) * 3;

    // --- update the world --------------------------------------------
    const animT = this.reduced ? 0 : t;
    this.water.update(animT, ctx);
    this.face.update(animT, ctx);
    this.membrane.update(animT, ctx);
    if (this.vessel.group.visible) this.vessel.update(animT, ctx);

    this.renderer.render(this.scene, this.camera);

    if (!this.degraded) this.#governor(dt);
  }

  /**
   * Perf governor: a beautiful algorithm that stutters is not beautiful,
   * merely ambitious (docs/PERMEATE.md §V). If we can't hold ~45fps over a
   * 90-frame window, shed cost once and stop measuring.
   */
  #governor(dt) {
    this.fpsSamples.push(1 / Math.max(dt, 1e-4));
    if (this.fpsSamples.length < 90) return;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.fpsSamples.length = 0;
    if (avg >= 45) return;

    this.degraded = true;
    this.renderer.setPixelRatio(Math.max(1, this.renderer.getPixelRatio() - 0.5));
    this.membrane.setQuality({
      pixelRatio: this.renderer.getPixelRatio(),
      octaves: 1,
      size: 3.4,
    });
    this.vessel.setQuality({ transmission: false });
    this.water.setQuality({ intensity: 0.75, causticGain: 4 });
    this.onResize();
  }

  destroy() {
    this.destroyed = true;
    this.pause();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.membrane.dispose();
    this.water.dispose();
    this.face.dispose();
    this.vessel.dispose();
    this.envRT?.dispose();
    this.renderer.dispose();
  }
}

/* ------------------------------------------------------------------ *
 * Boot — called from the page. Resolves to null when the stage should
 * not run at all, in which case the CSS fallback stays visible.
 * ------------------------------------------------------------------ */
export function boot(canvas) {
  const caps = detect();
  if (caps.tier === TIER.OFF) return null;

  const stage = new Stage(canvas, { caps });

  /* Waypoint selection.
   *
   * IntersectionObserver ratios are the wrong tool here: a section taller
   * than the viewport can never reach a 0.25 ratio, so threshold-based
   * switching silently strands the camera on the previous beat. Instead we
   * ask a direct question every scroll — which section owns the viewport's
   * focal line? — which is correct for sections of any height. */
  const sections = Array.from(document.querySelectorAll('[data-stage]'));

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;

      const max = document.documentElement.scrollHeight - window.innerHeight;
      stage.scrollTarget = max > 0 ? window.scrollY / max : 0;

      // Focal line sits above centre: the beat changes as a section's
      // content arrives, not once it already fills the screen.
      const focus = window.innerHeight * 0.38;
      let active = null;
      for (const s of sections) {
        const r = s.getBoundingClientRect();
        if (r.top <= focus && r.bottom > focus) {
          active = s;
          break;
        }
      }
      // Past the last section (e.g. over the footer) hold the final beat.
      if (!active) {
        active = sections.find((s) => s.getBoundingClientRect().bottom > 0) || sections[sections.length - 1];
      }
      if (active && active.dataset.stage !== stage.activeSection) {
        stage.setWaypoint(active.dataset.stage, stage.scrollTarget);
      }
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  stage.play();
  return stage;
}

export { detect, TIER };
