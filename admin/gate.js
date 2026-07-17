/* Simple client-side password gate for the admin pages.
   Note: this is casual gating only — the real edit auth is the GitHub token.
   Anyone determined can read this file; treat it as a "keep the door shut"
   layer, not a security control. */
(function () {
  var KEY = 'gs_admin_ok';
  var PASSWORD = 'Coutinho10';
  try {
    if (sessionStorage.getItem(KEY) === '1' || localStorage.getItem(KEY) === '1') return;
  } catch (e) {}
  // Hide the page until we approve.
  var style = document.createElement('style');
  style.id = 'gs-gate-hide';
  style.textContent = 'body>*:not(#gs-gate){display:none!important;}body{background:#0B1F5B!important;}';
  document.documentElement.appendChild(style);
  function build() {
    if (document.getElementById('gs-gate')) return;
    var overlay = document.createElement('div');
    overlay.id = 'gs-gate';
    overlay.setAttribute('style', [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'background:#0B1F5B', 'color:#fff',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'padding:24px'
    ].join(';'));
    overlay.innerHTML =
      '<form id="gs-gate-form" style="width:100%;max-width:340px;text-align:center;">' +
        '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:1.8rem;letter-spacing:0.06em;margin-bottom:6px;">ADMIN ACCESS</div>' +
        '<div style="font-size:0.78rem;letter-spacing:0.14em;text-transform:uppercase;color:#FFCB05;margin-bottom:22px;">Global Shapers Pittsburgh</div>' +
        '<input id="gs-gate-pw" type="password" autocomplete="current-password" autofocus placeholder="Password" ' +
          'style="width:100%;padding:14px 16px;font-size:1rem;background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.35);outline:none;margin-bottom:12px;">' +
        '<label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;color:rgba(255,255,255,0.75);margin-bottom:16px;justify-content:center;">' +
          '<input id="gs-gate-remember" type="checkbox"> Remember on this device' +
        '</label>' +
        '<button type="submit" style="width:100%;padding:13px 16px;background:#FFCB05;color:#0B1F5B;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;border:none;cursor:pointer;font-size:0.85rem;">Enter</button>' +
        '<div id="gs-gate-err" style="margin-top:12px;color:#ff9d9d;font-size:0.8rem;min-height:1em;"></div>' +
      '</form>';
    document.body.appendChild(overlay);
    var form = document.getElementById('gs-gate-form');
    var pw = document.getElementById('gs-gate-pw');
    var remember = document.getElementById('gs-gate-remember');
    var err = document.getElementById('gs-gate-err');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (pw.value === PASSWORD) {
        try {
          sessionStorage.setItem(KEY, '1');
          if (remember.checked) localStorage.setItem(KEY, '1');
        } catch (ex) {}
        var s = document.getElementById('gs-gate-hide'); if (s) s.remove();
        overlay.remove();
      } else {
        err.textContent = 'Incorrect password.';
        pw.select();
      }
    });
    pw.focus();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
