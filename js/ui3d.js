/* =========================================================================
   DELIGHT WATER — Scroll-reveal animations (lightweight)
   -------------------------------------------------------------------------
   Vanilla CSS transitions handle most of the visual interest.  This
   file only adds: section reveal on scroll, pointer tilt on cards.
   Lenis smooth-scroll is optional and only kicks in if the browser
   supports it AND the user hasn't asked for reduced motion.
   ========================================================================= */

(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse       = window.matchMedia('(pointer: coarse)').matches;

  if (reduceMotion) return;

  /* ----------------  Lenis smooth scroll (optional)  ------------------- */
  if (window.Lenis) {
    try {
      const lenis = new window.Lenis({
        duration: 1.0,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });
      function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
      requestAnimationFrame(raf);
      /* intercept in-page anchor links */
      document.querySelectorAll('a[href^="#"]').forEach((a) => {
        a.addEventListener('click', (e) => {
          const id = a.getAttribute('href');
          if (id.length > 1) {
            const target = document.querySelector(id);
            if (target) { e.preventDefault(); lenis.scrollTo(target, { offset: -90 }); }
          }
        });
      });
    } catch (e) {
      console.warn('[ui3d] Lenis init failed:', e);
    }
  }

  /* ----------------  Pointer tilt on cards  ----------------------------- */
  if (!coarse) {
    document.querySelectorAll('.product-card, .service-card, .stat-card').forEach((el) => {
      el.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top)  / r.height;
        const rx = (0.5 - y) * 5;
        const ry = (x - 0.5) * 7;
        el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`;
      });
      el.addEventListener('pointerleave', () => {
        el.style.transform = '';
      });
    });
  }
})();
