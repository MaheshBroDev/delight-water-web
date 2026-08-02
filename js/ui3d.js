/* =========================================================================
   DELIGHT WATER — DOM 3D LAYER (CSS perspective tilt + 3D scroll reveals)
   -------------------------------------------------------------------------
   Turns the content cards into interactive 3D "divisions": they tilt in
   real space toward the pointer, with layered depth, glare sheen and a
   rising-from-depth entrance. Pure vanilla JS + CSS transforms (no WebGL),
   so it stays buttery on every device. Fully respects reduced-motion.
   ========================================================================= */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  const TILT_SELECTOR = [
    '.expertise-card', '.service-card', '.product-card',
    '.product-showcase-card', '.feature-highlight', '.stat-card', '.coverage-point'
  ].join(',');

  const REVEAL_SELECTOR = [
    '.expertise-card', '.service-card', '.product-card', '.product-showcase-card',
    '.feature-highlight', '.stat-card', '.coverage-point', '.section-title',
    '.section-subtitle', '.company-mission', '.faq-item', '.contact-detail',
    '.contact-form', '.products-cta', '.coverage-map-card'
  ].join(',');

  function init() {
    /* ---------------- 3D scroll-reveal (rise from depth) ------------------ */
    const revealEls = [...document.querySelectorAll(REVEAL_SELECTOR)];
    revealEls.forEach((el) => {
      el.classList.add('reveal-3d');
      el.style.transitionDelay = ((el.dataset.delay !== undefined) ? el.dataset.delay :
        (Math.random() * 0.12).toFixed(2)) + 's';
    });

    if (!reduceMotion && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-3d-in');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      revealEls.forEach((el) => io.observe(el));
    } else {
      revealEls.forEach((el) => el.classList.add('reveal-3d-in'));
    }

    /* ---------------- 3D pointer-tilt "divisions" ------------------------- */
    if (reduceMotion || coarse) return;          // skip on touch / reduced-motion

    const cards = [...document.querySelectorAll(TILT_SELECTOR)];
    cards.forEach((card) => {
      card.classList.add('tilt-3d');
      // glare layer
      const glare = document.createElement('span');
      glare.className = 'tilt-glare';
      card.appendChild(glare);

      const MAX = 10;                              // max degrees of tilt
      let raf = null, rect = null;

      function onMove(e) {
        rect = rect || card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        const ry = (px - 0.5) * (MAX * 2);
        const rx = -(py - 0.5) * (MAX * 2);
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          card.style.transform =
            `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(18px)`;
          glare.style.background =
            `radial-gradient(circle at ${px*100}% ${py*100}%, rgba(255,255,255,0.28), rgba(255,255,255,0) 55%)`;
          glare.style.opacity = '1';
        });
      }
      function onEnter() { rect = null; card.style.transition = 'transform .12s ease'; }
      function onLeave() {
        if (raf) cancelAnimationFrame(raf);
        card.style.transition = 'transform .5s cubic-bezier(.2,.8,.2,1)';
        card.style.transform = 'perspective(900px) rotateX(0) rotateY(0) translateZ(0)';
        glare.style.opacity = '0';
      }
      card.addEventListener('pointerenter', onEnter);
      card.addEventListener('pointermove', onMove);
      card.addEventListener('pointerleave', onLeave);
    });

    /* ---------------- subtle hero-content parallax ------------------------ */
    const heroContent = document.querySelector('.hero-content');
    const heroVisual = document.querySelector('.hero-visual');
    if (heroContent && heroVisual && !reduceMotion) {
      let rx = 0, ry = 0, cx = 0, cy = 0;
      window.addEventListener('pointermove', (e) => {
        rx = (e.clientY / window.innerHeight - 0.5);
        ry = (e.clientX / window.innerWidth - 0.5);
      }, { passive: true });
      (function tick() {
        requestAnimationFrame(tick);
        cx += (rx - cx) * 0.05; cy += (ry - cy) * 0.05;
        heroContent.style.transform = `translate3d(${cy * -10}px, ${cx * 10}px, 0)`;
      })();
    }
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else init();
})();
