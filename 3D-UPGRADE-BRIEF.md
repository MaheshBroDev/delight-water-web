# Delight Water Solutions — 3D / WebGL Upgrade Brief

This document is the **adapted prompt** used to drive the immersive 3D rebuild of the
Delight Water Solutions website, plus a summary of how it was implemented.

---

## Adapted prompt (water-treatment + RO focused)

> You are a developer tasked with rebuilding a water-treatment company website as a
> **fully-immersed 3D WebGL experience**. Your main objective is to implement a
> high-performance WebGL "clean flowing water" environment that wraps the whole site,
> plus an interactive, photoreal **3D Reverse-Osmosis water-filter system with a UV
> reactor** as the hero centrepiece. The result should read like a million-dollar,
> agency-built 3D site while remaining extremely fast to render on everyday devices.
>
> **Focus on:**
>
> – A real-time WebGL background that visualises **clean, flowing water** — an
>   undulating water surface, light caustics, god-rays, rising bubbles and drifting
>   current particles — rendered with GPU shaders for speed.
> – An **interactive 3D RO model** (filter canisters, stainless UV chamber with a
>   glowing quartz tube, pressure gauges, feed pump, manifold pipes and a clean-water
>   faucet) that the user can orbit/zoom, with **visibly flowing water** moving through
>   clear sight-tubes. Model it on the Sketchfab *"RO Product Water Filter System with
>   UV"* (id `645dc166e0fb4f0e8330ae5714c8b64b`).
> – Content **"3D divisions"** — cards that tilt in real 3D space toward the pointer
>   and rise out of depth on scroll.
> – Cinematic image-based lighting (PMREM environment), ACES filmic tone mapping and
>   sRGB output for a premium metal/glass look.
> – **Performance & robustness:** capped device-pixel-ratio, render-gating by viewport
>   visibility, GPU-side particle animation, `prefers-reduced-motion` support, mobile
>   scaling, and a graceful fallback to the existing CSS water theme if WebGL is
>   unavailable.
>
> **# Steps**
> 1. Vendor Three.js locally (no runtime CDN dependency) and load it via an ES-module
>    import map.
> 2. Build the flowing-water background scene with custom GLSL (Gerstner-style wave
>    displacement + procedural caustics), volumetric god-rays, GPU bubble/particle
>    systems and bokeh, with pointer parallax.
> 3. Build the RO water-filter system procedurally from physical materials (polished
>    steel, glass canisters, glowing UV tube), animate flowing water inside clear tubes,
>    UV pulse light and a dripping faucet, and wire it to OrbitControls (auto-rotate).
> 4. Add a CSS 3D layer: pointer-tilt "divisions" with glare, plus 3D scroll reveals.
> 5. Gate rendering (IntersectionObserver + `visibilitychange`), cap DPR, scale down on
>    mobile, and respect reduced-motion; keep the original CSS water theme as fallback.
> 6. Preserve all existing SEO, structured data (JSON-LD), accessibility, forms and copy.
>
> **# Output**
> Working, self-contained static site (HTML/CSS/JS + vendored Three.js) — see the
> implementation notes below.

---

## Implementation summary

| Layer | File | What it does |
|------|------|--------------|
| Flowing-water WebGL background | `js/scene3d.js` → `initBackground()` | `#bg-canvas`: GLSL wave water surface (ceiling + floor), additive caustic plane, volumetric god-rays, GPU rising bubbles, drifting current particles, bokeh discs, pointer parallax + bob. |
| Interactive 3D RO system | `js/scene3d.js` → `initROViewer()` | `#ro-canvas`: procedural stainless skid frame, 3 glass filter canisters (water + cartridge), horizontal UV reactor with glowing quartz tube + point light, steel manifold, **clear sight-tubes with flowing water rings**, 2 pressure gauges, feed pump, clean-water faucet with dripping stream/basin, contact shadow, glow ring. PMREM (RoomEnvironment) IBL, ACES tone mapping, OrbitControls auto-rotate. |
| DOM 3D layer | `js/ui3d.js` | Pointer-tilt 3D "divisions" with glare + 3D scroll-reveal + hero parallax. Reduced-motion / touch aware. |
| Three.js (vendored) | `vendor/three.module.min.js`, `vendor/controls/OrbitControls.js`, `vendor/environments/RoomEnvironment.js` | Loaded via `<script type="importmap">` — zero runtime CDN dependency. |
| Styles | `css/modern-styles.css` | New "3D / WebGL layer" section (canvas stacking, hero 3D stage, tilt, reveal, responsive). |
| Markup | `index.html` | Added `#bg-canvas`, hero `#ro-canvas` (+ graceful fallback image), import map and the two module scripts. All SEO/JSON-LD/forms preserved. |

### Performance & accessibility features
- DPR capped (`≤2` desktop / `≤1.5–2` mobile); `powerPreference: 'high-performance'`.
- Single `requestAnimationFrame` loop drives both scenes; pauses on `visibilitychange`.
- The RO viewer is render-gated by `IntersectionObserver` (only draws when on-screen).
- Particles/bubbles animate **on the GPU** (custom shaders) — no per-frame CPU loops.
- `prefers-reduced-motion` → calm, slow water + no auto-rotate + instant reveals.
- Graceful fallback: if WebGL is unavailable, the original CSS water/bubble theme stays
  and the hero shows the static RO image; `#bg-canvas` is simply never initialised.

### Notes
- The Sketchfab model is **referenced** for accuracy; the hero uses a procedurally-built
  Three.js model so the site stays self-contained, fast-loading and licence-free. A real
  `.glb` of that exact model can be dropped in later via `GLTFLoader` if desired.
