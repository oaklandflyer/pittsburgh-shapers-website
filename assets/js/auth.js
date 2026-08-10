/* =====================================================================
   Global Shapers Pittsburgh — members-area login (first-party, no SDKs)

   The site is static hosting with no backend, so sign-in is verified in the
   browser with the platform's own WebCrypto:

     data/members.json holds, per member, a random 16-byte salt and the
     PBKDF2-SHA256 (210k iterations) hash of their password. Signing in
     re-derives the hash from what was typed and compares it in constant
     time. No plaintext password is ever stored, sent, or logged, and no
     third-party identity provider, script, or API is involved.

   What this is NOT: server-side authentication. Anyone can download
   members.json and attack the hashes offline, so this protects "members
   only, please" content — meeting notes, working links — not secrets.
   PBKDF2 at 210k iterations makes that attack slow and per-user, which is
   the most a static site can honestly offer. See SECURITY-NOTES.md.
   ===================================================================== */
(function (window, document) {
  'use strict';

  var STORE_KEY = 'gs_members_session';
  var SESSION_DAYS = 30;          // "keep me signed in" lifetime

  /* Work out the site root from this script's own URL, so the same file
     works from /shapers.html and from /admin/*.html without either page
     having to know how deep it is. */
  var SITE_ROOT = (function () {
    var s = document.currentScript;
    if (s && s.src) {
      var i = s.src.indexOf('assets/js/auth.js');
      if (i > -1) return s.src.slice(0, i);
    }
    return '';
  })();
  var MEMBERS_URL = SITE_ROOT + 'data/members.json';

  var subtle = window.crypto && window.crypto.subtle;

  function toHex(buf) {
    var bytes = new Uint8Array(buf), out = '';
    for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
    return out;
  }

  function fromHex(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }

  /* Comparison that doesn't leak how many leading characters matched. */
  function constantTimeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  function derive(password, saltHex, iterations) {
    if (!subtle) return Promise.reject(new Error('insecure-context'));
    return subtle.importKey(
      'raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
    ).then(function (key) {
      return subtle.deriveBits({
        name: 'PBKDF2',
        salt: fromHex(saltHex),
        iterations: iterations,
        hash: 'SHA-256'
      }, key, 256);
    }).then(toHex);
  }

  var membersPromise = null;
  function loadMembers() {
    if (!membersPromise) {
      membersPromise = fetch(MEMBERS_URL, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data || !Array.isArray(data.users)) return { iterations: 210000, users: [] };
          return data;
        })
        .catch(function () { return null; });
    }
    return membersPromise;
  }

  /* Resolves with the member record on success, or null on a bad
     username/password. Rejects only when the browser can't do the work
     (e.g. page served over plain http, where WebCrypto is unavailable). */
  function verify(username, password) {
    var u = String(username || '').trim().toLowerCase();
    if (!u || !password) return Promise.resolve(null);
    return loadMembers().then(function (data) {
      if (!data) throw new Error('no-directory');
      var rec = null;
      for (var i = 0; i < data.users.length; i++) {
        if (String(data.users[i].u).toLowerCase() === u) { rec = data.users[i]; break; }
      }
      // Unknown usernames still run a derivation so a wrong username and a
      // wrong password take about the same time.
      var target = rec || {
        salt: '00000000000000000000000000000000',
        iter: data.iterations || 210000,
        hash: ''
      };
      return derive(password, target.salt, target.iter || data.iterations || 210000)
        .then(function (hex) {
          if (rec && constantTimeEqual(hex, rec.hash)) {
            return {
              user: rec.u,
              name: rec.name || rec.u,
              role: rec.role || '',
              // 'admin' accounts land on the admin tools and may open /admin/*.
              kind: rec.kind === 'admin' ? 'admin' : 'member'
            };
          }
          return null;
        });
    });
  }

  function readSession() {
    var raw = null;
    try { raw = sessionStorage.getItem(STORE_KEY) || localStorage.getItem(STORE_KEY); }
    catch (e) { return null; }
    if (!raw) return null;
    try {
      var s = JSON.parse(raw);
      if (!s || !s.user) return null;
      if (s.exp && Date.now() > s.exp) { signOut(); return null; }
      return s;
    } catch (e) { return null; }
  }

  function signIn(member, remember) {
    var session = {
      user: member.user,
      name: member.name,
      role: member.role,
      kind: member.kind === 'admin' ? 'admin' : 'member',
      at: Date.now(),
      exp: remember ? Date.now() + SESSION_DAYS * 864e5 : null
    };
    var raw = JSON.stringify(session);
    try {
      sessionStorage.setItem(STORE_KEY, raw);
      if (remember) localStorage.setItem(STORE_KEY, raw);
      else localStorage.removeItem(STORE_KEY);
    } catch (e) {}
    return session;
  }

  function signOut() {
    try {
      sessionStorage.removeItem(STORE_KEY);
      localStorage.removeItem(STORE_KEY);
      // Clear the passcode flag the old shared-passcode gate used, so an
      // upgraded browser doesn't stay "unlocked" from the previous scheme.
      localStorage.removeItem('gs_shapers_unlocked');
      sessionStorage.removeItem('gs_shapers_unlocked');
    } catch (e) {}
  }

  function isAdmin(session) {
    var s = session || readSession();
    return !!(s && s.kind === 'admin');
  }

  /* Where a given account belongs after signing in: admins go to the admin
     tools, everyone else to the members area. */
  function homeFor(session) {
    return SITE_ROOT + (isAdmin(session) ? 'admin/index.html' : 'shapers.html');
  }

  window.GSAuth = {
    verify: verify,
    session: readSession,
    signIn: signIn,
    signOut: signOut,
    isAdmin: isAdmin,
    homeFor: homeFor,
    siteRoot: SITE_ROOT,
    available: !!subtle
  };
})(window, document);
