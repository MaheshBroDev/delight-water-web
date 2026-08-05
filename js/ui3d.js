/* =========================================================================
   DELIGHT WATER — SCROLL NARRATIVE  (Lenis + GSAP + ScrollTrigger)
   -------------------------------------------------------------------------
   Apple-style cinematic scroll.  This file:
     1. Initialises Lenis smooth-scroll.
     2. Wires GSAP + ScrollTrigger to that Lenis scroller.
     3. Drives the 5 hero text panels — each fades in/out as the user
        scrolls past it.  As each panel becomes active, the 3D hero
        camera is told which keyframe to be on.  NO GSAP `pin` on the
        stage itself (it's already `position: fixed`) — instead, a
        separate ScrollTrigger toggles `body.hero-out` once the user
        scrolls past the hero, fading the stage out so it stops
        covering subsequent content.
     4. Triggers the moment scenes (canister, pure) as they enter.
     5. Reveals every section card with a 3D "rise from depth" animation.
     6. Counts up the stats.  Pointer-tilt on cards.  FAQ accordion.
   ========================================================================= */

(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse       = window.matchMedia('(pointer: coarse)').matches;

  function whenReady(cb) {
    if (document.body.classList.contains('webgl') || !window.WebGLRenderingContext) {
      requestAnimationFrame(cb);
    } else {
      setTimeout(() => requestAnimationFrame(cb), 16);
    }
  }

  whenReady(() => init());

  function init() {
    /* ---------------- 1.  Lenis smooth scroll ------------------------- */
    let lenis = null;
    if (!reduceMotion && window.Lenis) {
      lenis = new window.Lenis({
        duration: 1.15,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        wheelMultiplier: 1.0,
        touchMultiplier: 1.4,
      });
      if (window.gsap) {
        window.gsap.ticker.add((time) => { lenis.raf(time * 1000); });
        window.gsap.ticker.lagSmoothing(0);
      } else {
        function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
        requestAnimationFrame(raf);
      }
      document.querySelectorAll('a[href^="#"]').forEach((a) => {
        a.addEventListener('click', (e) => {
          const id = a.getAttribute('href');
          if (id.length > 1) {
            const target = document.querySelector(id);
            if (target) {
              e.preventDefault();
              lenis.scrollTo(target, { offset: -60 });
            }
          }
        });
      });
    }

    /* ---------------- 2.  GSAP + ScrollTrigger ------------------------ */
    if (window.gsap && window.ScrollTrigger) {
      window.gsap.registerPlugin(window.ScrollTrigger);
      if (lenis) {
        lenis.on('scroll', window.ScrollTrigger.update);
      }
    }
    const gsap = window.gsap;
    const ST   = window.ScrollTrigger;
    const d3d  = window.__delight3d || {};

    /* ---------------- 3.  HERO  +  text panels  ----------------------- */
    /* The hero is 500vh tall (CSS) with 5 panels inside.  As the user
       scrolls through it, each text panel fades in and out, and the
       3D camera is told which step (0..4) to be on.  We also toggle
       `body.hero-out` once the user has scrolled past the hero so
       the fixed 3D stage fades out and doesn't cover the next section. */
    if (gsap && ST) {
      const heroEl   = document.querySelector('.hero');
      const panels   = document.querySelectorAll('.hero-text__panel');
      if (heroEl && panels.length) {
        const N = panels.length;
        const scroller = lenis ? lenis.rootElement : window;

        /* 3a.  Each panel — fade in/out as it enters/exits the viewport.
           We use a per-panel scrollTrigger that maps panel i to the
           scroll range [i, i+1] of the hero (in viewport heights). */
        panels.forEach((panel, i) => {
          if (i === 0) {
            /* first panel: keep visible from the start */
            gsap.set(panel, { opacity: 1, y: 0 });
          } else if (i === N - 1) {
            /* last panel: fade in at the end and stay */
            gsap.fromTo(panel,
              { opacity: 0, y: 40 },
              {
                opacity: 1, y: 0, duration: 0.6, ease: 'power2.out',
                scrollTrigger: {
                  trigger: heroEl,
                  scroller,
                  start: () => `top+=${(i - 1) * window.innerHeight} top`,
                  end:   () => `top+=${i * window.innerHeight} top`,
                  scrub: 0.4,
                },
              });
          } else {
            /* middle panel: fade in, then fade out as the next arrives */
            gsap.fromTo(panel,
              { opacity: 0, y: 40 },
              {
                opacity: 1, y: 0, duration: 0.4, ease: 'power2.out',
                scrollTrigger: {
                  trigger: heroEl,
                  scroller,
                  start: () => `top+=${(i - 1) * window.innerHeight} top`,
                  end:   () => `top+=${(i - 0.5) * window.innerHeight} top`,
                  scrub: 0.4,
                },
              });
            gsap.to(panel, {
              opacity: 0, y: -40, duration: 0.4, ease: 'power2.in',
              scrollTrigger: {
                trigger: heroEl,
                scroller,
                start: () => `top+=${(i + 0.5) * window.innerHeight} top`,
                end:   () => `top+=${(i + 1) * window.innerHeight} top`,
                scrub: 0.4,
              },
            });
          }
        });

        /* 3b.  Drive the 3D camera based on hero scroll progress. */
        if (d3d.hero) {
          ST.create({
            trigger: heroEl,
            scroller,
            start: 'top top',
            end:   () => `bottom top`,
            scrub: 0.4,
            onUpdate: (self) => {
              /* self.progress is 0..1 across the full hero (5 panels);
                 multiply to get a 0..N-1 step value. */
              d3d.hero.setHeroStep(self.progress * (N - 1));
            },
          });
        }

        /* 3c.  Toggle `body.hero-out` once the user scrolls past the
           hero so the fixed 3D stage fades out and stops covering
           subsequent content. */
        ST.create({
          trigger: heroEl,
          scroller,
          start: 'top top',
          end:   'bottom top',
          onUpdate: (self) => {
            /* fade out the stage in the last 30% of the hero so the
               next section is fully visible by the time we arrive */
            if (self.progress > 0.7) {
              document.body.classList.add('hero-out');
            } else {
              document.body.classList.remove('hero-out');
            }
          },
        });
      }
    }

    /* ---------------- 4.  Moment scenes: canister + pure  -------------- */
    if (gsap && ST) {
      const scroller = lenis ? lenis.rootElement : window;
      const moments = [
        { id: 'moment-canister', setStep: d3d.canister && d3d.canister.setStep },
        { id: 'moment-pure',     setStep: d3d.pure     && d3d.pure.setStep },
      ];
      moments.forEach((m) => {
        const sec = document.getElementById(m.id);
        if (!sec || !m.setStep) return;
        ST.create({
          trigger: sec, scroller,
          start: 'top bottom', end: 'bottom top', scrub: 0.4,
          onUpdate: (self) => { m.setStep(self.progress); },
        });
        const cap = sec.querySelector('.moment__caption');
        if (cap) {
          gsap.fromTo(cap, { opacity: 0, y: 60 }, {
            opacity: 1, y: 0, ease: 'power2.out',
            scrollTrigger: {
              trigger: sec, scroller,
              start: 'top 80%', end: 'top 30%', scrub: 0.5,
            },
          });
        }
      });
    }

    /* ---------------- 5.  Section card reveal -------------------------- */
    const REVEAL = [
      '.expertise-card', '.service-card', '.product-card',
      '.product-showcase-card', '.feature-highlight', '.stat-card',
      '.coverage-point', '.faq-item', '.contact-detail',
      '.contact-form', '.products-cta', '.coverage-map-card',
      '.map-info', '.section-title', '.section-subtitle',
    ];
    const revealEls = document.querySelectorAll(REVEAL.join(','));
    if (gsap && ST && !reduceMotion) {
      revealEls.forEach((el, i) => {
        gsap.from(el, {
          opacity: 0, y: 60, z: -120, rotateX: -8,
          duration: 1.0, ease: 'power3.out',
          delay: (i % 4) * 0.06,
          scrollTrigger: {
            trigger: el,
            scroller: lenis ? lenis.rootElement : window,
            start: 'top 88%', once: true,
          },
        });
      });
    } else {
      revealEls.forEach((el) => { el.style.opacity = '1'; });
    }

    /* ---------------- 6.  Pointer tilt + glare ------------------------- */
    const TILT = [
      '.expertise-card', '.service-card', '.product-card',
      '.product-showcase-card', '.feature-highlight', '.stat-card',
      '.coverage-point',
    ];
    if (!coarse && !reduceMotion) {
      document.querySelectorAll(TILT.join(',')).forEach((el) => {
        const glare = document.createElement('span');
        glare.className = 'glare';
        el.appendChild(glare);
        el.style.transformStyle = 'preserve-3d';
        el.style.transition = 'transform 0.18s ease-out, box-shadow 0.18s ease-out';
        el.addEventListener('pointermove', (e) => {
          const r = el.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width;
          const y = (e.clientY - r.top)  / r.height;
          const rx = (0.5 - y) * 8;
          const ry = (x - 0.5) * 10;
          el.style.transform =
            `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`;
          glare.style.background =
            `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(255,255,255,0.35), transparent 55%)`;
          glare.style.opacity = '0.9';
        });
        el.addEventListener('pointerleave', () => {
          el.style.transform = 'perspective(900px) rotateX(0) rotateY(0)';
          glare.style.opacity = '0';
        });
      });
    }

    /* ---------------- 7.  Section title parallax ----------------------- */
    if (gsap && ST && !reduceMotion) {
      const scroller = lenis ? lenis.rootElement : window;
      document.querySelectorAll('.section-title').forEach((t) => {
        gsap.fromTo(t, { y: 40, opacity: 0.2 }, {
          y: -10, opacity: 1, ease: 'none',
          scrollTrigger: {
            trigger: t, scroller,
            start: 'top 95%', end: 'top 30%', scrub: 0.5,
          },
        });
      });
    }

    /* ---------------- 8.  Stats count-up ------------------------------ */
    if (gsap && ST) {
      const scroller = lenis ? lenis.rootElement : window;
      document.querySelectorAll('.stat-number').forEach((el) => {
        const target = el.textContent.trim();
        const m = target.match(/^(\d+)(.*)$/);
        if (!m) return;
        const n = parseInt(m[1], 10), suffix = m[2];
        const obj = { v: 0 };
        gsap.to(obj, {
          v: n, duration: 1.6, ease: 'power2.out',
          onUpdate: () => { el.textContent = Math.round(obj.v) + suffix; },
          scrollTrigger: {
            trigger: el, scroller,
            start: 'top 85%', once: true,
          },
        });
      });
    }

    /* ---------------- 9.  Scroll-hint fade (hero) --------------------- */
    if (gsap && ST) {
      const scroller = lenis ? lenis.rootElement : window;
      const hint = document.querySelector('.scroll-hint');
      if (hint) {
        gsap.to(hint, {
          opacity: 0, ease: 'power2.out',
          scrollTrigger: {
            trigger: '.hero', scroller,
            start: 'top top', end: 'top+=200 top', scrub: 0.4,
          },
        });
      }
    }
  }
})();
