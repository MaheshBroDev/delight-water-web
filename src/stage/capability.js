/**
 * Device capability tiering.
 *
 * The physics never adapts — only the number of witnesses (docs/PERMEATE.md §V).
 * A phone and a workstation resolve the identical instant of the identical
 * world; one simply samples it with fewer particles.
 */

export const TIER = { OFF: 0, LOW: 1, MID: 2, HIGH: 3 };

let cached = null;

function detectWebGL() {
  try {
    const c = document.createElement('canvas');
    const gl =
      c.getContext('webgl2') ||
      c.getContext('webgl') ||
      c.getContext('experimental-webgl');
    if (!gl) return null;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return { renderer, maxTex, isWebGL2 };
  } catch {
    return null;
  }
}

export function prefersReducedMotion() {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Reads a forced tier from the URL (`?stageTier=1|2|3`).
 * QA seam: lets the verifier capture what real hardware renders even when
 * running under software raster. Ignored unless the value is valid.
 */
function forcedTier() {
  try {
    const v = Number(new URLSearchParams(location.search).get('stageTier'));
    return v >= 1 && v <= 3 ? v : null;
  } catch {
    return null;
  }
}

/** Returns { tier, particles, dpr, postfx, reason }. */
export function detect() {
  if (cached) return cached;

  const reduced = prefersReducedMotion();
  const gl = detectWebGL();

  if (!gl) {
    cached = { tier: TIER.OFF, particles: 0, dpr: 1, postfx: false, reason: 'no-webgl' };
    return cached;
  }

  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const coarse =
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 700;
  const software = /swiftshader|llvmpipe|software|basic render/i.test(gl.renderer);
  const saveData = navigator.connection?.saveData === true;

  let tier;
  if (saveData) tier = TIER.LOW;
  else if (software) tier = TIER.LOW;
  else if (mem <= 2 || cores <= 2) tier = TIER.LOW;
  else if (coarse || narrow || mem <= 4 || cores <= 4) tier = TIER.MID;
  else tier = TIER.HIGH;

  const forced = forcedTier();
  if (forced) tier = forced;

  const particles = { 1: 6000, 2: 18000, 3: 42000 }[tier];
  const dpr = {
    1: 1,
    2: Math.min(window.devicePixelRatio || 1, 1.5),
    3: Math.min(window.devicePixelRatio || 1, 2),
  }[tier];

  cached = {
    tier,
    particles,
    dpr,
    postfx: tier === TIER.HIGH,
    reduced,
    software,
    webgl2: gl.isWebGL2,
    reason: 'ok',
  };
  return cached;
}

/** Test seam — lets the verifier force a tier. */
export function override(partial) {
  cached = { ...(cached || detect()), ...partial };
  return cached;
}
