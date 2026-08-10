/* =====================================================================
   Global Shapers Pittsburgh — orthographic globe on a 2D canvas
   No WebGL, no external libraries, no per-frame trigonometry.

   Why this file exists
   --------------------
   The previous version re-projected every coastline vertex from scratch on
   every animation frame: ~10,600 vertices x 10 trig calls x 60fps is about
   6.4 million sin/cos per second, which is what made the members page crawl
   on laptops and phones. Three changes fix that:

     1. Geometry is pre-baked once. Each vertex is stored as its unit-sphere
        components (A, B, C) in flat Float32Arrays, so rotating the globe is
        a handful of multiplies per point and zero trig.
     2. Rings that fall entirely on the far side of the sphere are skipped
        with a single dot-product test against a pre-computed bounding cap.
     3. Frames are only drawn when something changed, capped at 30fps while
        auto-spinning, and the loop stops completely when the globe scrolls
        off screen or the tab goes to the background.
   ===================================================================== */
(function (window) {
  'use strict';

  var D = Math.PI / 180;
  var SPIN_FPS = 30;
  var SPIN_STEP = 0.13;   // degrees of longitude per spin tick

  function CanvasGlobe(host, canvas, ctx, hubs, opts) {
    opts = opts || {};
    this.host = host; this.canvas = canvas; this.ctx = ctx;
    this.onPick = opts.onPick || function () {};
    this.autoSpin = opts.autoSpin !== false;

    this.hubs = (hubs || []).filter(function (h) { return isFinite(h.lat) && isFinite(h.lng); });
    this.hubGeom = packPoints(this.hubs);
    this.countries = null;
    this.cities = []; this.cityGeom = null;

    this.lam = 0; this.phi = 20;           // rotation: centre lng / lat, degrees
    this.zoom = 1; this.minZoom = 0.9; this.maxZoom = 7;
    this.spinning = this.autoSpin;
    this.active = true;                    // false once off screen / tab hidden
    this.dragging = false;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.pointers = {}; this.pinchDist = 0;
    this.dotHits = [];
    this._raf = 0; this._spinRaf = 0; this._lastSpin = 0; this._idleTimer = null;
    this.graticule = buildGraticule();

    var self = this;
    this._onResize = function () { self.resize(); };
    window.addEventListener('resize', this._onResize, { passive: true });

    this.bindPointer();
    this.resize();
    this.requestDraw();
    if (this.spinning) this.startSpin();
  }

  /* ---------- geometry pre-baking ---------- */

  /* A ring of [lng,lat] pairs becomes three parallel Float32Arrays plus a
     bounding cap, so drawing it later needs no trig at all. */
  function packRing(coords) {
    var n = coords.length;
    var A = new Float32Array(n), B = new Float32Array(n), C = new Float32Array(n);
    var sa = 0, sb = 0, sc = 0;
    for (var i = 0; i < n; i++) {
      var lng = coords[i][0] * D, lat = coords[i][1] * D;
      var cph = Math.cos(lat);
      var a = cph * Math.cos(lng), b = cph * Math.sin(lng), c = Math.sin(lat);
      A[i] = a; B[i] = b; C[i] = c;
      sa += a; sb += b; sc += c;
    }
    // Bounding cap: centroid direction + the widest angle to any vertex.
    var len = Math.sqrt(sa * sa + sb * sb + sc * sc) || 1;
    var ca = sa / len, cb = sb / len, cc = sc / len;
    var minDot = 1;
    for (var j = 0; j < n; j++) {
      var d = A[j] * ca + B[j] * cb + C[j] * cc;
      if (d < minDot) minDot = d;
    }
    // sin of the cap's angular radius; rings wider than a hemisphere never skip.
    var sinTheta = minDot > 0 ? Math.sqrt(1 - minDot * minDot) : 1;
    return { n: n, A: A, B: B, C: C, ca: ca, cb: cb, cc: cc, sinTheta: sinTheta };
  }

  function packPoints(list) {
    var n = list.length;
    var A = new Float32Array(n), B = new Float32Array(n), C = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var lng = list[i].lng * D, lat = list[i].lat * D, cph = Math.cos(lat);
      A[i] = cph * Math.cos(lng); B[i] = cph * Math.sin(lng); C[i] = Math.sin(lat);
    }
    return { n: n, A: A, B: B, C: C };
  }

  function buildGraticule() {
    var rings = [], lat, lng, ring;
    for (lat = -60; lat <= 60; lat += 30) {
      ring = [];
      for (lng = -180; lng <= 180; lng += 6) ring.push([lng, lat]);
      rings.push(packRing(ring));
    }
    for (lng = -180; lng < 180; lng += 30) {
      ring = [];
      for (lat = -90; lat <= 90; lat += 6) ring.push([lng, lat]);
      rings.push(packRing(ring));
    }
    return rings;
  }

  CanvasGlobe.prototype.setCountries = function (geo) {
    if (!geo || !geo.features) return;
    var rings = [];
    for (var f = 0; f < geo.features.length; f++) {
      var g = geo.features[f].geometry;
      if (!g) continue;
      var polys = g.type === 'Polygon' ? [g.coordinates]
                : (g.type === 'MultiPolygon' ? g.coordinates : []);
      for (var p = 0; p < polys.length; p++) {
        for (var r = 0; r < polys[p].length; r++) {
          if (polys[p][r].length > 1) rings.push(packRing(polys[p][r]));
        }
      }
    }
    this.countries = rings;
    this.requestDraw();
  };

  CanvasGlobe.prototype.setCities = function (list) {
    // Gazetteer of major cities — only used for labels once zoomed in.
    this.cities = (list || []).filter(function (c) { return c && isFinite(c.lat) && isFinite(c.lng); });
    this.cityGeom = packPoints(this.cities);
    this.requestDraw();
  };

  /* ---------- view state ---------- */

  CanvasGlobe.prototype.resize = function () {
    var w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.w = w; this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.baseR = Math.min(w, h) * 0.44;
    this.requestDraw();
  };

  CanvasGlobe.prototype.focus = function (lat, lng) {
    this.lam = -lng; this.phi = lat; this.requestDraw();
  };

  CanvasGlobe.prototype.zoomBy = function (f) {
    var next = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * f));
    if (next === this.zoom) return;
    this.zoom = next;
    this.pauseSpin();
    this.requestDraw();
  };

  /* Auto-spin resumes 5s after the visitor stops interacting. */
  CanvasGlobe.prototype.pauseSpin = function () {
    this.spinning = false;
    this.stopSpin();
    if (!this.autoSpin) return;
    var self = this;
    clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(function () {
      self.spinning = true;
      self.startSpin();
    }, 5000);
  };

  /* Called by the page when the globe scrolls out of view or the tab is
     backgrounded — everything stops, nothing is queued. */
  CanvasGlobe.prototype.setActive = function (on) {
    if (this.active === on) return;
    this.active = on;
    if (on) { this.requestDraw(); if (this.spinning) this.startSpin(); }
    else { this.stopSpin(); }
  };

  CanvasGlobe.prototype.destroy = function () {
    this._dead = true;
    this.stopSpin();
    clearTimeout(this._idleTimer);
    if (this._raf) window.cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
  };

  /* ---------- frame scheduling ----------
     One draw per changed state, never a permanently running loop. */

  CanvasGlobe.prototype.requestDraw = function () {
    if (this._dead || this._raf) return;
    var self = this;
    this._raf = window.requestAnimationFrame(function () {
      self._raf = 0;
      self.draw();
    });
  };

  CanvasGlobe.prototype.startSpin = function () {
    if (this._dead || this._spinRaf || !this.active || !this.spinning) return;
    var self = this;
    this._lastSpin = 0;
    (function tick(ts) {
      if (self._dead || !self.active || !self.spinning) { self._spinRaf = 0; return; }
      self._spinRaf = window.requestAnimationFrame(tick);
      if (self.dragging) return;
      // Cap the spin to SPIN_FPS: on a 120Hz screen this halves the work
      // and the motion still reads as smooth.
      if (ts && self._lastSpin && ts - self._lastSpin < 1000 / SPIN_FPS) return;
      self._lastSpin = ts || 0;
      self.lam -= SPIN_STEP;
      if (self.lam < -360) self.lam += 360;
      self.draw();
    })(0);
  };

  CanvasGlobe.prototype.stopSpin = function () {
    if (this._spinRaf) { window.cancelAnimationFrame(this._spinRaf); this._spinRaf = 0; }
  };

  /* ---------- drawing ---------- */

  /* Cache the four rotation scalars once per frame; every point reuses them. */
  CanvasGlobe.prototype.updateRotation = function () {
    var lamR = this.lam * D, phiR = this.phi * D;
    this.cosLam = Math.cos(lamR); this.sinLam = Math.sin(lamR);
    this.cosPhi0 = Math.cos(phiR); this.sinPhi0 = Math.sin(phiR);
  };

  CanvasGlobe.prototype.projectDeg = function (lat, lng) {
    var cph = Math.cos(lat * D), a = cph * Math.cos(lng * D), b = cph * Math.sin(lng * D), c = Math.sin(lat * D);
    var u = a * this.cosLam - b * this.sinLam;
    var v = b * this.cosLam + a * this.sinLam;
    var R = this.baseR * this.zoom;
    return {
      x: this.w / 2 + R * v,
      y: this.h / 2 - R * (this.cosPhi0 * c - this.sinPhi0 * u),
      vis: (this.sinPhi0 * c + this.cosPhi0 * u) >= 0
    };
  };

  CanvasGlobe.prototype.strokeRings = function (rings, R, cx, cy) {
    var ctx = this.ctx;
    var cosLam = this.cosLam, sinLam = this.sinLam, cosPhi0 = this.cosPhi0, sinPhi0 = this.sinPhi0;
    for (var r = 0; r < rings.length; r++) {
      var ring = rings[r];
      // Cheap rejection: is the ring's bounding cap entirely behind the limb?
      var cu = ring.ca * cosLam - ring.cb * sinLam;
      if (sinPhi0 * ring.cc + cosPhi0 * cu < -ring.sinTheta) continue;

      var A = ring.A, B = ring.B, C = ring.C, n = ring.n, pen = false;
      for (var i = 0; i < n; i++) {
        var a = A[i], b = B[i], c = C[i];
        var u = a * cosLam - b * sinLam;
        if (sinPhi0 * c + cosPhi0 * u < 0) { pen = false; continue; }   // back hemisphere
        var v = b * cosLam + a * sinLam;
        var x = cx + R * v;
        var y = cy - R * (cosPhi0 * c - sinPhi0 * u);
        if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
      }
    }
  };

  CanvasGlobe.prototype.draw = function () {
    var ctx = this.ctx, w = this.w, h = this.h;
    if (!w || !h || this._dead) return;
    this.updateRotation();
    var cx = w / 2, cy = h / 2, R = this.baseR * this.zoom;

    ctx.clearRect(0, 0, w, h);

    // Ocean sphere
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    var grad = ctx.createRadialGradient(cx - R * 0.32, cy - R * 0.36, R * 0.1, cx, cy, R);
    grad.addColorStop(0, '#173a7a'); grad.addColorStop(0.65, '#0d244f'); grad.addColorStop(1, '#07132b');
    ctx.fillStyle = grad; ctx.fill();
    ctx.clip();                       // keeps graticule + coastlines inside the disk

    ctx.beginPath();
    this.strokeRings(this.graticule, R, cx, cy);
    ctx.strokeStyle = 'rgba(120,155,235,0.12)'; ctx.lineWidth = 1; ctx.stroke();

    if (this.countries) {
      ctx.beginPath();
      this.strokeRings(this.countries, R, cx, cy);
      ctx.strokeStyle = 'rgba(150,180,255,0.52)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();

    // Limb
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(120,160,255,0.4)'; ctx.lineWidth = 1.2; ctx.stroke();

    this.drawCityLabels(R, cx, cy);
    this.drawHubs(R, cx, cy);
  };

  CanvasGlobe.prototype.drawCityLabels = function (R, cx, cy) {
    // Only when zoomed in, and only near the centre, so labels never crowd.
    if (this.zoom < 2.4 || !this.cityGeom) return;
    var ctx = this.ctx, geom = this.cityGeom, cities = this.cities;
    var cosLam = this.cosLam, sinLam = this.sinLam, cosPhi0 = this.cosPhi0, sinPhi0 = this.sinPhi0;
    if (!this._hubNames) {
      this._hubNames = {};
      for (var k = 0; k < this.hubs.length; k++) {
        this._hubNames[(String(this.hubs[k].name).split(',')[0] || '').toLowerCase()] = 1;
      }
    }
    ctx.font = '11px "Space Mono", monospace';
    ctx.textBaseline = 'middle';
    var shownX = [], shownY = [], limit = 26, maxR = R * 0.72;
    for (var i = 0; i < geom.n && shownX.length < limit; i++) {
      var city = cities[i];
      if (this._hubNames[(city.c || '').toLowerCase()]) continue;   // hubs get their own label
      var a = geom.A[i], b = geom.B[i], c = geom.C[i];
      var u = a * cosLam - b * sinLam;
      if (sinPhi0 * c + cosPhi0 * u < 0) continue;
      var v = b * cosLam + a * sinLam;
      var x = cx + R * v, y = cy - R * (cosPhi0 * c - sinPhi0 * u);
      var dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > maxR * maxR) continue;
      var overlap = false;
      for (var s = 0; s < shownX.length; s++) {
        if (Math.abs(shownX[s] - x) < 62 && Math.abs(shownY[s] - y) < 14) { overlap = true; break; }
      }
      if (overlap) continue;
      shownX.push(x); shownY.push(y);
      ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(200,215,255,0.7)'; ctx.fill();
      ctx.fillStyle = 'rgba(210,222,255,0.82)';
      ctx.fillText(city.c, x + 6, y);
    }
  };

  CanvasGlobe.prototype.drawHubs = function (R, cx, cy) {
    var ctx = this.ctx, geom = this.hubGeom, hubs = this.hubs;
    var cosLam = this.cosLam, sinLam = this.sinLam, cosPhi0 = this.cosPhi0, sinPhi0 = this.sinPhi0;
    var labelHubs = this.zoom >= 1.9;
    this.dotHits.length = 0;
    for (var i = 0; i < geom.n; i++) {
      var a = geom.A[i], b = geom.B[i], c = geom.C[i];
      var u = a * cosLam - b * sinLam;
      if (sinPhi0 * c + cosPhi0 * u < 0) continue;
      var v = b * cosLam + a * sinLam;
      var x = cx + R * v, y = cy - R * (cosPhi0 * c - sinPhi0 * u);
      var h = hubs[i];
      this.dotHits.push(x, y, i);

      if (h.home) {
        ctx.beginPath(); ctx.arc(x, y, 8, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255,203,5,0.22)'; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(x, y, h.home ? 5 : 3.4, 0, 2 * Math.PI);
      ctx.fillStyle = h.home ? '#FFCB05' : '#5b8bff';
      ctx.strokeStyle = h.home ? '#B8860B' : 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1; ctx.fill(); ctx.stroke();

      if (labelHubs || h.home) {
        ctx.font = (h.home ? 'bold ' : '') + '11px "Space Mono", monospace';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = h.home ? '#FFCB05' : 'rgba(235,242,255,0.92)';
        ctx.fillText(String(h.name).split(',')[0], x + 8, y);
      }
    }
  };

  /* ---------- interaction ---------- */

  CanvasGlobe.prototype.hitTest = function (mx, my) {
    var best = -1, bd = 18 * 18, hits = this.dotHits;
    for (var i = 0; i < hits.length; i += 3) {
      var dx = hits[i] - mx, dy = hits[i + 1] - my, dist = dx * dx + dy * dy;
      if (dist < bd) { bd = dist; best = hits[i + 2]; }
    }
    return best === -1 ? null : this.hubs[best];
  };

  CanvasGlobe.prototype.bindPointer = function () {
    var self = this, c = this.canvas, moved = 0;
    function local(e) {
      var r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    c.addEventListener('pointerdown', function (e) {
      if (c.setPointerCapture) c.setPointerCapture(e.pointerId);
      self.pointers[e.pointerId] = local(e);
      var keys = Object.keys(self.pointers);
      if (keys.length === 1) { self.dragging = true; moved = 0; self.pauseSpin(); }
      else if (keys.length === 2) {
        var a = self.pointers[keys[0]], b = self.pointers[keys[1]];
        self.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    c.addEventListener('pointermove', function (e) {
      var prev = self.pointers[e.pointerId];
      if (!prev) return;
      var pos = local(e), keys = Object.keys(self.pointers);
      if (keys.length >= 2) {
        self.pointers[e.pointerId] = pos;
        var a = self.pointers[keys[0]], b = self.pointers[keys[1]];
        var dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (self.pinchDist) self.zoomBy(dist / self.pinchDist);
        self.pinchDist = dist;
        return;
      }
      var ddx = pos.x - prev.x, ddy = pos.y - prev.y;
      self.pointers[e.pointerId] = pos;
      moved += Math.abs(ddx) + Math.abs(ddy);
      var k = 0.28 / self.zoom;
      self.lam += ddx * k;
      self.phi = Math.max(-89, Math.min(89, self.phi + ddy * k));
      self.dragging = true;
      self.requestDraw();
    });
    function up(e) {
      var was = self.pointers[e.pointerId];
      delete self.pointers[e.pointerId];
      if (!Object.keys(self.pointers).length) {
        self.dragging = false;
        self.pauseSpin();
        if (was && moved < 6) {              // a tap, not a drag → open the hub
          var hub = self.hitTest(was.x, was.y);
          if (hub) self.onPick(hub);
        }
      }
      self.pinchDist = 0;
    }
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });
  };

  window.CanvasGlobe = CanvasGlobe;
})(window);
