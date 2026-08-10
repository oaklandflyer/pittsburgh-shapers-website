/* =====================================================================
   Global Shapers Pittsburgh — shared front-end behaviour
   Loaded by index.html and shapers.html.

   Everything here is deliberately cheap: one IntersectionObserver for
   reveals, one for scroll-spy, and a single rAF-throttled scroll handler.
   Nothing polls, nothing runs a timer while the tab is hidden.
   ===================================================================== */
(function (window, document) {
  'use strict';

  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- tiny helpers ---------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // http(s) links open in a new tab; in-page/relative ones don't.
  function extAttrs(href) {
    return /^https?:/i.test(href || '') ? ' target="_blank" rel="noopener noreferrer"' : '';
  }

  /* Run `fn` the first time `el` scrolls near the viewport, then forget it.
     Used to defer building the hub map and the globe — the two most
     expensive things on the site — until someone can actually see them. */
  function whenVisible(el, fn, margin) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) { io.disconnect(); fn(); return; }
      }
    }, { rootMargin: margin || '250px' });
    io.observe(el);
  }

  /* Calls onChange(visible) whenever `el` enters/leaves the viewport, and
     also when the tab is backgrounded. Animations use this to stop
     burning frames on something nobody is looking at. */
  function visibilityGate(el, onChange) {
    var inView = true, tabVisible = !document.hidden;
    function push() { onChange(inView && tabVisible); }
    if ('IntersectionObserver' in window && el) {
      var io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        push();
      }, { rootMargin: '80px' });
      io.observe(el);
    }
    document.addEventListener('visibilitychange', function () {
      tabVisible = !document.hidden;
      push();
    });
    push();
    return { destroy: function () { if (io) io.disconnect(); } };
  }

  /* ---------- navigation ---------- */

  function initNav() {
    var nav = document.querySelector('nav.site-nav');
    var toggle = document.querySelector('.nav-toggle');
    var links = document.getElementById('nav-links');

    if (toggle && links) {
      var setOpen = function (open) {
        links.classList.toggle('open', open);
        if (nav) nav.classList.toggle('menu-open', open);   // solid bar behind the panel
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
      toggle.addEventListener('click', function () {
        setOpen(!links.classList.contains('open'));
      });
      links.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () { setOpen(false); });
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && links.classList.contains('open')) {
          setOpen(false);
          toggle.focus();
        }
      });
    }

    var bar = document.querySelector('.scroll-progress');
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        var y = window.pageYOffset || document.documentElement.scrollTop;
        if (nav) nav.classList.toggle('scrolled', y > 12);
        if (bar) {
          var max = document.documentElement.scrollHeight - window.innerHeight;
          bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
        }
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* Highlights the nav link for whichever section is currently on screen. */
  function initScrollSpy() {
    if (!('IntersectionObserver' in window)) return true;
    var map = {};
    var sections = [];
    document.querySelectorAll('.nav-links a[href^="#"]').forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      var sec = id && document.getElementById(id);
      if (!sec) return;
      map[id] = a;
      sections.push(sec);
    });
    if (!sections.length) return false;

    var visible = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
      var current = null;
      for (var i = 0; i < sections.length; i++) {
        if (visible[sections[i].id]) { current = sections[i].id; break; }
      }
      for (var id in map) map[id].classList.toggle('active', id === current);
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { io.observe(s); });
    return true;
  }

  /* ---------- scroll reveal ---------- */

  function initReveal() {
    document.documentElement.classList.add('js-ready');
    var els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        var delay = parseInt(el.getAttribute('data-reveal-delay') || '0', 10);
        if (delay) el.style.transitionDelay = delay + 'ms';
        el.classList.add('is-in');
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    els.forEach(function (el) { if (!el.classList.contains('is-in')) io.observe(el); });
  }

  /* ---------- count-up numbers ----------
     Markup: <span class="stat-num" data-count="10000" data-suffix="+">10,000+</span>
     The final text is already in the HTML, so no-JS visitors see the real
     number; we only replace it while the animation runs. */
  function initCounters() {
    var els = document.querySelectorAll('[data-count]');
    if (!els.length) return;
    if (reduceMotion || !('IntersectionObserver' in window)) return;

    function fmt(n, decimals) {
      return decimals
        ? n.toFixed(decimals)
        : Math.round(n).toLocaleString('en-US');
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        io.unobserve(el);
        el.setAttribute('data-counted', '1');
        var target = parseFloat(el.getAttribute('data-count'));
        if (!isFinite(target)) return;
        var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
        var prefix = el.getAttribute('data-prefix') || '';
        var suffix = el.getAttribute('data-suffix') || '';
        var dur = 1100, start = 0;
        function step(ts) {
          if (!start) start = ts;
          var t = Math.min(1, (ts - start) / dur);
          var eased = 1 - Math.pow(1 - t, 3);
          el.textContent = prefix + fmt(target * eased, decimals) + suffix;
          if (t < 1) window.requestAnimationFrame(step);
        }
        window.requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    els.forEach(function (el) { if (!el.hasAttribute('data-counted')) io.observe(el); });
  }

  /* ---------- boot ---------- */

  /* boot() is safe to call more than once. The members page calls it again
     after sign-in, when its sections finally exist in a visible tree — the
     one-shot pieces are guarded so nothing gets wired twice. */
  var booted = { nav: false, spy: false };
  function boot() {
    if (!booted.nav) { initNav(); booted.nav = true; }
    if (!booted.spy) { booted.spy = !!initScrollSpy(); }
    initReveal();
    initCounters();
  }

  window.GS = {
    esc: esc,
    extAttrs: extAttrs,
    whenVisible: whenVisible,
    visibilityGate: visibilityGate,
    reduceMotion: reduceMotion,
    boot: boot
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);
