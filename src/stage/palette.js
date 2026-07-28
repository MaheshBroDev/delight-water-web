/**
 * Deep-water technical palette.
 *
 * Colour is measured, not assigned (docs/PERMEATE.md §IV):
 *   hue      → solute load
 *   luminance→ velocity
 *   alpha    → depth
 *
 * `permeate` is the only genuinely bright value in the world, reserved
 * exclusively for water that has crossed the membrane — so purity is the
 * brightest fact on screen.
 */
import { Color } from 'three';

export const PALETTE = {
  abyss: 0x03070c, // near-black tank
  deep: 0x061420, // body of water
  brine: 0x0a2b3d, // rejected stream
  teal: 0x0e6b7d, // sodium-lit plant at night
  aqua: 0x2fd4e8, // brand cyan, corrected
  permeate: 0x8ef4ff, // the one hot value
  mineral: 0x1d4a5c, // suspended solids
};

const cache = new Map();

/** Memoised THREE.Color for a palette key or hex literal. */
export function color(key) {
  const hex = typeof key === 'string' ? PALETTE[key] : key;
  if (!cache.has(hex)) cache.set(hex, new Color(hex));
  return cache.get(hex);
}

/** CSS custom-property mirror, so DOM and WebGL never drift apart. */
export const CSS_TOKENS = {
  '--abyss': '#03070c',
  '--deep': '#061420',
  '--brine': '#0a2b3d',
  '--teal': '#0e6b7d',
  '--aqua': '#2fd4e8',
  '--permeate': '#8ef4ff',
  '--mineral': '#1d4a5c',
};
