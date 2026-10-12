/* CulturePGH shared script.
 *
 * Every CulturePGH page loads this file. The page says which one it is with
 * <body data-page="home|directory|profile|dinners|partners">, and the matching
 * init function below fills in the data-driven parts.
 *
 * Data lives in two JSON files next to this script:
 *   restaurants.json  the guide (see README.md for every field)
 *   dinners.json      occasional sit-down dinners
 *
 * The render* functions are pure: they take data and return HTML strings and
 * never touch the DOM. That keeps the door open to generating static pages
 * per restaurant later (for SEO and link previews) by running the same
 * functions in Node. To switch, change profileUrl() and add the generator.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  var FORM_INBOX = 'hello@pittsburghshapers.org';

  // Folder this script lives in (culturepgh/), and the site root above it.
  // Resolving from the script means pages at any depth find the data.
  var BASE = new URL('./', document.currentScript.src);
  var SITE_ROOT = new URL('../', BASE);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Empty strings, null, and "TODO: ..." placeholders all count as missing,
  // so a half-filled entry renders its fallbacks instead of placeholder text.
  function blank(v) {
    return v == null || (typeof v === 'string' && (!v.trim() || /^\s*TODO\b/i.test(v)));
  }
  function val(v) { return blank(v) ? '' : String(v).trim(); }

  function initials(name) {
    return val(name).split(/\s+/).filter(Boolean).slice(0, 2)
      .map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
  }

  // Image paths in the JSON are relative to the site root (e.g.
  // "assets/culturepgh/tramas/hero.jpg"). Full https:// URLs also work.
  function assetUrl(p) {
    p = val(p);
    if (!p) return '';
    if (/^https?:\/\//i.test(p)) return p;
    return new URL(p.replace(/^\/+/, ''), SITE_ROOT).href;
  }

  // Only http(s) links from the data file are rendered.
  function safeUrl(u) {
    u = val(u);
    return /^https?:\/\//i.test(u) ? u : '';
  }

  function instagramUrl(handle) {
    handle = val(handle).replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/.*$/, '');
    return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? 'https://www.instagram.com/' + handle + '/' : '';
  }

  function directionsUrl(r) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(val(r.name) + ', ' + val(r.address));
  }

  // The one place profile URLs are built. For static pages later, return
  // BASE.href + 'restaurant/' + slug + '/' instead.
  function profileUrl(slug) {
    return BASE.href + 'restaurant/?slug=' + encodeURIComponent(slug);
  }

  function hasCoords(r) { return typeof r.lat === 'number' && typeof r.lng === 'number'; }
  function isFeatured(r) { return r.status === 'featured'; }

  function byFeaturedThenName(a, b) {
    if (isFeatured(a) !== isFeatured(b)) return isFeatured(a) ? -1 : 1;
    return a.name.localeCompare(b.name);
  }

  function getJSON(file) {
    return fetch(BASE.href + file).then(function (r) {
      if (!r.ok) throw new Error(file + ': HTTP ' + r.status);
      return r.json();
    });
  }

  var guidePromise;
  function loadGuide() {
    if (!guidePromise) {
      guidePromise = getJSON('restaurants.json').then(function (d) {
        var list = ((d && d.restaurants) || []).filter(function (r) { return r && val(r.slug) && val(r.name); });
        return { restaurants: list, cuisineGroups: d.cuisineGroups || [], types: d.types || {} };
      });
    }
    return guidePromise;
  }
  function loadDinners() {
    return getJSON('dinners.json').then(function (d) { return (d && d.dinners) || []; });
  }

  function typeLabel(guide, t) { return (guide.types && guide.types[t]) || val(t); }

  // ---------------------------------------------------------------------------
  // Renderers (pure: data in, HTML string out)
  // ---------------------------------------------------------------------------

  function renderBadge(r) {
    return isFeatured(r)
      ? '<span class="badge partner">Featured partner</span>'
      : '<span class="badge">On our radar</span>';
  }

  function renderMeta(r, guide, withType) {
    var bits = [val(r.cuisine), withType ? typeLabel(guide, r.type) : '', val(r.neighborhood)].filter(Boolean);
    return bits.map(esc).join('<span class="dot" aria-hidden="true">·</span>');
  }

  function renderCard(r, guide, headingLevel) {
    var h = headingLevel || 3;
    var hero = r.heroImage && assetUrl(r.heroImage.src);
    var media = hero
      ? '<img class="r-img" src="' + esc(hero) + '" alt="' + esc(val(r.heroImage.alt) || ('Food at ' + r.name)) + '" width="600" height="400" loading="lazy" decoding="async">'
      : '<div class="r-ph" aria-hidden="true">' + esc(initials(r.name)) + '</div>';
    var meta = renderMeta(r, guide, true);
    return '<article class="r-card' + (isFeatured(r) ? ' featured' : '') + '">' + media +
      '<div class="r-body">' + renderBadge(r) +
      '<h' + h + '><a href="' + esc(profileUrl(r.slug)) + '">' + esc(r.name) + '</a></h' + h + '>' +
      (meta ? '<div class="r-meta">' + meta + '</div>' : '') +
      (val(r.blurb) ? '<p>' + esc(val(r.blurb)) + '</p>' : '') +
      '</div></article>';
  }

  function renderCards(list, guide, headingLevel) {
    return '<ul class="r-grid" role="list">' + list.map(function (r) {
      return '<li>' + renderCard(r, guide, headingLevel) + '</li>';
    }).join('') + '</ul>';
  }

  function paragraphs(text) {
    return val(text).split(/\n\s*\n/).map(function (p) { return '<p>' + esc(p.trim()) + '</p>'; }).join('');
  }

  function renderProfile(r, guide) {
    var name = r.name;
    var owner = r.owner || {};
    var ownerName = val(owner.name);
    var hero = r.heroImage && assetUrl(r.heroImage.src);
    var gallery = (r.gallery || []).filter(function (g) { return g && assetUrl(g.src); });
    var meta = renderMeta(r, guide, false);
    var out = [];

    out.push('<div class="p-hero">' + (hero
      ? '<img src="' + esc(hero) + '" alt="' + esc(val(r.heroImage.alt) || ('Food at ' + name)) + '" width="1600" height="700" fetchpriority="high" decoding="async">'
      : '<div class="p-hero-fallback" aria-hidden="true"></div>') + '</div>');

    out.push('<div class="wrap"><div class="p-title">' + renderBadge(r) +
      '<h1>' + esc(name) + '</h1>' +
      (meta ? '<div class="r-meta">' + meta + '</div>' : '') +
      (val(r.blurb) ? '<p class="blurb">' + esc(val(r.blurb)) + '</p>' : '') +
      '</div>');

    out.push('<div class="p-layout"><div>');

    if (ownerName) {
      var head = assetUrl(owner.headshot);
      out.push('<section class="p-section" aria-labelledby="owner-h"><h2 id="owner-h">Meet the owner</h2><div class="owner">' +
        (head
          ? '<img src="' + esc(head) + '" alt="Portrait of ' + esc(ownerName) + '" width="240" height="240" loading="lazy" decoding="async">'
          : '<div class="initials" aria-hidden="true">' + esc(initials(ownerName)) + '</div>') +
        '<div><h3>' + esc(ownerName) + '</h3><div class="role">Owner</div>' +
        (val(owner.bio) ? paragraphs(owner.bio) : '<p class="muted">We\'re still writing up ' + esc(ownerName) + '\'s story. Check back soon.</p>') +
        '</div></div></section>');
    }

    if (val(r.story)) {
      out.push('<section class="p-section" aria-labelledby="story-h"><h2 id="story-h">The story</h2>' + paragraphs(r.story) + '</section>');
    } else if (isFeatured(r) && !ownerName) {
      out.push('<section class="p-section" aria-labelledby="story-h"><h2 id="story-h">The story</h2><p class="muted">The full story is coming soon.</p></section>');
    }

    if (gallery.length) {
      out.push('<section class="p-section" aria-labelledby="gallery-h"><h2 id="gallery-h">From the kitchen</h2><ul class="gallery" role="list">' +
        gallery.map(function (g, i) {
          var src = assetUrl(g.src);
          var alt = val(g.alt) || ('Food at ' + name + ', photo ' + (i + 1));
          return '<li><a href="' + esc(src) + '" target="_blank" rel="noopener"><img src="' + esc(src) + '" alt="' + esc(alt) +
            '" width="400" height="300" loading="lazy" decoding="async"></a></li>';
        }).join('') + '</ul></section>');
    } else if (isFeatured(r)) {
      out.push('<section class="p-section" aria-labelledby="gallery-h"><h2 id="gallery-h">From the kitchen</h2><p class="muted">Photos coming soon.</p></section>');
    }

    if (!isFeatured(r)) {
      out.push('<section class="p-section" aria-labelledby="about-h"><h2 id="about-h">About this listing</h2>' +
        '<p>' + esc(name) + ' is on our radar: a place we like or that someone recommended to us. ' +
        'We haven\'t visited to write it up yet, and this listing doesn\'t mean the business has partnered with CulturePGH.</p></section>');
    }

    out.push('</div>');

    // Details sidebar
    var rows = [];
    if (val(r.cuisine)) rows.push(['Cuisine', esc(val(r.cuisine))]);
    if (val(r.type)) rows.push(['Type', esc(typeLabel(guide, r.type))]);
    if (val(r.neighborhood)) rows.push(['Neighborhood', esc(val(r.neighborhood))]);
    if (val(r.address)) rows.push(['Address', esc(val(r.address)) +
      '<br><a href="' + esc(directionsUrl(r)) + '" target="_blank" rel="noopener">Get directions<span class="visually-hidden"> (opens in a new tab)</span></a>']);
    var web = safeUrl(r.website);
    if (web) rows.push(['Website', '<a href="' + esc(web) + '" target="_blank" rel="noopener">' + esc(web.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')) + '</a>']);
    var ig = instagramUrl(r.instagram);
    if (ig) rows.push(['Instagram', '<a href="' + esc(ig) + '" target="_blank" rel="noopener">@' + esc(ig.split('/')[3]) + '</a>']);

    out.push('<aside class="info-card" aria-label="Details for ' + esc(name) + '">' +
      (rows.length
        ? '<dl>' + rows.map(function (x) { return '<div><dt>' + x[0] + '</dt><dd>' + x[1] + '</dd></div>'; }).join('') + '</dl>'
        : '<p class="muted">Location details coming soon.</p>') +
      (hasCoords(r) ? '<div id="cpgh-map" role="region" aria-label="Map showing ' + esc(name) + '"></div>' : '') +
      (isFeatured(r)
        ? ''
        : '<div class="notice"><strong>Own or work at ' + esc(name) + '?</strong> We\'d love to tell your story, or fix anything that\'s wrong here. <a href="' + esc(BASE.href) + 'for-restaurants/">Get in touch</a>.</div>') +
      '</aside>');

    out.push('</div>'); // .p-layout
    out.push('<p class="more-link"><a class="btn btn-ghost" href="' + esc(BASE.href) + 'restaurants/">&larr; Back to the guide</a></p>');
    out.push('<div class="p-end"></div>');
    out.push('</div>'); // .wrap
    return out.join('');
  }

  function dinnerDate(d) {
    if (val(d.dateLabel)) return val(d.dateLabel);
    if (/^\d{4}-\d{2}-\d{2}$/.test(val(d.date))) {
      var p = d.date.split('-');
      return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    return 'Date to be announced';
  }

  function renderDinner(d, guide) {
    var r = guide && guide.restaurants.filter(function (x) { return x.slug === d.restaurant; })[0];
    var tickets = safeUrl(d.ticketUrl);
    var photo = d.photo && assetUrl(d.photo.src);
    return '<article class="seat' + (d.status === 'upcoming' ? ' next' : '') + '">' +
      (photo ? '<img class="seat-img" src="' + esc(photo) + '" alt="' + esc(val(d.photo.alt) || val(d.title)) + '" width="600" height="400" loading="lazy" decoding="async">' : '') +
      '<div class="st">' + esc(dinnerDate(d)) + '</div>' +
      '<h3>' + esc(val(d.title) || (r ? 'Dinner at ' + r.name : 'CulturePGH dinner')) + '</h3>' +
      (r ? '<p class="r-meta seat-where"><a href="' + esc(profileUrl(r.slug)) + '">' + esc(r.name) + '</a>' + (val(r.neighborhood) ? '<span class="dot" aria-hidden="true">·</span>' + esc(val(r.neighborhood)) : '') + '</p>' : '') +
      (val(d.summary) ? '<p>' + esc(val(d.summary)) + '</p>' : '') +
      (tickets ? '<a class="seat-link" href="' + esc(tickets) + '" target="_blank" rel="noopener">Get tickets &rarr;</a>' : '') +
      '</article>';
  }

  function renderComingSoon(signupHref) {
    return '<article class="seat next"><div class="st">Coming soon</div><h3>Next dinner</h3>' +
      '<p>We\'re planning the next CulturePGH dinner now. Dinners happen a few times a year, and people on the email list hear about each one first.</p>' +
      '<a class="seat-link" href="' + esc(signupHref) + '">Join the list to hear first &rarr;</a></article>';
  }

  // Exposed for debugging in the console and for a future static generator.
  window.CPGH = {
    render: { card: renderCard, cards: renderCards, profile: renderProfile, dinner: renderDinner, comingSoon: renderComingSoon },
    profileUrl: profileUrl, loadGuide: loadGuide, loadDinners: loadDinners
  };

  // ---------------------------------------------------------------------------
  // Page wiring
  // ---------------------------------------------------------------------------

  function errorBox(msg) {
    return '<div class="empty-state" role="status"><strong>Something didn\'t load.</strong>' + esc(msg) +
      ' Please refresh, or email <a href="mailto:' + FORM_INBOX + '">' + FORM_INBOX + '</a>.</div>';
  }

  function makeMap(el) {
    if (!el) return null;
    if (typeof L === 'undefined') {
      el.innerHTML = '<p class="map-note" style="padding:18px">Map failed to load. Please refresh.</p>';
      return null;
    }
    var map = L.map(el, { scrollWheelZoom: false }).setView([40.4506, -79.9709], 12);
    map.on('click', function () { map.scrollWheelZoom.enable(); });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      className: 'map-tiles-muted', maxZoom: 19
    }).addTo(map);
    return map;
  }
  function pinIcon(type) {
    return L.divIcon({
      className: '', iconSize: [18, 18], iconAnchor: [9, 18], popupAnchor: [0, -16],
      html: '<div class="cpgh-pin ' + esc(type) + '"></div>'
    });
  }

  function initHome() {
    var featuredEl = document.getElementById('featured-list');
    var statsEl = document.getElementById('guide-stats');
    var nextEl = document.getElementById('next-dinner');

    loadGuide().then(function (guide) {
      var all = guide.restaurants;
      var featured = all.filter(isFeatured).sort(byFeaturedThenName);
      if (statsEl) {
        var uniq = function (f) { var s = {}; all.forEach(function (r) { var v = val(r[f]); if (v) s[v] = 1; }); return Object.keys(s).length; };
        statsEl.innerHTML =
          '<div><b>' + all.length + '</b><span>Places</span></div>' +
          '<div><b>' + uniq('cuisine') + '</b><span>Cuisines</span></div>' +
          '<div><b>' + uniq('neighborhood') + '</b><span>Neighborhoods</span></div>' +
          '<div><b>' + featured.length + '</b><span>Featured</span></div>';
      }
      if (featuredEl) {
        featuredEl.innerHTML = featured.length
          ? renderCards(featured.slice(0, 6), guide, 3)
          : '<div class="empty-state"><strong>Our first features are on the way.</strong>In the meantime, browse the places on our radar.</div>';
        var more = document.getElementById('radar-count');
        if (more) more.textContent = String(all.length - featured.length);
      }
      return guide;
    }).catch(function (e) {
      if (featuredEl) featuredEl.innerHTML = errorBox('The restaurant guide could not be loaded.');
      if (statsEl) statsEl.innerHTML = '';
      return null;
    }).then(function (guide) {
      if (!nextEl) return;
      return loadDinners().then(function (dinners) {
        var up = dinners.filter(function (d) { return d.status === 'upcoming'; });
        nextEl.innerHTML = up.length ? renderDinner(up[0], guide || { restaurants: [] }) : renderComingSoon('#signup');
      }).catch(function () { nextEl.innerHTML = renderComingSoon('#signup'); });
    });
  }

  function initDirectory() {
    var gridEl = document.getElementById('dir-grid');
    var countEl = document.getElementById('dir-count');
    var form = document.getElementById('dir-filters');
    var sel = { cuisine: document.getElementById('f-cuisine'), type: document.getElementById('f-type'), neighborhood: document.getElementById('f-hood') };
    var clearBtn = document.getElementById('f-clear');

    loadGuide().then(function (guide) {
      var all = guide.restaurants.slice().sort(byFeaturedThenName);

      // Build dropdowns from the data, so new cuisines/neighborhoods need no code.
      function present(field) {
        var s = {}; all.forEach(function (r) { var v = val(r[field]); if (v) s[v] = 1; }); return Object.keys(s);
      }
      var groups = present('cuisineGroup');
      var ordered = guide.cuisineGroups.filter(function (g) { return groups.indexOf(g) !== -1; })
        .concat(groups.filter(function (g) { return guide.cuisineGroups.indexOf(g) === -1; }).sort());
      function fill(select, values, label) {
        values.forEach(function (v) {
          var o = document.createElement('option'); o.value = v; o.textContent = label ? label(v) : v; select.appendChild(o);
        });
      }
      fill(sel.cuisine, ordered);
      fill(sel.type, Object.keys(guide.types).filter(function (t) { return present('type').indexOf(t) !== -1; }), function (t) { return typeLabel(guide, t); });
      fill(sel.neighborhood, present('neighborhood').sort());

      // Restore filters from the URL so filtered views can be shared.
      var params = new URLSearchParams(location.search);
      Object.keys(sel).forEach(function (k) {
        var v = params.get(k);
        if (v && [].some.call(sel[k].options, function (o) { return o.value === v; })) sel[k].value = v;
      });

      // Map
      var map = makeMap(document.getElementById('cpgh-map'));
      var markers = {};
      if (map) {
        all.forEach(function (r) {
          if (!hasCoords(r)) return;
          var meta = renderMeta(r, guide, true);
          markers[r.slug] = L.marker([r.lat, r.lng], { icon: pinIcon(r.type), title: r.name, alt: r.name }).bindPopup(
            '<div class="pop-name">' + esc(r.name) + '</div>' +
            (meta ? '<div class="pop-meta">' + meta + '</div>' : '') +
            (val(r.address) ? '<div class="pop-addr">' + esc(val(r.address)) + '</div>' : '') +
            '<a class="pop-link" href="' + esc(profileUrl(r.slug)) + '">View profile &rarr;</a>' +
            (val(r.address) ? '<a class="pop-link" href="' + esc(directionsUrl(r)) + '" target="_blank" rel="noopener">Directions &rarr;</a>' : ''));
        });
      }

      function apply() {
        var f = { cuisine: sel.cuisine.value, type: sel.type.value, neighborhood: sel.neighborhood.value };
        var shown = all.filter(function (r) {
          return (!f.cuisine || val(r.cuisineGroup) === f.cuisine) &&
                 (!f.type || r.type === f.type) &&
                 (!f.neighborhood || val(r.neighborhood) === f.neighborhood);
        });
        gridEl.innerHTML = shown.length
          ? renderCards(shown, guide, 3)
          : '<div class="empty-state"><strong>Nothing matches those filters yet.</strong>Try a different combination, or <a href="#suggest">suggest a place</a> we should add.</div>';
        countEl.textContent = shown.length === all.length
          ? 'Showing all ' + all.length + ' places'
          : 'Showing ' + shown.length + ' of ' + all.length + ' places';

        if (map) {
          var bounds = L.latLngBounds([]);
          var keep = {}; shown.forEach(function (r) { keep[r.slug] = 1; });
          Object.keys(markers).forEach(function (slug) {
            var m = markers[slug];
            if (keep[slug]) { m.addTo(map); bounds.extend(m.getLatLng()); } else { map.removeLayer(m); }
          });
          if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        }

        var q = new URLSearchParams();
        Object.keys(f).forEach(function (k) { if (f[k]) q.set(k, f[k]); });
        var qs = q.toString();
        history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
      }

      form.addEventListener('change', apply);
      form.addEventListener('submit', function (e) { e.preventDefault(); });
      clearBtn.addEventListener('click', function () {
        Object.keys(sel).forEach(function (k) { sel[k].value = ''; });
        apply(); sel.cuisine.focus();
      });
      apply();
    }).catch(function () {
      gridEl.innerHTML = errorBox('The restaurant guide could not be loaded.');
    });
  }

  function initProfile() {
    var el = document.getElementById('profile');
    var slug = new URLSearchParams(location.search).get('slug') || '';
    loadGuide().then(function (guide) {
      var r = guide.restaurants.filter(function (x) { return x.slug === slug; })[0];
      if (!r) {
        document.title = 'Not found · CulturePGH';
        el.innerHTML = '<div class="wrap" style="padding:80px 0"><h1 class="sec-title">We couldn\'t find that place.</h1>' +
          '<p class="sec-intro">It may have moved or been renamed.</p><p class="more-link"><a class="btn btn-primary" href="' +
          esc(BASE.href) + 'restaurants/">Browse the guide</a></p></div>';
        return;
      }
      document.title = r.name + ' · CulturePGH';
      var desc = document.querySelector('meta[name="description"]');
      if (desc && val(r.blurb)) desc.setAttribute('content', val(r.blurb));
      el.innerHTML = renderProfile(r, guide);
      if (hasCoords(r)) {
        var map = makeMap(document.getElementById('cpgh-map'));
        if (map) {
          L.marker([r.lat, r.lng], { icon: pinIcon(r.type), title: r.name, alt: r.name }).addTo(map);
          map.setView([r.lat, r.lng], 15);
        }
      }
    }).catch(function () {
      el.innerHTML = '<div class="wrap" style="padding:80px 0">' + errorBox('This profile could not be loaded.') + '</div>';
    });
  }

  function initDinners() {
    var upEl = document.getElementById('dinner-list');
    var pastEl = document.getElementById('past-list');
    var pastSection = document.getElementById('past');
    Promise.all([loadDinners(), loadGuide().catch(function () { return { restaurants: [] }; })]).then(function (res) {
      var dinners = res[0], guide = res[1];
      var up = dinners.filter(function (d) { return d.status === 'upcoming'; })
        .sort(function (a, b) { return val(a.date).localeCompare(val(b.date)); });
      var past = dinners.filter(function (d) { return d.status === 'past'; })
        .sort(function (a, b) { return val(b.date).localeCompare(val(a.date)); });
      upEl.innerHTML = up.length ? up.map(function (d) { return renderDinner(d, guide); }).join('') : renderComingSoon('#signup');
      if (past.length && pastEl) {
        pastEl.innerHTML = past.map(function (d) { return renderDinner(d, guide); }).join('');
        pastSection.hidden = false;
      }
    }).catch(function () { upEl.innerHTML = renderComingSoon('#signup'); });
  }

  // ---------------------------------------------------------------------------
  // Shared behavior on every page
  // ---------------------------------------------------------------------------

  // Instagram links: hidden until the handle is set in settings.json
  // (editable from admin/culturepgh.html).
  getJSON('settings.json').then(function (settings) {
    var url = instagramUrl(settings && settings.instagram);
    if (!url) return;
    document.querySelectorAll('[data-instagram]').forEach(function (a) { a.href = url; a.hidden = false; });
  }).catch(function () {});

  // Mobile navigation toggle
  (function () {
    var toggle = document.querySelector('.nav-toggle');
    var links = document.getElementById('nav-links');
    if (!toggle || !links) return;
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && links.classList.contains('open')) {
        links.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus();
      }
    });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  })();

  // Scroll reveal (static content only)
  (function () {
    var els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.15 });
    els.forEach(function (el) { io.observe(el); });
  })();

  // Forms. Submissions go to FormSubmit (formsubmit.co), which emails each one
  // to FORM_INBOX. The site is static, so there is no server of our own. The
  // markup also posts there natively, so the forms still work without JS.
  // The very first submission triggers a one-time "Activate form" email to
  // the inbox; nothing is delivered until that link is clicked.
  (function () {
    var ENDPOINT = 'https://formsubmit.co/ajax/' + FORM_INBOX;
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    function okFor(name) { return document.querySelector('[data-ok="' + name + '"]'); }
    function showOk(form) {
      var ok = okFor(form.dataset.form);
      form.classList.add('hidden'); ok.classList.remove('hidden'); ok.focus({ preventScroll: true });
    }

    // Returning from the no-JS fallback redirect (?sent=signup etc.)
    var sent = new URLSearchParams(location.search).get('sent');
    if (sent) {
      var f0 = document.querySelector('form[data-form="' + sent + '"]');
      if (f0) showOk(f0);
    }

    function validate(form) {
      var firstBad = null;
      form.querySelectorAll('input:not([type=hidden]):not([name=_honey]), textarea, select').forEach(function (el) {
        var v = el.value.trim();
        var bad = (el.required && !v) || (el.type === 'email' && v && !EMAIL_RE.test(v));
        var field = el.closest('.field');
        if (field) field.classList.toggle('bad', !!bad);
        if (bad) {
          el.setAttribute('aria-invalid', 'true');
          var err = document.getElementById(el.id + '-err');
          if (err) el.setAttribute('aria-describedby', err.id);
          if (!firstBad) firstBad = el;
        } else {
          el.removeAttribute('aria-invalid');
        }
      });
      if (firstBad) firstBad.focus();
      return !firstBad;
    }

    document.querySelectorAll('form[data-form]').forEach(function (form) {
      var btn = form.querySelector('button[type=submit]');
      var lbl = btn.querySelector('.lbl'), lblText = lbl.textContent;
      var status = form.querySelector('.form-status');

      form.addEventListener('input', function (e) {
        var field = e.target.closest('.field');
        if (field && field.classList.contains('bad')) { field.classList.remove('bad'); e.target.removeAttribute('aria-invalid'); }
      });

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        status.classList.remove('show', 'error');
        if (!validate(form)) return;

        var data = {};
        new FormData(form).forEach(function (v, k) { if (k !== '_next') data[k] = typeof v === 'string' ? v.trim() : v; });
        if (data._honey) { showOk(form); return; } // bot: pretend it worked
        delete data._honey;
        if (data.email) data._replyto = data.email;

        btn.disabled = true; btn.classList.add('sending'); lbl.textContent = 'Sending…';

        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(data)
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (body) {
            if (!r.ok || String(body.success) !== 'true') throw new Error(body.message || ('HTTP ' + r.status));
          });
        }).then(function () {
          form.reset();
          showOk(form);
        }).catch(function () {
          status.innerHTML = 'Something went wrong sending that. Please try again, or email us at ' +
            '<a href="mailto:' + FORM_INBOX + '">' + FORM_INBOX + '</a>.';
          status.classList.add('show', 'error');
        }).then(function () {
          btn.disabled = false; btn.classList.remove('sending'); lbl.textContent = lblText;
        });
      });
    });
  })();

  var page = document.body.dataset.page;
  if (page === 'home') initHome();
  else if (page === 'directory') initDirectory();
  else if (page === 'profile') initProfile();
  else if (page === 'dinners') initDinners();
})();
