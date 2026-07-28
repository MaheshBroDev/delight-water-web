# Delight Water Solutions — web

Static marketing site for Delight Water Solutions (Pvt) Ltd, Galewela, Sri Lanka.
Built around a persistent WebGL stage: the page is an instrument panel suspended
over a live reverse-osmosis simulation.

**Live:** https://delightwatersolutions.com/

---

## Quick start

```bash
npm install        # esbuild + three (build-time only — nothing ships from a CDN)
npm run build      # bundles src/stage → assets/js/stage.js
npm run serve      # http://127.0.0.1:8123
```

`index.html`, `css/`, `assets/` are the deployable artefacts. There is no
server-side component; deploy the repository root as-is.

| Command | Purpose |
| --- | --- |
| `npm run build` | Tree-shaken, minified stage bundle (~132 KB gzip) |
| `npm run watch` | Rebuild on change |
| `npm run serve` | Local static server |
| `npm run verify` | Headless Chromium QA — see below |

> **Important:** `assets/js/stage.js` is a build output but *is* committed, so the
> site deploys without a build step. Re-run `npm run build` after touching
> anything in `src/stage/` or the change will not reach the page.

---

## Architecture

```
index.html            Single page. All SEO/JSON-LD lives in <head>.
css/stage.css         Design system: tokens, layout, components, motion.
assets/js/site.js     Progressive enhancement (nav, reveals, FAQ, form, tilt).
assets/js/stage.js    ← BUILD OUTPUT. Do not edit.
assets/fonts/         Self-hosted woff2 (128 KB total).
src/stage/            WebGL source.
  index.js            Scene, camera waypoints, render loop, perf governor.
  membrane.js         The particle system — the RO separation itself.
  water.js            Environment shell, caustics, membrane face.
  vessel.js           Pressure vessel: physical glass with transmission.
  glsl.js             Shader chunks (simplex, curl noise, caustics).
  palette.js          Colour, mirrored by CSS custom properties.
  capability.js       Device tiering.
tools/                build · serve · verify
docs/PERMEATE.md      The algorithmic philosophy behind the simulation.
```

### The stage

One canvas, one scene, one render loop, behind the entire document. Sections do
not own their own WebGL contexts — they own *waypoints* along a single camera
path (`WAYPOINTS` in `src/stage/index.js`), so scrolling reads as descending a
treatment train rather than cutting between unrelated widgets.

The particle system is the site's central idea: every particle carries a hidden
solute load, and at the membrane plane a verdict is rendered — permeate crosses
and cools to the one bright accent in the palette, brine is rejected tangentially
and darkens. Position is never integrated, only evaluated as a pure function of
`(seed, time)` in the vertex shader, so the same seed renders the same instant on
every device. The full rationale is in [`docs/PERMEATE.md`](docs/PERMEATE.md).

**Composition rule:** the pressure vessel is placed in *screen* space and
unprojected against the live camera each frame, so it holds its position in the
frame at any viewport size or camera angle. On content-dense beats (metrics,
products, services, contact) and on single-column layouts it withdraws entirely —
presence is earned by empty space, never asserted over a paragraph. This is
enforced by a test, not by convention.

### Degradation

Every path below is exercised by `npm run verify`:

| Condition | Behaviour |
| --- | --- |
| No WebGL | Stage never boots; CSS gradient field stays visible |
| No JS | Full document — all seven sections, all content, all links |
| `prefers-reduced-motion` | Animation frozen, camera sway off, content immediately visible |
| Low-power / `saveData` / software raster | 6 000 particles, 1× DPR, single noise octave, no transmission |
| Sustained < 45 fps | Governor sheds pixel ratio, octaves and glass — once, then stops measuring |
| Hidden tab | Loop paused |

Tiers: 6 000 / 18 000 / 42 000 particles. The *physics* never adapts, only the
number of witnesses. Force a tier for QA with `?stageTier=1|2|3`.

---

## Verification

`npm run verify` boots the real page in headless Chromium across three
viewports and asserts 37 invariants: that the stage actually advances frames and
produces non-flat output, that all six camera beats fire, that the vessel never
overlaps the reading column, that fonts load, that JSON-LD survives, that contact
details are intact, plus the four degradation paths above. Screenshots land in
`.tmp/shots/`.

It needs a Chromium binary:

```bash
CHROME=/path/to/chromium npm run verify
```

Sampling the vessel's projected bounding box against `elementFromPoint` is what
catches text collisions that centre-point checks miss — several were found and
fixed this way.

---

## Conventions

- **No CDNs at runtime.** Three.js is tree-shaken into `stage.js`; fonts are
  vendored. The site has no third-party network dependency.
- **Colour lives in two places that must agree:** `src/stage/palette.js` and the
  `:root` block in `css/stage.css`.
- **Content is not owned by JavaScript.** Copy, headings and contact details are
  in the HTML; JS only enhances.
- SEO/JSON-LD (`LocalBusiness`, `Product`, `FAQPage`, `Service`, `BreadcrumbList`)
  is load-bearing for this business. If you edit the FAQ copy, edit the
  `FAQPage` block to match.

`_archive/` holds superseded versions of the site and is not deployed.
