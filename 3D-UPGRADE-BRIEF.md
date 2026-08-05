# Delight Water Solutions — 3D / WebGL Upgrade Brief

This document is the **design brief + implementation notes** for the immersive
3D / WebGL rebuild of the Delight Water Solutions website, inspired by the
Awwwards *Site of the Day* — *Active Theory* / `w.`'s
**"3D Realistic Water Experiment"** (`https://water-simulation.vercel.app/`).

The goal is the language of that reference — **photoreal flowing water, caustics,
waterline, configuration panel, scroll-driven 3D** — applied to a real B2B
water-treatment brand.

---

## Design language (what we are matching)

| Element from the reference | Our adaptation |
|---|---|
| **Realistic flowing water** shader as a full-viewport background | Custom GLSL waterline plane (animated noise + mouse parallax) + animated caustic floor + god-rays + GPU-animated rising bubbles + drifting current particles, all over a deep-water gradient. |
| **Waterline** (the iconic horizontal "surface" line) | A thin shader-driven band with a small bright specular highlight, ripples, and a stronger glow under the pointer. |
| **Caustics** shimmering on the bottom | Additive GLSL caustic shader on a large floor plane, three sin/cos lattices multiplied and powered for the classic underwater light-pattern. |
| **Volumetric god-rays** | Five additive gradient planes that drift and pulse softly. |
| **GPU rising bubbles** | Custom-shader `THREE.Points` — sizes/positions animated in the vertex shader, no per-frame CPU loop. |
| **Drifting current particles** | Custom-shader points with pointer parallax (nudge toward the cursor). |
| **Pointer parallax** | The whole background scene subtly shifts to the cursor position. |
| **3D RO system as a hero centerpiece** | Procedural reverse-osmosis skid: 4-post frame, 3 glass filter canisters (water + cartridge inside), horizontal UV chamber with glowing quartz tube + point light, manifold, **clear sight-tubes with visibly flowing water**, 2 pressure gauges, red feed pump, clean-water faucet. |
| **HDRI IBL** (the photoreal look) | `RoomEnvironment` baked through `PMREMGenerator` for a believable studio reflection on steel + glass. |
| **Bloom on the UV glow** | `EffectComposer` + `UnrealBloomPass` + `OutputPass` + ACES tone mapping for the premium metal/glass look. |
| **Configuration panel** (a hallmark of the reference) | Floating glass UI next to the 3D viewer with **filter-stage buttons** (All / Sediment / Carbon / RO) and **sliders** for flow rate and UV intensity. Each control mutates the live 3D model in real time. |
| **Scroll-driven camera path** | The hero camera slowly arcs and zooms out as the user scrolls, so the 3D scene stays alive while the page transitions. |
| **Drag-to-orbit** | `OrbitControls` with damping, auto-rotate (off for `prefers-reduced-motion`), polar-angle limits to keep the framing. |
| **Cinematic scroll narrative** | Lenis smooth-scroll + GSAP + `ScrollTrigger` drive a 3D "rise-from-depth" reveal on every section card, parallax on the section title, and a hero fade-out. |
| **3D "divisions"** (cards) | Pointer-tilt + radial glare on the section cards (CSS `transform: rotateX/rotateY`). |
| **Stats count-up** | GSAP counts `15+ / 500+ / 100% / 24/7` on scroll. |

---

## Tech stack

- **Three.js** (vendored, no runtime CDN) + `OrbitControls` + `RoomEnvironment` + `EffectComposer` + `UnrealBloomPass` + `OutputPass` + `RenderPass`.
- **Lenis** (vendored) for smooth-scroll, hooked into the GSAP ticker.
- **GSAP** + **ScrollTrigger** (vendored) for the scroll narrative.
- **Vanilla JS** + native ES modules. **No build step.**
- The import map is in `index.html` and looks like:
  ```html
  <script type="importmap">
  { "imports": {
      "three": "/vendor/three.module.min.js",
      "three/addons/": "/vendor/"
  } }
  </script>
  ```
  Note: `three/addons/postprocessing/*` and `three/addons/postprocessing/shaders/*`
  files use *relative* imports (`./Pass.js`, `../shaders/CopyShader.js`), so the
  import map doesn't need entries for them — they resolve naturally from their
  own directory.

---

## File layout

| Layer | File | What it does |
|------|------|--------------|
| Flowing-water WebGL background | `js/scene3d.js` → `buildBackground()` | `#bg-canvas`: waterline + caustics + god-rays + GPU bubbles + current particles + pointer parallax. |
| Interactive 3D RO system | `js/scene3d.js` → `buildHero()` | `#ro-canvas`: procedural skid, glass canisters, UV reactor with glowing quartz tube, pressure gauges, feed pump, sight-tubes with flowing water, faucet, bloom. HDRI IBL + ACES + scroll-driven camera. |
| Configuration panel wiring | `js/scene3d.js` → bottom of `buildHero()` | Reads `.config-btn` / `.config-slider` clicks and mutates canisters, flow material, and UV emissive intensity live. |
| Scroll narrative | `js/ui3d.js` | Lenis + GSAP + ScrollTrigger; 3D reveals; pointer-tilt + glare; stats count-up; configuration panel toggle + slider `<output>` updates. |
| Three.js + addons | `vendor/three.module.min.js`, `vendor/controls/OrbitControls.js`, `vendor/environments/RoomEnvironment.js` | Vendored locally (no CDN). |
| Postprocessing | `vendor/postprocessing/*.js`, `vendor/shaders/*.js` | Vendored locally. |
| Lenis | `vendor/lenis/lenis.min.js` | Vendored locally. |
| GSAP + ScrollTrigger | `vendor/gsap/*.min.js` | Vendored locally. |
| Styles | `css/modern-styles.css` | New "3D / WebGL layer" section (canvas stacking, hero 3D stage, glare, configuration panel, Lenis, responsive). |
| Markup | `index.html` | Added `#bg-canvas`, hero `#ro-canvas` (+ graceful fallback image), the **configuration panel**, import map, the 3D module + Lenis/GSAP scripts. All SEO/JSON-LD/forms preserved. |

---

## Performance & accessibility features

- DPR capped (`≤1.75` desktop / `≤1.25` mobile); `powerPreference: 'high-performance'`.
- Single `requestAnimationFrame` loop drives both scenes; pauses on `visibilitychange`.
- The RO viewer is render-gated by `IntersectionObserver` (only draws when on-screen).
- Particles/bubbles animate **on the GPU** (custom shaders) — no per-frame CPU loops.
- `prefers-reduced-motion` → calm, slow water + no auto-rotate + instant reveals + Lenis disabled.
- Graceful fallback: if WebGL is unavailable, the original CSS water/bubble theme stays
  and the hero shows the static RO image; `#bg-canvas` is never initialised.
- All vendor JS is local — no third-party CDN dependency at runtime.

---

## SEO / AEO / accessibility preserved

All the existing SEO, structured data, accessibility, forms, and copy are
**unchanged**:
- `<title>`, `<meta>`, Open Graph, Twitter Card, canonical URL.
- JSON-LD: `LocalBusiness`, `FAQPage`, `Service`.
- Form posts to Formspree (`#contactForm`).
- Skip-links, alt text, ARIA labels preserved.
- New elements (`#bg-canvas`, `#ro-canvas`, configuration panel) all have
  `aria-label`s or `aria-hidden="true"` as appropriate.

The 3D is **enhancement** only — the entire site is fully readable, navigable,
and indexable without JavaScript.

---

## How to preview

Serve the directory with any static server (the project uses no build step):

```sh
python3 -m http.server 8080
# then open http://localhost:8080
```

Visual QA should be done in a real browser (the sandbox has no Chromium for
headless WebGL testing).

---

## Future work / out of scope for this PR

- The 3D model is procedural — a real `.glb` of an RO system could be dropped
  in via `GLTFLoader` later.
- A custom `WaterMaterial` (MeshPhysicalMaterial with transmission + a refraction
  normal map) could replace the simple glass canisters for a more dramatic
  photoreal look — kept simple here for performance.
- The configuration panel currently controls filter selection, flow rate and UV
  intensity; future iterations could add temperature, pressure, and pump speed
  sliders.
