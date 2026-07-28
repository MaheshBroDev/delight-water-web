#!/usr/bin/env node
/**
 * Headless verification: boots the real page in Chromium, checks the WebGL
 * stage actually renders, captures screenshots at three breakpoints, and
 * asserts a set of correctness/a11y invariants.
 *
 * Usage:  CHROME=/path/to/chromium node tools/verify.mjs
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, '.tmp/shots');
const PORT = 8177;
const CHROME = process.env.CHROME || '/tmp/tool/chrome/chromium';

const VIEWPORTS = [
  { name: 'desktop', width: 1512, height: 950, dsf: 1 },
  { name: 'tablet', width: 900, height: 1100, dsf: 1 },
  { name: 'mobile', width: 390, height: 844, dsf: 2 },
];

const results = [];
const pass = (n, d = '') => results.push({ ok: true, n, d });
const fail = (n, d = '') => results.push({ ok: false, n, d });

await mkdir(OUT, { recursive: true });

// --- static server -------------------------------------------------------
const server = spawn(process.execPath, [resolve(root, 'tools/serve.mjs')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 700));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--in-process-gpu',
    '--disable-dev-shm-usage',
    '--force-color-profile=srgb',
    '--hide-scrollbars',
  ],
});

const base = `http://127.0.0.1:${PORT}/`;

try {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    const errors = [];
    const failed404 = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('response', (r) => {
      if (r.status() >= 400) failed404.push(`${r.status()} ${r.url()}`);
    });

    await page.setViewport({
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.dsf,
      isMobile: vp.name === 'mobile',
      hasTouch: vp.name === 'mobile',
    });

    await page.goto(base, { waitUntil: 'networkidle0', timeout: 45000 });

    // Give the stage its idle window + a few render frames.
    await page.evaluate(
      () => new Promise((r) => setTimeout(r, 3200))
    );

    // ---- assertions -----------------------------------------------------
    const stageOk = await page.evaluate(() => {
      const s = window.__stage;
      if (!s) return { booted: false };
      return {
        booted: true,
        frames: s.frame,
        tier: s.caps.tier,
        particles: s.caps.particles,
        degraded: s.degraded,
        drawCalls: s.renderer.info.render.calls,
        triangles: s.renderer.info.render.triangles,
        programs: s.renderer.info.programs?.length ?? 0,
        ctxLost: s.renderer.getContext().isContextLost(),
      };
    });

    // Frame count alone is meaningless under software raster — what matters
    // is that the loop is *advancing*. Sample twice and require progress.
    const advanced = await page.evaluate(
      () =>
        new Promise((r) => {
          const s = window.__stage;
          if (!s) return r(0);
          const a = s.frame;
          setTimeout(() => r(s.frame - a), 1200);
        })
    );

    if (stageOk.booted && advanced > 3 && stageOk.drawCalls > 0) {
      pass(
        `${vp.name}: stage rendering`,
        `+${advanced} frames/1.2s · tier ${stageOk.tier} · ${stageOk.drawCalls} draws · ${stageOk.particles} particles`
      );
    } else {
      fail(`${vp.name}: stage rendering`, JSON.stringify({ ...stageOk, advanced }));
    }

    if (stageOk.booted && stageOk.ctxLost === false) pass(`${vp.name}: webgl context alive`);
    else if (stageOk.booted) fail(`${vp.name}: webgl context lost`);

    // Canvas must not be a flat fill — sample the framebuffer.
    const variance = await page.evaluate(async () => {
      const c = document.getElementById('stage');
      const shot = await new Promise((res) => {
        requestAnimationFrame(() => requestAnimationFrame(() => res(c.toDataURL('image/png'))));
      });
      const img = new Image();
      await new Promise((r) => { img.onload = r; img.src = shot; });
      const t = document.createElement('canvas');
      t.width = 160; t.height = 100;
      const g = t.getContext('2d');
      g.drawImage(img, 0, 0, 160, 100);
      const d = g.getImageData(0, 0, 160, 100).data;
      let n = 0, sum = 0, sumSq = 0, distinct = new Set();
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        sum += l; sumSq += l * l; n++;
        distinct.add(`${d[i] >> 3},${d[i + 1] >> 3},${d[i + 2] >> 3}`);
      }
      const mean = sum / n;
      return { std: Math.sqrt(sumSq / n - mean * mean), mean, distinct: distinct.size };
    });

    if (variance.distinct > 12 && variance.std > 1.2) {
      pass(`${vp.name}: canvas has real content`, `${variance.distinct} colours · σ=${variance.std.toFixed(2)}`);
    } else {
      fail(`${vp.name}: canvas looks flat`, JSON.stringify(variance));
    }

    // No horizontal overflow.
    const overflow = await page.evaluate(() => {
      const de = document.documentElement;
      return { scrollW: de.scrollWidth, clientW: de.clientWidth };
    });
    if (overflow.scrollW <= overflow.clientW + 1) pass(`${vp.name}: no horizontal overflow`);
    else fail(`${vp.name}: horizontal overflow`, JSON.stringify(overflow));

    // Content is visible and readable above the fold.
    const heroText = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      if (!h1) return null;
      const r = h1.getBoundingClientRect();
      const cs = getComputedStyle(h1);
      return {
        text: h1.innerText.replace(/\s+/g, ' ').trim(),
        visible: r.width > 0 && r.height > 0,
        top: Math.round(r.top),
        family: cs.fontFamily,
        size: cs.fontSize,
        opacity: cs.opacity,
      };
    });
    if (heroText?.visible && heroText.text.length > 4) {
      pass(`${vp.name}: hero legible`, `"${heroText.text}" ${heroText.size}`);
    } else {
      fail(`${vp.name}: hero missing`, JSON.stringify(heroText));
    }

    // Custom fonts actually loaded (not fallback).
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        serif: document.fonts.check('400 48px "Instrument Serif"'),
        sans: document.fonts.check('400 16px "Archivo"'),
        mono: document.fonts.check('400 12px "JetBrains Mono"'),
      };
    });
    if (fonts.serif && fonts.sans && fonts.mono) pass(`${vp.name}: fonts loaded`);
    else fail(`${vp.name}: fonts not loaded`, JSON.stringify(fonts));

    if (failed404.length === 0) pass(`${vp.name}: no failed requests`);
    else fail(`${vp.name}: failed requests`, failed404.join(' | '));

    if (errors.length === 0) pass(`${vp.name}: no JS errors`);
    else fail(`${vp.name}: JS errors`, errors.slice(0, 4).join(' | '));

    // ---- screenshots ----------------------------------------------------
    await page.screenshot({ path: resolve(OUT, `${vp.name}-hero.png`) });

    // Mid-page: scroll to products and let the camera settle.
    await page.evaluate(() => {
      document.getElementById('products')?.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 2000)));
    await page.screenshot({ path: resolve(OUT, `${vp.name}-products.png`) });

    await page.evaluate(() => {
      document.getElementById('contact')?.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 1600)));
    await page.screenshot({ path: resolve(OUT, `${vp.name}-contact.png`) });

    // Desktop-only deeper checks.
    if (vp.name === 'desktop') {
      // FAQ accordion opens and reports state.
      const faq = await page.evaluate(async () => {
        const btn = document.querySelector('.qa-q');
        btn.click();
        await new Promise((r) => setTimeout(r, 650));
        const panel = btn.parentElement.querySelector('.qa-a');
        return {
          expanded: btn.getAttribute('aria-expanded'),
          height: panel.getBoundingClientRect().height,
        };
      });
      if (faq.expanded === 'true' && faq.height > 20) pass('faq accordion opens', `h=${Math.round(faq.height)}px`);
      else fail('faq accordion', JSON.stringify(faq));

      // Metric counters resolve to their exact final values.
      // Generous window: under SwiftShader the main thread runs ~8fps, so
      // rAF and timers are heavily delayed. On real hardware this is ~1.5s.
      const counts = await page.evaluate(() => {
        document.querySelector('.metrics')?.scrollIntoView();
        return new Promise((r) =>
          setTimeout(
            () => r(Array.from(document.querySelectorAll('[data-count]')).map((e) => e.textContent)),
            7000
          )
        );
      });
      if (counts.join(',') === '17+,500+,100%') pass('metric counters', counts.join(' · '));
      else fail('metric counters', counts.join(' · '));

      // Reveal system: everything ends visible (no stuck opacity:0).
      const hidden = await page.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((r) => setTimeout(r, 1500));
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 600));
        return Array.from(document.querySelectorAll('[data-reveal]'))
          .filter((e) => getComputedStyle(e).opacity === '0').length;
      });
      if (hidden === 0) pass('all reveals resolved');
      else fail('stuck reveals', `${hidden} elements still opacity:0`);

      // JSON-LD survived the rebuild and still parses.
      const ld = await page.evaluate(() =>
        Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((s) => {
          try { return JSON.parse(s.textContent)['@type']; } catch { return 'PARSE_ERROR'; }
        })
      );
      const wanted = ['LocalBusiness', 'Product', 'FAQPage', 'Service', 'BreadcrumbList'];
      const missing = wanted.filter((w) => !ld.includes(w));
      if (!ld.includes('PARSE_ERROR') && missing.length === 0) pass('JSON-LD intact', ld.join(', '));
      else fail('JSON-LD', `types=${ld.join(',')} missing=${missing.join(',')}`);

      // Contact details preserved verbatim.
      const contactOk = await page.evaluate(() => {
        const html = document.body.innerHTML;
        return {
          phone1: html.includes('+94772666829'),
          phone2: html.includes('+94777822332'),
          email: html.includes('contact@delightwatersolutions.com'),
          formspree: html.includes('formspree.io/f/xbjpnaww'),
          address: html.includes('Bambaragaswewa'),
        };
      });
      const badContact = Object.entries(contactOk).filter(([, v]) => !v).map(([k]) => k);
      if (badContact.length === 0) pass('contact details preserved');
      else fail('contact details lost', badContact.join(','));

      // Keyboard: skip link is the first stop and becomes visible.
      const skip = await page.evaluate(async () => {
        document.body.focus();
        const a = document.querySelector('.skip');
        a.focus();
        const r = a.getBoundingClientRect();
        return { focused: document.activeElement === a, left: Math.round(r.left) };
      });
      if (skip.focused && skip.left >= 0) pass('skip link reachable');
      else fail('skip link', JSON.stringify(skip));

      // Waypoints advance through every beat as the page is scrolled —
      // this is what breaks when a section is taller than the viewport.
      const beats = await page.evaluate(async () => {
        const seen = [];
        const ids = ['#home', '#about', '#products', '#services', '#faq', '#contact'];
        for (const id of ids) {
          // 'instant': the page sets scroll-behavior:smooth, and a smooth
          // scroll under software raster takes longer than the settle
          // window — which would measure the animation, not the waypoint.
          document.querySelector(id)?.scrollIntoView({ behavior: 'instant', block: 'start' });
          await new Promise((r) => setTimeout(r, 900));
          seen.push(window.__stage?.activeSection);
        }
        window.scrollTo(0, 0);
        return seen;
      });
      const unique = new Set(beats.filter(Boolean));
      if (unique.size >= 5) pass('camera beats advance', beats.join(' → '));
      else fail('camera stuck on a beat', beats.join(' → '));

      // The vessel must never sit over the reading column.
      const clearance = await page.evaluate(async () => {
        const out = [];
        for (const id of ['#home', '#about', '#products', '#services', '#faq', '#contact']) {
          document.querySelector(id)?.scrollIntoView({ behavior: 'instant', block: 'start' });
          await new Promise((r) => setTimeout(r, 2600));
          const s = window.__stage;
          // Only assert on a vessel that is actually present: one that has
          // withdrawn for a full-bleed beat is scaled to nothing and cannot
          // occlude anything, regardless of where its transform sits.
          if (!s || !s.vessel.group.visible || s.vesselPresence < 0.15) {
            out.push({ id, withdrawn: true });
            continue;
          }
          // Sample the element's projected extent, not just its centre:
          // a long cylinder can clear the text at its midpoint while its
          // ends lie straight across a paragraph.
          const g = s.vessel.group;
          const half = 3.4 * g.scale.x;
          const pts = [];
          for (const dx of [-half, 0, half]) {
            for (const dy of [-half * 0.45, 0, half * 0.45]) {
              const w = g.position.clone();
              w.x += dx; w.y += dy;
              const v = w.project(s.camera);
              pts.push([((v.x + 1) / 2) * window.innerWidth, ((1 - v.y) / 2) * window.innerHeight]);
            }
          }
          const hits = pts.filter(([px, py]) => {
            if (px < 0 || py < 0 || px >= window.innerWidth || py >= window.innerHeight) return false;
            const el = document.elementFromPoint(px, py);
            return !!el?.closest('h1,h2,h3,h4,p,label,button,a,.readout,.form-panel,.channels,.unit,.metric');
          });
          out.push({ id, onText: hits.length > 0, hits: hits.length });
        }
        window.scrollTo(0, 0);
        return out;
      });
      const collisions = clearance.filter((c) => c.onText);
      if (collisions.length === 0) pass('vessel clears the reading column', clearance.map((c) => c.id).join(', '));
      else fail('vessel overlaps text', JSON.stringify(collisions));

      // Perf snapshot.
      const perf = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const paints = performance.getEntriesByType('paint');
        const fcp = paints.find((p) => p.name === 'first-contentful-paint');
        return {
          domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
          load: Math.round(nav.loadEventEnd),
          fcp: fcp ? Math.round(fcp.startTime) : null,
          transferKB: Math.round(
            performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || 0), 0) / 1024
          ),
        };
      });
      pass('perf snapshot', `FCP ${perf.fcp}ms · DCL ${perf.domContentLoaded}ms · ${perf.transferKB}KB transferred`);

      // Sustained frame rate under the real render loop.
      const fps = await page.evaluate(
        () =>
          new Promise((r) => {
            let n = 0;
            const t0 = performance.now();
            (function tick() {
              n++;
              if (performance.now() - t0 < 2500) requestAnimationFrame(tick);
              else r(Math.round((n / (performance.now() - t0)) * 1000));
            })();
          })
      );
      pass('frame rate (swiftshader, software raster)', `${fps} fps`);
    }

    await page.close();
  }

  // --- reduced motion path ------------------------------------------------
  {
    const page = await browser.newPage();
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setViewport({ width: 1512, height: 950 });
    await page.goto(base, { waitUntil: 'networkidle0' });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 2800)));
    const rm = await page.evaluate(() => {
      const h1 = document.querySelector('h1 .line > span');
      return {
        heroVisible: getComputedStyle(h1).opacity !== '0',
        reduced: window.__stage ? window.__stage.reduced : null,
        revealsHidden: Array.from(document.querySelectorAll('[data-reveal]'))
          .filter((e) => getComputedStyle(e).opacity === '0').length,
      };
    });
    if (rm.heroVisible && rm.revealsHidden === 0 && rm.reduced === true) {
      pass('reduced-motion: content visible, stage calmed');
    } else {
      fail('reduced-motion', JSON.stringify(rm));
    }
    await page.screenshot({ path: resolve(OUT, 'reduced-motion.png') });
    await page.close();
  }

  // --- no-WebGL fallback --------------------------------------------------
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1512, height: 950 });
    await page.evaluateOnNewDocument(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (String(type).includes('webgl')) return null;
        return orig.call(this, type, ...rest);
      };
    });
    await page.goto(base, { waitUntil: 'networkidle0' });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 2600)));
    const fb = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const bg = document.getElementById('stage-fallback');
      return {
        stageBooted: !!window.__stage,
        heroVisible: h1.getBoundingClientRect().height > 0,
        fallbackOpacity: getComputedStyle(bg).opacity,
        readout: document.getElementById('readout-tier')?.textContent,
      };
    });
    if (!fb.stageBooted && fb.heroVisible && fb.fallbackOpacity === '1') {
      pass('no-webgl: CSS fallback holds the page');
    } else {
      fail('no-webgl fallback', JSON.stringify(fb));
    }
    await page.screenshot({ path: resolve(OUT, 'no-webgl.png') });
    await page.close();
  }

  // --- no-JS path ---------------------------------------------------------
  {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setViewport({ width: 1512, height: 950 });
    await page.goto(base, { waitUntil: 'networkidle0' });
    const nojs = await page.evaluate === undefined ? null : await page.$eval('h1', (h) => ({
      text: h.innerText.replace(/\s+/g, ' ').trim(),
      height: h.getBoundingClientRect().height,
    }));
    const sections = await page.$$eval('section', (s) => s.length);
    if (nojs && nojs.height > 0 && sections >= 6) pass('no-js: document complete', `${sections} sections`);
    else fail('no-js', JSON.stringify({ nojs, sections }));
    await page.screenshot({ path: resolve(OUT, 'no-js.png') });
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}

// --- report ---------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
console.log('\n─── verification ───────────────────────────────────────────');
for (const r of results) {
  console.log(`${r.ok ? ' ✓' : ' ✗'} ${r.n}${r.d ? `  — ${r.d}` : ''}`);
}
console.log('────────────────────────────────────────────────────────────');
console.log(`${results.length - failed.length}/${results.length} passed`);
await writeFile(resolve(root, '.tmp/verify.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
