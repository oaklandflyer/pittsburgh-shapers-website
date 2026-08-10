/* Access gate for the admin pages.

   These pages now share the site's member login instead of carrying their own
   password: sign in at /shapers.html with an account whose kind is "admin"
   (see tools/make-member.py --kind admin) and the session unlocks /admin/*.

   As with the members area, this is client-side gating on static hosting — the
   real write authority is the GitHub token you paste into the manager. Treat
   this as "keep the door shut", not as a security control. See
   SECURITY-NOTES.md. */
(function () {
  'use strict';

  var LOGIN_URL = '../shapers.html?next=admin';

  // Hide the page until we know who this is.
  var style = document.createElement('style');
  style.id = 'gs-gate-hide';
  style.textContent = 'body>*:not(#gs-gate){display:none!important;}body{background:#0B1F5B!important;}';
  document.documentElement.appendChild(style);

  function unlock() {
    var s = document.getElementById('gs-gate-hide');
    if (s) s.remove();
    var o = document.getElementById('gs-gate');
    if (o) o.remove();
  }

  function whenBody(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function blocked(title, message, actionLabel, actionHref) {
    whenBody(function () { renderBlocked(title, message, actionLabel, actionHref); });
  }

  function renderBlocked(title, message, actionLabel, actionHref) {
    if (document.getElementById('gs-gate')) return;
    var overlay = document.createElement('div');
    overlay.id = 'gs-gate';
    overlay.setAttribute('style', [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'background:#0B1F5B', 'color:#fff',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'padding:24px', 'text-align:center'
    ].join(';'));
    overlay.innerHTML =
      '<div style="max-width:380px;">' +
        '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:1.9rem;letter-spacing:0.06em;margin-bottom:8px;">' + title + '</div>' +
        '<div style="font-size:0.78rem;letter-spacing:0.14em;text-transform:uppercase;color:#FFCB05;margin-bottom:20px;">Global Shapers Pittsburgh</div>' +
        '<p style="font-size:0.95rem;line-height:1.6;color:rgba(255,255,255,0.8);margin-bottom:24px;">' + message + '</p>' +
        '<a href="' + actionHref + '" style="display:inline-block;padding:13px 26px;background:#FFCB05;color:#0B1F5B;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;font-size:0.8rem;text-decoration:none;border-radius:999px;">' + actionLabel + '</a>' +
      '</div>';
    document.body.appendChild(overlay);
  }

  function check() {
    if (!window.GSAuth) {
      blocked('ADMIN ACCESS', 'The sign-in module could not load. Reload the page, or sign in from the members area.', 'Go to sign-in', LOGIN_URL);
      return;
    }
    var session = window.GSAuth.session();
    if (!session) {
      blocked('ADMIN ACCESS', 'Sign in with an admin account to open the hub managers.', 'Sign in', LOGIN_URL);
      return;
    }
    if (!window.GSAuth.isAdmin(session)) {
      blocked('ADMINS ONLY',
        'You are signed in as ' + (session.name || session.user) + ', which is a member account. Ask a curator for admin access.',
        'Back to the members area', '../shapers.html');
      return;
    }
    unlock();
  }

  // auth.js is loaded by this script so each admin page only needs gate.js.
  var s = document.createElement('script');
  s.src = '../assets/js/auth.js';
  s.onload = check;
  s.onerror = function () {
    blocked('ADMIN ACCESS', 'The sign-in module could not load. Check your connection and reload.', 'Go to sign-in', LOGIN_URL);
  };
  (document.head || document.documentElement).appendChild(s);
})();
