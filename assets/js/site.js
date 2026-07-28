/* Delight Water Solutions — page behaviour.
 * Progressive: every feature here is additive. With JS off the document
 * is still complete, readable and navigable. */
(function () {
    'use strict';

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- Masthead dock ------------------------------------------- */
    var masthead = document.querySelector('.masthead');
    var docked = false;
    function onScrollDock() {
        var should = window.scrollY > 24;
        if (should !== docked) {
            docked = should;
            masthead.classList.toggle('docked', should);
        }
    }
    window.addEventListener('scroll', onScrollDock, { passive: true });
    onScrollDock();

    /* ---------- Mobile nav ----------------------------------------------- */
    var burger = document.getElementById('burger');
    var nav = document.getElementById('nav');
    if (burger && nav) {
        burger.addEventListener('click', function () {
            var open = burger.getAttribute('aria-expanded') === 'true';
            burger.setAttribute('aria-expanded', String(!open));
            nav.classList.toggle('open', !open);
        });
        nav.addEventListener('click', function (e) {
            if (e.target.closest('a')) {
                burger.setAttribute('aria-expanded', 'false');
                nav.classList.remove('open');
            }
        });
    }

    /* ---------- Active section in nav ------------------------------------ */
    var links = Array.prototype.slice.call(document.querySelectorAll('.nav a[href^="#"]'));
    var targets = links
        .map(function (a) {
            var el = document.querySelector(a.getAttribute('href'));
            return el ? { a: a, el: el } : null;
        })
        .filter(Boolean);

    if (targets.length && 'IntersectionObserver' in window) {
        var spy = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    links.forEach(function (l) { l.classList.remove('active'); });
                    var hit = targets.filter(function (t) { return t.el === entry.target; })[0];
                    if (hit) hit.a.classList.add('active');
                });
            },
            { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
        );
        targets.forEach(function (t) { spy.observe(t.el); });
    }

    /* ---------- Reveal choreography --------------------------------------
     * IntersectionObserver alone is not sufficient: an instant jump (anchor
     * link, restored scroll position, fast flick) can carry an element from
     * below the viewport to above it between two frames, so its intersection
     * state never changes and it stays invisible forever. A rAF-throttled
     * sweep over the *pending* set is the backstop; the set shrinks to empty,
     * so the cost goes to zero. */
    var pending = [].slice.call(document.querySelectorAll('[data-reveal]'));

    if (!('IntersectionObserver' in window) || reduced) {
        pending.forEach(function (el) { el.classList.add('in'); });
        pending = [];
    } else {
        var show = function (el) {
            el.classList.add('in');
            var i = pending.indexOf(el);
            if (i > -1) pending.splice(i, 1);
        };

        var ro = new IntersectionObserver(
            function (entries, obs) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    show(entry.target);
                    obs.unobserve(entry.target);
                });
            },
            { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
        );
        pending.forEach(function (el) { ro.observe(el); });

        var sweeping = false;
        var sweep = function () {
            if (sweeping || !pending.length) return;
            sweeping = true;
            requestAnimationFrame(function () {
                sweeping = false;
                var h = window.innerHeight;
                pending.slice().forEach(function (el) {
                    var r = el.getBoundingClientRect();
                    // Anything at or above the fold has been "arrived at".
                    if (r.top < h * 0.92) {
                        ro.unobserve(el);
                        show(el);
                    }
                });
            });
        };
        window.addEventListener('scroll', sweep, { passive: true });
        window.addEventListener('resize', sweep, { passive: true });
        sweep();
    }

    /* ---------- Metric count-up ------------------------------------------ */
    var metrics = document.querySelectorAll('[data-count]');
    if (metrics.length && 'IntersectionObserver' in window) {
        var mo = new IntersectionObserver(
            function (entries, obs) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    var el = entry.target;
                    obs.unobserve(el);
                    var target = parseFloat(el.dataset.count);
                    var suffix = el.dataset.suffix || '';
                    if (reduced) { el.textContent = target + suffix; return; }
                    var start = performance.now();
                    var dur = 1500;
                    var done = false;

                    var settle = function () {
                        if (done) return;
                        done = true;
                        el.textContent = target + suffix;
                    };

                    // Backstop: rAF is throttled or suspended in background
                    // tabs (and during headless capture). Without this the
                    // number freezes mid-count and never reaches its value.
                    var guard = setTimeout(settle, dur + 400);

                    (function tick(now) {
                        if (done) return;
                        var p = Math.min((now - start) / dur, 1);
                        if (p === 1) {
                            clearTimeout(guard);
                            settle();
                            return;
                        }
                        // easeOutExpo — arrives decisively, settles softly.
                        el.textContent = Math.round(target * (1 - Math.pow(2, -10 * p))) + suffix;
                        requestAnimationFrame(tick);
                    })(start);
                });
            },
            { threshold: 0.5 }
        );
        metrics.forEach(function (m) { mo.observe(m); });
    }

    /* ---------- FAQ accordion (height-animated, a11y-correct) ------------ */
    var qas = document.querySelectorAll('.qa');
    Array.prototype.forEach.call(qas, function (qa) {
        var btn = qa.querySelector('.qa-q');
        var panel = qa.querySelector('.qa-a');
        if (!btn || !panel) return;

        btn.addEventListener('click', function () {
            var open = btn.getAttribute('aria-expanded') === 'true';

            Array.prototype.forEach.call(qas, function (other) {
                var b = other.querySelector('.qa-q');
                var p = other.querySelector('.qa-a');
                if (!b || !p || other === qa) return;
                b.setAttribute('aria-expanded', 'false');
                p.style.height = '0px';
            });

            if (open) {
                btn.setAttribute('aria-expanded', 'false');
                panel.style.height = '0px';
            } else {
                btn.setAttribute('aria-expanded', 'true');
                panel.style.height = panel.scrollHeight + 'px';
            }
        });

        panel.style.height = '0px';
    });

    // Keep an open panel correct when the viewport reflows.
    window.addEventListener('resize', function () {
        Array.prototype.forEach.call(qas, function (qa) {
            var btn = qa.querySelector('.qa-q');
            var panel = qa.querySelector('.qa-a');
            if (btn && panel && btn.getAttribute('aria-expanded') === 'true') {
                panel.style.height = panel.scrollHeight + 'px';
            }
        });
    }, { passive: true });

    /* ---------- Card tilt: the 3D language extends into the DOM ---------- */
    if (!reduced && window.matchMedia('(hover: hover)').matches) {
        Array.prototype.forEach.call(document.querySelectorAll('.unit'), function (card) {
            var raf = null;
            card.addEventListener('pointermove', function (e) {
                if (raf) return;
                raf = requestAnimationFrame(function () {
                    raf = null;
                    var r = card.getBoundingClientRect();
                    var px = (e.clientX - r.left) / r.width - 0.5;
                    var py = (e.clientY - r.top) / r.height - 0.5;
                    card.style.setProperty('--ry', (px * 7).toFixed(2) + 'deg');
                    card.style.setProperty('--rx', (-py * 7).toFixed(2) + 'deg');
                    card.style.setProperty('--ty', '-5px');
                });
            });
            card.addEventListener('pointerleave', function () {
                card.style.setProperty('--ry', '0deg');
                card.style.setProperty('--rx', '0deg');
                card.style.setProperty('--ty', '0px');
            });
        });
    }

    /* ---------- Contact form --------------------------------------------- */
    var form = document.getElementById('contactForm');
    var status = document.getElementById('formStatus');
    if (form && status) {
        var btn = form.querySelector('button[type="submit"]');
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var label = btn ? btn.querySelector('.btn-label') : null;
            var original = label ? label.textContent : '';
            if (btn) btn.disabled = true;
            if (label) label.textContent = 'Sending…';
            status.textContent = '';
            status.style.color = '';

            fetch(form.action, {
                method: form.method,
                body: new FormData(form),
                headers: { Accept: 'application/json' }
            })
                .then(function (res) {
                    if (res.ok) {
                        status.style.color = 'var(--permeate)';
                        status.textContent = '✓ Received — we will be in touch shortly.';
                        form.reset();
                    } else {
                        status.style.color = '#ff8a8a';
                        status.textContent = '⚠ Submission failed. Please call +94 77 266 6829.';
                    }
                })
                .catch(function () {
                    status.style.color = '#ff8a8a';
                    status.textContent = '⚠ Network error. Please check your connection.';
                })
                .then(function () {
                    if (btn) btn.disabled = false;
                    if (label) label.textContent = original;
                });
        });
    }

    /* ---------- Boot the WebGL stage ------------------------------------- */
    var canvas = document.getElementById('stage');
    var readout = document.getElementById('readout-tier');

    function labelFor(tier) {
        return { 1: 'ADAPTIVE', 2: 'STANDARD', 3: 'FULL' }[tier] || 'CSS';
    }

    if (canvas && 'IntersectionObserver' in window) {
        // Deferred: never contend with LCP. Idle if available, else a beat
        // after load, so first paint is always the content.
        var start = function () {
            import('./stage.js')
                .then(function (mod) {
                    var stage = mod.boot(canvas);
                    if (!stage) return;
                    document.documentElement.classList.add('stage-ready');
                    if (readout) readout.textContent = labelFor(stage.caps.tier);
                    window.__stage = stage; // QA handle
                })
                .catch(function () {
                    /* CSS fallback remains visible — nothing to do. */
                });
        };

        if ('requestIdleCallback' in window) {
            requestIdleCallback(start, { timeout: 2200 });
        } else {
            setTimeout(start, 900);
        }
    }
})();
