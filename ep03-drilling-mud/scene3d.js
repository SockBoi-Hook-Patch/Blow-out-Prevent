// scene3d.js — namman.story EP03 "น้ำโคลนเจาะ (Drilling Mud)" — low-poly 3D explainer, 120 s, 1080x1920.
// Contract: see SPEC.md (+ ../bop-3d/SPEC.md). renderFrame(t) / drawOverlay(ctx,t) are pure functions of t.
// Calmer pacing than EP02: captions 5–8 s, labels held ≥3 s, max 2 new labels at once, camera holds on key views.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DURATION = 120;
let THREE, renderer, scene, camera;
let W = 1080, H = 1920;

// world sets (far apart; only the active one is visible)
const OFF = { L: [0, 0, 0], W: [5000, 0, 0], T: [0, 0, -5000] };

// ---------------------------------------------------------------- math utils
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, u) => a + (b - a) * u;
const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const eio = u => { u = clamp(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
const eout = u => 1 - Math.pow(1 - clamp(u), 3);
const fract = x => x - Math.floor(x);
const hash = (i, k = 0) => fract(Math.sin(i * 127.1 + k * 311.7 + 0.123) * 43758.5453);
const win = (t, a, b, fi = 0.3, fo = 0.3) => Math.min(sstep(a, a + fi, t), 1 - sstep(b - fo, b, t));
const pwl = (pts, t) => {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) if (t < pts[i + 1][0]) return lerp(pts[i][1], pts[i + 1][1], sstep(pts[i][0], pts[i + 1][0], t));
  return pts[pts.length - 1][1];
};
// piecewise-linear rate -> exact integral from pts[0][0] to t
function pwlIntegral(pts, t) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, r0] = pts[i], [t1, r1] = pts[i + 1];
    if (t <= t0) break;
    const te = Math.min(t, t1), u = (te - t0) / (t1 - t0);
    const re = r0 + (r1 - r0) * u;
    acc += (te - t0) * (r0 + re) / 2;
    if (t <= t1) return acc;
  }
  const last = pts[pts.length - 1];
  if (t > last[0]) acc += (t - last[0]) * last[1];
  return acc;
}
// monotone cubic Hermite through keyframes {t, v:[...], stop?}
function track(keys, t) {
  const n = keys.length;
  if (t <= keys[0].t) return keys[0].v.slice();
  if (t >= keys[n - 1].t) return keys[n - 1].v.slice();
  let i = 0; while (t >= keys[i + 1].t) i++;
  const k0 = keys[i], k1 = keys[i + 1], dt = k1.t - k0.t, s = (t - k0.t) / dt;
  const tan = (j, c) => {
    if (j === 0 || j === n - 1 || keys[j].stop) return 0;
    const a = keys[j - 1], b = keys[j], d = keys[j + 1];
    const d0 = (b.v[c] - a.v[c]) / (b.t - a.t), d1 = (d.v[c] - b.v[c]) / (d.t - b.t);
    if (d0 * d1 <= 0) return 0;
    let m = (d.v[c] - a.v[c]) / (d.t - a.t);
    const lim = 3 * Math.min(Math.abs(d0), Math.abs(d1));
    if (Math.abs(m) > lim) m = Math.sign(m) * lim;
    return m;
  };
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  return k0.v.map((v0, c) => h00 * v0 + h10 * dt * tan(i, c) + h01 * k1.v[c] + h11 * dt * tan(i + 1, c));
}

// ---------------------------------------------------------------- palette
const HEX = {
  mud: '#c8925a', safe: '#22c55e', danger: '#ef4444', lost: '#f97316', ink: '#0f172a', flow: '#ffd166',
  pump: '#3b82f6', shaker: '#14b8a6', barite: '#ef4444', bent: '#a16207', mwd: '#22d3ee', cake: '#7c4a22',
  wbm: '#3b82f6', obm: '#f59e0b', sbm: '#22c55e', pore: '#ef4444', frac: '#f97316',
};

// ---------------------------------------------------------------- builders
const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...o });
const basic = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o });
function add(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r, h, s = 12, open = false, r2 = r) => new THREE.CylinderGeometry(r2, r, h, s, 1, open);
function cylBetween(a, b, r, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}
function xCyl(r, len, seg = 12) { const g = cyl(r, len, seg); g.rotateZ(Math.PI / 2); return g; }
function zCyl(r, len, seg = 12) { const g = cyl(r, len, seg); g.rotateX(Math.PI / 2); return g; }
function strip(geos) { return mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g)); }
const _c = { a: null };
function setEm(m, ...pairs) {
  m.emissive.setRGB(0, 0, 0);
  for (let i = 0; i < pairs.length; i += 2) if (pairs[i + 1] > 0.001) { _c.a.setHex(pairs[i]).multiplyScalar(pairs[i + 1]); m.emissive.add(_c.a); }
}
function lattice(H0, HT, b0, b1, lv, rc = 0.35, rh = 0.18, rd = 0.13) {
  const geos = [];
  const P = (sx, sz, k) => { const u = k / lv, b = lerp(b0, b1, u); return [sx * b, H0 + HT * u, sz * b]; };
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) geos.push(cylBetween(P(sx, sz, 0), P(sx, sz, lv), rc, 5));
  for (let k = 0; k <= lv; k++) for (let c = 0; c < 4; c++) {
    const [ax, az] = corners[c], [bx, bz] = corners[(c + 1) % 4];
    geos.push(cylBetween(P(ax, az, k), P(bx, bz, k), rh, 4));
    if (k < lv) geos.push(cylBetween(P(ax, az, k), P(bx, bz, k + 1), rd, 4));
  }
  return strip(geos);
}
// pipe run through a list of points (cylinders + elbow balls)
function pipeRun(pts, r, seg = 8) {
  const g = [];
  for (let i = 0; i < pts.length - 1; i++) g.push(cylBetween(pts[i], pts[i + 1], r, seg));
  for (let i = 1; i < pts.length - 1; i++) g.push(new THREE.SphereGeometry(r * 1.12, seg, 4).translate(...pts[i]));
  return strip(g);
}
// arc-length polyline sampler
class Poly {
  constructor(pts) {
    this.p = pts.map(a => new THREE.Vector3(...a)); this.c = [0];
    for (let i = 1; i < this.p.length; i++) this.c.push(this.c[i - 1] + this.p[i].distanceTo(this.p[i - 1]));
    this.L = this.c[this.c.length - 1];
  }
  at(s, out, tan) {
    s = clamp(s, 0, this.L);
    let i = 0; while (i < this.c.length - 2 && s > this.c[i + 1]) i++;
    const u = (s - this.c[i]) / Math.max(1e-6, this.c[i + 1] - this.c[i]);
    out.lerpVectors(this.p[i], this.p[i + 1], u);
    if (tan) tan.subVectors(this.p[i + 1], this.p[i]).normalize();
    return out;
  }
}

// ---- textures (incl. namman.story easter eggs)
function fitFont(x, text, weight, max, maxW) {
  let sz = max; x.font = `${weight} ${sz}px Kanit, sans-serif`;
  while (x.measureText(text).width > maxW && sz > 10) { sz -= 2; x.font = `${weight} ${sz}px Kanit, sans-serif`; }
  return sz;
}
function canvasTex(c) {
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = renderer.capabilities.getMaxAnisotropy(); tx.needsUpdate = true;
  return tx;
}
function grime(x, w, h, n, k, a = 0.25) {
  for (let i = 0; i < n; i++) {
    x.globalAlpha = 0.08 + hash(i, k) * a; x.fillStyle = hash(i, k + 1) < 0.5 ? '#2a1a0a' : '#ffffff';
    x.beginPath(); x.arc(hash(i, k + 2) * w, hash(i, k + 3) * h, 1 + hash(i, k + 4) * 3.5, 0, 7); x.fill();
  }
  x.globalAlpha = 1;
}
// stencil on the mud tank side (easter egg #1)
function tankStencilTex() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#4f6075'; x.fillRect(0, 0, 1024, 256);
  const gr = x.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(1, 'rgba(40,20,0,0.25)');
  x.fillStyle = gr; x.fillRect(0, 0, 1024, 256);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#f4f1e6';
  fitFont(x, 'namman.story', 600, 150, 900); x.fillText('namman.story', 512, 100);
  x.fillStyle = '#4f6075'; x.fillRect(30, 96, 964, 6); // stencil bridges
  x.fillStyle = '#ffd23f'; fitFont(x, 'MUD TANK 2 · 400 BBL', 600, 50, 760); x.fillText('MUD TANK 2 · 400 BBL', 512, 205);
  grime(x, 1024, 256, 500, 401, 0.3);
  x.globalAlpha = 0.35; x.fillStyle = '#6b4423';
  for (let i = 0; i < 16; i++) x.fillRect(hash(i, 410) * 1010, 0, 6 + hash(i, 411) * 10, 30 + hash(i, 412) * 120); // mud splashes / drips
  return canvasTex(c);
}
// big front label on a standing barite sack (easter egg #2)
function sackLabelTex() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 768;
  const x = c.getContext('2d');
  x.fillStyle = '#f3f4f1'; x.fillRect(0, 0, 512, 768);
  x.globalAlpha = 0.08; x.fillStyle = '#000';
  for (let i = 0; i < 64; i++) { x.fillRect(0, i * 12, 512, 2); x.fillRect(i * 12, 0, 2, 768); } // woven bag
  x.globalAlpha = 1;
  x.fillStyle = '#d62828'; x.fillRect(0, 70, 512, 150);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffffff';
  fitFont(x, 'BARITE', 600, 120, 460); x.fillText('BARITE', 256, 148);
  x.fillStyle = '#1f2937'; fitFont(x, 'แบไรต์ · เพิ่มน้ำหนัก', 600, 40, 440); x.fillText('แบไรต์ · เพิ่มน้ำหนัก', 256, 270);
  x.fillStyle = '#d62828'; x.fillRect(60, 320, 392, 6);
  x.fillStyle = '#111827'; fitFont(x, 'namman.story', 600, 84, 440); x.fillText('namman.story', 256, 410);
  x.fillStyle = '#374151'; fitFont(x, 'DRILLING GRADE · API 13A', 600, 32, 430); x.fillText('DRILLING GRADE · API 13A', 256, 490);
  x.fillStyle = '#111827'; fitFont(x, '50 KG', 600, 96, 400); x.fillText('50 KG', 256, 600);
  x.fillStyle = '#d62828'; x.fillRect(0, 690, 512, 40);
  grime(x, 512, 768, 260, 421, 0.18);
  return canvasTex(c);
}
function sackTex(kind) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const x = c.getContext('2d');
  const bar = kind === 'B';
  x.fillStyle = bar ? '#eef0ec' : '#c9a46b'; x.fillRect(0, 0, 256, 96);
  x.fillStyle = bar ? '#d62828' : '#2f6b2f'; x.fillRect(0, 0, 256, 18); x.fillRect(0, 78, 256, 18);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = bar ? '#b91c1c' : '#1f4d1f';
  const s = bar ? 'BARITE' : 'BENTONITE';
  fitFont(x, s, 600, 46, 236); x.fillText(s, 128, 50);
  grime(x, 256, 96, 60, bar ? 431 : 441, 0.2);
  return canvasTex(c);
}
function swirlTex() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#8a5a30'; x.fillRect(0, 0, 512, 512);
  x.translate(256, 256);
  for (let k = 0; k < 7; k++) {
    x.beginPath();
    for (let a = 0; a < 12; a += 0.05) { const r = 8 + a * 22; x.lineTo(Math.cos(a + k * 0.9) * r, Math.sin(a + k * 0.9) * r); }
    x.strokeStyle = k % 2 ? 'rgba(196,140,84,0.55)' : 'rgba(80,46,20,0.45)'; x.lineWidth = 10 + (k % 3) * 6; x.stroke();
  }
  for (let i = 0; i < 160; i++) {
    const a = hash(i, 451) * 7, r = 20 + hash(i, 452) * 240;
    x.globalAlpha = 0.25 + hash(i, 453) * 0.4; x.fillStyle = '#e8c79a';
    x.beginPath(); x.arc(Math.cos(a) * r, Math.sin(a) * r, 2 + hash(i, 454) * 5, 0, 7); x.fill();
  }
  const t = canvasTex(c); t.center.set(0.5, 0.5); return t;
}
function screenTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#3b4250'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#a7b0bf'; x.lineWidth = 2;
  for (let i = 0; i <= 256; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
  x.fillStyle = 'rgba(140,90,48,0.55)'; x.fillRect(0, 0, 256, 120); // mud pool at the feed end
  const t = canvasTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t;
}

// ---------------- human figure (~1.8 m)
function buildHuman(suit = 0xf97316, hat = 0xffffff) {
  const g = new THREE.Group();
  const suitG = [box(0.17, 0.86, 0.2).translate(-0.1, 0.43, 0), box(0.17, 0.86, 0.2).translate(0.1, 0.43, 0),
    box(0.44, 0.62, 0.26).translate(0, 1.17, 0), box(0.12, 0.6, 0.14).translate(-0.29, 1.14, 0), box(0.12, 0.6, 0.14).translate(0.29, 1.14, 0)];
  const skinG = [new THREE.IcosahedronGeometry(0.13, 1).translate(0, 1.6, 0)];
  const hatG = [new THREE.SphereGeometry(0.15, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.65, 0), cyl(0.19, 0.03, 10).translate(0, 1.66, 0)];
  add(g, strip(suitG), lam(suit)); add(g, strip(skinG), lam(0xd9a273)); add(g, strip(hatG), lam(hat));
  add(g, box(0.45, 0.06, 0.27), lam(0xf8fafc, { emissive: 0x555555 }), 0, 1.0, 0);
  return g;
}

// ---------------- sky dome
function makeSky(cTop, cMid, cHor, cLow) {
  const sky = new THREE.SphereGeometry(2500, 32, 16);
  const sc = [], sp = sky.attributes.position;
  const T = new THREE.Color(cTop), M = new THREE.Color(cMid), Hh = new THREE.Color(cHor), Lw = new THREE.Color(cLow);
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i) / 2500; const c = new THREE.Color();
    if (y < 0) c.copy(Hh).lerp(Lw, clamp(-y * 6));
    else if (y < 0.18) c.copy(Hh).lerp(M, y / 0.18);
    else c.copy(M).lerp(T, clamp((y - 0.18) / 0.5));
    sc.push(c.r, c.g, c.b);
  }
  sky.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  const m = new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10; return m;
}

// ---------------------------------------------------------------- state
const O = {};

// ---------------------------------------------------------------- LAND set (rig + mud system)
// layout: rig at origin (floor y 7.2), mud tanks A/B/C along +x (z -7..-1), triplex pump at z 7.2
const TANKS = [{ x0: 9.5, x1: 15.0 }, { x0: 15.5, x1: 21.0 }, { x0: 21.5, x1: 27.0 }];
const TZ0 = -7, TZ1 = -1, TH = 3.0, MUDY = 2.55;
const HOSE_CTRL = [[4.7, 23.5, 1.5], [4.6, 24.15, 1.5], [4.25, 23.7, 1.45], [3.5, 19.2, 1.25], [2.6, 17.2, 0.95],
  [1.5, 18.4, 0.6], [0.75, 21.4, 0.25], [0.45, 22.45, 0.1], [0.0, 22.35, 0.0]];
function hosePts() {
  const cv = new THREE.CatmullRomCurve3(HOSE_CTRL.map(p => new THREE.Vector3(...p)));
  return cv.getPoints(26).map(v => [v.x, v.y, v.z]);
}
const DN_PRE = [[24.0, 2.8, -4.2], [24.0, 2.8, -1.8], [24.0, 0.7, -1.4], [24.0, 0.7, 4.4], [21.25, 0.7, 4.4], [21.25, 0.62, 7.2],
  [21.6, 1.4, 7.2], [21.0, 1.85, 7.2], [20.3, 1.85, 7.2], [20.3, 0.45, 7.2], [8.0, 0.45, 7.2], [8.0, 0.45, 1.5], [8.0, 7.75, 1.5],
  [4.7, 7.75, 1.5]];
const RET_PTS = [[0, 4.8, 0], [0, 6.0, 0], [0.4, 6.0, -0.4], [10.75, 5.15, -4.9], [11.4, 5.1, -4.9], [12.25, 4.95, -4.1],
  [12.25, 4.45, -1.6], [12.25, 2.8, -2.4], [14.2, 2.8, -3.6], [15.25, 3.3, -3.8], [16.5, 2.8, -3.8], [20.0, 2.8, -3.2],
  [21.25, 3.3, -3.4], [22.4, 2.8, -3.8], [24.0, 2.8, -4.2]];

function buildSurfaceBOP(G) {
  const g = new THREE.Group(); g.position.set(0, -2.4, 0); G.add(g);
  const body = lam(0xcbd5e1), conn = lam(0x8b5cf6), pipe = lam(0x3b82f6), shear = lam(0xef4444), ann = lam(0xf59e0b), nip = lam(0x9ca3af);
  add(g, cyl(0.5, 0.5, 12), lam(0x94a3b8), 0, 0.25, 0);
  add(g, cyl(0.68, 0.16, 14), conn, 0, 0.58, 0);
  add(g, cyl(0.42, 0.62, 12), body, 0, 0.97, 0);
  add(g, box(1.25, 0.66, 0.95), body, 0, 1.73, 0);
  add(g, box(1.25, 1.36, 0.95), body, 0, 2.86, 0);
  for (const [yc, m] of [[1.73, pipe], [2.52, pipe], [3.2, shear]]) for (const s of [1, -1]) add(g, xCyl(0.29, 0.72, 12), m, s * 0.98, yc, 0);
  const prof = [[0.35, 3.64], [0.78, 3.64], [0.86, 3.86], [0.84, 4.42], [0.7, 4.68], [0.46, 4.8], [0.33, 4.82]].map(([r, y]) => new THREE.Vector2(r, y));
  add(g, new THREE.LatheGeometry(prof, 14), ann);
  add(g, cyl(0.36, 0.5, 12), nip, 0, 5.05, 0);
  add(g, cyl(0.3, 3.7, 10), nip, 0, 7.1, 0); // riser / bell nipple up to the flowline
  add(g, cyl(0.42, 0.5, 10), nip, 0, 8.4, 0);
}

function buildLand(G) {
  O.skyL = makeSky(0x1f2a63, 0x9a4f86, 0xffab6b, 0x7a5a44); G.add(O.skyL);
  const sunDir = new THREE.Vector3(-0.62, 0.05, -0.78).normalize();
  O.sunL = add(G, new THREE.CircleGeometry(60, 28), basic(0xfff1c9, { fog: false }), ...sunDir.clone().multiplyScalar(2300).toArray());
  O.sunL.lookAt(0, 0, 0);
  const sg2 = add(G, new THREE.CircleGeometry(240, 28), basic(0xffb27a, { fog: false, transparent: true, opacity: 0.35, depthWrite: false }), ...sunDir.clone().multiplyScalar(2320).toArray());
  sg2.lookAt(0, 0, 0);
  // drill pad with cellar opening
  const pad = new THREE.Shape(); pad.moveTo(-45, -45); pad.lineTo(45, -45); pad.lineTo(45, 45); pad.lineTo(-45, 45); pad.closePath();
  const hole = new THREE.Path(); hole.moveTo(-2.5, -2.5); hole.lineTo(-2.5, 2.5); hole.lineTo(2.5, 2.5); hole.lineTo(2.5, -2.5); hole.closePath();
  pad.holes.push(hole);
  const pg = new THREE.ExtrudeGeometry(pad, { depth: 0.6, bevelEnabled: false }); pg.rotateX(-Math.PI / 2); pg.translate(0, -0.6, 0);
  add(G, pg, lam(0xcdb48a));
  // desert terrain
  const tg = new THREE.PlaneGeometry(2400, 2400, 56, 56); tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i), r = Math.hypot(x, z);
    const n = Math.sin(x * 0.012) * Math.cos(z * 0.01) * 9 + Math.sin(x * 0.031 + z * 0.023) * 3.5 + (hash(i, 3) - 0.5) * 1.5;
    tp.setY(i, -0.35 + n * sstep(80, 260, r));
  }
  add(G, tg, lam(0xe0b47e));
  const mesa = [];
  for (let i = 0; i < 16; i++) {
    const a = hash(i, 11) * Math.PI * 2, r = 600 + hash(i, 12) * 600, s = 40 + hash(i, 13) * 70;
    const q = new THREE.CylinderGeometry(s * 0.7, s, s * (0.5 + hash(i, 14) * 0.5), 6); q.rotateY(hash(i, 15) * 3);
    mesa.push(q.translate(Math.cos(a) * r, s * 0.2, Math.sin(a) * r));
  }
  add(G, strip(mesa), lam(0xb9774c));
  const scrub = [], rocks = [];
  for (let i = 0; i < 70; i++) {
    const a = hash(i, 21) * Math.PI * 2, r = 55 + hash(i, 22) * 220;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (hash(i, 23) < 0.6) scrub.push(new THREE.IcosahedronGeometry(0.8 + hash(i, 24) * 1.2, 0).scale(1, 0.6, 1).translate(x, 0.2, z));
    else rocks.push(new THREE.DodecahedronGeometry(0.8 + hash(i, 25) * 2.2, 0).scale(1, 0.6, 1.1).translate(x, 0, z));
  }
  add(G, strip(scrub), lam(0x7d8f52)); add(G, strip(rocks), lam(0xa57e5c));
  // cellar
  const conc = lam(0x9ca3af);
  add(G, box(5, 0.2, 5), lam(0x7b8794), 0, -2.5, 0);
  add(G, strip([box(5, 2.4, 0.3).translate(0, -1.2, -2.35), box(5, 2.4, 0.3).translate(0, -1.2, 2.35),
    box(0.3, 2.4, 5).translate(-2.35, -1.2, 0), box(0.3, 2.4, 5).translate(2.35, -1.2, 0)]), conc);
  buildSurfaceBOP(G);
  // substructure
  const sgm = [];
  for (const sx of [-1, 1]) {
    const xs = [sx * 3.4, sx * 6.6];
    for (const x of xs) for (const z of [-7, 0, 7]) sgm.push(cylBetween([x, 0, z], [x, 6.5, z], 0.22, 5));
    for (const x of xs) for (const y of [0.15, 6.4]) sgm.push(cylBetween([x, y, -7], [x, y, 7], 0.18, 4));
    for (const x of xs) for (const [z0, z1] of [[-7, 0], [0, 7]]) { sgm.push(cylBetween([x, 0.2, z0], [x, 6.4, z1], 0.13, 4)); sgm.push(cylBetween([x, 6.4, z0], [x, 0.2, z1], 0.13, 4)); }
    for (const z of [-7, 7]) for (const y of [0.15, 6.4]) sgm.push(cylBetween([xs[0], y, z], [xs[1], y, z], 0.16, 4));
  }
  add(G, strip(sgm), lam(0x3f4d63));
  add(G, box(15, 0.6, 15.4), lam(0x52627a), 0, 6.8, 0);
  add(G, box(15.2, 0.25, 15.6), lam(0xfbbf24), 0, 7.2, 0);
  add(G, cyl(1.1, 0.4, 12), lam(0x334155), 0, 7.4, 0);
  add(G, lattice(7.2, 34, 4.3, 1.3, 6, 0.32, 0.17, 0.12), lam(0xeef2f6));
  add(G, box(3.4, 2.0, 3.4), lam(0xe11d48), 0, 42.2, 0);
  add(G, box(0.9, 0.9, 0.9), basic(0xfff1c2), 0, 43.6, 0);
  // rig lights (dusk)
  const lg = [];
  for (const [y, s] of [[14, 3.6], [24, 2.8], [34, 1.95]]) for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1]]) lg.push(box(0.45, 0.3, 0.3).translate(sx * s, y, sz * s));
  add(G, strip(lg), basic(0xfff3c4));
  // doghouse + V-door + pipe racks
  add(G, box(4, 3, 5), lam(0x7aa6d6), -5.4, 8.7, 5);
  add(G, box(4.1, 0.9, 5.1), basic(0xffe9b0), -5.4, 9.2, 5);
  add(G, box(5, 2.4, 3), lam(0x2563eb), -1.5, 8.4, -6);
  add(G, cylBetween([0, 7.0, -7.7], [0, 1.2, -21], 0.9, 4), lam(0x6b7280));
  add(G, box(1.8, 1.2, 14), lam(0x6b7280), 0, 0.6, -28);
  const pr = [];
  for (const s of [-1, 1]) for (let i = 0; i < 9; i++) pr.push(zCyl(0.18, 13, 6).translate(s * (2.6 + (i % 3) * 0.42), 0.9 + Math.floor(i / 3) * 0.38, -28));
  add(G, strip(pr), lam(0x8b96a5));
  // generators + fuel
  const gc = [0xe2b33c, 0x4d7c0f, 0xe2b33c];
  for (let i = 0; i < 3; i++) add(G, box(3, 2.8, 7), lam(gc[i]), -17 - i * 3.6, 1.4, -8);
  add(G, xCyl(1.4, 9, 10), lam(0xf1f5f9), -16, 1.4, -19);
  // ---- top drive, traveling block, drill pipe stand
  const TD = O.topDrive = new THREE.Group(); TD.position.set(0, 20.6, 0); G.add(TD);
  add(TD, box(1.4, 2.3, 1.2), lam(0xdc2626), 0, 0, 0);
  add(TD, cyl(0.5, 0.9, 10), lam(0x7f1d1d), 0, 1.55, 0);
  add(TD, box(0.4, 2.6, 0.3), lam(0x374151), 0, 0.2, -0.75);
  add(TD, cylBetween([0, 1.2, 0], [0, 1.85, 0], 0.16, 8), lam(0x94a3b8));
  add(G, box(0.35, 26, 0.35), lam(0x4b5563), 0, 22, -1.25); // guide rail
  add(G, box(1.6, 1.8, 1.0), lam(0xfacc15), 0, 25.2, 0);   // traveling block
  add(G, strip([[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([x, z]) => cylBetween([x * 0.8, 26, z * 0.6], [x * 0.8, 41, z * 0.6], 0.04, 3))), lam(0x1f2937));
  add(G, cylBetween([0, 22.6, 0], [0, 24.3, 0], 0.12, 6), lam(0x374151));
  const dp = [cylBetween([0, 7.4, 0], [0, 19.4, 0], 0.17, 8)];
  for (const y of [8.4, 18.8]) dp.push(cyl(0.24, 0.5, 8).translate(0, y, 0));
  add(G, strip(dp), lam(0x8792a2));
  // ---- mud system
  buildMudSystem(G);
  // workers
  const w3 = buildHuman(); w3.position.set(2.4, 7.35, 3.2); w3.rotation.y = 0.5; G.add(w3);
  const w4 = buildHuman(0x16a34a); w4.position.set(-8.5, 0, 9.5); w4.rotation.y = -2.4; G.add(w4);
}

function buildMudSystem(G) {
  const tankM = lam(0x56677d), rimM = lam(0xfbbf24), skidM = lam(0x334155), pipeM = lam(0x8f9aab), darkM = lam(0x1f2937);
  // swirling mud surface (shared texture, rotated per frame)
  O.swirl = swirlTex();
  O.mudSurfM = new THREE.MeshPhongMaterial({ color: 0xffffff, map: O.swirl, flatShading: true, shininess: 30, specular: 0x5a3a1a });
  O.mudSurf = [];
  TANKS.forEach((T, k) => {
    const w = T.x1 - T.x0, d = TZ1 - TZ0, xc = (T.x0 + T.x1) / 2, zc = (TZ0 + TZ1) / 2;
    add(G, strip([box(w + 0.2, 0.3, d + 0.2).translate(xc, 0.15, zc)]), skidM);
    add(G, strip([box(w, TH, 0.15).translate(xc, TH / 2, TZ1 - 0.075), box(w, TH, 0.15).translate(xc, TH / 2, TZ0 + 0.075),
      box(0.15, TH, d).translate(T.x0 + 0.075, TH / 2, zc), box(0.15, TH, d).translate(T.x1 - 0.075, TH / 2, zc)]), tankM);
    add(G, strip([box(w + 0.1, 0.12, 0.25).translate(xc, TH, TZ1 - 0.1), box(w + 0.1, 0.12, 0.25).translate(xc, TH, TZ0 + 0.1),
      box(0.25, 0.12, d).translate(T.x0 + 0.1, TH, zc), box(0.25, 0.12, d).translate(T.x1 - 0.1, TH, zc)]), rimM);
    // handrail on the back
    const hr = [cylBetween([T.x0, TH + 1.0, TZ0 + 0.1], [T.x1, TH + 1.0, TZ0 + 0.1], 0.04, 4)];
    for (let x = T.x0 + 0.2; x < T.x1; x += 1.3) hr.push(cylBetween([x, TH, TZ0 + 0.1], [x, TH + 1.0, TZ0 + 0.1], 0.04, 4));
    add(G, strip(hr), rimM);
    // stiffeners on the front face
    const st = [];
    for (let x = T.x0 + 0.5; x < T.x1 - 0.2; x += 1.15) if (k !== 1 || Math.abs(x - xc) > 2.3) st.push(box(0.14, TH - 0.3, 0.1).translate(x, TH / 2, TZ1 + 0.03));
    if (st.length) add(G, strip(st), lam(0x4a5a6f));
    const sg = new THREE.PlaneGeometry(w - 0.3, d - 0.3, 12, 10); sg.rotateX(-Math.PI / 2);
    const m = add(G, sg, O.mudSurfM, xc, MUDY, zc);
    m.userData.base = Float32Array.from(sg.attributes.position.array); m.userData.k = k;
    O.mudSurf.push(m);
  });
  // easter egg #1: stencil on tank 2 (B) front
  const tB = TANKS[1];
  O.stencil = add(G, new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshLambertMaterial({ map: tankStencilTex(), emissive: 0x222222 }), (tB.x0 + tB.x1) / 2, 1.55, TZ1 + 0.01);
  // agitators on B and C
  O.agit = [];
  for (const k of [1, 2]) {
    const T = TANKS[k], xc = (T.x0 + T.x1) / 2, zc = (TZ0 + TZ1) / 2;
    add(G, box(0.45, 0.35, 6.3), lam(0xfbbf24), xc, TH + 0.2, zc);
    add(G, box(0.95, 0.7, 0.95), lam(0x2563eb), xc, TH + 0.72, zc);
    add(G, xCyl(0.32, 1.0, 10), lam(0x1e40af), xc + 0.95, TH + 0.78, zc);
    add(G, cyl(0.08, TH, 6), pipeM, xc, 1.6, zc);
    const cp = new THREE.Group(); cp.position.set(xc, TH + 0.1, zc); G.add(cp);
    add(cp, cyl(0.3, 0.12, 10), lam(0xe5e7eb));
    add(cp, box(0.62, 0.14, 0.1), lam(0xef4444), 0, 0.01, 0);
    O.agit.push(cp);
  }
  // ---- shale shaker on tank A
  const SH = O.shaker = new THREE.Group(); G.add(SH);
  const shM = lam(0x0f9488), shD = lam(0x115e59);
  add(SH, strip([box(0.2, 1.0, 0.2).translate(10.95, 3.5, -4.4), box(0.2, 1.0, 0.2).translate(13.55, 3.5, -4.4),
    box(0.2, 0.7, 0.2).translate(10.95, 3.35, -1.2), box(0.2, 0.7, 0.2).translate(13.55, 3.35, -1.2)]), shD);
  add(SH, box(3.0, 1.0, 0.9), shD, 12.25, 5.0, -5.0);  // header box / possum belly
  const BK = O.basket = new THREE.Group(); BK.position.set(12.25, 4.55, -2.65); BK.rotation.x = 0.187; SH.add(BK);
  const scr = new THREE.PlaneGeometry(2.8, 3.8); scr.rotateX(-Math.PI / 2);
  add(BK, scr, new THREE.MeshLambertMaterial({ map: screenTex(), side: THREE.DoubleSide }), 0, 0.02, 0);
  add(BK, strip([box(0.14, 0.7, 3.9).translate(-1.47, 0.3, 0), box(0.14, 0.7, 3.9).translate(1.47, 0.3, 0), box(3.08, 0.8, 0.14).translate(0, 0.35, -1.95),
    box(3.08, 0.16, 3.9).translate(0, -0.12, 0)]), shM);
  add(BK, strip([box(0.14, 1.2, 0.14).translate(-1.47, 0.9, -0.3), box(0.14, 1.2, 0.14).translate(1.47, 0.9, -0.3), box(3.3, 0.22, 0.32).translate(0, 1.45, -0.3)]), shM);
  add(BK, strip([xCyl(0.26, 0.7, 10).translate(-0.85, 1.75, -0.3), xCyl(0.26, 0.7, 10).translate(0.85, 1.75, -0.3)]), lam(0x334155));
  // skip (cuttings box) in front of tank A
  add(G, strip([box(3.0, 0.15, 1.8).translate(12.25, 0.08, 0.9), box(3.0, 1.3, 0.12).translate(12.25, 0.65, 0.06), box(3.0, 1.3, 0.12).translate(12.25, 0.65, 1.74),
    box(0.12, 1.3, 1.8).translate(10.81, 0.65, 0.9), box(0.12, 1.3, 1.8).translate(13.69, 0.65, 0.9)]), lam(0xf97316));
  const pile = [new THREE.ConeGeometry(0.95, 0.55, 7).translate(12.4, 1.1, 0.85)];
  for (let i = 0; i < 12; i++) pile.push(new THREE.DodecahedronGeometry(0.12 + hash(i, 61) * 0.1, 0).translate(11.6 + hash(i, 62) * 1.5, 1.05 + hash(i, 63) * 0.2, 0.4 + hash(i, 64) * 0.9));
  add(G, strip(pile), lam(0x6b5a48));
  // flowline from bell nipple to shaker header
  add(G, pipeRun([[0.0, 6.0, 0.0], [0.4, 6.0, -0.4], [10.75, 5.15, -4.9]], 0.24, 10), lam(0x9ca3af));
  // ---- triplex mud pump (world coords, axis along x, fluid end at -x)
  const pumpB = lam(0x1d4ed8), steel = lam(0xa3acb9), yel = lam(0xfacc15);
  add(G, box(7.8, 0.35, 2.8), skidM, 24.0, 0.175, 7.2);
  add(G, box(2.8, 2.0, 2.2), pumpB, 26.3, 1.35, 7.2);
  add(G, zCyl(1.05, 2.2, 14), pumpB, 26.3, 2.35, 7.2);
  add(G, box(1.7, 1.2, 1.5), lam(0x6b7280), 26.6, 3.75, 7.2);
  O.wheel = new THREE.Group(); O.wheel.position.set(26.3, 1.7, 8.45); G.add(O.wheel);
  add(O.wheel, zCyl(1.25, 0.22, 16), lam(0x374151));
  add(O.wheel, strip([box(2.3, 0.18, 0.06).translate(0, 0, 0.13), box(0.18, 2.3, 0.06).translate(0, 0, 0.13)]), yel);
  add(G, strip([box(2.0, 0.16, 2.0).translate(23.65, 2.2, 7.2), box(2.0, 0.3, 2.0).translate(23.65, 0.5, 7.2)]), pumpB);
  add(G, strip([box(0.16, 1.7, 0.16).translate(22.75, 1.35, 6.25), box(0.16, 1.7, 0.16).translate(22.75, 1.35, 8.15),
    box(0.16, 1.7, 0.16).translate(24.55, 1.35, 6.25), box(0.16, 1.7, 0.16).translate(24.55, 1.35, 8.15)]), pumpB);
  O.rods = [];
  for (let k = 0; k < 3; k++) {
    const z = 6.55 + 0.65 * k;
    add(G, xCyl(0.24, 0.55, 10), lam(0xe5e7eb), 22.95, 1.35, z); // liner
    const r = new THREE.Group(); r.position.set(0, 1.35, z); G.add(r);
    add(r, xCyl(0.12, 1.6, 8), lam(0xf1f5f9, { emissive: 0x222222 }), 23.75, 0, 0);
    add(r, box(0.26, 0.34, 0.34), yel, 24.0, 0, 0);
    add(r, xCyl(0.27, 0.45, 10), steel, 24.55, 0, 0);
    O.rods.push(r);
  }
  add(G, box(1.4, 1.8, 2.3), steel, 22.1, 1.3, 7.2);  // fluid end
  for (let k = 0; k < 3; k++) add(G, cyl(0.22, 0.22, 10), lam(0x64748b), 22.1, 2.3, 6.55 + 0.65 * k);
  add(G, new THREE.IcosahedronGeometry(0.45, 1), lam(0xdc2626), 21.5, 2.75, 7.2); // pulsation dampener
  add(G, cylBetween([21.5, 2.2, 7.2], [21.5, 2.45, 7.2], 0.12, 6), steel);
  // suction & discharge lines
  add(G, pipeRun([[24.0, 0.7, -1.0], [24.0, 0.7, 4.4], [21.25, 0.7, 4.4], [21.25, 0.62, 6.1]], 0.26, 10), lam(0x6b7280));
  add(G, xCyl(0.26, 0.3, 10), lam(0x6b7280), 21.25, 0.62, 6.3);
  add(G, pipeRun([[21.4, 1.85, 7.2], [20.3, 1.85, 7.2], [20.3, 0.45, 7.2], [8.0, 0.45, 7.2], [8.0, 0.45, 1.5], [8.0, 7.75, 1.5], [4.7, 7.75, 1.5], [4.7, 23.5, 1.5]], 0.17, 8), pipeM);
  add(G, strip([box(0.5, 0.15, 0.15).translate(4.45, 12, 1.5), box(0.5, 0.15, 0.15).translate(4.4, 17, 1.5), box(0.8, 0.15, 0.15).translate(4.3, 22, 1.5)]), darkM);
  add(G, zCyl(0.16, 0.08, 12), basic(0xf8fafc), 20.3, 1.85, 7.42); // pressure gauge face
  // rotary (kelly) hose to the top drive
  O.hose = hosePts();
  add(G, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(O.hose.map(p => new THREE.Vector3(...p))), 40, 0.16, 6), lam(0x111827));
  // circulation paths (for glowing flow arrows)
  O.pathDN = new Poly([...DN_PRE, ...O.hose, [0, 20.6, 0], [0, 7.4, 0], [0, -1.0, 0]]);
  O.sDN = { pump: new Poly(DN_PRE.slice(0, 7)).L, stand: new Poly(DN_PRE).L, td: new Poly([...DN_PRE, ...O.hose]).L };
  O.pathRET = new Poly(RET_PTS);
  O.sRET = { shaker: new Poly(RET_PTS.slice(0, 6)).L, tankA: new Poly(RET_PTS.slice(0, 9)).L };
  O.arrows = new THREE.InstancedMesh(new THREE.ConeGeometry(0.24, 0.66, 6), basic(0xffd166), 420);
  O.arrows.frustumCulled = false; G.add(O.arrows);
  // ---- sacks: bentonite + barite pallets, standing barite sack, hopper
  const mats = { B: lam(0xffffff, { map: sackTex('B') }), N: lam(0xffffff, { map: sackTex('N') }) };
  for (const [px, kind] of [[14.6, 'N'], [16.1, 'B']]) {
    add(G, box(1.3, 0.15, 1.1), lam(0xa16207), px, 0.08, 3.0);
    for (let l = 0; l < 4; l++) for (let j = 0; j < 2; j++) {
      const s = add(G, box(0.6, 0.22, 1.0), mats[kind], px - 0.31 + j * 0.62, 0.27 + l * 0.23, 3.0);
      s.rotation.y = (hash(l * 2 + j, kind === 'B' ? 71 : 72) - 0.5) * 0.12;
    }
  }
  const sk = new THREE.Group(); sk.position.set(16.75, 0, 3.85); sk.rotation.y = -0.12; G.add(sk);
  add(sk, box(0.62, 0.95, 0.3), lam(0xf3f4f1), 0, 0.48, 0);
  O.sackLabel = add(sk, new THREE.PlaneGeometry(0.58, 0.87), new THREE.MeshLambertMaterial({ map: sackLabelTex(), emissive: 0x1a1a1a }), 0, 0.48, 0.152);
  O.sackGroup = sk;
  // mixing hopper
  add(G, strip([box(0.1, 1.2, 0.1).translate(19.3, 0.6, 2.7), box(0.1, 1.2, 0.1).translate(19.9, 0.6, 2.7), box(0.1, 1.2, 0.1).translate(19.3, 0.6, 3.3), box(0.1, 1.2, 0.1).translate(19.9, 0.6, 3.3)]), darkM);
  add(G, new THREE.ConeGeometry(0.65, 0.8, 10, 1, true).rotateX(Math.PI), lam(0x9ca3af, { side: THREE.DoubleSide }), 19.6, 1.55, 3.0);
  add(G, pipeRun([[19.6, 1.1, 3.0], [19.6, 0.7, 3.0], [19.6, 0.7, -0.9]], 0.12, 8), pipeM);
  // mud engineer for scale
  const me = buildHuman(0xf97316, 0xffffff); me.position.set(17.7, 0, 3.6); me.rotation.y = -0.55; G.add(me); O.engineer = me;
  // shaker particles: cuttings sliding off + mud dripping through the screen
  O.shCut = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), lam(0x5f4d3c), 110);
  O.shDrip = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), lam(0x9b6a3c), 90);
  for (const m of [O.shCut, O.shDrip]) { m.frustumCulled = false; G.add(m); }
}

// ---------------------------------------------------------------- WELL set (cutaway cross-section)
const RH = 1.6, RC = 2.0, Y_SHOE = -14, YB = -38.4, YBT = YB + 2.0, Y_COL = -28.0, Y_TOP = 8.0;
const RP = 0.5, RPI = 0.38, RCO = 0.8;
const Y_MWD0 = -33.8, Y_MWD1 = -31.2;
const LAYERS = [
  { y0: 0, y1: -4, c: 0xd9bf8c },
  { y0: -4, y1: -11, c: 0xb98a5a },
  { y0: -11, y1: -18, c: 0x97a08a },
  { y0: -18, y1: -24, c: 0xbdb5a8 },
  { y0: -24, y1: -31, c: 0xe1b98c, porous: true },
  { y0: -31, y1: -35, c: 0x7c8273 },
  { y0: -35, y1: -42, c: 0xd9733f, gas: true },
  { y0: -42, y1: -90, c: 0x5d6158 },
];
const CRACKS = [ // right-side fractures (lost circulation)
  { y: -32.4, len: 7.0, k: 0 }, { y: -29.6, len: 5.2, k: 1 },
];
function crackPts(cr) {
  const pts = [];
  for (let i = 0; i <= 9; i++) {
    const u = i / 9;
    pts.push([u * cr.len, (hash(i, 501 + cr.k * 7) - 0.5) * 0.9 * (i > 0 ? 1 : 0) - u * 0.6 * (cr.k ? -1 : 1)]);
  }
  return pts;
}
function crackShape(pts, w0) {
  const s = new THREE.Shape();
  const n = pts.length;
  s.moveTo(pts[0][0], pts[0][1] + w0);
  for (let i = 1; i < n; i++) s.lineTo(pts[i][0], pts[i][1] + w0 * (1 - i / (n - 1)) + 0.02);
  for (let i = n - 1; i >= 0; i--) s.lineTo(pts[i][0], pts[i][1] - w0 * (1 - i / (n - 1)) - 0.02);
  return new THREE.ShapeGeometry(s);
}

function buildWell(G) {
  const clip = O.clipW = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const cb = (c, o = {}) => lam(c, { clippingPlanes: [clip], side: THREE.DoubleSide, ...o });
  const Wd = 34, Dd = 24;
  for (const L of LAYERS) {
    const geos = [];
    const top = L.y0, botCh = Math.max(L.y1, YB);
    if (top > YB) {
      const segs = [];
      if (top > Y_SHOE && botCh < Y_SHOE) segs.push([top, Y_SHOE, RC], [Y_SHOE, botCh, RH]);
      else segs.push([top, botCh, top > Y_SHOE ? RC : RH]);
      for (const [a, b, R] of segs) {
        const h = a - b, yc = (a + b) / 2;
        geos.push(box(Wd - R, h, Dd).translate(-(R + Wd) / 2, yc, -Dd / 2));
        geos.push(box(Wd - R, h, Dd).translate((R + Wd) / 2, yc, -Dd / 2));
        geos.push(box(2 * R, h, Dd - R).translate(0, yc, -R - (Dd - R) / 2));
        if (R === RH) add(G, cyl(R, h, 18, true), cb(new THREE.Color(L.c).multiplyScalar(0.62).getHex()), 0, yc, 0);
      }
    }
    if (L.y1 < YB) { const a = Math.min(L.y0, YB), h = a - L.y1; geos.push(box(2 * Wd, h, Dd).translate(0, (a + L.y1) / 2, -Dd / 2)); }
    add(G, strip(geos), lam(L.c));
  }
  // pebbles / pores on the cut face
  const peb = { light: [], dark: [], pore: [], gas: [] };
  for (let i = 0; i < 300; i++) {
    const x = (hash(i, 21) - 0.5) * 2 * 30, y = 0.2 - hash(i, 22) * 70;
    if (Math.abs(x) < 2.4) continue;
    const L = LAYERS.find(l => y <= l.y0 && y > l.y1);
    const r = 0.2 + hash(i, 23) * 0.5;
    const gq = new THREE.CircleGeometry(r, 5).translate(x, y, 0.03);
    if (L && L.gas) peb.gas.push(gq); else (hash(i, 24) < 0.5 ? peb.light : peb.dark).push(gq);
  }
  for (let i = 0; i < 160; i++) { // sandstone pores
    const x = (hash(i, 25) - 0.5) * 2 * 28, y = -24.2 - hash(i, 26) * 6.6;
    if (Math.abs(x) < 1.9) continue;
    peb.pore.push(new THREE.CircleGeometry(0.1 + hash(i, 27) * 0.14, 6).translate(x, y, 0.035));
  }
  for (let i = 0; i < 110; i++) {
    const x = (hash(i, 31) - 0.5) * 2 * 28, y = -35.3 - hash(i, 32) * 6.4;
    if (Math.abs(x) < 1.8) continue;
    peb.gas.push(new THREE.CircleGeometry(0.16 + hash(i, 33) * 0.22, 6).translate(x, y, 0.04));
  }
  add(G, strip(peb.light), basic(0xffffff, { transparent: true, opacity: 0.16, depthWrite: false }));
  add(G, strip(peb.dark), basic(0x000000, { transparent: true, opacity: 0.13, depthWrite: false }));
  add(G, strip(peb.pore), basic(0x5b3d22, { transparent: true, opacity: 0.45, depthWrite: false }));
  O.gasPores = add(G, strip(peb.gas), basic(0xfff2b0, { transparent: true, opacity: 0.7 }));
  // surface + mini rig
  add(G, strip([box(Wd - RC, 0.4, Dd).translate(-(RC + Wd) / 2, 0.2, -Dd / 2), box(Wd - RC, 0.4, Dd).translate((RC + Wd) / 2, 0.2, -Dd / 2)]), lam(0xe9d3a3));
  add(G, box(9, 0.5, 7), lam(0x52627a), 0, 3.0, -2.0);
  add(G, box(9.1, 0.18, 7.1), lam(0xfbbf24), 0, 3.3, -2.0);
  add(G, strip([cylBetween([-4, 0.4, -5], [-4, 2.8, -5], 0.2, 4), cylBetween([4, 0.4, -5], [4, 2.8, -5], 0.2, 4), cylBetween([-4, 0.4, 1.2], [-4, 2.8, 1.2], 0.2, 4), cylBetween([4, 0.4, 1.2], [4, 2.8, 1.2], 0.2, 4)]), lam(0x3f4d63));
  const lt = lattice(3.4, 20, 3.0, 0.9, 5, 0.22, 0.12, 0.09); lt.translate(0, 0, -1.5);
  add(G, lt, lam(0xf8fafc));
  add(G, box(1.6, 2.2, 1.3), lam(0xdc2626), 0, Y_TOP + 1.0, 0); // top drive
  add(G, pipeRun([[0.2, Y_TOP + 2.1, 0], [3.5, Y_TOP + 4.5, -0.5], [6.5, Y_TOP + 1.0, -0.8], [6.5, 3.4, -0.8]], 0.16, 6), lam(0x111827));
  add(G, pipeRun([[RC, 1.0, 0], [9.0, 1.0, 0]], 0.36, 10), cb(0x9ca3af)); // flowline stub (cut)
  add(G, cyl(RC + 0.25, 1.4, 16, true), cb(0x9ca3af), 0, 1.0, 0);   // wellhead / bell nipple (cut)
  // cement + casing
  add(G, cyl(RC, -Y_SHOE + 0.4, 18, true), cb(0xc9c3b6), 0, Y_SHOE / 2 + 0.2, 0);
  add(G, cyl(RH, -Y_SHOE + 0.4, 18, true), cb(0x8f9cab), 0, Y_SHOE / 2 + 0.2, 0);
  add(G, strip([1, -1].map(s => box(RC - RH - 0.1, -Y_SHOE, 0.2).translate(s * (RC + RH + 0.1) / 2, Y_SHOE / 2, -0.1))), lam(0xd6d0c4));
  add(G, strip([1, -1].map(s => box(0.12, -Y_SHOE + 0.4, 0.22).translate(s * (RH + 0.06), Y_SHOE / 2 + 0.2, -0.1))), lam(0x475569));
  add(G, strip([1, -1].map(s => box(0.5, 0.6, 0.3).translate(s * (RH + 0.15), Y_SHOE - 0.2, -0.1))), lam(0x475569));
  // mud tint in hole + pipe
  O.mudTint = add(G, cyl(RH - 0.03, -YB + 0.4, 18, true), lam(0x8a5a2e, { clippingPlanes: [clip], side: THREE.DoubleSide, transparent: true, opacity: 0.42, depthWrite: false }), 0, YB / 2 + 0.2, 0);
  O.mudTint.renderOrder = 1;
  // filter cake (sandstone)
  O.cakeM = lam(0x5a3518, { clippingPlanes: [clip], side: THREE.DoubleSide, transparent: true, opacity: 0 });
  O.cake = add(G, cyl(RH - 0.02, 7, 18, true), O.cakeM, 0, -27.5, 0);
  O.cakeStrips = [1, -1].map(s => add(G, box(1, 7, 0.2), lam(0x5a3518), s * (RH - 0.05), -27.5, -0.1));
  // cracks (lost circulation)
  O.cracks = CRACKS.map(cr => {
    const g = new THREE.Group(); g.position.set(RH - 0.05, cr.y, 0.045); G.add(g);
    const pts = crackPts(cr);
    add(g, crackShape(pts, 0.32), basic(0x24180f));
    const fill = add(g, crackShape(pts, 0.17), basic(0xc2884f), 0, 0, 0.01);
    return { g, fill, pts, cr };
  });
  // drill string
  const DS = O.ds = new THREE.Group(); G.add(DS);
  const DR = O.dsRot = new THREE.Group(); DS.add(DR);
  const pipeM = cb(0x8792a2), boreM = cb(0x5e6773), colM = cb(0x6b7684);
  add(DR, cyl(RP, Y_TOP - Y_COL, 14, true), pipeM, 0, (Y_TOP + Y_COL) / 2, 0);
  add(DR, cyl(RPI, Y_TOP - Y_COL, 14, true), boreM, 0, (Y_TOP + Y_COL) / 2, 0);
  add(DR, cyl(RCO, Y_COL - YBT, 14, true), colM, 0, (Y_COL + YBT) / 2, 0);
  add(DR, cyl(RPI, Y_COL - YBT, 14, true), boreM, 0, (Y_COL + YBT) / 2, 0);
  const tjs = [], stripes = [];
  for (let y = -4; y > Y_COL + 1; y -= 9) {
    tjs.push(cyl(RP + 0.14, 0.9, 14, true).translate(0, y, 0));
    stripes.push(box(0.2, 0.95, 0.1).translate(RP + 0.12, y, -0.08), box(0.2, 0.95, 0.1).translate(-RP - 0.12, y, -0.08));
  }
  for (let y = Y_COL - 1.5; y > YBT + 1; y -= 2.6) if (y > Y_MWD1 || y < Y_MWD0) stripes.push(box(0.16, 0.5, 0.1).translate(RCO, y, -0.12), box(0.16, 0.5, 0.1).translate(-RCO, y, -0.12));
  add(DR, strip(tjs), cb(0xaab4c3));
  add(DR, strip(stripes), cb(0x1e293b));
  O.mwdM = cb(0x0891b2);
  add(DR, cyl(RCO + 0.04, Y_MWD1 - Y_MWD0, 14, true), O.mwdM, 0, (Y_MWD0 + Y_MWD1) / 2, 0);
  add(DR, cyl(RCO + 0.08, 0.3, 14, true), cb(0xfacc15), 0, Y_MWD1 - 0.4, 0);
  // cut edges (static)
  add(DS, strip([1, -1].map(s => box(RP - RPI, Y_TOP - Y_COL, 0.14).translate(s * (RP + RPI) / 2, (Y_TOP + Y_COL) / 2, -0.07))), lam(0x475569));
  add(DS, strip([1, -1].map(s => box(RCO - RPI, Y_COL - YBT, 0.14).translate(s * (RCO + RPI) / 2, (Y_COL + YBT) / 2, -0.07))), lam(0x4b5563));
  O.mwdEdge = lam(0x0e7490);
  add(DS, strip([1, -1].map(s => box(RCO - RPI + 0.04, Y_MWD1 - Y_MWD0, 0.16).translate(s * (RCO + RPI) / 2, (Y_MWD0 + Y_MWD1) / 2, -0.06))), O.mwdEdge);
  // bit
  const BIT = O.bit = new THREE.Group(); BIT.position.y = YB; DS.add(BIT);
  O.bitM = lam(0x9ca3af); O.bitM2 = lam(0xb0b7c2); O.teethM = lam(0xfbbf24);
  add(BIT, cyl(1.45, 1.1, 12), O.bitM, 0, 1.45, 0);
  add(BIT, cyl(0.9, 0.5, 12, false, RCO), O.bitM2, 0, 2.05, 0);
  add(BIT, new THREE.ConeGeometry(1.5, 0.9, 12).rotateX(Math.PI), O.bitM2, 0, 0.45, 0);
  const teeth = [];
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2, r = 0.55 + (i % 3) * 0.42;
    teeth.push(new THREE.ConeGeometry(0.2, 0.42, 4).rotateX(Math.PI).translate(Math.cos(a) * r, 0.42 - (r - 0.55) * 0.42, Math.sin(a) * r));
  }
  add(BIT, strip(teeth), O.teethM);
  const nz = [];
  for (let k = 0; k < 3; k++) {
    const a = k * 2.094;
    nz.push(cylBetween([Math.cos(a) * 0.62, 0.55, Math.sin(a) * 0.62], [Math.cos(a) * 0.8, 0.3, Math.sin(a) * 0.8], 0.13, 8));
  }
  add(BIT, strip(nz), lam(0x111827));
  // nozzle jets (additive cones)
  O.jetM = basic(0xffe7b8, { transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let k = 0; k < 3; k++) {
    const a = k * 2.094;
    const g = new THREE.ConeGeometry(0.22, 0.9, 8, 1, true); g.translate(0, -0.45, 0);
    const m = add(BIT, g, O.jetM, Math.cos(a) * 0.74, 0.36, Math.sin(a) * 0.74);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(Math.cos(a) * 0.5, -0.86, Math.sin(a) * 0.5).normalize());
  }
  O.heatGlow = add(BIT, new THREE.SphereGeometry(2.4, 12, 8), basic(0xff5a1f, { transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 1.0, 0);
  // particles
  O.NPW = 900;
  O.mudW = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.13, 0), basic(0xffffff), O.NPW + 260);
  O.mudW.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((O.NPW + 260) * 3), 3);
  O.cutW = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), lam(0xffffff), 320);
  O.cutW.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(320 * 3), 3);
  O.gasW = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xfffbea, emissive: 0x8a7a48 }), 140);
  O.pulseW = new THREE.InstancedMesh(cyl(0.34, 0.7, 12), basic(0x67e8f9, { transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), 24);
  for (const m of [O.mudW, O.cutW, O.gasW, O.pulseW]) { m.frustumCulled = false; G.add(m); }
}

// ---------------------------------------------------------------- STUDIO set (3 mud types)
function buildStudio(G) {
  add(G, cyl(60, 0.4, 48), lam(0x16233a), 0, -0.2, 0);
  add(G, new THREE.RingGeometry(14, 14.4, 64).rotateX(-Math.PI / 2), basic(0x2b4a73), 0, 0.02, 0);
  O.beakers = [];
  const cols = [[0x3b82f6, 0xa87a4a], [0xf59e0b, 0x3a2616], [0x22c55e, 0x9c8a4a]];
  cols.forEach(([ring, fluid], i) => {
    const P = new THREE.Group(); P.position.set((i - 1) * 4.2, 0, 0); G.add(P);
    add(P, cyl(1.7, 0.8, 24), lam(0x2a3a55), 0, 0.4, 0);
    add(P, new THREE.TorusGeometry(1.7, 0.08, 4, 32).rotateX(Math.PI / 2), basic(ring), 0, 0.8, 0);
    const fl = add(P, cyl(1.05, 2.2, 18), new THREE.MeshPhongMaterial({ color: fluid, shininess: 60, flatShading: true }), 0, 0.8 + 1.15, 0);
    add(P, cyl(1.15, 3.0, 18, true), new THREE.MeshPhongMaterial({ color: 0xdbeafe, transparent: true, opacity: 0.28, shininess: 90, side: THREE.DoubleSide, depthWrite: false }), 0, 0.8 + 1.5, 0);
    add(P, new THREE.TorusGeometry(1.15, 0.05, 4, 24).rotateX(Math.PI / 2), lam(0xe2e8f0), 0, 3.8, 0);
    add(P, cyl(1.06, 0.06, 18), new THREE.MeshPhongMaterial({ color: new THREE.Color(fluid).multiplyScalar(1.25), shininess: 80 }), 0, 3.08, 0);
    O.beakers.push({ P, fl });
  });
}

// ---------------------------------------------------------------- shots / cameras (set-local: [px,py,pz, tx,ty,tz, fov])
const K_TITLE = [{ t: 0, v: [112, 22, 128, 8, 19, 0, 40] }, { t: 8, v: [96, 18, 110, 8, 18.5, 0, 40] }];
const K_DIRT = [
  { t: 8.0, v: [25.0, 7.4, 10.8, 18.2, 1.9, -2.3, 40] },
  { t: 12.4, v: [23.4, 6.8, 9.8, 18.2, 1.9, -2.3, 40], stop: true },
  { t: 13.6, v: [17.4, 2.5, 10.6, 16.0, 1.0, 2.9, 40] },
  { t: 18.0, v: [16.9, 2.3, 10.0, 16.0, 1.0, 2.9, 40] },
];
const K_LOOP1 = [
  { t: 18.0, v: [34, 12.5, 9, 23.5, 1.6, -2.0, 40] },
  { t: 21.0, v: [33, 12, 9.6, 23.5, 1.6, -2.0, 40], stop: true },
  { t: 22.2, v: [17.5, 5.2, 26.5, 23.8, 1.3, 7.0, 40] },
  { t: 24.6, v: [18.3, 5.0, 25.5, 23.8, 1.3, 7.0, 40], stop: true },
  { t: 25.8, v: [31, 14, 33, 3.8, 13.5, 2.0, 40] },
  { t: 28.6, v: [30, 14.5, 31.5, 3.8, 13.5, 2.0, 40] },
];
const K_SHAKER = [
  { t: 38.8, v: [6.4, 9.6, 7.4, 12.3, 3.4, -1.8, 40] },
  { t: 41.6, v: [7.2, 9.2, 7.6, 12.3, 3.4, -1.8, 40], stop: true },
  { t: 42.6, v: [44, 27, 46, 14, 5, 0, 40] },
  { t: 45.2, v: [41, 25.5, 43, 14, 5, 0, 40] },
];
const K_END = [{ t: 113.4, v: [56, 30, 58, 12, 9, 0, 40] }, { t: 120, v: [47, 26, 51, 12, 9, 0, 40] }];
const OVW = [10, -24, 142, 0, -28.1, 0, 30];
const K_WLOOP = [
  { t: 28.5, v: OVW }, { t: 31.5, v: [7, -25, 136, 0, -28.1, 0, 30], stop: true },
  { t: 32.5, v: [4.5, -35.4, 15.5, 0, -37.0, 0, 40], stop: true },
  { t: 35.3, v: [3.8, -35.6, 15, 0, -37.0, 0, 40], stop: true },
  { t: 36.3, v: [6.5, -27.2, 27, 0, -29.3, 0, 40], stop: true },
  { t: 38.8, v: [6.0, -25.6, 26, 0, -27.8, 0, 40] },
];
const K_JOBS = [
  { t: 45.0, v: [12, -24, 142, 0, -28.1, 0, 30] }, { t: 52.6, v: [5, -25, 138, 0, -28.1, 0, 30], stop: true },
  { t: 53.6, v: [5.5, -31.0, 21, 0, -32.8, 0, 40], stop: true }, { t: 60.4, v: [4.0, -30.4, 20, 0, -32.6, 0, 40], stop: true },
  { t: 61.4, v: [3.6, -35.2, 11.5, 0, -37.0, 0, 40], stop: true }, { t: 68.4, v: [2.8, -35.4, 11, 0, -37.0, 0, 40], stop: true },
  { t: 69.4, v: [4.6, -26.6, 12.5, 1.3, -27.6, 0, 40], stop: true }, { t: 76.4, v: [4.0, -27.0, 12, 1.3, -27.6, 0, 40], stop: true },
  { t: 77.4, v: [4.2, -31.6, 12, 0, -32.6, 0, 40], stop: true }, { t: 79.4, v: [3.6, -31.4, 11.5, 0, -32.6, 0, 40], stop: true },
  { t: 81.6, v: [8, -24, 140, 0, -28.1, 0, 30], stop: true }, { t: 85.0, v: [4, -24.5, 138, 0, -28.1, 0, 30] },
];
const K_WIN = [{ t: 85.0, v: [4.5, -33.0, 34, 0.6, -34.6, 0, 40] }, { t: 103.4, v: [2.0, -33.4, 32, 0.6, -34.6, 0, 40] }];
const K_TYPES = [{ t: 103.4, v: [-1.5, 7.5, 21, 0, 4.4, 0, 40] }, { t: 113.4, v: [1.5, 7.0, 20, 0, 4.4, 0, 40] }];

function shotFor(t) {
  if (t < 8) return { set: 'L', v: track(K_TITLE, t) };
  if (t < 18) return { set: 'L', v: track(K_DIRT, t) };
  if (t < 28.5) return { set: 'L', v: track(K_LOOP1, t) };
  if (t < 38.8) return { set: 'W', v: track(K_WLOOP, t) };
  if (t < 45) return { set: 'L', v: track(K_SHAKER, t) };
  if (t < 85) return { set: 'W', v: track(K_JOBS, t) };
  if (t < 103.4) return { set: 'W', v: track(K_WIN, t) };
  if (t < 113.4) return { set: 'T', v: track(K_TYPES, t), vo: 520 };
  return { set: 'L', v: track(K_END, t) };
}

// ---------------------------------------------------------------- init
async function init(opts) {
  THREE = opts.THREE; renderer = opts.renderer; W = opts.width || 1080; H = opts.height || 1920;
  renderer.localClippingEnabled = true;
  _c.a = new THREE.Color();
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, W / H, 0.3, 5000);
  scene.fog = new THREE.Fog(0x000000, 10, 1000);
  scene.background = new THREE.Color();
  O.hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1.5); scene.add(O.hemi);
  O.dir = new THREE.DirectionalLight(0xffffff, 2.2); scene.add(O.dir); scene.add(O.dir.target);
  O.sets = {};
  for (const k of Object.keys(OFF)) { const g = new THREE.Group(); g.position.set(...OFF[k]); scene.add(g); O.sets[k] = g; }
  buildLand(O.sets.L); buildWell(O.sets.W); buildStudio(O.sets.T);
  O.v3 = new THREE.Vector3(); O.v3b = new THREE.Vector3(); O.tan = new THREE.Vector3(); O.q = new THREE.Quaternion(); O.up = new THREE.Vector3(0, 1, 0);
  O.m4 = new THREE.Matrix4(); O.scl = new THREE.Vector3(); O.col = new THREE.Color();
  O.lastT = null;
}

// ---------------------------------------------------------------- per-frame helpers
function setI(mesh, i, x, y, z, s, sy = s) {
  const e = mesh.instanceMatrix.array, o = i * 16;
  e[o] = s; e[o + 1] = 0; e[o + 2] = 0; e[o + 3] = 0;
  e[o + 4] = 0; e[o + 5] = sy; e[o + 6] = 0; e[o + 7] = 0;
  e[o + 8] = 0; e[o + 9] = 0; e[o + 10] = s; e[o + 11] = 0;
  e[o + 12] = x; e[o + 13] = y; e[o + 14] = z; e[o + 15] = 1;
}
function setC(mesh, i, hex) { O.col.setHex(hex); O.col.toArray(mesh.instanceColor.array, i * 3); }
function done(mesh, n) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }

function placeCam(set, v, vo = 0) {
  const o = OFF[set];
  camera.position.set(v[0] + o[0], v[1] + o[1], v[2] + o[2]);
  camera.lookAt(v[3] + o[0], v[4] + o[1], v[5] + o[2]);
  camera.fov = v[6];
  if (vo) camera.setViewOffset(W, H, 0, vo, W, H); else camera.clearViewOffset();
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}

function env(set) {
  const o = OFF[set];
  if (set === 'L') {
    scene.background.setHex(0x9a4f86);
    scene.fog.color.setHex(0xe8a27a); scene.fog.near = 160; scene.fog.far = 1600;
    O.hemi.color.setHex(0xffe6cf); O.hemi.groundColor.setHex(0x8a6448); O.hemi.intensity = 1.75;
    O.dir.color.setHex(0xffc58f); O.dir.intensity = 2.5;
    O.dir.position.set(o[0] + 60, 55, o[2] + 75); O.dir.target.position.set(o[0], 0, o[2]);
  } else if (set === 'W') {
    scene.background.setHex(0x0f2236);
    scene.fog.color.setHex(0x0f2236); scene.fog.near = 300; scene.fog.far = 1200;
    O.hemi.color.setHex(0xffffff); O.hemi.groundColor.setHex(0x7a8796); O.hemi.intensity = 1.9;
    O.dir.color.setHex(0xffffff); O.dir.intensity = 1.8;
    O.dir.position.set(o[0] + 40, 70, o[2] + 90); O.dir.target.position.set(o[0], -10, o[2]);
  } else {
    scene.background.setHex(0x0d1a2e);
    scene.fog.color.setHex(0x0d1a2e); scene.fog.near = 60; scene.fog.far = 200;
    O.hemi.color.setHex(0xffffff); O.hemi.groundColor.setHex(0x3a4a66); O.hemi.intensity = 1.8;
    O.dir.color.setHex(0xffffff); O.dir.intensity = 2.1;
    O.dir.position.set(o[0] + 30, 50, o[2] + 60); O.dir.target.position.set(o[0], 2, o[2]);
  }
}
function showOnly(set) { for (const k in O.sets) O.sets[k].visible = k === set; }

// ---- LAND dynamics
const PUMP_W = 2 * Math.PI * 1.5;
// reveal distance of the glowing flow along the down / return paths
function revealDN(t) {
  if (t < 18.2) return t < 8 ? 1e9 : -1;
  if (t < 21.5) return O.sDN.pump * eio((t - 18.4) / 1.8);
  if (t < 25.0) return lerp(O.sDN.pump, O.sDN.stand, eio((t - 21.9) / 2.0));
  if (t < 28.5) return lerp(O.sDN.stand, O.pathDN.L, eio((t - 25.4) / 2.4));
  return 1e9;
}
function revealRET(t) {
  if (t < 38.8) return t < 8 ? 1e9 : -1;
  if (t < 42.0) return O.sRET.tankA * eio((t - 39.0) / 2.2);
  if (t < 45.0) return lerp(O.sRET.tankA, O.pathRET.L, eio((t - 42.0) / 1.6));
  return 1e9;
}
function stateLand(t, v) {
  O.skyL.position.set(v[0], 0, v[2]);
  // mud surfaces + agitators
  O.swirl.rotation = -t * 0.55;
  for (const m of O.mudSurf) {
    const a = m.geometry.attributes.position, b = m.userData.base, k = m.userData.k;
    for (let i = 0; i < a.array.length; i += 3) {
      const x = b[i], z = b[i + 2], r = Math.hypot(x, z), th = Math.atan2(z, x);
      a.array[i + 1] = 0.06 * Math.sin(r * 2.6 - t * 2.4 + th * 2 + k) + 0.03 * Math.sin(x * 3.1 + t * 3.3) + (k === 0 ? 0.03 * Math.sin(z * 5 + t * 7) : 0);
    }
    a.needsUpdate = true;
  }
  for (const a of O.agit) a.rotation.y = t * 5.5;
  // pump pistons
  const th = t * PUMP_W;
  O.rods.forEach((r, k) => { r.position.x = 0.34 * Math.sin(th + k * 2.094); });
  O.wheel.rotation.z = -th;
  // shaker vibration
  O.basket.position.set(12.25 + 0.018 * Math.sin(t * 47), 4.55 + 0.022 * Math.sin(t * 53 + 1), -2.65 + 0.018 * Math.cos(t * 41));
  // shaker cuttings: slide down the screen, fall off into the skip
  let n = 0;
  for (let i = 0; i < 110; i++) {
    const life = 2.6, age = fract(t / life + hash(i, 81)) * life;
    const x = 11.0 + hash(i, 82) * 2.5, s = 0.1 + hash(i, 83) * 0.09;
    if (age < 1.8) {
      const u = age / 1.8;
      setI(O.shCut, n++, x, lerp(4.95, 4.22, u) + 0.07, lerp(-4.3, -0.75, u), s);
    } else {
      const f = age - 1.8;
      const y = Math.max(1.02 + hash(i, 84) * 0.25, 4.22 - 4.9 * f * f);
      setI(O.shCut, n++, lerp(x, 12.25, f * 0.5), y, -0.75 + 1.6 * Math.min(f, 0.55), s);
    }
  }
  done(O.shCut, n);
  n = 0;
  for (let i = 0; i < 90; i++) {
    const life = 0.55, age = fract(t / life + hash(i, 85)) * life;
    const z = -4.2 + hash(i, 86) * 3.2, y0 = lerp(4.95, 4.22, (z + 4.3) / 3.55) - 0.2;
    setI(O.shDrip, n++, 11.0 + hash(i, 87) * 2.5, Math.max(MUDY, y0 - 4.9 * age * age * 1.6), z, 0.07, 0.14);
  }
  done(O.shDrip, n);
  // flow arrows
  const dist = camera.position.distanceTo(O.v3.set(v[3], v[4], v[5]));
  const k = clamp(dist / 22, 1, 3.2), sp = 1.55 * k, speed = 3.2;
  const rD = revealDN(t), rR = revealRET(t);
  n = 0;
  const pulse = 0.85 + 0.15 * Math.sin(t * 6);
  for (const [path, R] of [[O.pathDN, rD], [O.pathRET, rR]]) {
    if (R < 0) continue;
    const N = Math.floor(path.L / sp);
    for (let j = 0; j < N && n < 420; j++) {
      const s = fract(j / N + t * speed / path.L) * path.L;
      if (s > R) continue;
      const edge = R < 1e8 ? clamp((R - s) / 1.5) : 1;
      path.at(s, O.v3, O.tan);
      O.q.setFromUnitVectors(O.up, O.tan);
      O.scl.setScalar(k * pulse * (0.4 + 0.6 * edge));
      O.m4.compose(O.v3, O.q, O.scl);
      O.arrows.setMatrixAt(n++, O.m4);
    }
  }
  O.arrows.count = n; O.arrows.instanceMatrix.needsUpdate = true;
  O.arrows.visible = t >= 18.2;
}

// ---- WELL dynamics
const RATE_W = [[0, 1], [61.3, 1], [61.9, 0], [63.6, 0], [64.2, 1], [200, 1]];
const MW_K = [[85, 12.6], [90.2, 12.6], [91.0, 10.2], [95.1, 10.2], [97.0, 16.2], [99.6, 16.2], [100.3, 13.0], [130, 13.0]];
const PORE = 11.0, FRAC = 15.2;
const mwAt = t => pwl(MW_K, t);
const TA = (Y_TOP - YBT) / 12, TB = 0.4, TCt = 0.5, TD = (0.3 - (YB + 1.4)) / 3.0, TE = 2.0;
const TT = TA + TB + TCt + TD + TE;
const BIT_ROT = t => t * 1.3;
const pp = [0, 0, 0];
function mudPathW(tau, i, rot, out) {
  const jx = (hash(i, 41) - 0.5) * 2, jz = -0.3 + hash(i, 42) * 0.55;
  const side = hash(i, 43) < 0.5 ? -1 : 1, lane = 0.95 + hash(i, 44) * 0.5, lz = -0.55 + hash(i, 45) * 0.85;
  if (tau < TA) { out[0] = jx * 0.25; out[1] = Y_TOP - 12 * tau; out[2] = jz; return 0; }
  const a = rot + (i % 3) * 2.094;
  const ca = Math.cos(a), sa = Math.sin(a);
  if (tau < TA + TB) {
    const u = (tau - TA) / TB;
    out[0] = lerp(0.74, 1.45, u) * ca; out[1] = YB + lerp(0.36, 0.1, u); out[2] = lerp(0.74, 1.45, u) * sa; return 1;
  }
  const sd = ca >= 0 ? 1 : -1;
  if (tau < TA + TB + TCt) {
    const u = (tau - TA - TB) / TCt;
    out[0] = lerp(1.45 * ca, sd * lane, u); out[1] = YB + lerp(0.1, 1.4, u); out[2] = lerp(1.45 * sa, lz, u); return 2;
  }
  const s = side; // annulus lanes
  const c = tau - TA - TB - TCt;
  if (c < TD) {
    const y = YB + 1.4 + 3.0 * c;
    const u = clamp((tau - TA - TB - TCt) / 0.6);
    out[0] = lerp(sd * lane, s * lane, u) + Math.sin(y * 0.7 + i) * 0.06; out[1] = y; out[2] = lz; return 3;
  }
  const e = c - TD;
  if (e < 0.4) { const u = e / 0.4; out[0] = lerp(s * lane, RC + 0.3, u); out[1] = lerp(0.3, 1.0, u); out[2] = lerp(lz, 0.1, u); return 4; }
  out[0] = RC + 0.3 + 3.2 * (e - 0.4); out[1] = 1.0 + jz * 0.4; out[2] = 0.15; return out[0] < 9 ? 4 : -1;
}
function stateWell(t, v) {
  const rot = BIT_ROT(t);
  O.dsRot.rotation.y = rot; O.bit.rotation.y = rot;
  const Dm = pwlIntegral(RATE_W, t);
  const loop = t >= 28.5 && t < 38.8;
  const elapsed = loop ? pwlIntegral(RATE_W, t) - pwlIntegral(RATE_W, 28.5) : 1e9;
  const dist = camera.position.distanceTo(O.v3.set(v[3] + OFF.W[0], v[4], v[5]));
  const ks = clamp(dist / 26, 1, 2.6);
  // window state
  const inWin = t >= 85 && t < 103.4;
  const mw = mwAt(t);
  const lost = inWin ? sstep(FRAC, FRAC + 0.5, mw) : 0;
  const lostFade = inWin ? 1 - sstep(100.1, 100.9, t) : 0;
  // mud particles
  let n = 0;
  const NP = O.NPW;
  for (let i = 0; i < NP; i++) {
    const tau = ((hash(i, 40) * TT + Dm) % TT + TT) % TT;
    if (tau > elapsed) continue;
    const ph = mudPathW(tau, i, rot, pp);
    if (ph < 0) continue;
    if (ph === 1 && pp[2] < -0.2 && Math.abs(pp[0]) < 1.4) continue; // hidden behind the bit
    let sz = ks;
    let col = 0xf1cfa2;
    if (ph === 1) { sz *= 1.35; col = 0xfff4dc; }
    setI(O.mudW, n, pp[0], pp[1], pp[2], sz);
    setC(O.mudW, n, col); n++;
  }
  // leak into fractures (lost circulation)
  if (lost * lostFade > 0.01) {
    for (const C of O.cracks) for (let j = 0; j < 70; j++) {
      const u = fract(hash(j, 141 + C.cr.k) + t * 0.35);
      if (u > lost * 1.0) continue;
      const f = u * (C.pts.length - 1), i0 = Math.floor(f), w = f - i0, a = C.pts[i0], b = C.pts[Math.min(i0 + 1, C.pts.length - 1)];
      const x = RH - 0.05 + lerp(a[0], b[0], w) * O.cracks[C.cr.k].g.scale.x, y = C.cr.y + lerp(a[1], b[1], w);
      setI(O.mudW, n, x, y, 0.12, ks * 0.9 * lostFade);
      setC(O.mudW, n, 0xffb35c); n++;
    }
  }
  // filtrate into porous sandstone (job 4)
  const fj = win(t, 69.3, 77.0, 0.4, 0.4);
  const cake = t < 69 ? 0 : sstep(70.4, 74.6, t);
  if (fj > 0) {
    for (let j = 0; j < 120; j++) {
      const sd = j % 2 ? 1 : -1;
      const sp = lerp(1.2, 0.15, cake);
      const u = fract(hash(j, 151) + (t - 69) * sp * 0.25);
      const y = -24.6 - hash(j, 152) * 5.8;
      setI(O.mudW, n, sd * (RH + 0.05 + u * 3.2), y, 0.06, ks * 0.7 * fj * (1 - u * 0.6));
      setC(O.mudW, n, 0x93c5fd); n++;
    }
  }
  done(O.mudW, n);
  // cuttings
  const Tc = 0.6 + TD * 3 / 1.8 + TE;
  const cutBoost = win(t, 53.2, 61.0, 0.5, 0.5);
  n = 0;
  for (let i = 0; i < 320; i++) {
    if (i >= 220 && cutBoost <= 0) break;
    const tau = ((hash(i, 60) * Tc + Dm) % Tc + Tc) % Tc;
    if (tau > elapsed - (TA + TB)) continue;
    const side = hash(i, 61) < 0.5 ? -1 : 1, lane = 1.0 + hash(i, 62) * 0.45, lz = -0.5 + hash(i, 63) * 0.8;
    const a = hash(i, 64) * 6.283, r0 = 0.3 + hash(i, 65) * 1.1;
    let x, y, z;
    if (tau < 0.6) { const u = tau / 0.6; x = lerp(Math.cos(a) * r0, side * lane, u); y = YB + lerp(0.06, 1.3, u); z = lerp(clamp(Math.sin(a) * r0, -0.6, 0.4), lz, u); }
    else {
      y = YB + 1.3 + 1.8 * (tau - 0.6);
      if (y > 0.3) { const e = (y - 0.3) / 1.8; x = RC + 0.3 + 3.2 * e; y = 1.0; z = 0.12; if (x > 9) continue; }
      else { x = side * lane + Math.sin(y * 0.9 + i) * 0.08; z = lz; }
    }
    const s = (0.11 + hash(i, 66) * 0.1) * ks * (1 + 0.35 * cutBoost);
    setI(O.cutW, n, x, y, z, s);
    setC(O.cutW, n, [0x5b4a3a, 0x6f6252, 0x4a3b2e][i % 3]); n++;
  }
  done(O.cutW, n);
  // gas bubbles (kick)
  let ng = 0;
  if (inWin && t > 91.0) {
    for (let j = 0; j < 140; j++) {
      const te = 91.0 + j * 0.035;
      if (te > t || mwAt(te) >= PORE) continue;
      const age = t - te;
      const side = hash(j, 111) < 0.5 ? -1 : 1, lane = 1.05 + hash(j, 112) * 0.4, lz = -0.4 + hash(j, 113) * 0.7;
      const ye = -35.2 - hash(j, 114) * 3.0;
      let x, y;
      if (age < 0.8) { const u = age / 0.8; x = side * lerp(RH + 0.3, lane, u); y = ye + u * 0.5; }
      else { y = ye + 0.5 + 2.4 * (age - 0.8) + 0.25 * (age - 0.8) * (age - 0.8); x = side * lane + Math.sin(y * 0.8 + j) * 0.1; }
      if (y > -18) continue;
      const r = (0.2 + 0.22 * clamp((y - ye) / 14) + hash(j, 115) * 0.07) * Math.min(1.6, ks);
      setI(O.gasW, ng++, x, y, lz, r);
    }
  }
  done(O.gasW, ng);
  O.gasPores.material.opacity = 0.5 + 0.25 * Math.sin(t * 3) + (inWin && mw < PORE ? 0.25 * Math.sin(t * 10) : 0);
  // cracks
  O.cracks.forEach((C, k) => {
    const g = inWin ? sstep(FRAC - 0.1, FRAC + 0.8, mw) * (t < 100.0 ? 1 : 1) : 0;
    const grow = inWin && t < 100.0 ? eout((t - 96.85 - k * 0.25) / 1.1) * g : g;
    C.g.visible = grow * lostFade > 0.01;
    C.g.scale.set(Math.max(0.01, grow), 1, 1);
    C.fill.scale.set(clamp((t - 97.4 - k * 0.2) / 1.6), 1, 1);
    C.fill.visible = t > 97.4;
  });
  // filter cake
  const ca = t < 69 ? 0 : cake;
  O.cake.visible = ca > 0.01; O.cakeM.opacity = 0.95 * ca;
  const th = 0.03 + 0.13 * ca;
  O.cakeStrips.forEach((m, k) => { m.visible = ca > 0.01; m.scale.x = th; m.position.x = (k ? -1 : 1) * (RH - th / 2); });
  // bit heat (job 3)
  const heat = t < 61 || t > 69.5 ? 0 : sstep(61.5, 63.4, t) * (1 - sstep(64.6, 67.4, t));
  setEm(O.bitM, 0xff3b1f, heat * 0.85); setEm(O.bitM2, 0xff5a1f, heat * 0.75); setEm(O.teethM, 0xff6b2a, heat * 0.6);
  O.heatGlow.material.opacity = heat * (0.28 + 0.06 * Math.sin(t * 14));
  O.heatGlow.visible = heat > 0.01;
  // nozzle jets
  const rate = t > 61.3 && t < 64.2 ? (t < 61.9 ? 1 - (t - 61.3) / 0.6 : t > 63.6 ? (t - 63.6) / 0.6 : 0) : 1;
  const jetA = (0.3 + 0.5 * win(t, 32.0, 35.4, 0.3, 0.4)) * rate * (loop && elapsed < TA ? 0 : 1);
  O.jetM.opacity = jetA * (0.85 + 0.15 * Math.sin(t * 25));
  // MWD highlight + pulses
  const mh = win(t, 77.2, 85, 0.4, 0.4) * (0.6 + 0.4 * Math.sin(t * 6));
  setEm(O.mwdM, 0x22d3ee, mh * 0.55); setEm(O.mwdEdge, 0x22d3ee, mh * 0.5);
  let np = 0;
  if (t > 78 && t < 85.5) {
    for (let j = 0; j < MWD_BITS.length; j++) {
      if (!MWD_BITS[j]) continue;
      const te = 78.2 + j * 0.55, age = t - te;
      if (age < 0) continue;
      const y = Y_MWD1 + 9 * age;
      if (y > Y_TOP) continue;
      setI(O.pulseW, np++, 0, y, 0, 1, 1);
    }
  }
  done(O.pulseW, np);
}
const MWD_BITS = [1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1];

function stateStudio(t) {
  O.beakers.forEach((b, i) => {
    const a = sstep(104.0 + i * 1.6, 104.6 + i * 1.6, t);
    b.P.rotation.y = 0.3 * Math.sin(t * 0.5 + i);
    b.P.scale.setScalar(0.001 + 0.999 * eout(a));
    b.P.position.y = 0;
  });
}

function applyState(t) {
  if (O.lastT === t) return;
  O.lastT = t;
  const s = O.shot = shotFor(t);
  placeCam(s.set, s.v, s.vo || 0);
  if (s.set === 'L') stateLand(t, s.v);
  if (s.set === 'W') stateWell(t, s.v);
  if (s.set === 'T') stateStudio(t);
  scene.updateMatrixWorld();
}

function renderFrame(t) {
  applyState(t);
  const s = O.shot;
  showOnly(s.set); env(s.set);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- overlay (2D)
function proj(p, local) {
  const v = O.v3b.set(p[0], p[1], p[2]);
  if (local) v.applyMatrix4(local.matrixWorld);
  v.project(camera);
  return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, ok: v.z < 1 };
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const F = (w, s) => `${w} ${s}px Kanit`;

function pill(ctx, cx, cy, en, th, color, a = 1, size = 34, align = 'center') {
  ctx.save(); ctx.globalAlpha = a;
  ctx.font = F(600, size); const we = ctx.measureText(en).width;
  ctx.font = F(400, size * 0.9); const wt = th ? ctx.measureText(th).width : 0;
  const sep = th ? 22 : 0, padX = 26, dot = 16;
  const w = padX * 2 + dot + 14 + we + sep + wt, h = size * 1.75;
  let x = align === 'center' ? cx - w / 2 : align === 'left' ? cx : cx - w;
  x = clamp(x, 62, 958 - w);
  const y = cy - h / 2;
  ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; rr(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + padX + dot / 2, cy, dot / 2, 0, 7); ctx.fill();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  let tx = x + padX + dot + 14;
  ctx.font = F(600, size); ctx.fillStyle = HEX.ink; ctx.fillText(en, tx, cy + 1); tx += we;
  if (th) {
    ctx.fillStyle = 'rgba(15,23,42,0.35)'; ctx.fillRect(tx + sep / 2 - 1, cy - size * 0.45, 2, size * 0.9);
    ctx.font = F(400, size * 0.9); ctx.fillStyle = '#334155'; ctx.fillText(th, tx + sep, cy + 1);
  }
  ctx.restore();
  return { x, y, w, h };
}
function pillBounds(ctx, cx, cy, en, th, size, align) {
  ctx.save(); ctx.font = F(600, size); const we = ctx.measureText(en).width;
  ctx.font = F(400, size * 0.9); const wt = th ? ctx.measureText(th).width : 0; ctx.restore();
  const w = 52 + 16 + 14 + we + (th ? 22 : 0) + wt, h = size * 1.75;
  let x = align === 'center' ? cx - w / 2 : align === 'left' ? cx : cx - w;
  x = clamp(x, 62, 958 - w);
  return { x, y: cy - h / 2, w, h };
}
function callout(ctx, t, t0, t1, anchor, local, px, py, en, th, color, size = 36, align = 'center') {
  const a = win(t, t0, t1, 0.4, 0.35);
  if (a <= 0) return;
  const P = proj(anchor, local);
  if (!P.ok) return;
  const k = eout((t - t0) / 0.5);
  const b = pillBounds(ctx, px, py, en, th, size, align);
  const ex = clamp(P.x, b.x + b.h / 2, b.x + b.w - b.h / 2), ey = P.y > b.y + b.h ? b.y + b.h : P.y < b.y ? b.y : b.y + b.h / 2;
  const sx = P.y > b.y + b.h || P.y < b.y ? ex : (P.x < b.x ? b.x : b.x + b.w);
  const lx = lerp(sx, P.x, k), ly = lerp(ey, P.y, k);
  ctx.save(); ctx.globalAlpha = a;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.moveTo(sx, ey); ctx.lineTo(lx, ly); ctx.stroke();
  if (k > 0.95) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(P.x, P.y, 10, 0, 7); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
    const ph = fract((t - t0) * 0.8);
    ctx.globalAlpha = a * (1 - ph); ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(P.x, P.y, 11 + ph * 26, 0, 7); ctx.stroke();
  }
  ctx.restore();
  pill(ctx, px, py + (1 - k) * 14, en, th, color, a, size, align);
}

function chapter(ctx, t, t0, t1, num, th, en, by = 0) {
  const a = win(t, t0, t1, 0.4, 0.3);
  if (a <= 0) return;
  const big = 1 - sstep(t0 + 1.7, t0 + 2.2, t);
  ctx.save();
  if (big > 0.01) {
    const k = eout((t - t0) / 0.6);
    ctx.globalAlpha = a * big;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 24;
    ctx.translate(0, by);
    ctx.font = F(600, 32); ctx.fillStyle = '#ffd166';
    ctx.fillText(`${num}  ·  ${en}`, 510, 300 - (1 - k) * 30);
    ctx.font = F(600, 88); const tw = ctx.measureText(th).width;
    if (tw > 860) ctx.font = F(600, Math.floor(88 * 860 / tw));
    ctx.fillStyle = '#ffffff';
    ctx.fillText(th, 510, 382 - (1 - k) * 30);
    ctx.fillStyle = '#ffd166'; ctx.shadowBlur = 0; rr(ctx, 510 - 50 * k, 442, 100 * k, 8, 4); ctx.fill();
    ctx.translate(0, -by);
  }
  const sm = sstep(t0 + 1.8, t0 + 2.3, t);
  if (sm > 0) {
    ctx.globalAlpha = a * sm;
    ctx.font = F(600, 28); const label = `${num}  ${th}`; const w = ctx.measureText(label).width + 48;
    ctx.fillStyle = 'rgba(10,18,36,0.74)'; rr(ctx, 70, 166, w, 54, 27); ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(96, 193, 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(label, 112, 194);
  }
  ctx.restore();
}

function badge(ctx, t, t0, t1, cx, cy, en, th, color, size = 46) {
  const a = win(t, t0, t1, 0.35, 0.35); if (a <= 0) return;
  const k = eout((t - t0) / 0.4), s = 0.7 + 0.3 * k + 0.06 * Math.sin(clamp((t - t0) / 0.4) * Math.PI);
  ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy); ctx.scale(s, s);
  ctx.font = F(600, size); const w1 = ctx.measureText(th).width;
  ctx.font = F(600, size * 0.55); const w2 = ctx.measureText(en).width;
  const w = Math.max(w1, w2) + 90, h = size * 2.35;
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 8;
  ctx.fillStyle = color; rr(ctx, -w / 2, -h / 2, w, h, 28); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = F(600, size); ctx.fillText(th, 0, -size * 0.33);
  ctx.font = F(600, size * 0.55); ctx.globalAlpha = a * 0.9; ctx.fillText(en, 0, size * 0.6);
  ctx.restore();
}
function warnIcon(ctx, x, y, s, col = '#fff', ink = '#ef4444') {
  ctx.save(); ctx.fillStyle = col; ctx.beginPath();
  ctx.moveTo(x, y - s * 0.55); ctx.lineTo(x + s * 0.55, y + s * 0.42); ctx.lineTo(x - s * 0.55, y + s * 0.42); ctx.closePath(); ctx.fill();
  ctx.fillStyle = ink; ctx.fillRect(x - s * 0.05, y - s * 0.22, s * 0.1, s * 0.36); ctx.beginPath(); ctx.arc(x, y + s * 0.27, s * 0.065, 0, 7); ctx.fill();
  ctx.restore();
}
function alarm(ctx, t, t0, t1, en, th, cy, rgb = [255, 20, 20], size = 84, cx = 510) {
  const a = win(t, t0, t1, 0.2, 0.4); if (a <= 0) return;
  const p = 0.5 + 0.5 * Math.sin((t - t0) * Math.PI * 3);
  ctx.save();
  const g = ctx.createRadialGradient(540, 960, 600, 540, 960, 1250);
  g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`); g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.38 * p * a})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const k = eout((t - t0) / 0.3);
  ctx.globalAlpha = a; ctx.translate(cx, cy); ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k);
  ctx.font = F(600, size); const w = ctx.measureText(en).width + size * 2;
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 30;
  ctx.fillStyle = `rgba(${Math.min(255, rgb[0] - 40 + 40 * p) | 0},${(rgb[1] * 0.9 + 20) | 0},${(rgb[2] * 0.6 + 30) | 0},0.95)`;
  const hh = size * 1.65;
  rr(ctx, -w / 2, -hh / 2, w, hh, 30); ctx.fill();
  ctx.shadowColor = 'transparent';
  warnIcon(ctx, -w / 2 + size * 0.85, -2, size * 0.83, '#fff', `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(en, -w / 2 + size * 1.5, 2);
  if (th) { ctx.font = F(600, 40); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 14; ctx.fillText(th, 0, hh / 2 + 44); }
  ctx.restore();
}
function fade(ctx, t, tc, color, half = 0.25) {
  const d = Math.abs(t - tc); if (d >= half) return;
  ctx.save(); ctx.globalAlpha = 1 - d / half; ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); ctx.restore();
}
function panel(ctx, x, y, w, h, a) {
  ctx.globalAlpha = a; ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 20;
  ctx.fillStyle = 'rgba(10,18,36,0.82)'; rr(ctx, x, y, w, h, 26); ctx.fill(); ctx.shadowColor = 'transparent';
}
function arrowLine(ctx, x0, y0, x1, y1, col, wdt = 8, head = 22) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = wdt; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - Math.cos(a) * head * 0.8, y1 - Math.sin(a) * head * 0.8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - Math.cos(a - 0.5) * head, y1 - Math.sin(a - 0.5) * head); ctx.lineTo(x1 - Math.cos(a + 0.5) * head, y1 - Math.sin(a + 0.5) * head); ctx.closePath(); ctx.fill();
}

// ---- title
function titleCard(ctx, t) {
  const a = sstep(0.2, 0.9, t) * (1 - sstep(7.3, 7.9, t)); if (a <= 0) return;
  const k = eout((t - 0.2) / 0.9), k2 = eout((t - 0.8) / 0.8);
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(30,10,50,0.6)'; ctx.shadowBlur = 30;
  ctx.font = F(600, 32); ctx.fillStyle = '#ffd59a'; ctx.fillText('OIL & GAS 101 · EP.03', 510, 250 - (1 - k) * 24);
  ctx.font = F(600, 150); ctx.fillStyle = '#ffffff'; ctx.fillText('น้ำโคลนเจาะ', 510, 372 - (1 - k) * 40);
  ctx.shadowBlur = 0; ctx.fillStyle = '#ffb627'; rr(ctx, 510 - 90 * k2, 470, 180 * k2, 10, 5); ctx.fill();
  ctx.shadowBlur = 26; ctx.globalAlpha = a * k2;
  ctx.font = F(600, 72); ctx.fillStyle = '#ffe3a3'; ctx.fillText('Drilling Mud', 510, 545);
  const q = sstep(2.4, 3.0, t);
  if (q > 0) {
    ctx.globalAlpha = a * q; ctx.font = F(600, 52); const qt = 'ทำไมเจาะหลุมต้องใช้โคลน?'; const w = ctx.measureText(qt).width + 90;
    ctx.shadowBlur = 20; ctx.fillStyle = 'rgba(10,18,36,0.84)'; rr(ctx, 540 - w / 2, 1150 - 50 + (1 - q) * 20, w, 100, 50); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(540 - w / 2 + 44, 1150 + (1 - q) * 20, 9, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(qt, 552, 1152 + (1 - q) * 20);
  }
  ctx.restore();
}

// ---- circulation loop strip
const STEPS = [
  { t: 18.0, th: 'บ่อโคลน' }, { t: 21.5, th: 'ปั๊ม' }, { t: 25.0, th: 'ท่อตั้ง' }, { t: 28.5, th: 'ก้านเจาะ' },
  { t: 32.0, th: 'หัวฉีด' }, { t: 35.4, th: 'ขาขึ้น' }, { t: 38.8, th: 'ตะแกรง' },
];
function loopStrip(ctx, t) {
  const A = win(t, 20.0, 45.0, 0.5, 0.4); if (A <= 0) return;
  const x0 = 140, dx = 133, y = 282;
  ctx.save();
  panel(ctx, 70, 232, 880, 146, A * 0.95);
  ctx.globalAlpha = A;
  // return arc (back to pits)
  const ret = sstep(42.0, 43.2, t);
  const xe = x0 + dx * 6;
  ctx.lineWidth = 5; ctx.lineCap = 'round';
  const cur = STEPS.reduce((c, s, i) => (t >= s.t ? i : c), 0);
  for (let i = 0; i < 6; i++) {
    const reach = sstep(STEPS[i + 1].t - 0.2, STEPS[i + 1].t + 0.5, t);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(x0 + dx * i, y); ctx.lineTo(x0 + dx * (i + 1), y); ctx.stroke();
    if (reach > 0) { ctx.strokeStyle = HEX.flow; ctx.beginPath(); ctx.moveTo(x0 + dx * i, y); ctx.lineTo(x0 + dx * (i + reach), y); ctx.stroke(); }
  }
  if (ret > 0) {
    ctx.strokeStyle = HEX.flow; ctx.setLineDash([10, 9]); ctx.lineDashOffset = -t * 30;
    ctx.beginPath(); ctx.moveTo(xe + 30, y); ctx.lineTo(xe + 52, y); ctx.lineTo(xe + 52, y + 74 * ret);
    if (ret > 0.4) { const u = (ret - 0.4) / 0.6; ctx.lineTo(lerp(xe + 52, x0 - 52, u), y + 74); if (u > 0.98) ctx.lineTo(x0 - 52, y + 2); }
    ctx.stroke(); ctx.setLineDash([]);
    if (ret > 0.98) { ctx.fillStyle = HEX.flow; ctx.beginPath(); ctx.moveTo(x0 - 52, y - 4); ctx.lineTo(x0 - 62, y + 14); ctx.lineTo(x0 - 42, y + 14); ctx.fill(); }
  }
  STEPS.forEach((s, i) => {
    const on = t >= s.t - 0.15, act = i === cur && t < 42.0 ? 1 : (t >= 42.0 && i === 0 ? sstep(43.0, 43.4, t) : 0);
    const r = 22 + 8 * act;
    const cx = x0 + dx * i;
    ctx.fillStyle = on ? (act ? HEX.flow : '#14b8a6') : 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(cx, y, r, 0, 7); ctx.fill();
    if (act) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.fillStyle = on ? HEX.ink : 'rgba(255,255,255,0.5)'; ctx.font = F(600, 24); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), cx, y + 1);
    ctx.font = F(act ? 600 : 400, 24); ctx.fillStyle = on ? (act ? '#ffd166' : '#ffffff') : 'rgba(255,255,255,0.4)';
    ctx.fillText(s.th, cx, y + 48);
  });
  ctx.restore();
}

// ---- job card
function jobCard(ctx, t, t0, t1, n, th, en, color) {
  const a = win(t, t0, t1, 0.45, 0.35); if (a <= 0) return;
  const k = eout((t - t0) / 0.5);
  const x = 70, y = 236, w = 880, h = 130;
  ctx.save(); ctx.globalAlpha = a; ctx.translate((1 - k) * -60, 0);
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  ctx.fillStyle = 'rgba(255,255,255,0.96)'; rr(ctx, x, y, w, h, 30); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.fillStyle = color; rr(ctx, x, y, 16, h, 8); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 82, y + h / 2, 44, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = F(600, 56); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(n), x + 82, y + h / 2 + 2);
  ctx.textAlign = 'left'; ctx.fillStyle = HEX.ink;
  ctx.font = F(600, 54); const tw = ctx.measureText(th).width; if (tw > 700) ctx.font = F(600, Math.floor(54 * 700 / tw));
  ctx.fillText(th, x + 148, y + 52);
  ctx.font = F(600, 26); ctx.fillStyle = color; ctx.fillText(en, x + 150, y + 100);
  // 5-dot progress
  for (let i = 0; i < 5; i++) { ctx.fillStyle = i < n ? color : 'rgba(15,23,42,0.15)'; ctx.beginPath(); ctx.arc(x + w - 150 + i * 26, y + 100, 8, 0, 7); ctx.fill(); }
  ctx.restore();
}

// ---- job 1 gauge: mud column vs formation pressure
function pressGauge(ctx, t, a) {
  if (a <= 0) return;
  const k = eout((t - 47.0) / 1.2);
  const x = 700, y = 560, w = 252, h = 420;
  ctx.save(); panel(ctx, x, y, w, h, a);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.font = F(600, 30); ctx.fillText('แรงดัน', x + w / 2, y + 36);
  ctx.font = F(400, 22); ctx.fillStyle = 'rgba(200,215,240,0.85)'; ctx.fillText('PRESSURE', x + w / 2, y + 66);
  const bh = 200, by = y + 92;
  for (const [val, col, th, en, bx] of [[0.82 * k, '#60a5fa', 'โคลน', 'Mud', x + 72], [0.62 * k, '#f87171', 'ในหิน', 'Rock', x + w - 72]]) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(ctx, bx - 28, by, 56, bh, 12); ctx.fill();
    const hh = Math.max(1, bh * val);
    ctx.fillStyle = col; rr(ctx, bx - 28, by + bh - hh, 56, hh, 12); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = F(600, 26); ctx.fillText(th, bx, by + bh + 28);
    ctx.font = F(400, 20); ctx.fillStyle = 'rgba(200,215,240,0.85)'; ctx.fillText(en, bx, by + bh + 54);
  }
  ctx.font = F(600, 40); ctx.fillStyle = '#fff'; ctx.fillText('>', x + w / 2, by + bh * 0.55);
  const ok = sstep(48.0, 48.4, t);
  ctx.globalAlpha = a * ok;
  ctx.fillStyle = HEX.safe; rr(ctx, x + 18, y + h - 66, w - 36, 50, 25); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = F(600, 26); ctx.fillText('ปลอดภัย ✓', x + w / 2, y + h - 40);
  ctx.restore();
}
// pressure arrows along the well (hydrostatic grows with depth)
function pressArrows(ctx, t, a) {
  if (a <= 0) return;
  const G = O.sets.W;
  ctx.save(); ctx.globalAlpha = a; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8;
  const depths = [-6, -14, -22, -30];
  depths.forEach((yy, i) => {
    const u = sstep(47.0 + i * 0.25, 47.6 + i * 0.25, t);
    if (u <= 0) return;
    const L = (26 + 22 * i) * u;
    for (const s of [1, -1]) {
      const P = proj([s * RH, yy, 0], G);
      arrowLine(ctx, P.x - s * 6, P.y, P.x + s * L, P.y, '#60a5fa', 7, 18);
    }
  });
  // formation pushes back at the high-pressure layer
  const u = sstep(47.6, 48.3, t);
  if (u > 0) for (const s of [1, -1]) {
    const P = proj([s * RH, -36.5, 0], G);
    const L = 80 * u;
    arrowLine(ctx, P.x + s * (L + 30), P.y, P.x + s * 22, P.y, '#f87171', 7, 18);
  }
  ctx.restore();
}
function thermo(ctx, t, a) {
  if (a <= 0) return;
  const heat = sstep(61.5, 63.4, t) * (1 - sstep(64.6, 67.4, t));
  const x = 806, y = 520, w = 140, h = 470;
  ctx.save(); panel(ctx, x, y, w, h, a);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.font = F(600, 26); ctx.fillText('อุณหภูมิ', x + w / 2, y + 34);
  const tx = x + w / 2, ty0 = y + 74, ty1 = y + h - 90;
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; rr(ctx, tx - 16, ty0, 32, ty1 - ty0, 16); ctx.fill();
  const col = heat > 0.5 ? '#ef4444' : heat > 0.2 ? '#f59e0b' : '#38bdf8';
  const lv = 0.25 + 0.7 * heat;
  ctx.fillStyle = col; rr(ctx, tx - 10, ty1 - (ty1 - ty0) * lv, 20, (ty1 - ty0) * lv, 10); ctx.fill();
  ctx.beginPath(); ctx.arc(tx, ty1 + 20, 28, 0, 7); ctx.fill();
  ctx.font = F(600, 30); ctx.fillStyle = '#fff'; ctx.fillText(heat > 0.5 ? 'ร้อน' : 'เย็น', tx, y + h - 26);
  ctx.restore();
}
function pulsePanel(ctx, t, a) {
  if (a <= 0) return;
  const x = 560, y = 560, w = 390, h = 250;
  ctx.save(); panel(ctx, x, y, w, h, a);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.font = F(600, 28); ctx.fillText('แรงดันที่ผิวดิน', x + 26, y + 36);
  ctx.font = F(400, 20); ctx.fillStyle = 'rgba(200,215,240,0.85)'; ctx.fillText('SURFACE PRESSURE', x + 26, y + 66);
  const gx0 = x + 24, gx1 = x + w - 24, gy = y + 160, span = 4.0;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx0, gy); ctx.lineTo(gx1, gy); ctx.stroke();
  ctx.strokeStyle = HEX.mwd; ctx.lineWidth = 4; ctx.beginPath();
  const travel = (Y_TOP - Y_MWD1) / 9;
  for (let i = 0; i <= 120; i++) {
    const tt = t - span + span * i / 120;
    let v = 0;
    for (let j = 0; j < MWD_BITS.length; j++) if (MWD_BITS[j]) { const d = tt - (78.2 + j * 0.55 + travel); if (d > 0 && d < 0.4) v = Math.max(v, Math.sin(d / 0.4 * Math.PI)); }
    const px = lerp(gx0, gx1, i / 120), py = gy - v * 62;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // decoded bits
  let s = '';
  for (let j = 0; j < MWD_BITS.length; j++) if (t > 78.2 + j * 0.55 + travel + 0.2) s += MWD_BITS[j];
  ctx.font = F(600, 30); ctx.fillStyle = '#ffd166'; ctx.fillText(s.slice(-10).split('').join(' '), x + 26, y + h - 32);
  ctx.restore();
}

// ---- mud weight window gauge
function windowGauge(ctx, t) {
  const a = win(t, 85.3, 103.4, 0.5, 0.3); if (a <= 0) return;
  const x = 66, y = 520, w = 290, h = 700;
  const mw = mwAt(t);
  const vmin = 8, vmax = 18;
  const gx = x + 104, gy0 = y + 96, gy1 = y + h - 110;
  const Y = v => lerp(gy1, gy0, (v - vmin) / (vmax - vmin));
  ctx.save(); panel(ctx, x, y, w, h, a * 0.95); ctx.globalAlpha = a;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.font = F(600, 30); ctx.fillText('น้ำหนักโคลน', x + w / 2, y + 36);
  ctx.font = F(400, 20); ctx.fillStyle = 'rgba(200,215,240,0.85)'; ctx.fillText('MUD WEIGHT · ppg', x + w / 2, y + 66);
  // zones
  ctx.fillStyle = 'rgba(239,68,68,0.28)'; ctx.fillRect(gx - 26, Y(PORE), 52, gy1 - Y(PORE));
  ctx.fillStyle = 'rgba(34,197,94,0.35)'; ctx.fillRect(gx - 26, Y(FRAC), 52, Y(PORE) - Y(FRAC));
  ctx.fillStyle = 'rgba(249,115,22,0.3)'; ctx.fillRect(gx - 26, gy0, 52, Y(FRAC) - gy0);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(gx - 26, gy0, 52, gy1 - gy0);
  for (let v = 8; v <= 18; v += 2) { ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = F(400, 20); ctx.textAlign = 'right'; ctx.fillText(String(v), gx - 36, Y(v)); }
  // lines
  for (const [v, col, en, th] of [[FRAC, HEX.frac, 'Fracture', 'หินแตก'], [PORE, HEX.pore, 'Pore', 'แรงดันในหิน']]) {
    ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(gx - 34, Y(v)); ctx.lineTo(gx + 40, Y(v)); ctx.stroke();
    ctx.textAlign = 'left'; ctx.font = F(600, 22); ctx.fillStyle = col; ctx.fillText(en, gx + 46, Y(v) - 13);
    ctx.font = F(400, 20); ctx.fillStyle = '#fff'; ctx.fillText(th, gx + 46, Y(v) + 13);
  }
  // slider
  const state = mw < PORE ? 'kick' : mw > FRAC ? 'lost' : 'ok';
  const col = state === 'kick' ? HEX.danger : state === 'lost' ? HEX.lost : HEX.safe;
  const sy = Y(mw);
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10;
  ctx.fillStyle = col; rr(ctx, gx - 40, sy - 9, 80, 18, 9); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(gx - 46, sy); ctx.lineTo(gx - 62, sy - 12); ctx.lineTo(gx - 62, sy + 12); ctx.fill();
  ctx.shadowBlur = 0;
  // readout
  ctx.fillStyle = col; rr(ctx, x + 20, y + h - 92, w - 40, 72, 24); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = F(600, 30);
  ctx.fillText(`${mw.toFixed(1)} ppg  ${state === 'ok' ? '✓' : '✕'}`, x + w / 2, y + h - 56);
  // barite sacks dropping in
  for (let i = 0; i < 3; i++) {
    const t0 = 95.1 + i * 0.5, u = clamp((t - t0) / 0.6);
    if (u <= 0 || u >= 1) continue;
    const bx = gx + 90, byy = lerp(y - 40, sy, eio(u));
    ctx.globalAlpha = a * (1 - u * 0.6);
    ctx.fillStyle = '#f3f4f1'; rr(ctx, bx - 28, byy - 20, 56, 40, 8); ctx.fill();
    ctx.fillStyle = '#d62828'; ctx.fillRect(bx - 28, byy - 6, 56, 12);
  }
  ctx.restore();
}

// ---- 3 mud types
const TYPES = [
  { t: 104.0, tag: 'WBM', th: 'โคลนฐานน้ำ', d: 'ใช้มากที่สุด · ราคาถูก', en: 'Water-based · most common, cheapest', col: HEX.wbm, ic: 'drop' },
  { t: 105.6, tag: 'OBM', th: 'โคลนฐานน้ำมัน', d: 'หินดินดานบวมน้ำ · หลุมร้อน', en: 'Oil-based · reactive shale, hot wells', col: HEX.obm, ic: 'oil' },
  { t: 107.2, tag: 'SBM', th: 'โคลนสังเคราะห์', d: 'งานนอกชายฝั่ง · กระทบน้อยกว่า', en: 'Synthetic · offshore, lower impact', col: HEX.sbm, ic: 'leaf' },
];
function typeIcon(ctx, kind, x, y, col) {
  ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  if (kind === 'drop' || kind === 'oil') {
    ctx.beginPath(); ctx.moveTo(x, y - 36); ctx.bezierCurveTo(x + 32, y + 2, x + 28, y + 30, x, y + 30); ctx.bezierCurveTo(x - 28, y + 30, x - 32, y + 2, x, y - 36); ctx.fill();
    ctx.fillStyle = col; ctx.font = F(600, 26); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(kind === 'drop' ? 'H₂O' : 'OIL', x, y + 10);
  } else {
    ctx.beginPath(); ctx.moveTo(x - 26, y + 26); ctx.quadraticCurveTo(x - 30, y - 28, x + 28, y - 30); ctx.quadraticCurveTo(x + 30, y + 24, x - 26, y + 26); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 20, y + 20); ctx.lineTo(x + 18, y - 20); ctx.stroke();
  }
  ctx.restore();
}
function typeCards(ctx, t) {
  TYPES.forEach((c, i) => {
    const a = win(t, c.t, 113.2, 0.45, 0.4); if (a <= 0) return;
    const k = eout((t - c.t) / 0.5);
    const x = 70, y = 760 + i * 172, w = 880, h = 156;
    ctx.save(); ctx.globalAlpha = a; ctx.translate((1 - k) * 70, 0);
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8;
    ctx.fillStyle = 'rgba(255,255,255,0.96)'; rr(ctx, x, y, w, h, 30); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.fillStyle = c.col; ctx.beginPath(); ctx.arc(x + 84, y + h / 2, 54, 0, 7); ctx.fill();
    typeIcon(ctx, c.ic, x + 84, y + h / 2, c.col);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = F(600, 50); ctx.fillStyle = c.col; ctx.fillText(c.tag, x + 166, y + 48);
    const tw = ctx.measureText(c.tag).width;
    ctx.font = F(600, 42); ctx.fillStyle = HEX.ink; ctx.fillText(c.th, x + 186 + tw, y + 48);
    ctx.font = F(400, 34); ctx.fillStyle = '#334155'; ctx.fillText(c.d, x + 166, y + 106);
    ctx.restore();
    // tag above the matching beaker
    const P = proj([0, 4.4, 0], O.beakers[i].P);
    pill(ctx, P.x, P.y - 34, c.tag, '', c.col, a, 34);
  });
}

function endCard(ctx, t) {
  const a = win(t, 113.8, 121, 0.7, 0.1); if (a <= 0) return;
  const k = eout((t - 113.8) / 0.8);
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(20,10,40,0.6)'; ctx.shadowBlur = 28;
  ctx.font = F(600, 30); ctx.fillStyle = '#ffd59a'; ctx.fillText('DRILLING MUD', 510, 258 - (1 - k) * 20);
  ctx.font = F(600, 120); ctx.fillStyle = '#fff'; ctx.fillText('น้ำโคลนเจาะ', 510, 360 - (1 - k) * 30);
  ctx.shadowBlur = 0; ctx.fillStyle = '#ffb627'; rr(ctx, 510 - 80 * k, 440, 160 * k, 10, 5); ctx.fill();
  ctx.shadowBlur = 24;
  ctx.font = F(600, 62); ctx.fillStyle = '#ffffff'; ctx.fillText('= เลือดของหลุมเจาะ', 510, 515);
  ctx.font = F(400, 36); ctx.fillStyle = '#ffe3a3'; ctx.fillText('the lifeblood of every well', 510, 580);
  // 5 jobs recap chips
  const chips = ['คุมแรงดัน', 'พาเศษหิน', 'ระบายร้อน', 'ฉาบผนัง', 'ส่งข้อมูล'];
  const u = sstep(115.0, 115.6, t);
  if (u > 0) {
    ctx.globalAlpha = a * u; ctx.font = F(600, 28); ctx.shadowBlur = 10;
    const ws = chips.map(c => ctx.measureText(c).width + 40), tot = ws.reduce((s, v) => s + v, 0) + 14 * 4;
    let cx = 540 - Math.min(tot, 880) / 2;
    const sc = Math.min(1, 880 / tot);
    chips.forEach((c, i) => {
      const w = ws[i] * sc;
      ctx.fillStyle = 'rgba(10,18,36,0.8)'; rr(ctx, cx, 640, w, 52, 26); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = F(600, 28 * sc); ctx.fillText(c, cx + w / 2, 667);
      cx += w + 14 * sc;
    });
  }
  ctx.restore();
}

function drawOverlay(ctx, t) {
  applyState(t);
  ctx.save(); ctx.textBaseline = 'middle';
  const L = O.sets.L, WG = O.sets.W;
  if (t < 8.2) titleCard(ctx, t);
  // ---- NOT DIRT
  if (t >= 8 && t < 18.2) {
    chapter(ctx, t, 8.0, 18.0, '01', 'ไม่ใช่แค่ดินโคลน', 'NOT JUST DIRT');
    callout(ctx, t, 9.0, 12.6, [18.25, 3.0, -2.2], L, 330, 560, 'Mud Tank', 'บ่อโคลน', HEX.mud);
    callout(ctx, t, 9.5, 12.6, [18.25, 4.1, -4.0], L, 700, 700, 'Agitator', 'ใบกวน', HEX.pump);
    callout(ctx, t, 14.0, 17.9, [16.1, 1.2, 3.0], L, 680, 560, 'BARITE', 'เพิ่มน้ำหนัก', HEX.barite);
    callout(ctx, t, 14.5, 17.9, [14.6, 1.2, 3.0], L, 330, 720, 'BENTONITE', 'เพิ่มความหนืด', HEX.bent);
  }
  // ---- CIRCULATION LOOP
  if (t >= 18 && t < 45.2) {
    chapter(ctx, t, 18.0, 45.0, '02', 'วงจรน้ำโคลน', 'CIRCULATION LOOP');
    loopStrip(ctx, t);
    if (t < 28.5) {
      callout(ctx, t, 18.5, 21.6, [24.0, 3.0, -4.0], L, 360, 560, 'Mud Pits', 'บ่อโคลน', HEX.mud);
      callout(ctx, t, 22.2, 25.2, [23.65, 1.35, 7.85], L, 560, 560, 'Mud Pump', 'ปั๊ม 3 ลูกสูบ', HEX.pump);
      callout(ctx, t, 25.6, 28.6, [4.7, 13, 1.5], L, 740, 560, 'Standpipe', 'ท่อตั้ง', '#94a3b8');
      callout(ctx, t, 25.8, 28.6, [0, 21.0, 0.6], L, 300, 470, 'Top Drive', 'หัวขับ', '#ef4444');
    } else if (t < 38.8) {
      callout(ctx, t, 28.8, 31.9, [0, -6, 0.3], WG, 300, 620, 'Drill Pipe', 'ก้านเจาะ', '#94a3b8');
      callout(ctx, t, 32.6, 35.6, [0.8, YB + 0.3, 0.9], WG, 340, 600, 'Bit Nozzles', 'หัวฉีดโคลน', HEX.flow);
      callout(ctx, t, 35.8, 38.9, [-1.25, -27.5, 0.2], WG, 290, 560, 'Annulus', 'ช่องว่างรอบก้าน', HEX.mud);
      callout(ctx, t, 36.0, 38.9, [1.2, -30.5, 0.2], WG, 720, 760, 'Cuttings', 'เศษหิน', '#8b7355');
    } else {
      callout(ctx, t, 39.0, 42.1, [12.25, 4.9, -3.0], L, 330, 560, 'Shale Shaker', 'ตะแกรงสั่น', HEX.shaker);
      callout(ctx, t, 39.2, 42.1, [12.25, 1.3, 0.9], L, 720, 1120, 'Cuttings Skip', 'ถังเศษหิน', '#f97316');
      callout(ctx, t, 42.4, 45.1, [24.0, 3.0, -4.0], L, 620, 640, 'Back to Pits', 'กลับลงบ่อ', HEX.flow);
    }
  }
  // ---- 5 JOBS
  if (t >= 45 && t < 85.2) {
    chapter(ctx, t, 45.0, 85.0, '03', '5 หน้าที่ของโคลน', '5 JOBS OF MUD');
    jobCard(ctx, t, 47.0, 53.0, 1, 'คุมแรงดันในหลุม', 'CONTROL WELL PRESSURE', '#3b82f6');
    jobCard(ctx, t, 53.0, 61.0, 2, 'พาเศษหินขึ้นมา', 'CARRY CUTTINGS UP', '#a16207');
    jobCard(ctx, t, 61.0, 69.0, 3, 'ระบายความร้อนหัวเจาะ', 'COOL & LUBRICATE THE BIT', '#ef4444');
    jobCard(ctx, t, 69.0, 77.0, 4, 'ฉาบผนังหลุม', 'BUILD A FILTER CAKE', HEX.cake);
    jobCard(ctx, t, 77.0, 85.0, 5, 'ส่งข้อมูลขึ้นมา', 'SEND DATA (MUD PULSES)', '#0891b2');
    // job 1
    const j1 = win(t, 47.0, 52.9, 0.5, 0.4);
    pressArrows(ctx, t, j1);
    pressGauge(ctx, t, j1);
    callout(ctx, t, 47.8, 52.9, [-RH - 1.2, -37.0, 0], WG, 300, 1170, 'Formation', 'แรงดันในหิน', HEX.danger);
    if (t > 49.4) {
      const a = win(t, 49.4, 52.9, 0.4, 0.4);
      ctx.save(); ctx.globalAlpha = a; ctx.font = F(600, 40); const s = 'P = 0.052 × MW × D';
      const w = ctx.measureText(s).width + 60; ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 18;
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; rr(ctx, 826 - w, 1010, w, 74, 37); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = HEX.ink; ctx.textAlign = 'center'; ctx.fillText(s, 826 - w / 2, 1048); ctx.restore();
    }
    // job 2
    callout(ctx, t, 53.8, 60.7, [1.25, -31.0, 0.3], WG, 720, 560, 'Cuttings', 'เศษหิน', '#8b7355');
    if (t > 54.5 && t < 60.8) {
      const a = win(t, 54.5, 60.7, 0.4, 0.4);
      ctx.save(); ctx.globalAlpha = a * 0.9; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8;
      for (const s of [1, -1]) for (let i = 0; i < 3; i++) {
        const ph = fract(t * 0.7 + i / 3), P = proj([s * (RH + 0.9), lerp(-37, -27, ph), 0], WG);
        ctx.globalAlpha = a * 0.9 * Math.sin(ph * Math.PI);
        arrowLine(ctx, P.x, P.y + 30, P.x, P.y - 30, '#ffffff', 7, 20);
      }
      ctx.restore();
    }
    // job 3
    callout(ctx, t, 61.6, 64.9, [1.2, YB + 1.2, 0.5], WG, 330, 560, 'Hot Bit', 'หัวเจาะร้อนจัด', '#ef4444');
    callout(ctx, t, 64.9, 68.8, [-0.9, YB + 2.6, 0.4], WG, 330, 560, 'Mud Cools', 'โคลนช่วยให้เย็น', '#38bdf8');
    thermo(ctx, t, win(t, 61.5, 68.8, 0.4, 0.4));
    // job 4
    callout(ctx, t, 69.8, 76.8, [3.2, -25.4, 0], WG, 700, 520, 'Porous Rock', 'หินมีรูพรุน', '#e1b98c');
    callout(ctx, t, 71.6, 76.8, [RH - 0.08, -29.0, 0.1], WG, 330, 1120, 'Filter Cake', 'แผ่นโคลนฉาบผนัง', HEX.cake);
    // job 5
    callout(ctx, t, 77.7, 81.2, [RCO, (Y_MWD0 + Y_MWD1) / 2, 0.2], WG, 700, 560, 'MWD Tool', 'เครื่องมือวัด', HEX.mwd);
    callout(ctx, t, 81.6, 84.8, [0, -12, 0.3], WG, 300, 640, 'Mud Pulses', 'คลื่นแรงดัน', HEX.mwd);
    pulsePanel(ctx, t, win(t, 81.8, 84.8, 0.4, 0.4));
  }
  // ---- MUD WEIGHT WINDOW
  if (t >= 85 && t < 103.6) {
    chapter(ctx, t, 85.0, 103.4, '04', 'ช่วงน้ำหนักโคลน', 'MUD WEIGHT WINDOW');
    windowGauge(ctx, t);
    badge(ctx, t, 87.0, 90.4, 650, 470, 'IN THE WINDOW', 'พอดี ✓', '#16a34a', 50);
    alarm(ctx, t, 91.2, 95.0, 'KICK!', 'โคลนเบาไป', 470, [255, 20, 20], 80, 650);
    callout(ctx, t, 91.8, 95.0, [-1.2, -31.0, 0.3], WG, 640, 1120, 'Gas', 'แก๊สดันเข้าหลุม', HEX.danger);
    if (t > 95.0 && t < 98.2) pill(ctx, 650, 640, '+ BARITE', 'เพิ่มน้ำหนัก', HEX.barite, win(t, 95.0, 98.1, 0.3, 0.3), 36);
    alarm(ctx, t, 97.3, 100.3, 'LOST CIRCULATION', 'โคลนหนักไป', 470, [249, 115, 22], 50, 650);
    callout(ctx, t, 97.3, 100.3, [RH + 3.0, -32.6, 0.1], WG, 700, 1120, 'Fracture', 'รอยแตก', HEX.lost);
    badge(ctx, t, 100.3, 103.4, 650, 470, 'JUST RIGHT', 'พอดี ✓', '#16a34a', 50);
  }
  // ---- TYPES
  if (t >= 103.4 && t < 113.6) {
    chapter(ctx, t, 103.4, 113.4, '05', 'โคลน 3 แบบ', '3 TYPES OF MUD');
    typeCards(ctx, t);
  }
  // ---- END
  if (t >= 113.4) endCard(ctx, t);
  // ---- transitions
  fade(ctx, t, 8.0, '#06101e', 0.3);
  fade(ctx, t, 18.0, '#06101e');
  fade(ctx, t, 28.5, '#06101e');
  fade(ctx, t, 38.8, '#06101e');
  fade(ctx, t, 45.0, '#06101e');
  fade(ctx, t, 85.0, '#06101e');
  fade(ctx, t, 103.4, '#06101e');
  fade(ctx, t, 113.4, '#06101e', 0.3);
  if (t > 119.3) { ctx.save(); ctx.globalAlpha = sstep(119.3, 120, t); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  ctx.restore();
}

// ---------------------------------------------------------------- captions & cues
const captions = [
  { t0: 0, t1: 7, th: 'แท่นเจาะบนบก ใช้น้ำโคลนตลอดเวลาที่เจาะ', en: 'A land rig circulates mud the whole time it drills' },
  { t0: 7, t1: 13, th: 'น้ำโคลนเจาะ ไม่ใช่แค่ดินผสมน้ำ', en: 'Drilling mud is not just dirt and water' },
  { t0: 13, t1: 18, th: 'ของเหลวฐาน + สารเติมแต่ง เช่น แบไรต์', en: 'A base fluid plus additives like bentonite and barite' },
  { t0: 18, t1: 25, th: 'ปั๊มดูดโคลนจากบ่อ แล้วอัดแรงดันขึ้นท่อตั้ง', en: 'Pumps pull mud from the pits and push it up the standpipe' },
  { t0: 25, t1: 31.5, th: 'ผ่านสายยางและหัวขับ ลงไปในก้านเจาะ', en: 'Through the hose and top drive, down the drill pipe' },
  { t0: 31.5, t1: 38.5, th: 'พุ่งออกหัวฉีดที่หัวเจาะ แล้วพาเศษหินขึ้นมา', en: 'It jets out of the bit nozzles and lifts the cuttings' },
  { t0: 38.5, t1: 45, th: 'ตะแกรงสั่นแยกเศษหินออก โคลนไหลกลับลงบ่อ', en: 'Shale shakers remove cuttings; mud returns to the pits' },
  { t0: 45, t1: 53, th: 'หน้าที่ 1: น้ำหนักโคลนกดแรงดันในหินไว้', en: 'Job 1: the mud column holds back formation pressure' },
  { t0: 53, t1: 61, th: 'หน้าที่ 2: พาเศษหินขึ้นมา ให้หลุมสะอาด', en: 'Job 2: carry cuttings up and keep the hole clean' },
  { t0: 61, t1: 69, th: 'หน้าที่ 3: ระบายความร้อนและหล่อลื่นหัวเจาะ', en: 'Job 3: cool and lubricate the bit' },
  { t0: 69, t1: 77, th: 'หน้าที่ 4: ฉาบผนังหลุมด้วยแผ่นโคลนบาง ๆ', en: 'Job 4: a thin filter cake seals the hole wall' },
  { t0: 77, t1: 85, th: 'หน้าที่ 5: ส่งข้อมูลขึ้นมาเป็นคลื่นแรงดัน', en: 'Job 5: MWD data travels up as mud-pressure pulses' },
  { t0: 85, t1: 91, th: 'น้ำหนักโคลนต้องอยู่ในช่วงที่พอดี', en: 'Mud weight must stay inside a safe window' },
  { t0: 91, t1: 97, th: 'เบาไป: ของเหลวในหินดันเข้าหลุม เกิด Kick', en: 'Too light: formation fluid flows in — a kick' },
  { t0: 97, t1: 103, th: 'หนักไป: หินแตก โคลนไหลหายเข้าไปในหิน', en: 'Too heavy: the rock fractures and mud is lost' },
  { t0: 103, t1: 108.5, th: 'โคลนมี 3 แบบ: ฐานน้ำ ฐานน้ำมัน สังเคราะห์', en: 'Three types: water-, oil- and synthetic-based' },
  { t0: 108.5, t1: 114, th: 'เลือกตามสภาพหลุม ต้นทุน และสิ่งแวดล้อม', en: 'Chosen by well conditions, cost and environment' },
  { t0: 114, t1: 120, th: 'น้ำโคลนเจาะ คือเลือดที่หล่อเลี้ยงหลุมเจาะ', en: 'Drilling mud: the lifeblood of the well' },
];

const cues = [
  { t: 0.3, sfx: 'whoosh' }, { t: 1.0, sfx: 'impact' }, { t: 2.5, sfx: 'blip' },
  { t: 7.8, sfx: 'whoosh' }, { t: 8.3, sfx: 'bubble' }, { t: 9.0, sfx: 'blip' }, { t: 9.5, sfx: 'blip' }, { t: 11.0, sfx: 'bubble' },
  { t: 12.5, sfx: 'whoosh' }, { t: 14.0, sfx: 'blip' }, { t: 14.5, sfx: 'blip' }, { t: 15.2, sfx: 'clunk' },
  { t: 17.8, sfx: 'whoosh' }, { t: 18.5, sfx: 'blip' }, { t: 19.0, sfx: 'bubble' },
  { t: 21.4, sfx: 'whoosh' }, { t: 22.2, sfx: 'blip' }, { t: 22.4, sfx: 'pump' }, { t: 23.6, sfx: 'pump' },
  { t: 25.0, sfx: 'whoosh' }, { t: 25.6, sfx: 'blip' }, { t: 25.8, sfx: 'blip' }, { t: 26.4, sfx: 'hiss' },
  { t: 28.3, sfx: 'whoosh' }, { t: 28.8, sfx: 'blip' }, { t: 31.6, sfx: 'whoosh' }, { t: 32.4, sfx: 'bubble' },
  { t: 32.6, sfx: 'blip' }, { t: 33.8, sfx: 'bubble' }, { t: 35.5, sfx: 'whoosh' }, { t: 35.8, sfx: 'blip' }, { t: 36.0, sfx: 'blip' },
  { t: 38.6, sfx: 'whoosh' }, { t: 39.0, sfx: 'blip' }, { t: 39.2, sfx: 'blip' }, { t: 39.5, sfx: 'clunk' },
  { t: 41.8, sfx: 'whoosh' }, { t: 42.4, sfx: 'blip' },
  { t: 44.8, sfx: 'whoosh' }, { t: 47.0, sfx: 'blip' }, { t: 47.8, sfx: 'blip' }, { t: 49.4, sfx: 'blip' },
  { t: 53.0, sfx: 'whoosh' }, { t: 53.8, sfx: 'blip' }, { t: 54.6, sfx: 'bubble' },
  { t: 61.0, sfx: 'whoosh' }, { t: 61.6, sfx: 'blip' }, { t: 63.7, sfx: 'pump' }, { t: 64.9, sfx: 'hiss' }, { t: 65.0, sfx: 'blip' },
  { t: 69.0, sfx: 'whoosh' }, { t: 69.8, sfx: 'blip' }, { t: 71.6, sfx: 'blip' },
  { t: 77.0, sfx: 'whoosh' }, { t: 77.7, sfx: 'blip' }, { t: 78.2, sfx: 'clunk' }, { t: 79.5, sfx: 'whoosh' }, { t: 81.6, sfx: 'blip' },
  { t: 84.8, sfx: 'whoosh' }, { t: 87.0, sfx: 'blip' }, { t: 90.4, sfx: 'hiss' }, { t: 91.0, sfx: 'bubble' }, { t: 91.2, sfx: 'alarm' },
  { t: 91.8, sfx: 'blip' }, { t: 93.0, sfx: 'bubble' }, { t: 95.1, sfx: 'clunk' }, { t: 95.6, sfx: 'clunk' }, { t: 96.1, sfx: 'clunk' },
  { t: 97.0, sfx: 'impact' }, { t: 97.4, sfx: 'hiss' }, { t: 100.3, sfx: 'blip' },
  { t: 103.2, sfx: 'whoosh' }, { t: 104.0, sfx: 'blip' }, { t: 105.6, sfx: 'blip' }, { t: 107.2, sfx: 'blip' },
  { t: 113.2, sfx: 'whoosh' }, { t: 114.0, sfx: 'success' },
];

export default { DURATION, init, renderFrame, drawOverlay, captions, cues };
