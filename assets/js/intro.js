/* =====================================================================
   Global Shapers Pittsburgh — opening sequence

   A short branded curtain over the hero: the mark fades up, the wordmark
   rises line by line, a gold bar fills, then the curtain lifts and the hero
   content staggers in.

   Loaded synchronously in <head> (after site.css) so the curtain is on
   screen before the hero ever paints — a deferred script would flash the
   page first. It is ~2KB and same-origin, so the blocking cost is trivial.

   Three rules keep it from becoming an obstacle:
     - it plays once per browser session, not on every navigation;
     - it is skipped entirely when the visitor prefers reduced motion;
     - it removes itself on a hard timeout, so a slow or broken page can
       never leave the site hidden behind it.
   ===================================================================== */
(function (window, document) {
  'use strict';

  var KEY = 'gs_intro_played';
  var MIN_MS = 1900;    // let the animation read
  var MAX_MS = 3200;    // hard ceiling, even if the page is still loading
  var html = document.documentElement;

  function skip() { html.classList.add('intro-skip'); }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { skip(); return; }

  var seen = false;
  try { seen = sessionStorage.getItem(KEY) === '1'; } catch (e) {}
  if (seen) { skip(); return; }

  var curtain = document.createElement('div');
  curtain.className = 'intro';
  curtain.id = 'gs-intro';
  curtain.setAttribute('role', 'presentation');
  curtain.setAttribute('aria-hidden', 'true');
  curtain.innerHTML =
    '<div class="intro-inner">' +
      '<img class="intro-mark" src="assets/global-shapers-pittsburgh-logo.png" alt="" width="315" height="84">' +
      '<span class="intro-line"><span>GLOBAL SHAPERS</span></span>' +
      '<span class="intro-line"><span class="accent">PITTSBURGH</span></span>' +
      '<div class="intro-tag">Shaping Pittsburgh\'s future</div>' +
      '<div class="intro-bar"><i></i></div>' +
    '</div>';

  // The <body> may not exist yet at this point in <head>, so attach to the
  // root element — valid, and it means the curtain paints immediately.
  (document.body || html).appendChild(curtain);
  html.classList.add('intro-lock');

  var started = Date.now();
  var finished = false;

  function finish() {
    if (finished) return;
    finished = true;
    try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
    curtain.classList.add('done');
    html.classList.remove('intro-lock');
    html.classList.add('intro-played');
    window.setTimeout(function () {
      if (curtain.parentNode) curtain.parentNode.removeChild(curtain);
    }, 600);
  }

  function finishWhenReady() {
    var wait = Math.max(0, MIN_MS - (Date.now() - started));
    window.setTimeout(finish, wait);
  }

  if (document.readyState === 'complete') finishWhenReady();
  else window.addEventListener('load', finishWhenReady);

  // Failsafe: never hold the page for longer than MAX_MS, whatever happens.
  window.setTimeout(finish, MAX_MS);

  // Let people out early.
  curtain.addEventListener('click', finish);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish();
  });
})(window, document);
