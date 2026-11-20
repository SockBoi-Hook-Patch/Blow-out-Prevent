/* scenes.js - BOP (Blowout Preventer) 8-bit explainer: procedural pixel-art scenes.
 * Portrait logical canvas 180x320. Art area y=0..244; y=245..319 kept plain dark (caption band).
 * window.BOPScenes = { draw(ctx, t), cues, captions }   draw() is a pure function of t (0..60).
 */
(function () {
  'use strict';
  var W = 180, H = 320, AH = 245;

  // PICO-8 palette
  var PAL = ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
    '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'];
  // 0 black 1 navy 2 plum 3 dkgreen 4 brown 5 dkgray 6 ltgray 7 white
  // 8 red 9 orange 10 yellow 11 green 12 blue 13 lavender 14 pink 15 peach

  var C = null, cur = -1;
  function fs(c) { if (c !== cur) { C.fillStyle = PAL[c]; cur = c; } }
  function R(x, y, w, h, c) {
    var x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.floor(x + w), y1 = Math.floor(y + h);
    if (x1 <= x0 || y1 <= y0) return;
    fs(c); C.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  function P(x, y, c) { R(x, y, 1, 1, c); }
  function cl01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ramp(t, a, b) { return cl01((t - a) / (b - a)); }
  function ease(v) { return v * v * (3 - 2 * v); }
  function lerp(a, b, v) { return a + (b - a) * v; }
  function hsh(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function fract(v) { return v - Math.floor(v); }
  function blink(t, hz) { var n = Math.floor(t * hz * 2); return (((n % 2) + 2) % 2) === 0; }

  // ---------------------------------------------------------------- 3x5 pixel font
  // each glyph: 5 rows, each row a digit 0..7 (bits: 4=left,2=mid,1=right)
  var GL = {
    A: '75755', B: '75657', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553', H: '55755',
    I: '72227', J: '31152', K: '55655', L: '44447', M: '57755', N: '65555', O: '75557', P: '75744',
    Q: '25563', R: '75655', S: '34216', T: '72222', U: '55557', V: '55552', W: '55775', X: '55255',
    Y: '55222', Z: '71247',
    '0': '75557', '1': '26227', '2': '61247', '3': '61216', '4': '55711', '5': '74616', '6': '34757',
    '7': '71122', '8': '75757', '9': '75716',
    '!': '22202', '.': '00002', ':': '02020', '-': '00700', '/': '11244', '>': '42124', '<': '12421',
    '=': '07070', '?': '61202', ' ': '00000', '+': '02720', '%': '51245', '^': '27222', '~': '22272',
    ',': '00012', '(': '12221', ')': '42224', '*': '05250'
  };
  function text(s, x, y, c, sc, rows) {
    sc = sc || 1; x = Math.floor(x); y = Math.floor(y);
    for (var i = 0; i < s.length; i++) {
      var g = GL[s.charAt(i)];
      if (g) {
        for (var r = 0; r < 5; r++) {
          if (rows !== undefined && !(rows & (1 << r))) continue;
          var b = g.charCodeAt(r) - 48, c0 = -1;
          for (var k = 0; k <= 3; k++) {
            var on = k < 3 && (b & (4 >> k));
            if (on && c0 < 0) c0 = k;
            else if (!on && c0 >= 0) { R(x + c0 * sc, y + r * sc, (k - c0) * sc, sc, c); c0 = -1; }
          }
        }
      }
      x += 4 * sc;
    }
  }
  function tw(s, sc) { sc = sc || 1; return s.length * 4 * sc - sc; }
  function textC(s, cx, y, c, sc, rows) { text(s, cx - Math.floor(tw(s, sc) / 2), y, c, sc, rows); }
  function textO(s, x, y, c, o, sc) { // outlined
    sc = sc || 1;
    text(s, x - 1, y, o, sc); text(s, x + 1, y, o, sc); text(s, x, y - 1, o, sc); text(s, x, y + 1, o, sc);
    text(s, x + 1, y + 1, o, sc); text(s, x - 1, y + 1, o, sc);
    text(s, x, y, c, sc);
  }
  function textOC(s, cx, y, c, o, sc) { textO(s, cx - Math.floor(tw(s, sc) / 2), y, c, o, sc); }
  function label(s, x, y, c, bg) { R(x - 1, y - 1, tw(s) + 2, 7, bg === undefined ? 0 : bg); text(s, x, y, c); }

  // ---------------------------------------------------------------- primitives
  function line(x0, y0, x1, y1, c, step) {
    var dx = x1 - x0, dy = y1 - y0, n = Math.max(Math.abs(dx), Math.abs(dy)) | 0;
    step = step || 1;
    if (n === 0) { P(x0, y0, c); return; }
    for (var i = 0; i <= n; i += step) P(Math.round(x0 + dx * i / n), Math.round(y0 + dy * i / n), c);
  }
  function circ(x, y, r, c) {
    x = Math.floor(x); y = Math.floor(y);
    if (r <= 0) { P(x, y, c); return; }
    for (var dy = -r; dy <= r; dy++) {
      var w = Math.floor(Math.sqrt(r * r - dy * dy) + 0.35);
      R(x - w, y + dy, 2 * w + 1, 1, c);
    }
  }
  function bubble(x, y, r) {
    x = Math.floor(x); y = Math.floor(y);
    if (r <= 0) { P(x, y, 7); return; }
    if (r === 1) { R(x - 1, y, 3, 1, 7); R(x, y - 1, 1, 3, 7); return; }
    circ(x, y, r, 6); circ(x, y, r - 1, 7);
    var s = Math.max(1, r >> 2); R(x - (r >> 1), y - (r >> 1), s, s, 12);
  }
  function outline(x, y, w, h, c) { R(x, y, w, 1, c); R(x, y + h - 1, w, 1, c); R(x, y, 1, h, c); R(x + w - 1, y, 1, h, c); }
  function bodyRect(x, y, w, h, base, lt, dk) {
    R(x, y, w, h, 0);
    if (w <= 2 || h <= 2) return;
    R(x + 1, y + 1, w - 2, h - 2, base);
    R(x + 1, y + 1, w - 2, 1, lt); R(x + 1, y + 1, 1, h - 2, lt);
    R(x + 1, y + h - 2, w - 2, 1, dk); R(x + w - 2, y + 2, 1, h - 3, dk);
  }
  function sym(cx, hw, ya, yb, base, lt, dk) { bodyRect(cx - hw, ya, hw * 2, yb - ya, base, lt, dk); }
  function speckle(x0, y0, w, h, c, seed, dens) {
    var n = (w * h / dens) | 0;
    for (var j = 0; j < n; j++) {
      R(x0 + Math.floor(hsh(seed + j * 3.17) * w), y0 + Math.floor(hsh(seed + j * 5.71 + 1) * h), 2, 1, c);
    }
  }
  // earth bands: list of [y0, y1, base, speck]
  function earth(x0, w, bands, seed) {
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      R(x0, b[0], w, b[1] - b[0], b[2]);
      speckle(x0, b[0], w, b[1] - b[0], b[3], seed + i * 101, 45);
      R(x0, b[0], w, 1, b[3] === 1 ? 5 : b[3]);
    }
  }
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function dissolve(cov) {
    if (cov <= 0) return;
    if (cov >= 1) { R(0, 0, W, H, 0); return; }
    fs(0);
    for (var by = 0; by < 40; by++) for (var bx = 0; bx < 23; bx++) {
      var v = BAYER[(by & 3) * 4 + (bx & 3)] / 16 * 0.45 + ((bx + by) / 61) * 0.55;
      if (v < cov) C.fillRect(bx * 8, by * 8, 8, 8);
    }
  }
  function stars(n, ymax, t, seed) {
    for (var i = 0; i < n; i++) {
      var x = Math.floor(hsh(seed + i * 1.3) * W), y = Math.floor(hsh(seed + i * 2.9 + 7) * ymax);
      var tw2 = hsh(i * 9.1 + Math.floor(t * 3 + hsh(i) * 3));
      var c = tw2 > 0.85 ? 5 : (tw2 > 0.4 ? 6 : 7);
      P(x, y, c);
      if (i % 11 === 0 && tw2 < 0.5) { P(x - 1, y, 5); P(x + 1, y, 5); P(x, y - 1, 5); P(x, y + 1, 5); }
    }
  }
  function waves(y0, y1, t, amp) {
    // surface
    for (var x = 0; x < W; x += 3) {
      var yy = y0 + Math.round(amp * Math.sin(x * 0.09 + t * 2.2) + 0.6 * Math.sin(x * 0.23 - t * 3.1));
      R(x, yy, 3, y0 + 3 - yy, 12);
      P(x, yy, 7);
    }
    for (var r = 0; r < 8; r++) {
      var yr = y0 + 7 + r * Math.floor((y1 - y0 - 8) / 8);
      if (yr >= y1) break;
      var dir = (r % 2) ? 1 : -1, sp = 6 + r * 2;
      for (var i = 0; i < 5; i++) {
        var len = 4 + ((r + i) % 3) * 2;
        var xx = ((hsh(r * 31 + i) * (W + 30) + dir * sp * t) % (W + 30) + (W + 30)) % (W + 30) - 15;
        R(xx, yr, len, 1, r < 3 ? 12 : 13);
      }
    }
  }
  function derrick(cx, yTop, yBase, hb, ht, col, br) {
    var hgt = yBase - yTop;
    for (var y = yTop; y < yBase; y++) {
      var hw = Math.round(lerp(ht, hb, (y - yTop) / hgt));
      R(cx - hw, y, 2, 1, col); R(cx + hw - 2, y, 2, 1, col);
    }
    var step = Math.max(5, Math.round(hgt / 6));
    for (var y2 = yTop + step; y2 < yBase; y2 += step) {
      var a = Math.round(lerp(ht, hb, (y2 - yTop) / hgt));
      var yb = Math.min(yBase - 1, y2 + step), b = Math.round(lerp(ht, hb, (yb - yTop) / hgt));
      R(cx - a, y2, 2 * a, 1, br);
      line(cx - a + 1, y2, cx + b - 2, yb, br, 1);
      line(cx + a - 2, y2, cx - b + 1, yb, br, 1);
    }
    R(cx - ht - 2, yTop - 4, 2 * ht + 4, 4, col);
  }

  // ---------------------------------------------------------------- BOP stack (unit geometry, scale k)
  // units (k=1): connector 0..4, annular 4..20, spacer, shear ram 22..31, spacer, pipe ram 33..42,
  // spool 42..48 with choke/kill outlets, wellhead connector 48..54
  function geo(cx, y0, k, pw) {
    return { cx: cx, y0: y0, k: k, pw: pw, bw: Math.round(7 * k) };
  }
  function U(g, v) { return Math.round(v * g.k); }
  function Y(g, v) { return g.y0 + Math.round(v * g.k); }

  function ramBody(g, v, base, lt, dk) {
    var cx = g.cx;
    var b0 = Y(g, v + 1), b1 = Y(g, v + 8), bl = U(g, 28) - U(g, 21) + 1;
    bodyRect(cx - U(g, 28), b0, bl, b1 - b0, 6, 7, 5);
    bodyRect(cx + U(g, 21) - 1, b0, bl, b1 - b0, 6, 7, 5);
    var e0 = Y(g, v + 3), e1 = Y(g, v + 6);
    bodyRect(cx - U(g, 30), e0 - 1, U(g, 2) + 1, e1 - e0 + 2, 5, 6, 0);
    bodyRect(cx + U(g, 28) - 1, e0 - 1, U(g, 2) + 1, e1 - e0 + 2, 5, 6, 0);
    sym(cx, U(g, 21), Y(g, v), Y(g, v + 9), base, lt, dk);
    // bolts
    R(cx - U(g, 18), Y(g, v) + 2, 1, 1, dk); R(cx + U(g, 18) - 1, Y(g, v) + 2, 1, 1, dk);
    R(cx - U(g, 27), e0, 2 * U(g, 27), e1 - e0, 0);
  }
  function stackBack(g, bore, vk, vc) {
    var cx = g.cx, bw = g.bw;
    var o0 = Y(g, 43.5), o1 = Y(g, 46.5), ow = U(g, 31);
    R(cx - ow, o0, 2 * ow, o1 - o0, 6);
    R(cx - ow, o0 + 1, 2 * ow, o1 - o0 - 2, bore);
    sym(cx, U(g, 9), Y(g, 0), Y(g, 4), 6, 7, 5);
    sym(cx, U(g, 19), Y(g, 8), Y(g, 20), 10, 7, 9);
    sym(cx, U(g, 15), Y(g, 6), Y(g, 8) + 1, 10, 7, 9);
    sym(cx, U(g, 11), Y(g, 4), Y(g, 6) + 1, 10, 7, 9);
    R(cx - U(g, 15), Y(g, 9), 2 * U(g, 15), Y(g, 19) - Y(g, 9), 0);
    sym(cx, U(g, 7) + 1, Y(g, 20), Y(g, 22), 6, 7, 5);
    ramBody(g, 22, 8, 14, 2);
    sym(cx, U(g, 7) + 1, Y(g, 31), Y(g, 33), 6, 7, 5);
    ramBody(g, 33, 9, 10, 4);
    sym(cx, U(g, 11), Y(g, 42), Y(g, 48), 6, 7, 5);
    sym(cx, U(g, 12), Y(g, 48), Y(g, 54), 6, 7, 5);
    R(cx - U(g, 10), Y(g, 50), 1, 1, 5); R(cx + U(g, 10) - 1, Y(g, 50), 1, 1, 5);
    R(cx - bw, g.y0, 2 * bw, Y(g, 54) - g.y0, bore);
    R(cx - ow, o0 + 1, 2 * ow, o1 - o0 - 2, bore);
  }
  function valves(g, vk, vc) {
    var o0 = Y(g, 43.5), o1 = Y(g, 46.5), hh = o1 - o0;
    var xs = [g.cx - U(g, 22) - 2, g.cx + U(g, 22) - 2], cs = [vk, vc];
    for (var i = 0; i < 2; i++) {
      var x = xs[i];
      R(x - 1, o0 - 2, 6, hh + 4, 0); R(x, o0 - 1, 4, hh + 2, cs[i]);
      R(x + 1, o0 - 1, 1, 1, 7);
      R(x - 1, o0 - 4, 6, 1, 6); R(x + 1, o0 - 3, 2, 1, 6);
    }
  }
  function annFront(g, a) {
    var cx = g.cx, bw = g.bw, pw = g.pw;
    var inner = Math.round(lerp(bw, pw, a)), outer = U(g, 14);
    var lift = Math.round(a * U(g, 1.5));
    var ry0 = Y(g, 10) - lift, ry1 = Y(g, 16) - lift, rh = ry1 - ry0;
    for (var s = -1; s <= 1; s += 2) {
      var xa = s < 0 ? cx - outer : cx + inner, wdt = outer - inner;
      R(xa, ry0, wdt, rh, 5);
      R(xa, ry0, wdt, 1, 0); R(xa, ry1 - 1, wdt, 1, 0);
      // steel inserts
      var ins = s < 0 ? cx - outer + 1 : cx + inner + 2;
      R(ins, ry0, wdt - 3, 1, 6); R(ins, ry1 - 1, wdt - 3, 1, 6);
      // piston below
      var px = s < 0 ? cx - outer : cx + bw + 1;
      R(px, ry1, outer - bw - 1, Y(g, 19) - ry1, 13);
      R(px, ry1, outer - bw - 1, 1, 7);
    }
  }
  function ramFront(g, v, c, shear) {
    var cx = g.cx, bw = g.bw, pw = g.pw;
    var ch0 = Y(g, v + 3), ch1 = Y(g, v + 6), chh = ch1 - ch0, len = U(g, 27) - bw - 1;
    var rodX = cx - U(g, 29), mid = ch0 + (chh >> 1);
    if (!shear) {
      var tip = Math.round(lerp(bw + 1, pw, c));
      var x0 = cx - tip - len;
      R(x0, ch0, len, chh, 6); R(x0, ch0, len, 1, 7); R(x0, ch1 - 1, len, 1, 5);
      R(cx - tip - 2, ch0, 2, chh, 0);
      R(rodX, mid, x0 - rodX, 1, 6);
      var x1 = cx + tip;
      R(x1, ch0, len, chh, 6); R(x1, ch0, len, 1, 7); R(x1, ch1 - 1, len, 1, 5);
      R(x1, ch0, 2, chh, 0);
      R(x1 + len, mid, (cx + U(g, 29)) - (x1 + len), 1, 6);
    } else {
      var sL = Math.round(lerp(-(bw + 1), bw - 2, c)), bl = bw, half = chh >> 1;
      var lb = cx + sL - bl - len;
      R(lb, ch0, len, chh, 6); R(lb, ch0, len, 1, 7); R(lb, ch1 - 1, len, 1, 5);
      R(cx + sL - bl, ch0, bl, half, 7); R(cx + sL - 1, ch0, 1, half, 6);
      R(rodX, mid, lb - rodX, 1, 6);
      var rb = cx - sL + bl;
      R(rb, ch0, len, chh, 6); R(rb, ch0, len, 1, 7); R(rb, ch1 - 1, len, 1, 5);
      R(cx - sL, ch0 + half, bl, chh - half, 7); R(cx - sL, ch0 + half, 1, chh - half, 6);
      R(rb + len, mid, (cx + U(g, 29)) - (rb + len), 1, 6);
    }
  }
  function hlBox(g, which, c) {
    var cx = g.cx;
    if (which === 1) outline(cx - U(g, 19) - 2, Y(g, 4) - 2, 2 * U(g, 19) + 4, Y(g, 20) - Y(g, 4) + 4, c);
    else if (which === 2) outline(cx - U(g, 30) - 2, Y(g, 22) - 2, 2 * U(g, 30) + 4, Y(g, 31) - Y(g, 22) + 4, c);
    else if (which === 3) outline(cx - U(g, 30) - 2, Y(g, 33) - 2, 2 * U(g, 30) + 4, Y(g, 42) - Y(g, 33) + 4, c);
    else if (which === 4) outline(cx - U(g, 31) - 2, Y(g, 42) - 2, 2 * U(g, 31) + 4, Y(g, 48) - Y(g, 42) + 4, c);
  }
  // vertical side line (choke/kill), 4px wide
  function sideLine(x, y0, y1, inner, wall) {
    R(x, y0, 4, y1 - y0, wall === undefined ? 6 : wall);
    R(x + 1, y0, 2, y1 - y0, inner);
  }
  function drillPipe(cx, pw, y0, y1, rot, interior) {
    if (y1 <= y0) return;
    R(cx - pw, y0, 2, y1 - y0, 6); R(cx + pw - 2, y0, 2, y1 - y0, 6);
    if (interior >= 0) R(cx - pw + 2, y0, 2 * pw - 4, y1 - y0, interior);
    var off = Math.floor(rot * 20) % 6;
    for (var yy = y0 - 6 + off; yy < y1; yy += 6) {
      var a = Math.max(y0, yy), b = Math.min(y1, yy + 3);
      if (b > a) R(cx - pw, a, 2, b - a, 5);
      a = Math.max(y0, yy + 3); b = Math.min(y1, yy + 6);
      if (b > a) R(cx + pw - 2, a, 2, b - a, 5);
    }
  }
  function toolJoints(cx, pw, y0, y1, phase) {
    for (var yj = y0 + ((Math.floor(phase) % 40) + 40) % 40; yj < y1 - 3; yj += 40) {
      R(cx - pw - 1, yj, 2, 3, 6); R(cx + pw - 1, yj, 2, 3, 6);
      R(cx - pw - 1, yj + 2, 2, 1, 5); R(cx + pw - 1, yj + 2, 2, 1, 5);
    }
  }
  function bit(cx, by, rot) {
    R(cx - 5, by - 9, 10, 3, 6); R(cx - 5, by - 9, 10, 1, 7);
    R(cx - 6, by - 6, 12, 4, 5);
    var ph = Math.floor(rot * 12);
    for (var i = 0; i < 6; i++) R(cx - 6 + 2 * i, by - 2, 2, 2, ((i + ph) % 2) ? 9 : 6);
  }

  // ---------------------------------------------------------------- driller + console
  function driller(x, yF, press, t, alarm) {
    var bob = press ? 0 : (blink(t, 0.7) ? 0 : 1);
    var top = yF - 38 + bob;
    // console
    R(x + 19, yF - 16, 22, 16, 5); R(x + 19, yF - 16, 22, 1, 6); R(x + 19, yF - 16, 1, 16, 6);
    R(x + 22, yF - 12, 9, 5, 0);
    textC('BOP', x + 27, yF - 12, alarm && blink(t, 3) ? 8 : 11);
    R(x + 33, yF - 12, 2, 2, blink(t, 1.5) ? 11 : 3); R(x + 36, yF - 12, 2, 2, alarm ? (blink(t, 4) ? 8 : 2) : 3);
    R(x + 33, yF - 8, 5, 1, 6);
    // big red button
    var py = press ? 1 : 0;
    R(x + 23, yF - 18, 14, 2, 6);
    R(x + 24, yF - 22 + py, 12, 4 - py, press ? 2 : 8);
    R(x + 25, yF - 22 + py, 3, 1, press ? 8 : 14);
    if (press) { // glow rays
      R(x + 29, yF - 28, 2, 3, 10); R(x + 20, yF - 24, 2, 1, 10); R(x + 38, yF - 24, 2, 1, 10);
    }
    // legs + boots
    R(x + 3, yF - 13, 3, 11, 1); R(x + 7, yF - 13, 3, 11, 1);
    R(x + 2, yF - 2, 4, 2, 0); R(x + 7, yF - 2, 5, 2, 0);
    // body (orange coverall, reflective stripe)
    R(x + 2, top + 10, 10, 16 - bob, 9); R(x + 2, top + 18, 10, 1, 7); R(x + 2, top + 10, 1, 15 - bob, 4);
    // head + helmet
    R(x + 3, top + 3, 8, 7, 15); P(x + 9, top + 5, 0); R(x + 9, top + 8, 2, 1, press ? 0 : 4);
    R(x + 2, top, 10, 3, 10); R(x + 1, top + 3, 12, 1, 10); R(x + 4, top, 3, 1, 7);
    // arm
    if (press) {
      R(x + 11, top + 12, x + 24 - (x + 11), 3, 9); R(x + 24, top + 12, 4, 3, 15);
    } else {
      R(x + 11, top + 11, 3, 9, 9); R(x + 11, top + 20, 3, 2, 15);
    }
    if (alarm && !press && blink(t, 3)) { R(x + 12, top - 10, 6, 8, 7); text('!', x + 13, top - 9, 8); }
  }

  // ================================================================ SCENE: TITLE (0..6)
  function sceneTitle(t) {
    R(0, 0, W, 120, 0);
    R(0, 120, W, 70, 1);
    R(0, 112, W, 1, 1); R(0, 115, W, 2, 1); R(0, 118, W, 2, 1);
    R(0, 176, W, 1, 2); R(0, 182, W, 8, 2); R(0, 180, W, 1, 2);
    stars(55, 165, t, 3);
    // moon (crescent)
    circ(158, 20, 9, 15); circ(162, 17, 8, 0); P(152, 22, 6); P(154, 25, 6);
    // rig
    var cx = 92;
    // flare boom + flame
    line(40, 168, 22, 156, 5);
    var fl = Math.floor(t * 10);
    R(19, 150 - (fl % 3), 5, 6 + (fl % 3), 8); R(20, 152 - (fl % 2), 3, 4 + (fl % 2), 9); R(21, 154, 1, 2, 10);
    derrick(cx, 118, 166, 13, 3, 5, 5);
    R(cx - 5, 112, 10, 2, 5);
    // deck
    R(36, 166, 108, 7, 0); R(36, 166, 108, 1, 5);
    R(46, 173, 10, 24, 0); R(124, 173, 10, 24, 0); R(46, 173, 1, 17, 5); R(124, 173, 1, 17, 5);
    // accommodation
    R(40, 150, 26, 16, 0); R(40, 150, 26, 1, 5); R(38, 147, 30, 2, 5);
    for (var wy = 0; wy < 3; wy++) for (var wx = 0; wx < 5; wx++) {
      var on = hsh(wx * 7 + wy * 13 + Math.floor(t * 0.7 + hsh(wx + wy * 5) * 5) * 0.37) > 0.3;
      if (on) R(43 + wx * 5, 153 + wy * 4, 2, 2, (wx + wy) % 3 ? 10 : 9);
    }
    // doghouse + crane
    R(cx - 7, 160, 14, 6, 0); R(cx - 5, 162, 3, 2, 10);
    R(130, 150, 6, 16, 0); line(134, 150, 160, 128, 5); line(160, 128, 160, 140, 5);
    // lights
    if (blink(t, 1)) { R(cx - 1, 110, 2, 2, 8); P(160, 127, 8); }
    if (blink(t + 0.5, 1)) R(38, 145, 2, 2, 8);
    P(cx - 12, 140, 10); P(cx + 11, 140, 10);
    // sea
    R(0, 190, W, AH - 190, 1);
    waves(190, AH, t, 1.4);
    // reflections
    for (var i = 0; i < 6; i++) {
      var ry = 196 + i * 7, wv = Math.round(Math.sin(t * 3 + i) * 2);
      R(46 + wv + (i % 2) * 4, ry, 6 - (i % 3), 1, 10);
      R(156 + wv, ry + 2, 5 - (i % 2) * 2, 1, 15);
      R(20 + wv, ry - 3, 3, 1, 9);
    }
    // title text
    var bob = Math.round(Math.sin(t * 2.1) * 1.5);
    var tx = 40, ty = 18 + bob;
    text('BOP', tx + 3, ty + 3, 2, 9);
    text('BOP', tx - 1, ty, 0, 9); text('BOP', tx + 1, ty, 0, 9); text('BOP', tx, ty - 1, 0, 9); text('BOP', tx, ty + 1, 0, 9);
    text('BOP', tx, ty, 10, 9, 7);
    text('BOP', tx, ty, 9, 9, 24);
    // shine
    R(tx + 9, ty + 9, 3, 3, 7); R(tx + 45, ty + 9, 3, 3, 7); R(tx + 81, ty + 9, 3, 3, 7);
    textOC('BLOWOUT', 90, 72, 7, 0, 2);
    textOC('PREVENTER', 90, 85, 7, 0, 2);
    textC('HOW IT KEEPS A WELL SAFE', 90, 100, 12);
  }

  // ================================================================ SCENE: ANATOMY (6..16)
  var GA = geo(90, 72, 1.9, 5);
  function sceneAnatomy(t) {
    var g = GA, cx = g.cx;
    var sea0 = 24, seabed = Y(g, 54);
    R(0, 0, W, sea0, 0);
    stars(18, 20, t, 77);
    R(0, sea0, W, seabed - sea0, 1);
    // light rays in water
    for (var i = 0; i < 5; i++) {
      var x0 = 10 + i * 38 + Math.round(Math.sin(t * 0.8 + i) * 3);
      for (var yy = sea0 + 6; yy < sea0 + 60; yy += 3) P(x0 + ((yy - sea0) >> 3), yy, 13);
    }
    // drifting motes
    for (var m = 0; m < 22; m++) {
      var mx = Math.floor(fract(hsh(m) + t * 0.01 * (1 + (m % 3))) * W);
      var my = sea0 + 4 + Math.floor(fract(hsh(m + 40) - t * 0.03) * (seabed - sea0 - 8));
      P(mx, my, m % 4 ? 13 : 12);
    }
    // ground
    earth(0, W, [[seabed, seabed + 14, 4, 15], [seabed + 14, seabed + 32, 5, 6], [seabed + 32, seabed + 52, 13, 1], [seabed + 52, AH, 4, 9]], 500);
    // mini rig at top
    derrick(cx, 3, 15, 7, 2, 6, 5);
    R(54, 15, 72, 4, 5); R(54, 15, 72, 1, 6);
    R(60, 19, 7, 9, 5); R(113, 19, 7, 9, 5);
    R(56, 26, 68, 4, 0);
    waves(sea0, sea0 + 2, t, 0.8);
    R(56, 26, 68, 3, 5);
    if (blink(t, 1)) P(cx, 0, 8);
    // riser + lines
    var kx = cx - U(g, 31), chx = cx + U(g, 31) - 4;
    var hlc = blink(t, 4) ? 10 : 7;
    var cur4 = t >= 14 && t < 16, ckIn = t >= 14;
    sideLine(kx, 19, Y(g, 46.5), ckIn ? (cur4 ? 12 : 1) : 0, cur4 ? hlc : 6);
    sideLine(chx, 19, Y(g, 46.5), ckIn ? (cur4 ? 4 : 1) : 0, cur4 ? hlc : 6);
    var rh = U(g, 9);
    R(cx - rh, 19, 2 * rh, g.y0 - 19, 6); R(cx - rh, 19, 1, g.y0 - 19, 7); R(cx + rh - 1, 19, 1, g.y0 - 19, 5);
    R(cx - g.bw, 19, 2 * g.bw, g.y0 - 19, 0);
    // buoyancy modules on riser
    for (var b = 0; b < 2; b++) { var by = 26 + b * 13; R(cx - rh - 3, by, 2 * rh + 6, 10, 15); R(cx - rh - 3, by, 2 * rh + 6, 1, 7); R(cx - rh - 3, by + 9, 2 * rh + 6, 1, 4); }
    // riser break (not to scale)
    R(cx - rh - 6, 56, 2 * rh + 12, 3, 1);
    line(cx - rh - 6, 58, cx + rh + 6, 54, 7); line(cx - rh - 6, 61, cx + rh + 6, 57, 7);
    // flow in choke/kill demo
    if (cur4) {
      var d = (t - 14) * 30;
      for (var p = 0; p < 12; p++) {
        var yy2 = 19 + ((p * 12 + d) % (Y(g, 46.5) - 19));
        R(kx + 1, yy2, 2, 2, 7);
        var yy3 = Y(g, 46.5) - ((p * 12 + d) % (Y(g, 46.5) - 19));
        R(chx + 1, yy3, 2, 2, 15);
      }
    }
    // stack
    stackBack(g, 0);
    // casing below stack
    var hw = U(g, 10);
    R(cx - hw - 3, seabed, 2 * hw + 6, AH - seabed, 13);
    R(cx - hw - 1, seabed, 2 * hw + 2, AH - seabed, 6);
    R(cx - hw + 1, seabed, 2 * hw - 2, AH - seabed, 0);
    sym(cx, U(g, 14), seabed, seabed + 10, 6, 7, 5);
    R(cx - g.bw + 2, seabed, 2 * g.bw - 4, 10, 0);
    // drill pipe
    drillPipe(cx, g.pw, 19, AH, t * 0.6, 5);
    // component demos
    var a = 0, sh = 0, pr = 0;
    if (t > 7.8 && t < 9.4) a = Math.min(1, 1.3 * Math.sin(Math.PI * (t - 7.8) / 1.6));
    if (t > 9.9 && t < 11.5) sh = 0.32 * Math.sin(Math.PI * (t - 9.9) / 1.6);
    if (t > 12.3 && t < 13.9) pr = Math.min(1, 1.3 * Math.sin(Math.PI * (t - 12.3) / 1.6));
    annFront(g, a);
    ramFront(g, 22, sh, true);
    ramFront(g, 33, pr, false);
    valves(g, cur4 ? 11 : 8, cur4 ? 11 : 8);
    // highlight + labels
    var act = t < 7.5 ? 0 : t < 9.5 ? 1 : t < 12 ? 2 : t < 14 ? 3 : 4;
    if (act > 0) hlBox(g, act, hlc);
    function lab(id, tShow, s, x, y, lx, ly) {
      if (t < tShow) return;
      var on = act === id;
      var c = on ? 10 : 7;
      line(lx, ly, x < cx ? x + tw(s) + 1 : x - 2, y + 2, on ? 10 : 5);
      label(s, x, y, c);
    }
    var R2 = 152;
    lab(1, 7.5, 'ANNULAR', R2, Y(g, 12) - 2, cx + U(g, 19) + 1, Y(g, 12));
    if (t >= 9.5) {
      var on2 = act === 2, c2 = on2 ? 10 : 7, ly2 = Y(g, 26.5);
      line(24, ly2, cx - U(g, 30) - 1, ly2, on2 ? 10 : 5);
      label('BLIND', 3, ly2 - 9, c2); label('SHEAR', 3, ly2 - 2, c2); label('RAM', 3, ly2 + 5, c2);
    }
    if (t >= 12) {
      var on3 = act === 3, c3 = on3 ? 10 : 7, ly3 = Y(g, 37.5);
      line(cx + U(g, 30) + 1, ly3, 158, ly3, on3 ? 10 : 5);
      label('PIPE', 160, ly3 - 6, c3); label('RAM', 162, ly3 + 1, c3);
    }
    if (t >= 14) {
      var c4 = act === 4 ? 10 : 7;
      label('KILL', 9, 52, c4); label('LINE', 9, 59, c4);
      label('CHOKE', 155, 52, c4); label('LINE', 159, 59, c4);
      if (act === 4) {
        text('^', chx + 7, 36 - (Math.floor(t * 6) % 4), 15);
        text('~', kx - 8, 36 + (Math.floor(t * 6) % 4), 12);
      }
    }
    // static labels
    label('RISER', 3, 36, 6);
    line(23, 38, cx - rh - 4, 38, 5);
    label('RIG', 132, 6, 6);
    label('SEA', 160, 28, 12, 1);
    label('SEABED', 3, seabed + 4, 15);
    label('WELLHEAD', 146, seabed + 3, 6);
    line(cx + U(g, 14) + 1, seabed + 5, 144, seabed + 5, 5);
    label('CASING', 152, seabed + 26, 6);
    line(cx + hw + 3, seabed + 28, 150, seabed + 28, 5);
    // header
    R(0, 0, 50, 9, 0);
    text('BOP STACK', 2, 2, act === 0 && blink(t, 3) ? 7 : 10);
  }

  // ================================================================ SCENE: WELL (normal 16..24, kick 24..37)
  var GW = geo(68, 20, 1.5, 5);
  var WBANDS = [[101, 120, 4, 15], [120, 140, 5, 6], [140, 160, 13, 1], [160, 180, 4, 9], [180, 208, 5, 13], [224, AH, 5, 6]];
  var HP0 = 208, HP1 = 224, SB = 101, HH = 14, CSG = 160;
  function hwAt(y) { return y >= SB ? HH : GW.bw; }

  function sceneWell(t) {
    var g = GW, cx = g.cx, pw = g.pw, bw = g.bw;
    var kick = t >= 24;
    var seabed = Y(g, 54);
    var o0 = Y(g, 43.5), o1 = Y(g, 46.5), oyc = o0 + 1;
    var kx = cx - U(g, 31), chx = cx + U(g, 31) - 4;

    // --- state
    var by = kick ? 198 + Math.round(ease(ramp(t, 24, 25.6)) * 16) : 190 + Math.floor(t - 16);
    var rotT = kick ? Math.min(t, 27.6) : t;
    var ann = kick ? ease(ramp(t, 28, 29)) : 0;
    var pr = kick ? ease(ramp(t, 29.3, 30)) : 0;
    var chokeOpen = kick && t >= 30, killOpen = kick && t >= 30.5;
    var dP = kick ? 30 * Math.min(t, 27.6) + (t > 30.5 ? 45 * (t - 30.5) : 0) : 30 * t;
    var dL = kick ? 20 * Math.min(t, 28) + (t > 30.5 ? 32 * (t - 30.5) : 0) : 20 * t;
    var dU = 20 * Math.min(t, 28);
    var kfP = killOpen ? Math.min(by, 12 + 130 * (t - 30.5)) : -1; // kill mud front in pipe
    var tKA = 30.5 + (by - 12) / 130;
    var kfA = (kick && t > tKA) ? Math.max(oyc, by - 80 * (t - tKA)) : 999; // kill mud front in annulus
    var tKC = tKA + (by - oyc) / 80;
    var alarm = kick && t >= 26.5 && t < 35;
    var press = kick && t >= 27.5 && t < 28.6;
    var formP = 0.5 + (kick ? 0.36 * ramp(t, 24.85, 25.3) : 0);
    var mudP = 0.66 + (kick ? 0.28 * ramp(t, tKA, tKC) : 0);
    var pit = kick ? 0.35 + 0.42 * ramp(t, 25.2, 27.8) - 0.37 * ramp(t, 31, 35) : 0.35 + 0.02 * Math.sin(t * 2);

    // --- background
    R(0, 0, 132, seabed, 1);
    for (var m = 0; m < 14; m++) {
      var mx = Math.floor(fract(hsh(m + 3) + t * 0.012 * (1 + (m % 3))) * 132);
      var my = 14 + Math.floor(fract(hsh(m + 60) - t * 0.04) * (seabed - 16));
      P(mx, my, 13);
    }
    earth(0, 132, WBANDS, 900);
    R(0, HP0, 132, HP1 - HP0, 2);
    var pulse = kick && t > 24.8 && t < 28;
    for (var s = 0; s < 40; s++) {
      var sx = Math.floor(hsh(s * 3.3 + 1) * 132), sy = HP0 + 1 + Math.floor(hsh(s * 7.7 + 2) * (HP1 - HP0 - 2));
      var sc = pulse && blink(t + hsh(s), 3) ? 7 : 14;
      R(sx, sy, s % 3 ? 1 : 2, 1, sc);
    }
    R(0, HP0, 132, 1, 14);
    R(0, seabed, 132, 2, 15);
    // cement + casing + hole
    R(cx - HH - 4, seabed, 2 * HH + 8, CSG - seabed, 13);
    R(cx - HH - 2, seabed, 2 * HH + 4, CSG - seabed, 6);
    R(cx - HH - 3, CSG, 2 * HH + 6, 2, 5);
    R(cx - HH, seabed, 2 * HH, by + 2 - seabed, 4);
    for (var j = CSG + 2; j < by + 2; j += 3) {
      var jj = Math.floor(hsh(j) * 2);
      R(cx - HH - 1 - jj, j, 1 + jj, 3, 0); R(cx + HH, j, 1 + Math.floor(hsh(j + 9) * 2), 3, 0);
    }
    // choke & kill side lines
    var kfLine = killOpen ? Math.min(o1, 12 + 90 * (t - 30.5)) : 12;
    sideLine(kx, 12, o1, 0);
    if (killOpen) R(kx + 1, 12, 2, kfLine - 12, 9);
    var chokeCol = chokeOpen ? 4 : 0;
    sideLine(chx, 12, o1, chokeCol);
    if (kick && t > tKC) R(chx + 1, Math.max(12, oyc - 70 * (t - tKC)), 2, oyc + 1 - Math.max(12, oyc - 70 * (t - tKC)), 9);
    // riser
    var rh = U(g, 9);
    R(cx - rh, 12, 2 * rh, g.y0 - 12, 6); R(cx - rh, 12, 1, g.y0 - 12, 7); R(cx + rh - 1, 12, 1, g.y0 - 12, 5);
    R(cx - bw, 12, 2 * bw, g.y0 - 12, 4);
    stackBack(g, 4);
    // kill mud in outlets / annulus
    if (killOpen && kfLine >= o1) R(kx, oyc, cx - kx - bw, o1 - o0 - 2, 9);
    if (kick && t > tKC) R(cx + bw, oyc, chx - cx - bw + 1, o1 - o0 - 2, 9);
    if (kfA < 999) {
      var ya = Math.max(kfA, seabed);
      R(cx - HH, ya, 2 * HH, by + 2 - ya, 9);
      if (kfA < seabed) R(cx - bw, kfA, 2 * bw, seabed - kfA, 9);
    }
    // annulus particles
    var nL = 26, Lspan = by - 2 - oyc;
    for (var i = 0; i < nL; i++) {
      var f = hsh(i * 1.7 + 0.3), side = (i % 2) ? 1 : -1;
      var yP = by - 2 - fract(hsh(i * 2.3) + dL / Lspan) * Lspan;
      var hw = hwAt(yP), xo = pw + 1 + Math.floor(f * (hw - pw - 2));
      R(cx + side * xo - (side < 0 ? 1 : 0), yP, 1, 2, yP > kfA ? 10 : 15);
    }
    var Uspan = oyc - 12;
    for (i = 0; i < 12; i++) {
      var f2 = hsh(i * 3.1 + 5), side2 = (i % 2) ? 1 : -1;
      var yQ = oyc - fract(hsh(i * 4.9) + dU / Uspan) * Uspan;
      var xo2 = pw + 1 + Math.floor(f2 * (bw - pw - 2));
      R(cx + side2 * xo2 - (side2 < 0 ? 1 : 0), yQ, 1, 2, 15);
    }
    // choke flow + kill line flow
    if (chokeOpen) {
      var Lh = chx + 1 - (cx + bw), Lv = oyc - 12, dC = 26 * (t - 30);
      for (i = 0; i < 10; i++) {
        var sp = fract(i / 10 + dC / (Lh + Lv)) * (Lh + Lv);
        if (sp < Lh) R(cx + bw + sp, oyc, 2, 1, 15); else R(chx + 1, oyc - (sp - Lh), 1, 2, 15);
      }
    }
    if (killOpen) {
      for (i = 0; i < 8; i++) {
        var ky = 12 + fract(i / 8 + (t - 30.5) * 0.6) * (o1 - 14);
        if (ky < kfLine) R(kx + 1, ky, 2, 1, 10);
      }
    }
    // drill pipe
    var pTop = 12, pBot = by - 9;
    drillPipe(cx, pw, pTop, pBot, rotT, 4);
    if (kfP > 0) R(cx - pw + 2, pTop, 2 * pw - 4, Math.min(kfP, pBot) - pTop, 9);
    toolJoints(cx, pw, pTop, pBot, by);
    var pumping = !kick || t < 27.6 || t > 30.5;
    if (pumping) {
      for (i = 0; i < 14; i++) {
        var yd = pTop + fract(i / 14 + dP / (pBot - pTop)) * (pBot - pTop);
        R(cx - 1 + (i % 2) - 1, yd, 1, 2, (kfP > 0 && yd < kfP) ? 10 : 15);
      }
    }
    bit(cx, by, rotT);
    if (pumping) { // jets
      var jf = Math.floor(t * 12) % 3;
      P(cx - 7 - jf, by - 1 + jf, 15); P(cx + 6 + jf, by - 1 + jf, 15);
    }
    // gas bubbles (kick)
    if (kick) {
      for (i = 0; i < 11; i++) {
        var s0 = 25.0 + i * 0.24;
        if (t < s0) continue;
        var dist = 9 * (Math.min(t, 30.5) - s0) + (t > 30.5 ? 42 * (t - 30.5) : 0);
        var y0b = 212 - Math.floor(hsh(i + 9) * 4);
        var yb = y0b - dist, sideb = (i % 2) ? 1 : -1;
        if (yb >= oyc) {
          var hwb = hwAt(yb), r = yb < 195 ? 2 : 1;
          var xob = pw + 2 + r + Math.floor(hsh(i + 50) * Math.max(1, hwb - pw - 3 - 2 * r));
          xob += Math.round(Math.sin(t * 6 + i) * 0.8);
          bubble(cx + sideb * xob, yb, r);
        } else {
          var over = oyc - yb, Lh2 = chx + 2 - (cx - bw);
          if (over < Lh2) bubble(cx - bw + over, oyc, 1);
          else if (oyc - (over - Lh2) > 12) R(chx + 1, oyc - (over - Lh2), 2, 2, 7);
        }
      }
    }
    // BOP front
    annFront(g, ann);
    ramFront(g, 22, 0, true);
    ramFront(g, 33, pr, false);
    valves(g, killOpen ? 11 : 8, chokeOpen ? 11 : 8);
    if (kick && t >= 28 && t < 29.3) hlBox(g, 1, blink(t, 5) ? 10 : 7);
    if (kick && t >= 29.3 && t < 30.3) hlBox(g, 3, blink(t, 5) ? 10 : 7);

    // --- labels
    var hl = kick && t >= 28;
    label('KILL', 29, 15, killOpen ? 9 : 6);
    label('CHOKE', 89, 15, chokeOpen ? 11 : 6);
    if (chokeOpen) { text('^', 117, 26 - (Math.floor(t * 5) % 3), 15); text('^', 117, 36 - (Math.floor(t * 5) % 3), 15); }
    if (kick && t >= 28 && t < 31) label('ANNULAR', 3, Y(g, 12) - 2, t < 29.3 ? 10 : 7);
    if (kick && t >= 29.3 && t < 31) { var pc = t < 30.3 ? 10 : 7; label('PIPE', 3, Y(g, 37.5) - 6, pc); label('RAM', 3, Y(g, 37.5) + 1, pc); }
    if (!kick || t < 28) { label('BOP', 118, 46, 10); }
    if (!kick || t < 25) {
      if (t > 16.4) { label('CASING', 93, 110, 6); line(90, 112, cx + HH + 2, 112, 6); }
      if (t > 16.8) { label('ANNULUS', 93, 128, 15); line(90, 130, cx + 10, 130, 15); }
      if (t > 17.2) { label('DRILL PIPE', 93, 146, 6); line(90, 148, cx + 4, 148, 6); }
      if (t > 17.6) { label('BIT', 93, by - 6, 9); line(90, by - 4, cx + 7, by - 4, 9); }
      if (t > 18.2) { label('MUD', 4, 112, 15); label('DOWN', 4, 119, 15); text('~', 22, 114 + (Math.floor(t * 6) % 3), 15); }
      if (t > 18.6) { label('RETURN', 4, 136, 15); label('UP', 4, 143, 15); text('^', 14, 144 - (Math.floor(t * 6) % 3), 15); }
    }
    label(kick && t > 24.8 ? 'HIGH P GAS' : 'GAS ZONE', 91, 214, 14);
    if (kick && t >= 25.2 && t < 30) { label('GAS IN!', 95, 192, blink(t, 3) ? 7 : 8); line(93, 194, cx + 14, 200, 7); }
    if (kick && t >= 30.6 && t < 35) { label('KILL', 4, 122, 9); label('MUD', 4, 129, 9); text('~', 20, 124 + (Math.floor(t * 6) % 3), 9); }


    // header
    R(0, 0, 132, 12, 0);
    var hdr = 'DRILLING', hc = 11;
    if (kick) {
      if (t >= 25.2 && t < 27.5) { hdr = 'KICK!'; hc = blink(t, 3) ? 8 : 10; }
      else if (t >= 27.5 && t < 30.5) { hdr = 'SHUT IN'; hc = 10; }
      else if (t >= 30.5 && t < 35) { hdr = 'KILL WELL'; hc = 9; }
      else if (t >= 35) { hdr = 'SAFE'; hc = 11; }
    }
    textC(hdr, 66, 2, hc, 2);

    // --- gauge strip
    R(132, 0, 2, AH, 5);
    R(134, 0, 46, AH, 1);
    // pressure
    R(136, 3, 42, 95, 5); R(137, 4, 40, 93, 0);
    textC('PRESSURE', 157, 6, 6);
    for (var tk = 0; tk <= 6; tk++) R(138, 86 - tk * 10, 2, 1, 5);
    var hM = Math.round(mudP * 62), hF = Math.round(formP * 62);
    var mudC = (kick && t > tKA) ? 9 : 12;
    R(141, 86 - hM, 12, hM, mudC); R(141, 86 - hM, 12, 1, 7); R(141, 86 - hM, 1, hM, 7);
    var fBad = formP > mudP;
    var fC = fBad ? (blink(t, 3) ? 8 : 2) : 14;
    R(160, 86 - hF, 12, hF, fC); R(160, 86 - hF, 12, 1, 7);
    textC('MUD', 147, 89, mudC === 9 ? 9 : 12);
    textC('FORM', 166, 89, 14);
    text(fBad ? '<' : '>', 155, 52, fBad ? 8 : 11);
    // pit volume
    R(136, 101, 42, 58, 5); R(137, 102, 40, 56, 0);
    textC('PIT VOL', 157, 104, 6);
    R(144, 112, 26, 42, 6); R(145, 112, 24, 41, 0);
    var lv = Math.round(pit * 39);
    R(145, 153 - lv, 24, lv, 4); R(145, 153 - lv, 24, 1, 15);
    for (tk = 0; tk < 4; tk++) R(165, 120 + tk * 9, 4, 1, 5);
    if (kick && t >= 25.2 && t < 28 && blink(t, 3)) text('^', 172, 120, 8);
    if (kick && t >= 31 && t < 35 && blink(t, 2)) text('~', 172, 140, 11);
    // status
    if (alarm) {
      var ab = blink(t, 3);
      R(136, 162, 42, 16, ab ? 8 : 2); R(137, 163, 40, 14, ab ? 2 : 8);
      textC('ALARM', 157, 167, 7);
    } else {
      R(136, 162, 42, 16, 11); R(137, 163, 40, 14, 3);
      textC('OK', 157, 165, 7, 2);
    }
    // driller area
    R(134, 236, 46, 9, 5);
    for (var hz = 0; hz < 12; hz++) R(134 + hz * 4, 236, 2, 2, 10);
    R(134, 238, 46, 7, 5);
    R(144, 186, 26, 14, 0); R(145, 187, 24, 12, 12); // window
    R(145, 195, 24, 4, 1); P(150 + (Math.floor(t * 2) % 15), 196, 7);
    driller(136, 236, press, t, alarm);
    if (press) label('PUSH!', 148, 182, 10);

    // banners
    if (kick && t >= 35.2) {
      R(8, 118, 116, 30, 11); R(10, 120, 112, 26, 0);
      textC('WELL', 66, 123, 11, 2); textC('CONTROLLED', 66, 135, blink(t, 2) ? 11 : 10, 2);
    }
    if (alarm && blink(t, 3)) { R(0, 0, W, 2, 8); R(0, AH - 2, W, 2, 8); R(0, 0, 2, AH, 8); R(W - 2, 0, 2, AH, 8); }
  }

  // ================================================================ SCENE: BLOWOUT (37..50)
  function sceneBlowout(t) {
    var I = ramp(t, 37.8, 38.3) * (1 - ramp(t, 44.5, 46.0));      // eruption
    var F = ramp(t, 39.4, 40.0) * (1 - ramp(t, 44.8, 49.0));      // fire
    var cut = t >= 44.6;
    var A = 0;
    if (t >= 37.8 && t < 38.6) A = 3; else if (t >= 38.6 && t < 44.3) A = 1.5; else if (t >= 44.3 && t < 44.8) A = 2.5;
    else if (t >= 44.8) A = 1.5 * (1 - ramp(t, 44.8, 46));
    var dx = Math.round(A * Math.sin(t * 97)), dy = Math.round(A * Math.cos(t * 83));
    R(0, 0, W, AH, 0);
    C.save(); C.translate(dx, dy);
    var cx = 62, deck = 70, sea = 86, seabed = 196;
    // sky
    R(0, 0, W, sea, 0);
    R(0, 50, W, 1, 1); R(0, 56, W, 2, 1); R(0, 62, W, sea - 62, 1);
    stars(20, 60, t, 31);
    if (F > 0) {
      for (var gy = 30; gy < sea; gy += 2) if (gy > sea - F * 50) R(0, gy, W, 1, (gy % 4) ? 2 : (blink(t + gy * 0.01, 4) ? 8 : 2));
    }
    // sea
    R(0, sea, W, seabed - sea, 1);
    // pontoons
    R(14, 96, 98, 6, 5); R(14, 96, 98, 1, 6); R(14, 101, 98, 1, 0);
    // seabed + well
    earth(0, W, [[seabed, seabed + 16, 4, 15], [seabed + 16, seabed + 32, 5, 6], [seabed + 32, AH, 13, 1]], 77);
    R(cx - 4, seabed, 8, AH - seabed, 6); R(cx - 2, seabed, 4, AH - seabed, 0);
    // riser
    R(cx - 3, deck + 8, 7, 182 - deck - 8, 6); R(cx - 2, deck + 8, 5, 182 - deck - 8, 4); R(cx - 3, deck + 8, 1, 182 - deck - 8, 7);
    R(cx - 8, 80, 1, 104, 5); R(cx + 8, 80, 1, 104, 5);
    // gas in riser
    if (t < 37.8) {
      for (var i = 0; i < 10; i++) {
        var ph = fract(t * 0.5 + i / 10), yb = 180 - ph * 100, r = Math.round(ph * ph * 2.4);
        bubble(cx + Math.round(Math.sin(i * 3 + t * 4) * (2 - r)), yb, Math.min(r, 2));
      }
      for (i = 0; i < 6; i++) P(cx, seabed + 2 + fract(i / 6 - t * 0.6) * 46, 7);
    } else {
      var Ir = cut ? (1 - ramp(t, 44.6, 45.6)) : 1;
      for (i = 0; i < 18; i++) {
        if (hsh(i + 3) > Ir) continue;
        var yy = 180 - fract(t * 2.6 + i / 18) * 102;
        R(cx - 1 + (i % 3) - 1, yy, 1, 4, i % 2 ? 7 : 6);
      }
      if (!cut) for (i = 0; i < 6; i++) R(cx - 1, seabed + 2 + fract(i / 6 - t * 2) * 46, 2, 3, 7);
      else for (i = 0; i < 6; i++) bubble(cx - 1 + (i % 2) * 2, seabed + 6 + i * 7 + Math.round(Math.sin(t * 3 + i)), 0);
    }
    // small BOP on seabed
    var flashB = (t >= 43.4 && t < 46) && blink(t, 4);
    R(cx - 8, 182, 17, 4, 10); R(cx - 11, 186, 23, 4, flashB ? 7 : 8); R(cx - 11, 190, 23, 3, 9); R(cx - 7, 193, 15, 3, 6);
    R(cx - 8, 182, 17, 1, 7);
    // columns + deck + rig
    R(20, deck + 8, 10, 18, 5); R(94, deck + 8, 10, 18, 5); R(20, deck + 8, 2, 18, 6); R(94, deck + 8, 2, 18, 6);
    waves(sea, sea + 3, t, 1.2);
    // smoke behind
    var S = Math.max(F, ramp(t, 39.4, 40) * (1 - ramp(t, 47, 50)));
    for (i = 0; i < 12; i++) {
      if (hsh(i + 70) > S) continue;
      var age = fract(t * 0.22 + hsh(i));
      var sx = cx + (hsh(i + 1) - 0.5) * 40 + age * 30, sy = 48 - age * 46;
      circ(sx, sy, Math.round(3 + age * 7), i % 3 ? 5 : 0);
    }
    bodyRect(12, deck, 100, 8, 5, 6, 0);
    bodyRect(14, deck - 14, 24, 14, 6, 7, 5);
    R(12, deck - 16, 28, 2, 5);
    for (var wy = 0; wy < 2; wy++) for (var wx = 0; wx < 4; wx++) {
      var lit = F > 0 ? blink(t + wx * 0.13 + wy * 0.3, 5) : true;
      R(17 + wx * 5, deck - 11 + wy * 5, 2, 2, lit ? 10 : 0);
    }
    var drkDraw = function () { derrick(cx, 38, deck, 12, 3, 6, 5); bodyRect(cx - 9, deck - 6, 18, 6, 5, 6, 0); };
    drkDraw();
    R(96, deck - 12, 4, 12, 5); line(98, deck - 12, 120, 42, 6); line(120, 42, 120, 52, 5);
    if (blink(t, 1)) R(cx - 1, 32, 2, 2, 8);
    // eruption
    if (I > 0) {
      var ign = t >= 39.4;
      var Hj = I * (40 + 5 * Math.sin(t * 17));
      for (var yj = 0; yj < Hj; yj += 2) {
        var wj = 2 + Math.floor(hsh(Math.floor(t * 20) + yj) * 3) + Math.floor(yj / 14);
        var cj = ign ? (yj < Hj * 0.35 ? 10 : (yj < Hj * 0.7 ? 9 : 8)) : ((yj + Math.floor(t * 20)) % 4 < 2 ? 4 : 15);
        R(cx - wj, deck - 2 - yj, 2 * wj, 2, cj);
        if (ign && yj < Hj * 0.6) R(cx - 1, deck - 2 - yj, 2, 2, 7);
      }
      for (i = 0; i < 60; i++) {
        if (hsh(i + 4) > I) continue;
        var ag = fract(t / 1.1 + hsh(i)) * 1.1;
        var oy = deck - Hj * (0.55 + 0.45 * hsh(i + 2));
        var vx = (hsh(i + 1) - 0.5) * 80, vy = -18 - 28 * hsh(i + 3);
        var px = cx + vx * ag, py = oy + vy * ag + 60 * ag * ag;
        if (py > sea) continue;
        var pc;
        if (ign && i % 3) pc = ag < 0.3 ? 10 : ag < 0.6 ? 9 : ag < 0.85 ? 8 : 5;
        else pc = (t < 39 || i % 2) ? (hsh(i + 5) < 0.5 ? 4 : 15) : (i % 4 ? 6 : 7);
        R(px, py, 2, 2, pc);
      }
    }
    // fire on deck
    if (F > 0) {
      var fT = Math.floor(t * 10);
      for (var j = 0; j < 30; j++) {
        var fxp = 14 + j * 3.3;
        var dd = Math.abs(fxp - cx);
        var base = F * (5 + 9 * hsh(j * 12.9 + fT * 7.3) + 3 * Math.sin(t * 9 + j)) * (dd < 14 ? 1.8 : 1);
        if (base <= 1) continue;
        var fy = deck;
        R(fxp, fy - base, 3, base, 8);
        R(fxp, fy - base * 0.66, 3, base * 0.66, 9);
        R(fxp + 1, fy - base * 0.33, 2, base * 0.33, 10);
        if ((j + fT) % 3 === 0) P(fxp + 1, fy - base - 2, 9);
      }
      for (i = 0; i < 26; i++) {
        if (hsh(i + 90) > F) continue;
        var ea = fract(t * 0.7 + hsh(i + 11));
        P(18 + hsh(i + 12) * 90 + Math.sin(t * 3 + i) * 3, deck - ea * 64, blink(t + i * 0.1, 4) ? 10 : 9);
      }
      drkDraw();
      // reflections of fire on sea
      for (i = 0; i < 8; i++) R(16 + i * 12 + Math.round(Math.sin(t * 4 + i) * 2), sea + 4 + (i % 3) * 3, 5, 1, blink(t + i * 0.2, 3) ? 9 : 8);
    }

    // ---- inset panel
    var ix = 106, iy = 104, iw = 72, ih = 134, icx = 142;
    R(ix - 2, iy - 2, iw + 4, ih + 4, cut ? 11 : 8); R(ix, iy, iw, ih, 0);
    if (t < 43.3) {
      textC('KICK MISSED', icx, iy + 3, 8);
      textC('GAS EXPANDS', icx, iy + 11, 10);
      textC('LOW P = BIG', icx, iy + 20, 12);
      var ch0 = iy + 28, ch1 = iy + 112;
      R(icx - 18, ch0, 36, ch1 - ch0, 6); R(icx - 16, ch0, 32, ch1 - ch0, 1);
      for (i = 0; i < 6; i++) {
        var fb = fract(t * 0.32 + i / 6);
        var ybb = ch1 - 3 - fb * (ch1 - ch0 - 6);
        var rr = Math.round(1 + fb * fb * 12);
        if (rr > 14) rr = 14;
        if (ybb - rr < ch0) continue;
        bubble(icx + Math.round(Math.sin(fb * 9 + i * 2) * Math.max(0, 13 - rr) * 0.6), ybb, rr);
      }
      textC('HIGH P = SMALL', icx, iy + 115, 14);
      textC('PV = CONST', icx, iy + 124, 6);
    } else {
      if (t < 45.4) textC('EMERGENCY', icx, iy + 3, blink(t, 4) ? 8 : 7);
      else textC('SEALED!', icx, iy + 3, 11);
      textC('BLIND SHEAR RAM', icx, iy + 11, 10);
      var bw = 8, pw = 4, top = iy + 19, bot = iy + ih - 2;
      R(ix, top, iw, bot - top, 1);
      sym(icx, 26, top + 4, top + 24, 10, 7, 9);
      sym(icx, 12, top, top + 4, 6, 7, 5);
      sym(icx, 12, top + 24, top + 30, 6, 7, 5);
      var r0 = top + 30, r1 = top + 58, c0 = top + 38, c1 = top + 50;
      sym(icx, 34, r0, r1, 8, 14, 2);
      R(ix, c0, iw, c1 - c0, 0);
      sym(icx, 12, r1, r1 + 6, 6, 7, 5);
      sym(icx, 30, r1 + 6, r1 + 24, 9, 10, 4);
      R(icx - 29, r1 + 12, 58, 6, 0); R(icx - 29, r1 + 12, 20, 6, 6); R(icx + 9, r1 + 12, 20, 6, 6);
      sym(icx, 18, r1 + 24, bot, 6, 7, 5);
      // bore
      var gasBelow = 4, aboveC = cut ? 1 : 4;
      R(icx - bw, top, 2 * bw, c0 - top, aboveC);
      R(icx - bw, c1, 2 * bw, bot - c1, gasBelow);
      // pipe
      var drop = cut ? Math.round(6 * ease(ramp(t, 44.6, 44.9))) : 0;
      drillPipe(icx, pw, top, c0 + 2, 0, 5);
      drillPipe(icx, pw, c1 - 2 + drop, bot, 0, 5);
      if (!cut) R(icx - pw, c0, 2 * pw, c1 - c0, 6);
      else { R(icx - pw - 1, c0 + 1, 2 * pw + 2, 2, 5); R(icx - pw - 1, c1 - 3 + drop, 2 * pw + 2, 2, 5); }
      // flow particles
      for (i = 0; i < 16; i++) {
        var side = i % 2 ? 1 : -1, xo = pw + 1 + (i % 3);
        var yq = bot - fract(t * (cut ? 0.06 : 1.6) + i / 16) * (bot - top);
        if (cut && yq < c1 + 2) continue;
        var colq = (i % 4) < 2 ? 7 : 15;
        if (cut) bubble(icx + side * (xo + 1), yq, 1); else R(icx + side * xo - (side < 0 ? 1 : 0), yq, 1, 3, colq);
      }
      // shear blades
      var cc = ease(ramp(t, 44.3, 44.6));
      C.save(); C.beginPath(); C.rect(ix, top, iw, bot - top); C.clip();
      var sL = Math.round(lerp(-(bw + 1), bw - 2, cc)), bl = bw, half = (c1 - c0) >> 1, len = 36;
      R(icx + sL - bl - len, c0, len, c1 - c0, 6); R(icx + sL - bl - len, c0, len, 1, 7); R(icx + sL - bl - len, c1 - 1, len, 1, 5);
      R(icx + sL - bl, c0, bl, half, 7); R(icx + sL - 1, c0, 1, half, 6);
      R(icx - sL + bl, c0, len, c1 - c0, 6); R(icx - sL + bl, c0, len, 1, 7); R(icx - sL + bl, c1 - 1, len, 1, 5);
      R(icx - sL, c0 + half, bl, c1 - c0 - half, 7); R(icx - sL, c0 + half, 1, c1 - c0 - half, 6);
      if (cut) { R(icx - bw - 2, c0 - 1, 2 * bw + 4, 1, 0); R(icx - bw - 2, c1, 2 * bw + 4, 1, 0); }
      C.restore(); cur = -1;
      // sparks
      if (t >= 44.45 && t < 45.1) {
        var st = t - 44.45;
        for (i = 0; i < 14; i++) {
          var an = hsh(i + 200) * Math.PI * 2, ds = st * 70 * (0.4 + hsh(i + 201));
          R(icx + Math.cos(an) * ds, c0 + half + Math.sin(an) * ds * 0.7, 2, 1, i % 2 ? 10 : 7);
        }
        if (cut) label('CUT!', icx + 12, c0 - 9, 10);
      }
      label('SHEAR', ix + 2, r0 + 2, 7, 8);
      if (t >= 45.4) { label('SEAL', ix + 2, c1 + 2, 11); label('FLOW STOP', ix + 2, top + 2, 11); }
      else label('FLOW', ix + 2, top + 2, 7);
    }
    C.restore(); cur = -1;
    // overlays (not shaken)
    if (t >= 37 && t < 38) { textOC('IF A KICK IS', 90, 4, 7, 0, 1); textOC('MISSED...', 90, 11, 7, 0, 1); }
    if (t >= 38 && t < 43.3) textOC('BLOWOUT!', 90, 4, blink(t, 4) ? 8 : 10, 0, 3);
    if (t >= 43.3 && t < 45.4) textOC('SHEAR RAM!', 90, 6, blink(t, 4) ? 8 : 7, 0, 2);
    if (t >= 47.2) { R(14, 2, 152, 16, 11); R(16, 4, 148, 12, 0); textC('WELL SECURED', 90, 5, blink(t, 2) ? 11 : 10, 2); }
    if (t >= 38 && t < 43.3 && blink(t, 4)) { R(0, 0, W, 3, 8); R(0, AH - 3, W, 3, 8); R(0, 0, 3, AH, 8); R(W - 3, 0, 3, AH, 8); }
  }

  // ================================================================ SCENE: SUMMARY (50..59.5)
  function sceneSummary(t) {
    R(0, 0, W, AH, 1);
    for (var gy = 4; gy < AH; gy += 8) for (var gx = 4; gx < W; gx += 8) P(gx, gy, 0);
    R(0, 0, W, 14, 0);
    textC('WELL CONTROL', 90, 2, 10, 2);
    var heads = ['DETECT', 'SHUT IN', 'KILL'];
    var subs = [['WATCH PIT', 'LEVEL AND', 'MUD FLOW'], ['CLOSE THE', 'ANNULAR AND', 'PIPE RAMS'], ['PUMP HEAVY', 'MUD, GAS OUT', 'VIA CHOKE']];
    var actI = -1;
    for (var i = 0; i < 3; i++) {
      var ta = 50.6 + i * 2.2;
      if (t < ta) continue;
      actI = i;
      var off = Math.round((1 - ease(ramp(t, ta, ta + 0.35))) * 190);
      var y = 20 + i * 68, x = 6 + off;
      var act = (i === 2 && t > 57) ? false : (t < ta + 2.2);
      R(x, y, 168, 60, act && blink(t, 2) ? 10 : 6); R(x + 2, y + 2, 164, 56, 0);
      R(x + 4, y + 4, 56, 52, 1);
      var ix = x + 32, lt = t - ta;
      if (i === 0) {   // DETECT: pit tank rising + beacon
        R(ix - 14, y + 14, 28, 38, 6); R(ix - 13, y + 14, 26, 37, 0);
        var lvl = Math.round((0.25 + 0.6 * fract(lt / 2)) * 35);
        R(ix - 13, y + 51 - lvl, 26, lvl, 4); R(ix - 13, y + 51 - lvl, 26, 1, 15);
        if (blink(t, 2)) text('^', ix + 16, y + 30, 8, 1);
        R(ix + 13, y + 14, 8, 3, 5);
        R(ix + 14, y + 10, 6, 4, blink(t, 3) ? 8 : 2);
        if (blink(t, 3)) { P(ix + 12, y + 9, 8); P(ix + 22, y + 9, 8); P(ix + 17, y + 7, 8); }
        text('PIT', ix - 13, y + 7, 6);
      } else if (i === 1) { // SHUT IN: mini BOP closing
        var c = ease(cl01(fract(lt / 2.2) * 3));
        R(ix - 4, y + 6, 8, 48, 4);
        sym(ix, 22, y + 20, y + 38, 8, 14, 2);
        R(ix - 24, y + 26, 48, 6, 0);
        R(ix - 4, y + 6, 8, 14, 4); R(ix - 4, y + 38, 8, 16, 4);
        R(ix - 2, y + 6, 4, 48, 6); R(ix - 1, y + 6, 1, 48, 7);
        var tip = Math.round(lerp(5, 2, c));
        R(ix - tip - 16, y + 26, 16, 6, 6); R(ix + tip, y + 26, 16, 6, 6);
        R(ix - tip - 1, y + 26, 1, 6, 0); R(ix + tip, y + 26, 1, 6, 0);
        for (var b = 0; b < 3; b++) {
          var by = y + 52 - fract(lt * 0.8 + b / 3) * (c > 0.9 ? 12 : 46);
          bubble(ix + (b - 1) * 3, by, 0);
        }
        R(ix + 16, y + 6, 10, 3, c > 0.5 ? 2 : 8); R(ix + 15, y + 9, 12, 2, 5);
      } else {            // KILL: pump + heavy mud going down
        R(ix - 26, y + 8, 18, 14, 5); R(ix - 26, y + 8, 18, 1, 6);
        var ang = lt * 6;
        circ(ix - 17, y + 15, 4, 6); circ(ix - 17, y + 15, 2, 0);
        R(ix - 17 + Math.round(Math.cos(ang) * 3), y + 15 + Math.round(Math.sin(ang) * 3), 2, 2, 9);
        R(ix - 8, y + 13, 14, 4, 6); R(ix - 8, y + 14, 14, 2, 9);
        R(ix + 2, y + 13, 8, 42, 6); R(ix + 4, y + 17, 4, 38, 4);
        var fr = fract(lt / 2) * 38;
        R(ix + 4, y + 17, 4, fr, 9);
        R(ix + 4, y + 15, 4, 2, 9);
        text('~', ix + 12, y + 24 + (Math.floor(t * 5) % 3), 9);
        // gauge
        circ(ix - 14, y + 42, 9, 6); circ(ix - 14, y + 42, 8, 0);
        R(ix - 22, y + 42, 8, 1, 8); R(ix - 14, y + 42, 8, 1, 11);
        var na = Math.PI * (1 - 0.85 * ease(cl01(fract(lt / 2) * 1.6)));
        line(ix - 14, y + 42, ix - 14 + Math.round(Math.cos(na) * 7), y + 42 - Math.round(Math.sin(na) * 7), 10);
        R(ix - 24, y + 43, 21, 9, 1);
        text('OK', ix - 18, y + 46, fract(lt / 2) > 0.6 ? 11 : 5);
      }
      R(x + 64, y + 6, 11, 13, 8); R(x + 64, y + 6, 11, 1, 14);
      text(String(i + 1), x + 67, y + 8, 7, 2);
      text(heads[i], x + 79, y + 8, 10, 2);
      for (var k = 0; k < 3; k++) text(subs[i][k], x + 66, y + 26 + k * 9, 6);
      if (i < 2 && t > ta + 1.2) text('~', 88, y + 61, blink(t, 2) ? 10 : 5, 1);
    }
    if (t >= 57) {
      R(4, 226, 172, 15, 11); R(5, 227, 170, 13, 0);
      textC('THE BOP = LAST LINE', 90, 228, 10);
      textC('OF DEFENSE', 90, 234, 7);
    }
  }

  // ================================================================ DISPATCH
  function draw(ctx, t) {
    C = ctx; cur = -1;
    t = ((t % 60) + 60) % 60;
    var cov = 0;
    if (t >= 59.5) sceneTitle(t - 60);
    else if (t < 6) sceneTitle(t);
    else if (t < 16) sceneAnatomy(t);
    else if (t < 37) sceneWell(t);
    else if (t < 50) sceneBlowout(t);
    else sceneSummary(t);
    var B = [6, 16, 37, 50];
    for (var i = 0; i < B.length; i++) {
      var d = Math.abs(t - B[i]);
      if (d < 0.25) cov = Math.max(cov, 1 - d / 0.25);
    }
    if (t >= 59 && t < 59.5) cov = (t - 59) / 0.5;
    else if (t >= 59.5) cov = (60 - t) / 0.5;
    dissolve(cov);
    // caption band (covered by HTML captions) - keep plain dark
    R(0, AH, W, H - AH, 0);
    R(0, AH, W, 1, 1);
  }

  // ================================================================ CUES + CAPTIONS
  var cues = [
    { t: 7.5, sfx: 'blip' }, { t: 9.5, sfx: 'blip' }, { t: 12.0, sfx: 'blip' }, { t: 14.0, sfx: 'blip' },
    { t: 16.5, sfx: 'pump' },
    { t: 25.0, sfx: 'kick' }, { t: 26.5, sfx: 'alarm' }, { t: 27.5, sfx: 'blip' },
    { t: 28.0, sfx: 'close' }, { t: 29.3, sfx: 'close' },
    { t: 30.6, sfx: 'pump' }, { t: 32.6, sfx: 'pump' }, { t: 35.2, sfx: 'success' },
    { t: 37.8, sfx: 'boom' }, { t: 39.4, sfx: 'fire' }, { t: 41.5, sfx: 'fire' },
    { t: 43.3, sfx: 'alarm' }, { t: 44.3, sfx: 'close' }, { t: 47.2, sfx: 'success' },
    { t: 50.6, sfx: 'blip' }, { t: 52.8, sfx: 'blip' }, { t: 55.0, sfx: 'blip' }
  ];
  var captions = [
    { t0: 0, t1: 3, th: 'BOP อุปกรณ์ป้องกันการพลุ่ง ด่านสุดท้ายของความปลอดภัยในงานขุดเจาะ', en: 'The Blowout Preventer: drilling\'s last line of defense.' },
    { t0: 3, t1: 6, th: 'BOP คือวาล์วนิรภัยขนาดใหญ่ ติดอยู่บนปากหลุมเจาะ', en: 'A BOP is a giant safety valve on top of the well.' },
    { t0: 6, t1: 9.5, th: 'ในทะเล BOP ตั้งบนปากหลุมที่พื้นทะเล ต่อท่อ Riser ขึ้นไปยังแท่นเจาะ ส่วนบนคือ Annular', en: 'Offshore it sits on the seabed wellhead; a riser links it to the rig.' },
    { t0: 9.5, t1: 12, th: 'Annular คือยางรูปโดนัท บีบปิดรอบก้านเจาะได้ทุกรูปทรง', en: 'Annular: a rubber donut that squeezes around any pipe.' },
    { t0: 12, t1: 16, th: 'Blind Shear Ram ตัดก้านเจาะได้ Pipe Ram ปิดรอบก้านเจาะ ข้างๆ มีท่อ Choke และ Kill', en: 'Shear rams cut, pipe rams grip; choke & kill lines on the side.' },
    { t0: 16, t1: 20, th: 'น้ำโคลน (Mud) ถูกสูบลงในก้านเจาะ แล้วไหลกลับขึ้นทาง Annulus', en: 'Mud goes down the drill pipe and back up the annulus.' },
    { t0: 20, t1: 24, th: 'แรงดันน้ำโคลน > แรงดันชั้นหิน = หลุมปลอดภัย', en: 'Mud pressure > formation pressure = safe well.' },
    { t0: 24, t1: 27, th: 'Kick! ก๊าซจากชั้นหินแรงดันสูงไหลเข้าหลุม ระดับโคลนในบ่อเพิ่มขึ้น', en: 'KICK! High-pressure gas enters the well; the pit level rises.' },
    { t0: 27, t1: 30.5, th: 'ปิดหลุม: Annular ปิดรอบก้านเจาะ ตามด้วย Pipe Ram', en: 'Shut in: annular closes on the pipe, then the pipe rams.' },
    { t0: 30.5, t1: 34, th: 'สูบน้ำโคลนหนัก (Kill Mud) ไล่ก๊าซออกทาง Choke', en: 'Pump heavy kill mud; circulate the gas out the choke.' },
    { t0: 34, t1: 37, th: 'แรงดันกลับมาสมดุล ควบคุมหลุมได้แล้ว!', en: 'Pressure balanced again - well under control!' },
    { t0: 37, t1: 40.5, th: 'ถ้าตรวจไม่พบ Kick... ก๊าซจะขยายตัวมากขึ้นเรื่อยๆ ขณะลอยขึ้น', en: 'If a kick is missed, the gas expands as it rises...' },
    { t0: 40.5, t1: 44, th: 'Blowout = Kick ที่ควบคุมไม่ได้ ก๊าซพุ่งขึ้นสู่แท่นเจาะและลุกเป็นไฟ', en: 'Blowout: an uncontrolled kick erupts on the rig and ignites.' },
    { t0: 44, t1: 47, th: 'ฉุกเฉิน! Blind Shear Ram ตัดก้านเจาะและปิดผนึกหลุม', en: 'Emergency! Blind shear rams cut the pipe and seal the well.' },
    { t0: 47, t1: 50, th: 'การไหลหยุดลง ไฟค่อยๆ ดับ หลุมปลอดภัยแล้ว', en: 'Flow stops, the fire dies out - well secured.' },
    { t0: 50, t1: 53, th: 'สรุป 1) ตรวจจับ: สังเกตระดับโคลนในบ่อและอัตราการไหล', en: '1) DETECT: watch pit volume and mud flow.' },
    { t0: 53, t1: 56.5, th: '2) ปิดหลุมด้วย BOP  3) สูบโคลนหนักเพื่อฆ่าหลุม (Kill)', en: '2) SHUT IN with the BOP. 3) KILL with heavy mud.' },
    { t0: 56.5, t1: 60, th: 'BOP ปกป้องคน แท่นเจาะ และท้องทะเล', en: 'The BOP protects people, the rig and the ocean.' }
  ];

  var root = (typeof window !== 'undefined') ? window : this;
  root.BOPScenes = { draw: draw, cues: cues, captions: captions, W: W, H: H };
})();
