// scene3d.js — namman.story EP02 "Surface BOP vs Subsea BOP" — low-poly 3D explainer, 75 s, 1080x1920.
// Contract: see SPEC.md (+ ../bop-3d/SPEC.md). renderFrame(t) / drawOverlay(ctx,t) are pure functions of t.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DURATION = 75;
let THREE, renderer, scene, camera, camR;
let W = 1080, H = 1920;

const SB = -150; // seabed height in the sea world
// world sets (each a group, far apart; only the active one is visible)
const OFF = { L: [-5000, 0, 0], S: [0, 0, 0], J: [5000, 0, 0], D: [0, 0, 5000], T: [0, 0, -5000] };

// ---------------------------------------------------------------- math utils
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, u) => a + (b - a) * u;
const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const eio = u => { u = clamp(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
const eout = u => 1 - Math.pow(1 - clamp(u), 3);
const fract = x => x - Math.floor(x);
const hash = (i, k = 0) => fract(Math.sin(i * 127.1 + k * 311.7 + 0.123) * 43758.5453);
const win = (t, a, b, fi = 0.3, fo = 0.3) => Math.min(sstep(a, a + fi, t), 1 - sstep(b - fo, b, t));
const D2R = Math.PI / 180;

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

// ---------------------------------------------------------------- palette (EP01)
const C = {
  annular: 0xf59e0b, shear: 0xef4444, pipe: 0x3b82f6, ck: 0x10b981, conn: 0x8b5cf6,
  steel: 0xcbd5e1, steelD: 0x64748b, frame: 0xfacc15,
};
const HEX = {
  annular: '#f59e0b', shear: '#ef4444', pipe: '#3b82f6', ck: '#10b981', conn: '#8b5cf6',
  safe: '#22c55e', danger: '#ef4444', ink: '#0f172a',
  surf: '#fb923c', sub: '#38bdf8', lmrp: '#22d3ee', lower: '#f43f5e', hyd: '#60a5fa',
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

// ---- easter-egg / signage textures (namman.story)
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
function helideckTex() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  x.textAlign = 'center'; x.textBaseline = 'middle';
  fitFont(x, 'NAMMAN.STORY', 600, 230, 985);
  x.save(); x.translate(512, 230); x.scale(1, 2.1);
  x.lineJoin = 'round'; x.lineWidth = 9; x.strokeStyle = '#ffd23f'; x.strokeText('NAMMAN.STORY', 0, 0);
  x.fillStyle = '#ffffff'; x.fillText('NAMMAN.STORY', 0, 0);
  x.restore();
  x.fillStyle = '#ffd23f'; x.fillRect(90, 462, 844, 22);
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    x.globalAlpha = 0.25 + hash(i, 301) * 0.6;
    x.beginPath(); x.arc(hash(i, 302) * 1024, hash(i, 303) * 512, 1 + hash(i, 304) * 4.5, 0, 7); x.fill();
  }
  x.globalAlpha = 0.35; x.lineWidth = 6;
  for (let i = 0; i < 14; i++) {
    const sx = hash(i, 305) * 1024, sy = hash(i, 306) * 512;
    x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + 60 + hash(i, 307) * 160, sy + (hash(i, 308) - 0.5) * 40); x.stroke();
  }
  return canvasTex(c);
}
function plateTex(main, sub) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 200;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 512, 200);
  g.addColorStop(0, '#e9edf2'); g.addColorStop(0.5, '#b7c0cb'); g.addColorStop(1, '#dfe4ea');
  x.fillStyle = g; x.fillRect(0, 0, 512, 200);
  x.globalAlpha = 0.12; x.fillStyle = '#ffffff';
  for (let i = 0; i < 60; i++) x.fillRect(0, hash(i, 311) * 200, 512, 1);
  x.globalAlpha = 1; x.strokeStyle = '#4b5563'; x.lineWidth = 8; x.strokeRect(10, 10, 492, 180);
  x.fillStyle = '#4b5563';
  for (const [px, py] of [[30, 30], [482, 30], [30, 170], [482, 170]]) { x.beginPath(); x.arc(px, py, 8, 0, 7); x.fill(); }
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#111827';
  fitFont(x, main, 600, 96, 440); x.fillText(main, 256, 86);
  x.fillStyle = '#374151'; fitFont(x, sub, 600, 32, 400); x.fillText(sub, 256, 152);
  return canvasTex(c);
}
function stencilTex() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#e2ad0c'; x.fillRect(0, 0, 1024, 256);
  const gr = x.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(70,40,0,0.28)');
  x.fillStyle = gr; x.fillRect(0, 0, 1024, 256);
  x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(0, 6, 1024, 5); x.fillRect(0, 245, 1024, 5);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#15171b';
  fitFont(x, 'namman.story', 600, 168, 930); x.fillText('namman.story', 512, 104);
  // stencil bridges
  x.fillStyle = '#d9a70f'; x.fillRect(40, 101, 944, 5);
  x.fillStyle = '#15171b'; fitFont(x, 'ACCUMULATOR UNIT · 3000 PSI', 600, 46, 820); x.fillText('ACCUMULATOR UNIT · 3000 PSI', 512, 212);
  // grime / chipped paint
  for (let i = 0; i < 520; i++) {
    x.globalAlpha = 0.12 + hash(i, 321) * 0.3; x.fillStyle = hash(i, 325) < 0.5 ? '#5b4300' : '#fff3c4';
    x.beginPath(); x.arc(hash(i, 322) * 1024, hash(i, 323) * 256, 1 + hash(i, 324) * 3.5, 0, 7); x.fill();
  }
  x.globalAlpha = 0.25; x.fillStyle = '#5b3a00';
  for (let i = 0; i < 10; i++) x.fillRect(hash(i, 326) * 1000, 150 + hash(i, 327) * 40, 4, 40 + hash(i, 328) * 60);
  return canvasTex(c);
}
function rovTex() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 220;
  const x = c.getContext('2d');
  x.fillStyle = '#facc15'; x.fillRect(0, 0, 1024, 220);
  x.fillStyle = '#111827'; x.fillRect(0, 0, 1024, 14); x.fillRect(0, 206, 1024, 14);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#111827';
  fitFont(x, 'NAMMAN.STORY', 600, 140, 900); x.fillText('NAMMAN.STORY', 512, 112);
  return canvasTex(c);
}

// ---------------- human figure (~1.8 m)
function buildHuman(suit = 0xf97316, hat = 0xffffff, ghost = false) {
  const g = new THREE.Group();
  const suitG = [box(0.17, 0.86, 0.2).translate(-0.1, 0.43, 0), box(0.17, 0.86, 0.2).translate(0.1, 0.43, 0),
    box(0.44, 0.62, 0.26).translate(0, 1.17, 0), box(0.12, 0.6, 0.14).translate(-0.29, 1.14, 0), box(0.12, 0.6, 0.14).translate(0.29, 1.14, 0)];
  const skinG = [new THREE.IcosahedronGeometry(0.13, 1).translate(0, 1.6, 0)];
  const hatG = [new THREE.SphereGeometry(0.15, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.65, 0), cyl(0.19, 0.03, 10).translate(0, 1.66, 0)];
  if (ghost) {
    add(g, strip([...suitG, ...skinG, ...hatG]), basic(0xffffff, { transparent: true, opacity: 0.9 }));
  } else {
    add(g, strip(suitG), lam(suit)); add(g, strip(skinG), lam(0xd9a273)); add(g, strip(hatG), lam(hat));
    add(g, box(0.45, 0.06, 0.27), lam(0xf8fafc, { emissive: 0x555555 }), 0, 1.0, 0);
  }
  return g;
}

// ---------------- SURFACE BOP (local: y=0 = cellar floor / wellhead base; ~5.5 m incl. annular)
function buildSurfaceBOP(nipTop = 6.6, withPlate = false) {
  const g = new THREE.Group();
  const M = {
    body: lam(C.steel), wh: lam(0x94a3b8), conn: lam(C.conn), pipe: lam(C.pipe), shear: lam(C.shear),
    ann: lam(C.annular), ck: lam(C.ck), valve: lam(0x0f766e), nip: lam(0x9ca3af), fit: lam(0x334155),
  };
  add(g, cyl(0.5, 0.5, 12), M.wh, 0, 0.25, 0);
  add(g, cyl(0.68, 0.16, 14), M.conn, 0, 0.58, 0);
  add(g, cyl(0.42, 0.62, 12), M.body, 0, 0.97, 0);
  for (const s of [1, -1]) { // choke & kill outlets with gate valves
    const d = new THREE.Vector3(s, 0, 0.7).normalize();
    const P = r => [d.x * r, 0.97, d.z * r];
    add(g, strip([cylBetween(P(0.35), P(1.6), 0.1, 8)]), M.ck);
    const vb = add(g, box(0.32, 0.32, 0.32), M.valve, ...P(1.05)); vb.rotation.y = -Math.atan2(d.z, d.x);
    add(g, cyl(0.06, 0.25, 6), M.ck, d.x * 1.05, 1.25, d.z * 1.05);
    const wh = add(g, new THREE.TorusGeometry(0.15, 0.035, 4, 10), M.ck, d.x * 1.05, 1.38, d.z * 1.05); wh.rotation.x = Math.PI / 2;
  }
  add(g, cyl(0.62, 0.14, 14), M.conn, 0, 1.33, 0);
  const bon = (yc, mat) => {
    for (const s of [1, -1]) {
      add(g, xCyl(0.29, 0.72, 12), mat, s * 0.98, yc, 0);
      add(g, xCyl(0.35, 0.12, 12), mat, s * 1.38, yc, 0);
      add(g, box(0.12, 0.16, 0.12), M.fit, s * 1.2, yc + 0.32, 0);
    }
  };
  add(g, box(1.25, 0.66, 0.95), M.body, 0, 1.73, 0); bon(1.73, M.pipe);          // single pipe ram
  add(g, cyl(0.62, 0.12, 14), M.conn, 0, 2.1, 0);
  add(g, box(1.25, 1.36, 0.95), M.body, 0, 2.86, 0); bon(2.52, M.pipe); bon(3.2, M.shear); // double ram
  add(g, cyl(0.62, 0.12, 14), M.conn, 0, 3.6, 0);
  const prof = [[0.35, 3.64], [0.78, 3.64], [0.86, 3.86], [0.84, 4.42], [0.7, 4.68], [0.46, 4.8], [0.33, 4.82]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  add(g, new THREE.LatheGeometry(prof, 14), M.ann);
  add(g, box(0.14, 0.16, 0.14), M.fit, -0.8, 4.0, 0);
  add(g, cyl(0.36, 0.5, 12), M.nip, 0, 5.05, 0);
  if (nipTop > 5.3) add(g, cyl(0.28, nipTop - 5.3, 10), M.nip, 0, (nipTop + 5.3) / 2, 0);
  add(g, strip([cylBetween([0, 5.0, 0], [0, 5.0, -2.2], 0.16, 8)]), M.nip); // flowline stub
  let plate = null;
  if (withPlate) {
    plate = add(g, new THREE.PlaneGeometry(0.98, 0.98 * 200 / 512), new THREE.MeshLambertMaterial({ map: plateTex('namman.story', 'SURFACE BOP · 5K PSI'), emissive: 0x3a3f46 }), 0, 2.86, 0.482);
  }
  const ports = [[-1.44, 1.73, 0], [-1.44, 2.52, 0], [-1.44, 3.2, 0], [-0.85, 4.0, 0]];
  function set(st) {
    const gl = st.glow || 0, act = st.act || 0;
    for (const k of ['body', 'conn', 'wh', 'nip']) setEm(M[k], 0xffc65a, gl * 0.45);
    setEm(M.pipe, 0xffc65a, gl * 0.45, 0x9fd8ff, act * 0.55);
    setEm(M.shear, 0xffc65a, gl * 0.45, 0x9fd8ff, act * 0.55);
    setEm(M.ann, 0xffc65a, gl * 0.45, 0x9fd8ff, act * 0.55);
  }
  return { group: g, set, plate, ports, anchors: { mid: [0.7, 2.6, 0.5], top: [0, 4.8, 0], wh: [0.5, 0.4, 0.4], ann: [0.8, 4.3, 0.3] } };
}

// ---------------- SUBSEA BOP (local: y=0 = seabed; ~15.9 m). LMRP (top) separable from LOWER STACK.
function buildSubseaBOP() {
  const g = new THREE.Group();
  const lower = new THREE.Group(); g.add(lower);
  const piv = new THREE.Group(); piv.position.y = 10.4; g.add(piv);
  const lmrp = new THREE.Group(); lmrp.position.y = -10.4; piv.add(lmrp);
  const L = {
    body: lam(C.steel), conn: lam(C.conn), pipe: lam(C.pipe), shear: lam(C.shear), wh: lam(0x94a3b8),
    base: lam(0x475569), frame: lam(C.frame), acc: lam(0xeef2f7), accCap: lam(0xf97316), panel: lam(0xf97316),
    ck: lam(C.ck), valve: lam(0x0f766e), dark: lam(0x111827),
  };
  const U = {
    body: lam(C.steel), conn: lam(C.conn), ann: lam(C.annular), frame: lam(C.frame), flex: lam(0x9ca3af),
    podB: lam(0x2563eb), podY: lam(0xfbbf24), ck: lam(C.ck), dark: lam(0x1f2937), cabB: lam(0x1d4ed8), cabY: lam(0xeab308),
  };
  // --- lower stack
  add(lower, box(9.0, 0.5, 7), L.base, 0, 0.25, 0);
  add(lower, cyl(1.0, 1.6, 12), L.wh, 0, 1.2, 0);
  add(lower, cyl(1.75, 1.4, 14), L.conn, 0, 2.3, 0);
  add(lower, cyl(1.95, 0.3, 14), L.conn, 0, 3.05, 0);
  add(lower, cyl(1.3, 1.1, 12), L.body, 0, 3.7, 0);
  const ckDir = [];
  for (const s of [1, -1]) {
    const d = new THREE.Vector3(s, 0, -0.5).normalize(); ckDir.push(d);
    const P = r => [d.x * r, 3.7, d.z * r];
    add(lower, strip([cylBetween(P(1.1), P(2.0), 0.24, 8), cylBetween(P(2.6), P(3.1), 0.2, 8),
      cylBetween([d.x * 3.1, 3.6, d.z * 3.1], [d.x * 3.1, 10.3, d.z * 3.1], 0.17, 8)]), L.ck);
    const vb = add(lower, box(0.75, 0.75, 0.75), L.valve, ...P(2.3)); vb.rotation.y = -Math.atan2(d.z, d.x);
  }
  const ramBody = (yc, mat) => {
    add(lower, box(2.8, 1.8, 2.5), L.body, 0, yc, 0);
    for (const s of [1, -1]) {
      add(lower, xCyl(0.78, 2.0, 12), mat, s * 2.4, yc, 0);
      add(lower, xCyl(0.9, 0.3, 12), mat, s * 3.45, yc, 0);
    }
  };
  ramBody(5.2, L.pipe); ramBody(7.1, L.pipe); ramBody(9.0, L.shear);
  add(lower, cyl(1.3, 0.5, 12), L.body, 0, 10.15, 0);
  {
    const fg = [], px = 3.1, pz = 2.7;
    for (const x of [-px, px]) for (const z of [-pz, pz]) fg.push(cylBetween([x, 0.5, z], [x, 10.3, z], 0.16, 4));
    for (const y of [0.7, 10.3]) {
      fg.push(cylBetween([-px, y, -pz], [px, y, -pz], 0.13, 4), cylBetween([-px, y, pz], [px, y, pz], 0.13, 4),
        cylBetween([-px, y, -pz], [-px, y, pz], 0.13, 4), cylBetween([px, y, -pz], [px, y, pz], 0.13, 4));
    }
    add(lower, strip(fg), L.frame);
  }
  // subsea accumulator bottles (both sides)
  const accG = [], capG = [];
  for (const s of [1, -1]) for (const z of [-1.9, -0.65, 0.6, 1.85]) {
    accG.push(cyl(0.44, 3.0, 10).translate(s * 3.95, 2.0, z));
    capG.push(cyl(0.3, 0.35, 8).translate(s * 3.95, 3.65, z));
  }
  add(lower, strip(accG), L.acc); add(lower, strip(capG), L.accCap);
  add(lower, strip([box(0.2, 0.2, 4.6).translate(3.95, 3.3, 0), box(0.2, 0.2, 4.6).translate(-3.95, 3.3, 0)]), L.frame);
  // ROV intervention panel (hot-stab receptacle)
  add(lower, box(1.8, 1.4, 0.22), L.panel, 1.5, 2.0, 2.95);
  add(lower, zCyl(0.24, 0.12, 10), L.dark, 1.5, 2.0, 3.1);
  add(lower, new THREE.TorusGeometry(0.34, 0.06, 4, 12), lam(0xffffff), 1.5, 2.0, 3.08);
  // --- LMRP
  add(lmrp, cyl(1.75, 0.9, 14), U.conn, 0, 10.85, 0);
  add(lmrp, cyl(1.95, 0.3, 14), U.conn, 0, 11.35, 0);
  const prof = [[0.95, 11.5], [2.1, 11.5], [2.25, 11.9], [2.2, 13.1], [1.85, 13.8], [1.25, 14.25], [0.95, 14.3]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  add(lmrp, new THREE.LatheGeometry(prof, 16), U.ann);
  add(lmrp, new THREE.IcosahedronGeometry(0.85, 1), U.flex, 0, 14.8, 0);
  add(lmrp, cyl(0.75, 1.2, 12), U.flex, 0, 15.3, 0);
  {
    const fg = [], px = 3.1, pz = 2.7;
    for (const x of [-px, px]) for (const z of [-pz, pz]) fg.push(cylBetween([x, 10.6, z], [x, 15.0, z], 0.16, 4));
    for (const y of [10.6, 15.0]) {
      fg.push(cylBetween([-px, y, -pz], [px, y, -pz], 0.13, 4), cylBetween([-px, y, pz], [px, y, pz], 0.13, 4),
        cylBetween([-px, y, -pz], [-px, y, pz], 0.13, 4), cylBetween([px, y, -pz], [px, y, pz], 0.13, 4));
    }
    add(lmrp, strip(fg), U.frame);
    const ck = [];
    for (const d of ckDir) ck.push(cylBetween([d.x * 3.1, 10.5, d.z * 3.1], [d.x * 3.1, 15.0, d.z * 3.1], 0.17, 8),
      cylBetween([d.x * 3.1, 15.0, d.z * 3.1], [d.x * 1.45 / Math.abs(d.x), 16.0, -0.7], 0.15, 6));
    add(lmrp, strip(ck), U.ck);
  }
  // control pods (blue +x, yellow -x) on the LMRP
  for (const [s, m, cab] of [[1, U.podB, U.cabB], [-1, U.podY, U.cabY]]) {
    add(lmrp, box(1.15, 2.3, 0.95), m, s * 1.95, 12.55, 3.2);
    add(lmrp, box(1.25, 0.3, 1.05), U.dark, s * 1.95, 13.82, 3.2);
    add(lmrp, new THREE.ConeGeometry(0.3, 0.5, 8).rotateX(Math.PI), U.dark, s * 1.95, 11.15, 3.2);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 1.95, 13.9, 3.2), new THREE.Vector3(s * 1.6, 15.2, 2.4),
      new THREE.Vector3(s * 1.05, 16.3, 1.3), new THREE.Vector3(s * 1.0, 17.0, 1.1)]);
    add(lmrp, new THREE.TubeGeometry(curve, 10, 0.13, 5), cab);
  }
  let pose = { dx: 0, lift: 0, phi: 0 };
  function set(st) {
    const gl = st.glow || 0, hu = st.hiU || 0, hl = st.hiL || 0, pods = st.pods || 0, acc = st.acc || 0, pan = st.panel || 0, sh = st.shear || 0;
    for (const k of ['body', 'conn', 'wh', 'pipe', 'frame', 'base', 'ck', 'valve']) setEm(L[k], 0xffc65a, gl * 0.4, 0xff4d6d, hl * 0.42);
    setEm(L.shear, 0xffc65a, gl * 0.4, 0xff4d6d, hl * 0.42, 0xff2020, sh * 0.8);
    setEm(L.acc, 0xffc65a, gl * 0.4, 0xff4d6d, hl * 0.3, 0x7dd3fc, acc * 0.55);
    setEm(L.accCap, 0xffc65a, gl * 0.4, 0x7dd3fc, acc * 0.4);
    setEm(L.panel, 0xffc65a, gl * 0.4, 0xffffff, pan * 0.45);
    for (const k of ['body', 'conn', 'ann', 'frame', 'flex', 'ck']) setEm(U[k], 0xffc65a, gl * 0.4, 0x22d3ee, hu * 0.45);
    setEm(U.podB, 0xffc65a, gl * 0.4, 0x22d3ee, hu * 0.3, 0x60a5fa, pods * 0.7);
    setEm(U.podY, 0xffc65a, gl * 0.4, 0x22d3ee, hu * 0.3, 0xfde047, pods * 0.6);
    pose = { dx: st.dx || 0, lift: st.lift || 0, phi: st.phi || 0 };
    piv.position.set(pose.dx, 10.4 + pose.lift, 0); piv.rotation.z = -pose.phi;
  }
  // LMRP top (riser connection point) in BOP-local coords
  function top(out) {
    out.set(pose.dx + Math.sin(pose.phi) * 5.5, 10.4 + pose.lift + Math.cos(pose.phi) * 5.5, 0); return out;
  }
  const anchors = {
    lmrp: [2.3, 13.0, 1.2], lower: [2.8, 6.2, 1.3], podB: [1.95, 12.6, 3.7], podY: [-1.95, 12.6, 3.7],
    acc: [3.95, 2.6, 2.3], accL: [-3.95, 2.6, 2.3], panel: [1.5, 2.0, 3.1], shear: [2.6, 9.0, 1.3], top: [0, 15.9, 0],
    umb: [1.0, 17.0, 1.1], base: [0, 0, 0],
  };
  return { group: g, lower, lmrp, piv, set, top, anchors };
}

// ---------------- ROV (front = -z)
function buildROV() {
  const g = new THREE.Group();
  const yel = lam(0xfacc15), dark = lam(0x1f2937), gray = lam(0x64748b), orange = lam(0xf97316);
  add(g, box(2.0, 0.7, 3.0), yel, 0, 1.55, 0);
  add(g, box(1.7, 0.95, 2.7), dark, 0, 0.72, 0);
  add(g, strip([box(0.14, 0.14, 3.1).translate(0.85, 0.08, 0), box(0.14, 0.14, 3.1).translate(-0.85, 0.08, 0),
    box(0.1, 0.5, 0.1).translate(0.85, 0.3, 1.3), box(0.1, 0.5, 0.1).translate(-0.85, 0.3, 1.3),
    box(0.1, 0.5, 0.1).translate(0.85, 0.3, -1.3), box(0.1, 0.5, 0.1).translate(-0.85, 0.3, -1.3)]), gray);
  for (const s of [1, -1]) {
    add(g, zCyl(0.26, 0.55, 10), dark, s * 0.72, 1.0, 1.62);
    add(g, zCyl(0.3, 0.1, 10), orange, s * 0.72, 1.0, 1.9);
    add(g, cyl(0.26, 0.28, 10), dark, s * 0.55, 2.0, 0.4);
    add(g, box(0.28, 0.2, 0.08), basic(0xfffbe0), s * 0.62, 1.4, -1.53);
  }
  const beam = new THREE.ConeGeometry(1.1, 6, 10, 1, true); beam.translate(0, -3, 0); beam.rotateX(-Math.PI / 2);
  const bm = basic(0xfff7c2, { transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (const s of [1, -1]) add(g, beam, bm, s * 0.62, 1.4, -1.55);
  add(g, new THREE.SphereGeometry(0.24, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), lam(0x0b1220, { emissive: 0x1e3a8a }), 0, 0.95, -1.36);
  // manipulator arm + hot stab tool
  const arm = new THREE.Group(); arm.position.set(0.55, 0.55, -1.35); g.add(arm);
  add(arm, strip([cylBetween([0, 0, 0], [0.05, 0.25, -0.55], 0.09, 6), cylBetween([0.05, 0.25, -0.55], [0, 0, -1.0], 0.08, 6)]), gray);
  add(arm, box(0.22, 0.22, 0.22), orange, 0, 0, -1.0);
  add(arm, zCyl(0.07, 0.6, 8), lam(0xe5e7eb), 0, 0, -1.35);
  add(arm, box(0.4, 0.1, 0.1), orange, 0, 0, -1.08);
  // tether
  add(g, cyl(0.07, 70, 5), lam(0xf59e0b), 0, 1.9 + 35, 0.6);
  // easter egg decal (optional) on the +x side of the foam
  const dg = new THREE.PlaneGeometry(2.8, 2.8 * 220 / 1024);
  const dec = add(g, dg, new THREE.MeshLambertMaterial({ map: rovTex(), emissive: 0x303030 }), 1.005, 1.55, 0); dec.rotation.y = Math.PI / 2;
  return { group: g, arm };
}

// ---------------- DRILLSHIP (origin at waterline, bow +x, helideck at the bow)
function buildDrillship(withDecal = true) {
  const g = new THREE.Group();
  const sh = new THREE.Shape();
  sh.moveTo(-76, -13); sh.lineTo(38, -13); sh.quadraticCurveTo(68, -12, 80, 0); sh.quadraticCurveTo(68, 12, 38, 13); sh.lineTo(-76, 13);
  sh.quadraticCurveTo(-79, 0, -76, -13);
  const part = (y0, h, mat, k = 1) => {
    const ge = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 6 });
    ge.rotateX(-Math.PI / 2); ge.scale(k, 1, k); ge.translate(0, y0, 0);
    return add(g, ge, mat);
  };
  part(-8, 8, lam(0xb4232f));
  part(0, 8, lam(0x2c3e57));
  part(5.8, 0.8, lam(0xf1f5f9), 1.004);
  part(8, 0.4, lam(0x4b5563));
  const white = lam(0xe8ecf1), gray = lam(0x8d97a3), dark = lam(0x4b5563), red = lam(0xe11d48), yellow = lam(0xfbbf24),
    green = lam(0x1f6f5c), glow = basic(0xffe6a3);
  add(g, box(10, 0.2, 10), basic(0x0b1018), 0, 8.45, 0);
  add(g, box(18, 7, 18), lam(0x64748b), 0, 11.9, 0);
  add(g, box(21, 0.8, 21), dark, 0, 15.8, 0);
  add(g, lattice(16.2, 46, 6.5, 2.0, 7, 0.45, 0.22, 0.16), white);
  add(g, box(5.5, 2.6, 5.5), red, 0, 63.5, 0);
  add(g, box(1.2, 1.2, 1.2), glow, 0, 65.4, 0);
  for (const s of [1, -1]) add(g, cyl(0.8, 7, 8), white, 6, 11.9, s * 10); // riser tensioner
  // accommodation + bridge (bow)
  add(g, box(22, 12, 24), white, 46, 14.4, 0);
  for (let r = 0; r < 3; r++) add(g, box(22.2, 0.9, 20), glow, 46, 10.4 + r * 3.4, 0);
  add(g, box(14, 4, 26), white, 47, 22.4, 0);
  add(g, box(14.2, 1.2, 26.2), glow, 47, 22.8, 0);
  // helideck over the bow
  add(g, cyl(12.5, 0.8, 12), green, 64, 26.0, 0);
  add(g, new THREE.TorusGeometry(11.2, 0.3, 3, 24), yellow, 64, 26.45, 0).rotation.x = Math.PI / 2;
  add(g, strip([cylBetween([54, 20.4, 7], [62, 25.6, 6], 0.4, 4), cylBetween([54, 20.4, -7], [62, 25.6, -6], 0.4, 4),
    cylBetween([60, 8.4, 0], [66, 25.6, 0], 0.5, 4)]), gray);
  let decal = null;
  if (withDecal) {
    const dg = new THREE.PlaneGeometry(20, 10); dg.rotateX(-Math.PI / 2);
    decal = add(g, dg, new THREE.MeshLambertMaterial({ map: helideckTex(), transparent: true, depthWrite: false, emissive: 0x2a2a2a }), 64, 26.43, 0);
    decal.rotation.y = 0.9;
  }
  // cranes
  for (const [x, z, tx, ty, tz] of [[24, 11, 8, 30, 18], [24, -11, 40, 30, -20], [-40, 11, -20, 28, 20]]) {
    add(g, cyl(1.4, 8, 8), yellow, x, 12.4, z);
    add(g, cylBetween([x, 16, z], [tx, ty, tz], 0.6, 4), yellow);
  }
  // riser joints + pipe rack aft, containers
  const rg = [];
  for (let i = 0; i < 8; i++) rg.push(xCyl(1.1, 30, 8).translate(-36, 9.6 + (i % 2) * 1.8, -3 - Math.floor(i / 2) * 2.3));
  add(g, strip(rg), white);
  const pg = [];
  for (let i = 0; i < 10; i++) pg.push(xCyl(0.4, 26, 6).translate(-30, 8.9 + (i % 3) * 0.7, 4 + (i % 5) * 1.2));
  add(g, strip(pg), gray);
  const cols = [0xf97316, 0x2563eb, 0x16a34a, 0xe11d48];
  for (let i = 0; i < 6; i++) add(g, box(6, 2.6, 2.6), lam(cols[i % 4]), -62 + (i % 3) * 7, 9.7 + Math.floor(i / 3) * 2.6, 8);
  // azimuth thrusters
  const th = [];
  for (const x of [-60, -45, 55]) for (const z of [-7, 7]) th.push(cyl(1.6, 2.4, 8).translate(x, -9.2, z));
  add(g, strip(th), dark);
  return { group: g, decal };
}

// ---------------- semi-submersible (EP01 rig, background)
function buildSemi() {
  const g = new THREE.Group();
  const white = lam(0xe8ecf1), gray = lam(0x8d97a3), dark = lam(0x4b5563), orange = lam(0xf97316),
    red = lam(0xe11d48), yellow = lam(0xfbbf24), green = lam(0x1f6f5c), glow = basic(0xffe6a3);
  for (const z of [-16, 16]) add(g, box(66, 5, 10), gray, 0, -7, z);
  for (const x of [-22, 22]) for (const z of [-16, 16]) {
    add(g, cyl(4, 18, 10), white, x, 1, z); add(g, cyl(4.12, 3.2, 10), orange, x, 0.2, z);
  }
  add(g, box(58, 5, 42), gray, 0, 12.5, 0);
  add(g, box(58.6, 0.7, 42.6), dark, 0, 15.2, 0);
  add(g, box(13, 3, 13), dark, 0, 17, 0);
  add(g, lattice(18.5, 34, 5, 1.6, 6), white);
  add(g, box(4.4, 2.2, 4.4), red, 0, 53.5, 0);
  add(g, box(1, 1, 1), glow, 0, 55.1, 0);
  add(g, box(15, 10, 17), white, -18, 20, 9);
  add(g, box(15.2, 0.8, 17.2), red, -18, 25.2, 9);
  for (let r = 0; r < 3; r++) add(g, box(15.3, 0.7, 13), glow, -18, 17.2 + r * 2.6, 9);
  add(g, cyl(10, 0.7, 10), green, -27, 27, 12);
  add(g, cyl(1.2, 7, 8), yellow, 22, 18.5, -15);
  add(g, cylBetween([22, 21, -15], [6, 34, -24], 0.5, 4), yellow);
  add(g, cyl(2.4, 4, 10), white, 18, 17.5, -2);
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
function makeOcean(n, ext, pow, mat) {
  const og = new THREE.PlaneGeometry(2, 2, n, n); og.rotateX(-Math.PI / 2);
  const op = og.attributes.position;
  for (let i = 0; i < op.count; i++) {
    const m = v => Math.sign(v) * Math.pow(Math.abs(v), pow) * ext;
    op.setX(i, m(op.getX(i))); op.setZ(i, m(op.getZ(i)));
  }
  const mesh = new THREE.Mesh(og, mat); mesh.frustumCulled = false;
  mesh.userData.base = Float32Array.from(op.array);
  return mesh;
}
function waveOcean(mesh, t, amp = 1) {
  const op = mesh.geometry.attributes.position, a = op.array, b = mesh.userData.base;
  for (let i = 0; i < a.length; i += 3) {
    const x = b[i], z = b[i + 2];
    a[i + 1] = amp * (0.9 * Math.sin(0.045 * x + 1.1 * t) + 0.7 * Math.sin(0.06 * z - 0.9 * t + 0.012 * x) + 0.45 * Math.sin(0.11 * (x + z) + 1.7 * t));
  }
  op.needsUpdate = true;
}

// ---------------------------------------------------------------- state
const O = {};

// ---------------------------------------------------------------- LAND set
function buildLand(G) {
  // sky + sun
  O.skyL = makeSky(0x3b78c4, 0x8fbbe6, 0xffdcae, 0xd9b27c); G.add(O.skyL);
  // drill pad with cellar opening
  const pad = new THREE.Shape(); pad.moveTo(-45, -45); pad.lineTo(45, -45); pad.lineTo(45, 45); pad.lineTo(-45, 45); pad.closePath();
  const hole = new THREE.Path(); hole.moveTo(-2.5, -2.5); hole.lineTo(-2.5, 2.5); hole.lineTo(2.5, 2.5); hole.lineTo(2.5, -2.5); hole.closePath();
  pad.holes.push(hole);
  const pg = new THREE.ExtrudeGeometry(pad, { depth: 0.6, bevelEnabled: false }); pg.rotateX(-Math.PI / 2); pg.translate(0, -0.6, 0);
  add(G, pg, lam(0xcdb48a));
  // desert terrain
  const tg = new THREE.PlaneGeometry(2400, 2400, 64, 64); tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i), r = Math.hypot(x, z);
    const n = Math.sin(x * 0.012) * Math.cos(z * 0.01) * 9 + Math.sin(x * 0.031 + z * 0.023) * 3.5 + (hash(i, 3) - 0.5) * 1.5;
    tp.setY(i, -0.35 - 8 * (1 - sstep(30, 64, r)) + n * sstep(80, 260, r));
  }
  add(G, tg, lam(0xe6c48c));
  const mesa = [];
  for (let i = 0; i < 16; i++) {
    const a = hash(i, 11) * Math.PI * 2, r = 600 + hash(i, 12) * 600, s = 40 + hash(i, 13) * 70;
    const q = new THREE.CylinderGeometry(s * 0.7, s, s * (0.5 + hash(i, 14) * 0.5), 6); q.rotateY(hash(i, 15) * 3);
    mesa.push(q.translate(Math.cos(a) * r, s * 0.2, Math.sin(a) * r));
  }
  add(G, strip(mesa), lam(0xc98b5a));
  const scrub = [], rocks = [];
  for (let i = 0; i < 70; i++) {
    const a = hash(i, 21) * Math.PI * 2, r = 55 + hash(i, 22) * 220;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (hash(i, 23) < 0.6) scrub.push(new THREE.IcosahedronGeometry(0.8 + hash(i, 24) * 1.2, 0).scale(1, 0.6, 1).translate(x, 0.2, z));
    else rocks.push(new THREE.DodecahedronGeometry(0.8 + hash(i, 25) * 2.2, 0).scale(1, 0.6, 1.1).translate(x, 0, z));
  }
  add(G, strip(scrub), lam(0x8a9a5b)); add(G, strip(rocks), lam(0xb08a66));
  // cellar (concrete walls + floor)
  const conc = lam(0x9ca3af), concD = lam(0x7b8794);
  add(G, box(5, 0.2, 5), concD, 0, -2.5, 0);
  add(G, strip([box(5, 2.4, 0.3).translate(0, -1.2, -2.35), box(5, 2.4, 0.3).translate(0, -1.2, 2.35),
    box(0.3, 2.4, 5).translate(-2.35, -1.2, 0), box(0.3, 2.4, 5).translate(2.35, -1.2, 0)]), conc);
  // surface BOP in the cellar
  O.bopL = buildSurfaceBOP(8.9, true);
  O.bopL.group.position.set(0, -2.4, 0); G.add(O.bopL.group);
  // substructure (two side boxes, trussed)
  const subM = lam(0x3f4d63), sg = [];
  for (const sx of [-1, 1]) {
    const xs = [sx * 3.4, sx * 6.6];
    for (const x of xs) for (const z of [-7, 0, 7]) sg.push(cylBetween([x, 0, z], [x, 6.5, z], 0.22, 5));
    for (const x of xs) for (const y of [0.15, 6.4]) sg.push(cylBetween([x, y, -7], [x, y, 7], 0.18, 4));
    for (const x of xs) for (const [z0, z1] of [[-7, 0], [0, 7]]) { sg.push(cylBetween([x, 0.2, z0], [x, 6.4, z1], 0.13, 4)); sg.push(cylBetween([x, 6.4, z0], [x, 0.2, z1], 0.13, 4)); }
    for (const z of [-7, 7]) for (const y of [0.15, 6.4]) sg.push(cylBetween([xs[0], y, z], [xs[1], y, z], 0.16, 4));
  }
  add(G, strip(sg), subM);
  add(G, box(15, 0.6, 15.4), lam(0x52627a), 0, 6.8, 0);
  add(G, box(15.2, 0.25, 15.6), lam(0xfbbf24), 0, 7.2, 0);
  add(G, cyl(1.1, 0.4, 12), lam(0x334155), 0, 7.4, 0);
  add(G, lattice(7.2, 34, 4.3, 1.3, 6, 0.32, 0.17, 0.12), lam(0xe8ecf1));
  add(G, box(3.4, 2.0, 3.4), lam(0xe11d48), 0, 42.2, 0);
  add(G, box(0.9, 0.9, 0.9), basic(0xfff1c2), 0, 43.6, 0);
  add(G, box(4, 3, 5), lam(0x7aa6d6), -5.4, 8.7, 5);
  add(G, box(4.1, 0.9, 5.1), basic(0xd9f0ff), -5.4, 9.2, 5);
  add(G, box(5, 2.4, 3), lam(0x2563eb), 1.5, 8.4, -6);
  // V-door ramp + catwalk + pipe racks (back side)
  add(G, cylBetween([0, 7.0, -7.7], [0, 1.2, -21], 0.9, 4), lam(0x6b7280));
  add(G, box(1.8, 1.2, 14), lam(0x6b7280), 0, 0.6, -28);
  const pr = [];
  for (const s of [-1, 1]) for (let i = 0; i < 9; i++) pr.push(zCyl(0.18, 13, 6).translate(s * (2.6 + (i % 3) * 0.42), 0.9 + Math.floor(i / 3) * 0.38, -28));
  add(G, strip(pr), lam(0x8b96a5));
  // mud tanks + shaker house + flowline
  const tanks = [];
  for (const z of [-9, -1, 7]) tanks.push(box(5, 3, 7).translate(16, 1.5, z));
  add(G, strip(tanks), lam(0x64748b));
  add(G, strip([box(5.4, 0.2, 23).translate(16, 3.1, -1)]), lam(0xfbbf24));
  add(G, box(4, 3.4, 4), lam(0x94a3b8), 10, 1.7, -2);
  add(G, cylBetween([0, 2.6, -2.2], [8, 3.2, -2], 0.16, 6), lam(0x9ca3af));
  // generators + fuel tank
  const gc = [0xe2b33c, 0x4d7c0f, 0xe2b33c];
  for (let i = 0; i < 3; i++) add(G, box(3, 2.8, 7), lam(gc[i]), -17 - i * 3.6, 1.4, -8);
  add(G, xCyl(1.4, 9, 10), lam(0xf1f5f9), -16, 1.4, -19);
  add(G, box(10, 3, 3.4), lam(0xf8fafc), 26, 1.5, 20);
  add(G, box(10, 3, 3.4), lam(0xf8fafc), 26, 1.5, 25);
  // accumulator (Koomey) unit
  const K = O.koomey = new THREE.Group(); K.position.set(-12, 0, 10); K.rotation.y = 0.57; G.add(K);
  add(K, box(5.2, 0.3, 2.4), lam(0x374151), 0, 0.15, 0);
  add(K, box(4.8, 1.1, 1.9), lam(0xe2ad0c), 0, 0.85, 0);
  const sten = add(K, new THREE.PlaneGeometry(4.6, 4.6 / 4), new THREE.MeshLambertMaterial({ map: stencilTex(), emissive: 0x2b2b2b }), 0, 0.86, 0.956);
  O.stencil = sten;
  const bt = [], cap = [];
  for (let r = 0; r < 2; r++) for (let i = 0; i < 7; i++) {
    bt.push(cyl(0.26, 1.35, 10).translate(-2.1 + i * 0.7, 2.1, -0.4 + r * 0.62));
    cap.push(new THREE.SphereGeometry(0.26, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(-2.1 + i * 0.7, 2.77, -0.4 + r * 0.62));
  }
  add(K, strip(bt), lam(0xdc2626)); add(K, strip(cap), lam(0x991b1b));
  add(K, strip([box(0.12, 2.6, 0.12).translate(-2.5, 1.7, -0.85), box(0.12, 2.6, 0.12).translate(2.5, 1.7, -0.85),
    box(0.12, 2.6, 0.12).translate(-2.5, 1.7, 0.85), box(0.12, 2.6, 0.12).translate(2.5, 1.7, 0.85),
    box(5.1, 0.12, 0.12).translate(0, 3.0, -0.85), box(5.1, 0.12, 0.12).translate(0, 3.0, 0.85), box(5.1, 0.1, 0.1).translate(0, 1.45, 0.9)]), lam(0x374151));
  add(K, box(1.0, 1.4, 0.35), lam(0x1e3a5f), 2.95, 1.0, 0.5);
  for (let i = 0; i < 3; i++) add(K, zCyl(0.13, 0.06, 12), basic(0xf8fafc), 2.95 - 0.3 + i * 0.3, 1.35, 0.7);
  add(K, xCyl(0.32, 0.8, 10), lam(0x2563eb), -2.95, 0.7, 0.3);
  // hydraulic hoses: unit manifold -> cellar -> BOP ports
  const toW = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.57).add(K.position);
  O.hoses = [];
  const hg = [];
  O.bopL.ports.forEach((p, i) => {
    const off = (i - 1.5) * 0.18;
    const A = toW(2.5 + off * 0.5, 1.45, 0.95), B = toW(2.9 + off, 0.3, 1.5);
    const pts = [A, B, new THREE.Vector3(-7 + off, 0.12, 5.6 + off), new THREE.Vector3(-3.2 + off, 0.12, 2.6 + off),
      new THREE.Vector3(-2.3, 0.15, 1.0 + off), new THREE.Vector3(-2.0, -0.6, 0.5 + off * 0.6),
      new THREE.Vector3(p[0] - 0.12, p[1] - 2.4 + 0.25, p[2] + off * 0.2), new THREE.Vector3(p[0], p[1] - 2.4 + 0.02, p[2])];
    const cv = new THREE.CatmullRomCurve3(pts);
    O.hoses.push(cv);
    hg.push(new THREE.TubeGeometry(cv, 48, 0.055, 5));
  });
  add(G, strip(hg), lam(0x1f2933));
  O.pulseL = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.11, 0), basic(0x8fd3ff), 48);
  O.pulseL.frustumCulled = false; G.add(O.pulseL);
  // workers
  const w1 = buildHuman(); w1.position.set(1.45, -2.4, 1.45); w1.rotation.y = -0.6; G.add(w1);
  const w2 = buildHuman(0x2563eb); w2.position.set(-15.6, 0, 12.6); w2.rotation.y = 1.2; G.add(w2);
  const w3 = buildHuman(); w3.position.set(3, 7.35, 4); w3.rotation.y = 0.3; G.add(w3);
  const w4 = buildHuman(0x16a34a); w4.position.set(9.5, 0, 13.5); w4.rotation.y = -2.4; G.add(w4);
  O.workerCellar = w1;
}

// ---------------------------------------------------------------- JACK-UP set (shallow sea)
const JSB = -36;
function jackLeg(x, z, y0, y1) {
  const geos = [], R = 2.6;
  const ch = [0, 1, 2].map(i => { const a = i * 2.094 + 0.5; return [x + Math.cos(a) * R, z + Math.sin(a) * R]; });
  for (const [cx, cz] of ch) geos.push(cylBetween([cx, y0, cz], [cx, y1, cz], 0.45, 5));
  const step = 4;
  for (let y = y0; y < y1 - 0.1; y += step) for (let i = 0; i < 3; i++) {
    const a = ch[i], b = ch[(i + 1) % 3];
    geos.push(cylBetween([a[0], y, a[1]], [b[0], Math.min(y1, y + step), b[1]], 0.17, 4));
    geos.push(cylBetween([a[0], y, a[1]], [b[0], y, b[1]], 0.14, 4));
  }
  return strip(geos);
}
function jacket(y0, y1, s0, s1, levels) {
  const geos = [];
  const P = (sx, sz, y) => { const u = (y - y0) / (y1 - y0); return [sx * lerp(s0[0], s1[0], u), y, sz * lerp(s0[1], s1[1], u)]; };
  const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of cs) geos.push(cylBetween(P(sx, sz, y0), P(sx, sz, y1), 0.8, 6));
  for (let k = 0; k <= levels; k++) {
    const y = lerp(y0, y1, k / levels), yn = lerp(y0, y1, (k + 1) / levels);
    for (let c = 0; c < 4; c++) {
      const [ax, az] = cs[c], [bx, bz] = cs[(c + 1) % 4];
      geos.push(cylBetween(P(ax, az, y), P(bx, bz, y), 0.35, 4));
      if (k < levels) { geos.push(cylBetween(P(ax, az, y), P(bx, bz, yn), 0.3, 4)); geos.push(cylBetween(P(bx, bz, y), P(ax, az, yn), 0.3, 4)); }
    }
  }
  return strip(geos);
}
function buildJack(G) {
  O.skyJ = makeSky(0x3b78c4, 0x8fbbe6, 0xe9f1f4, 0x9ab8c7); G.add(O.skyJ);
  O.oceanJ = makeOcean(52, 1500, 1.7, new THREE.MeshPhongMaterial({ color: 0x1f86a8, specular: 0xbfe8ff, shininess: 60, flatShading: true,
    transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
  O.oceanJ.renderOrder = 2; G.add(O.oceanJ);
  const sg = new THREE.PlaneGeometry(1400, 1400, 40, 40); sg.rotateX(-Math.PI / 2);
  const sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) sp.setY(i, JSB + Math.sin(sp.getX(i) * 0.03) * Math.cos(sp.getZ(i) * 0.025) * 1.5 + (hash(i, 31) - 0.5) * 0.8);
  add(G, sg, lam(0xd8c08f));
  // jack-up hull
  const hs = new THREE.Shape(); hs.moveTo(-28, -24); hs.lineTo(14, -24); hs.lineTo(31, -8); hs.lineTo(31, 8); hs.lineTo(14, 24); hs.lineTo(-28, 24); hs.closePath();
  const hg = new THREE.ExtrudeGeometry(hs, { depth: 7, bevelEnabled: false }); hg.rotateX(-Math.PI / 2); hg.translate(0, 14, 0);
  add(G, hg, lam(0xdfe3e8));
  const hg2 = new THREE.ExtrudeGeometry(hs, { depth: 0.8, bevelEnabled: false }); hg2.rotateX(-Math.PI / 2); hg2.scale(1.004, 1, 1.004); hg2.translate(0, 14.4, 0);
  add(G, hg2, lam(0xf97316));
  const legM = lam(0xf2a516);
  for (const [x, z] of [[20, 0], [-19, -16], [-19, 16]]) {
    add(G, jackLeg(x, z, JSB + 1.5, 62), legM);
    add(G, cyl(4.6, 2.2, 10, false, 2.2), lam(0x9a6b14), x, JSB + 1.1, z);
    add(G, cyl(4.2, 3, 10), lam(0x6b7280), x, 22.5, z);
  }
  // accommodation + helideck + cranes
  add(G, box(13, 8, 24), lam(0xf8fafc), 18, 25, 0);
  for (let r = 0; r < 2; r++) add(G, box(13.2, 0.8, 20), basic(0xffe6a3), 18, 23 + r * 2.6, 0);
  add(G, cyl(9, 0.7, 10), lam(0x1f6f5c), 29, 30, 0);
  add(G, cyl(1.1, 6, 8), lam(0xfbbf24), 4, 24, 20); add(G, cylBetween([4, 26, 20], [-14, 36, 26], 0.45, 4), lam(0xfbbf24));
  for (let i = 0; i < 4; i++) add(G, box(5, 2.4, 2.4), lam([0x2563eb, 0xe11d48, 0x16a34a, 0xf97316][i]), -6 + i * 5.5, 22.2, -12);
  // cantilever + drill floor + derrick (over the stern)
  add(G, strip([box(20, 3, 1.4).translate(-36, 22.5, -5), box(20, 3, 1.4).translate(-36, 22.5, 5)]), lam(0x52627a));
  add(G, box(13, 1.2, 14), lam(0x52627a), -40, 25, 0);
  add(G, box(13.2, 0.3, 14.2), lam(0xfbbf24), -40, 25.7, 0);
  add(G, lattice(25.8, 30, 4.2, 1.3, 5, 0.32, 0.16, 0.12), lam(0xf8fafc)).position.x = -40;
  add(G, box(3.2, 1.8, 3.2), lam(0xe11d48), -40, 56.8, 0);
  // surface BOP under the drill floor + conductor to the seabed wellhead
  O.bopJ = buildSurfaceBOP(6.85, false);
  O.bopJ.group.position.set(-40, 14.6, 0); O.bopJ.group.scale.setScalar(1.4); G.add(O.bopJ.group);
  add(G, cyl(0.55, 14.6 - JSB, 10), lam(0x8b96a5), -40, (14.6 + JSB) / 2, 0);
  add(G, cyl(1.1, 1.6, 10), lam(0x94a3b8), -40, JSB + 0.8, 0);
  // fixed platform (simple icon-like jacket)
  const FP = O.fixed = new THREE.Group(); FP.position.set(100, 0, -62); G.add(FP);
  add(FP, jacket(JSB, 19, [12, 10], [7.5, 6.5], 4), lam(0xfacc15));
  add(FP, box(24, 2, 20), lam(0x52627a), 0, 20, 0);
  add(FP, box(10, 6, 8), lam(0xf8fafc), -5, 24, -4);
  add(FP, box(8, 4, 7), lam(0x94a3b8), 6, 23, 5);
  add(FP, lattice(21, 17, 3, 1, 4, 0.28, 0.14, 0.1), lam(0xf8fafc)).position.x = 5;
  add(FP, cyl(6, 0.6, 10), lam(0x1f6f5c), -6, 27.5, -4);
  add(FP, cylBetween([11, 21, -8], [24, 34, -18], 0.4, 4), lam(0x8d97a3));
  O.flameJ = add(FP, new THREE.ConeGeometry(0.9, 3.4, 6), basic(0xffb347), 24, 35.8, -18);
  // seabed rocks
  const rk = [];
  for (let i = 0; i < 40; i++) {
    const a = hash(i, 41) * Math.PI * 2, r = 20 + hash(i, 42) * 160;
    rk.push(new THREE.DodecahedronGeometry(0.8 + hash(i, 43) * 2, 0).scale(1, 0.5, 1).translate(Math.cos(a) * r, JSB, Math.sin(a) * r));
  }
  add(G, strip(rk), lam(0x8c97a1));
  const wj = buildHuman(); wj.position.set(-35.5, 25.85, 4.5); wj.rotation.y = -0.8; G.add(wj);
}

// ---------------------------------------------------------------- SEA set (drillship, riser, subsea BOP, ROV)
const RL = -8 - (SB + 15.9) + 2;
function buildSea(G) {
  O.skyS = makeSky(0x27306e, 0xa8558f, 0xffb37d, 0x28506e); G.add(O.skyS);
  const sunDir = new THREE.Vector3(-0.35, 0.07, -1).normalize(); O.sunDir = sunDir;
  O.sun = add(G, new THREE.CircleGeometry(70, 28), basic(0xfff1c9, { fog: false }), ...sunDir.clone().multiplyScalar(2300).toArray());
  O.sun.lookAt(0, 0, 0);
  O.sunGlow = add(G, new THREE.CircleGeometry(260, 28), basic(0xffc58a, { fog: false, transparent: true, opacity: 0.35, depthWrite: false }), ...sunDir.clone().multiplyScalar(2320).toArray());
  O.sunGlow.lookAt(0, 0, 0);
  O.oceanS = makeOcean(72, 1800, 1.6, new THREE.MeshPhongMaterial({ color: 0x1d6890, specular: 0xffc895, shininess: 70, flatShading: true, side: THREE.DoubleSide }));
  G.add(O.oceanS);
  O.ship = buildDrillship(true); G.add(O.ship.group);
  O.semi = buildSemi(); O.semi.position.set(-150, 0, -330); O.semi.rotation.y = 0.5; G.add(O.semi);
  // riser group (pivot at LMRP top)
  const R = O.riser = new THREE.Group(); G.add(R);
  const rm = lam(0xd4d9e0), bm = lam(0xf2f4f7);
  add(R, cyl(0.75, RL, 12).translate(0, RL / 2, 0), rm);
  const bg = [], rg = [];
  for (let y = 22; y < RL - 16; y += 14) bg.push(cyl(1.3, 11, 12).translate(0, y, 0));
  for (let y = 6; y < RL; y += 14) rg.push(cyl(0.95, 0.5, 12).translate(0, y, 0));
  add(R, strip(bg), bm); add(R, strip(rg), rm);
  add(R, strip([cylBetween([1.45, 0.1, -0.7], [1.45, RL, -0.7], 0.12, 5), cylBetween([-1.45, 0.1, -0.7], [-1.45, RL, -0.7], 0.12, 5)]), lam(C.ck));
  add(R, cylBetween([1.0, 1.1, 1.1], [1.0, RL, 1.1], 0.13, 5), lam(0x1d4ed8));
  add(R, cylBetween([-1.0, 1.1, 1.1], [-1.0, RL, 1.1], 0.13, 5), lam(0xeab308));
  O.pulseS = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 0), basic(0xffffff), 40);
  O.pulseS.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(40 * 3), 3);
  O.pulseS.frustumCulled = false; R.add(O.pulseS);
  // seabed
  const sg = new THREE.PlaneGeometry(700, 700, 44, 44); sg.rotateX(-Math.PI / 2);
  const spp = sg.attributes.position;
  for (let i = 0; i < spp.count; i++) {
    const x = spp.getX(i), z = spp.getZ(i), r = Math.hypot(x, z);
    const n = Math.sin(x * 0.05) * Math.cos(z * 0.043) * 2.2 + Math.sin(x * 0.13 + z * 0.09) * 0.9 + (hash(i, 3) - 0.5) * 1.2;
    spp.setY(i, SB + n * sstep(14, 40, r) - 0.3);
  }
  add(G, sg, lam(0xcdb489));
  const rocks = [], coral = [];
  for (let i = 0; i < 26; i++) {
    const a = hash(i, 1) * Math.PI * 2, r = 16 + hash(i, 2) * 70, s = 0.8 + hash(i, 4) * 2.4;
    const gq = new THREE.DodecahedronGeometry(s, 0); gq.scale(1, 0.6, 1.1); gq.rotateY(hash(i, 5) * 3);
    rocks.push(gq.translate(Math.cos(a) * r, SB + s * 0.2, Math.sin(a) * r));
  }
  for (let i = 0; i < 14; i++) {
    const a = hash(i, 7) * Math.PI * 2, r = 16 + hash(i, 8) * 40;
    coral.push(new THREE.ConeGeometry(0.6, 2 + hash(i, 9) * 2.5, 5).translate(Math.cos(a) * r, SB + 1, Math.sin(a) * r));
  }
  add(G, strip(rocks), lam(0x7d8a96)); add(G, strip(coral), lam(0xf472b6));
  O.bopS = buildSubseaBOP(); O.bopS.group.position.set(0, SB, 0); G.add(O.bopS.group);
  add(G, cyl(0.8, 1.5, 10), lam(0x6b7280), 0, SB - 0.4, 0);
  const ghost = buildHuman(0, 0, true); ghost.position.set(5.6, SB, 3.6); ghost.rotation.y = -0.5; G.add(ghost); O.ghost = ghost;
  O.rov = buildROV(); G.add(O.rov.group);
  // light rays, marine snow, fish
  const rayMat = basic(0xc8f3ff, { transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const rays = [];
  for (let i = 0; i < 9; i++) {
    const p = new THREE.PlaneGeometry(4 + hash(i, 11) * 6, 170);
    p.translate(0, -85, 0); p.rotateZ(0.18 + hash(i, 12) * 0.08); p.rotateY(hash(i, 13) * 3.1);
    p.translate(-30 + hash(i, 14) * 60, 0, -25 + hash(i, 15) * 50);
    rays.push(p);
  }
  O.rays = add(G, mergeGeometries(rays), rayMat);
  O.snow = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.08), basic(0xe6fbff), 320);
  O.snow.frustumCulled = false; G.add(O.snow);
  const fishG = mergeGeometries([new THREE.ConeGeometry(0.5, 2.0, 5).rotateZ(-Math.PI / 2),
    new THREE.ConeGeometry(0.45, 0.7, 3).rotateZ(Math.PI / 2).translate(-1.25, 0, 0)].map(g => g.toNonIndexed()));
  O.fish = new THREE.InstancedMesh(fishG, lam(0xffb020), 36);
  O.fish.frustumCulled = false; G.add(O.fish);
}

// ---------------------------------------------------------------- DIORAMA set (side-by-side cutaways)
const DSB = -62;
function buildDio(G) {
  O.dioLand = new THREE.Group(); G.add(O.dioLand);
  const LG = O.dioLand;
  add(G, box(96, 2, 30), lam(0x1e293b), 7, -73, 0);
  // land block x -36..-6, z -9..9, notch for the cellar at the front
  const lay = [[0, -2.2, 0xd9b77e], [-2.2, -5.5, 0xb98a5a], [-5.5, -8.8, 0x9c7656], [-8.8, -12, 0x7d6650]];
  const WX0 = -36, WX1 = -6, ZB = -9, ZF = 9, nx0 = -23.2, nx1 = -18.8, nz0 = 4.4, ny = -2.0;
  for (const [y0, y1, c] of lay) {
    const geos = [];
    const h = y0 - y1, yc = (y0 + y1) / 2;
    if (y1 >= ny - 0.01) { // layer intersecting the notch
      geos.push(box(nx0 - WX0, h, ZF - ZB).translate((WX0 + nx0) / 2, yc, 0));
      geos.push(box(WX1 - nx1, h, ZF - ZB).translate((WX1 + nx1) / 2, yc, 0));
      geos.push(box(nx1 - nx0, h, nz0 - ZB).translate((nx0 + nx1) / 2, yc, (ZB + nz0) / 2));
    } else geos.push(box(WX1 - WX0, h, ZF - ZB).translate((WX0 + WX1) / 2, yc, 0));
    add(LG, strip(geos), lam(c));
  }
  add(LG, box(nx1 - nx0, 0.25, ZF - nz0), lam(0x7b8794), (nx0 + nx1) / 2, ny + 0.12, (nz0 + ZF) / 2);
  add(LG, box(0.5, 10, 0.2), lam(0x64748b), -21, -7, ZF + 0.05);
  O.bopDL = buildSurfaceBOP(6.6, false);
  O.bopDL.group.scale.setScalar(0.8); O.bopDL.group.position.set(-21, ny + 0.25, 6.8); LG.add(O.bopDL.group);
  // mini land rig
  const sg = [];
  for (const sx of [-1, 1]) for (const z of [2.2, 11.4]) {
    sg.push(cylBetween([-21 + sx * 3.4, 0, z], [-21 + sx * 3.4, 4.3, z], 0.18, 4));
  }
  for (const sx of [-1, 1]) sg.push(cylBetween([-21 + sx * 3.4, 0.1, 2.2], [-21 + sx * 3.4, 4.2, 11.4], 0.12, 4), cylBetween([-21 + sx * 3.4, 4.2, 2.2], [-21 + sx * 3.4, 0.1, 11.4], 0.12, 4));
  add(LG, strip(sg), lam(0x3f4d63));
  add(LG, box(8.4, 0.5, 9.8), lam(0x52627a), -21, 4.5, 6.8);
  const lt = lattice(4.75, 20, 3.0, 0.9, 5, 0.22, 0.12, 0.09); lt.translate(-21, 0, 6.8);
  add(LG, lt, lam(0xf8fafc));
  add(LG, box(2.2, 1.2, 2.2), lam(0xe11d48), -21, 25.3, 6.8);
  add(LG, box(3, 2, 3), lam(0xe2ad0c), -31, 1, 5);
  for (let i = 0; i < 2; i++) add(LG, box(3.6, 1.8, 2.2), lam(0x64748b), -12, 0.9, 3 + i * 3);
  // sea block x 0..50
  const SX0 = 0, SX1 = 50;
  add(G, box(SX1 - SX0, 4, 18), lam(0xd9c08c), 25, DSB - 2, 0);
  add(G, box(SX1 - SX0, 6, 18), lam(0x9c7b5a), 25, DSB - 7, 0);
  O.dioWater = add(G, box(SX1 - SX0, -DSB, 18), new THREE.MeshLambertMaterial({ color: 0x1d8cb5, transparent: true, opacity: 0.34, depthWrite: false }), 25, DSB / 2, 0);
  O.dioWater.renderOrder = 3;
  const wg = new THREE.PlaneGeometry(50, 18, 25, 6); wg.rotateX(-Math.PI / 2);
  O.dioSurf = add(G, wg, new THREE.MeshPhongMaterial({ color: 0x3aa7d4, transparent: true, opacity: 0.55, flatShading: true, depthWrite: false, shininess: 60, specular: 0xffffff }), 25, 0, 0);
  O.dioSurf.renderOrder = 4; O.dioSurf.userData.base = Float32Array.from(wg.attributes.position.array);
  O.dioShip = buildDrillship(false); O.dioShip.group.scale.setScalar(0.2); G.add(O.dioShip.group);
  O.bopDS = buildSubseaBOP(); O.bopDS.group.scale.setScalar(0.45); O.bopDS.group.position.set(22, DSB, 0); G.add(O.bopDS.group);
  O.dioRiser = add(G, cyl(0.3, 1, 8).translate(0, 0.5, 0), lam(0xe2e8f0));
  const rk = [];
  for (let i = 0; i < 10; i++) rk.push(new THREE.DodecahedronGeometry(0.5 + hash(i, 51) * 0.9, 0).scale(1, 0.6, 1).translate(3 + hash(i, 52) * 44, DSB, -6 + hash(i, 53) * 12));
  add(G, strip(rk), lam(0x7d8a96));
}

// ---------------------------------------------------------------- STUDIO set (comparison + end)
function buildStudio(G) {
  add(G, cyl(70, 0.4, 48), lam(0x16233a), 0, -0.2, 0);
  add(G, new THREE.RingGeometry(30, 30.6, 64).rotateX(-Math.PI / 2), basic(0x2b4a73), 0, 0.02, 0);
  add(G, new THREE.RingGeometry(45, 45.4, 64).rotateX(-Math.PI / 2), basic(0x213a5c), 0, 0.02, 0);
  O.pedS = new THREE.Group(); O.pedS.position.set(-12, 0, 0); G.add(O.pedS);
  O.pedU = new THREE.Group(); O.pedU.position.set(10, 0, 0); G.add(O.pedU);
  for (const [P, col] of [[O.pedS, 0xfb923c], [O.pedU, 0x38bdf8]]) {
    add(P, cyl(5.6, 0.6, 32), lam(0x2a3a55), 0, 0.3, 0);
    add(P, new THREE.TorusGeometry(5.6, 0.12, 4, 40).rotateX(Math.PI / 2), basic(col), 0, 0.6, 0);
  }
  O.bopTS = buildSurfaceBOP(5.3, false); O.bopTS.group.position.y = 0.6; O.pedS.add(O.bopTS.group);
  O.bopTU = buildSubseaBOP(); O.bopTU.group.position.y = 0.6; O.bopTU.group.scale.setScalar(1); O.pedU.add(O.bopTU.group);
  const h1 = buildHuman(); h1.position.set(2.3, 0.6, 1.6); h1.rotation.y = -0.4; O.pedS.add(h1);
  const h2 = buildHuman(); h2.position.set(4.6, 0.6, 3.6); h2.rotation.y = -0.6; O.pedU.add(h2);
}

// ---------------------------------------------------------------- shots / cameras (set-local coords: [px,py,pz, tx,ty,tz, fov])
const K_TITLE_L = [{ t: 0, v: [62, 7, 160, 0, 23, 0, 40] }, { t: 5.2, v: [50, 6, 140, 0, 22, 0, 40] }];
const K_TITLE_R = [{ t: 0, v: [262, 32, 78, 10, 27, 0, 40] }, { t: 5.2, v: [236, 28, 66, 10, 25, 0, 40] }];
const K_HOOK = [{ t: 5, v: [7, -20, 262, 7, -46, 0, 40] }, { t: 10, v: [7, -24, 240, 7, -46, 0, 40] }];
const K_LAND = [
  { t: 10.0, v: [54, 30, 80, 0, 16, 0, 40] },
  { t: 12.4, v: [18, 8, 32, 0, 3, 0, 42] },
  { t: 13.4, v: [-0.6, 3.4, 15.8, 0, 0.9, 0, 46], stop: true },
  { t: 16.8, v: [1.6, 2.7, 13.2, 0, 0.6, 0, 46] },
  { t: 17.7, v: [0.5, 3.8, 19, -8, 0.8, 7, 44] },
  { t: 18.5, v: [-2.6, 3.8, 25.0, -12.0, 1.2, 10.0, 42], stop: true },
  { t: 20.6, v: [-3.4, 3.6, 23.6, -12.0, 1.2, 10.0, 42] },
];
const K_JACK = [
  { t: 20.6, v: [-140, 40, 125, -12, 4, 0, 42] },
  { t: 22.5, v: [-72, 20, -14, -40, 18, 0, 40], stop: true },
  { t: 24.1, v: [-70, 22, -6, -40, 18, 0, 40], stop: true },
  { t: 25.1, v: [-20, 36, 52, 90, 10, -60, 42] },
  { t: 26.0, v: [36, 30, 22, 100, 12, -62, 42] },
];
const K_SEA = [
  { t: 26.0, v: [128, 80, 50, 58, 20, 0, 40] },
  { t: 29.0, v: [116, 70, 44, 56, 20, 0, 40] },
  { t: 29.7, v: [56, 8, 56, 0, -4, 0, 42] },
  { t: 30.5, v: [22, -6, 30, 0, -17, 0, 44] },
  { t: 31.9, v: [16, -100, 30, 0, -116, 0, 44] },
  { t: 32.7, v: [20, SB + 9, 46, -2.2, SB + 4.2, 0, 42], stop: true },
  { t: 35.6, v: [16, SB + 9, 44, -2.2, SB + 4.4, 0, 42] },
  { t: 36.5, v: [12, SB + 14.5, 21, 0, SB + 12.6, 1.5, 40] },
  { t: 38.6, v: [8, SB + 13.5, 22, 0, SB + 12.2, 1.5, 40], stop: true },
  { t: 39.4, v: [16, SB + 5.5, 21, 2, SB + 3.2, 3, 42] },
  { t: 41.8, v: [12.5, SB + 4.8, 16.5, 1.5, SB + 2.8, 3.2, 42], stop: true },
  { t: 42.5, v: [28, SB + 8, 52, 0, SB + 5, 0, 42] },
  { t: 46.0, v: [30, SB + 9, 54, 1, SB + 5.5, 0, 42] },
];
const K_COMP = [{ t: 46, v: [-26, 32, 140, -1, 9, 0, 36] }, { t: 64, v: [24, 32, 140, -1, 9, 0, 36] }];
const K_WHY = [{ t: 64, v: [26, -30, 205, 26, -43, 0, 40] }, { t: 71, v: [29, -32, 190, 29, -43, 0, 40] }];
const K_END = [{ t: 71, v: [-16, 14, 116, -1, 7.5, 0, 40] }, { t: 75, v: [10, 12, 100, -1, 7.5, 0, 40] }];

function shotFor(t) {
  if (t < 5) return { set: 'L', v: track(K_TITLE_L, t), set2: 'S', v2: track(K_TITLE_R, t) };
  if (t < 10) return { set: 'D', v: track(K_HOOK, t) };
  if (t < 20.6) return { set: 'L', v: track(K_LAND, t) };
  if (t < 26) return { set: 'J', v: track(K_JACK, t) };
  if (t < 46) return { set: 'S', v: track(K_SEA, t) };
  if (t < 64) return { set: 'T', v: track(K_COMP, t), vo: 520 };
  if (t < 71) return { set: 'D', v: track(K_WHY, t) };
  return { set: 'T', v: track(K_END, t), vo: -120 };
}

// ---------------------------------------------------------------- init
async function init(opts) {
  THREE = opts.THREE; renderer = opts.renderer; W = opts.width || 1080; H = opts.height || 1920;
  _c.a = new THREE.Color();
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, W / H, 0.3, 5000);
  camR = new THREE.PerspectiveCamera(40, 0.5 * W / H, 0.3, 5000);
  scene.fog = new THREE.Fog(0x000000, 10, 1000);
  scene.background = new THREE.Color();
  O.hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1.5); scene.add(O.hemi);
  O.dir = new THREE.DirectionalLight(0xffffff, 2.2); scene.add(O.dir); scene.add(O.dir.target);
  O.sets = {};
  for (const k of Object.keys(OFF)) { const g = new THREE.Group(); g.position.set(...OFF[k]); scene.add(g); O.sets[k] = g; }
  buildLand(O.sets.L); buildJack(O.sets.J); buildSea(O.sets.S); buildDio(O.sets.D); buildStudio(O.sets.T);
  O.v3 = new THREE.Vector3(); O.v3b = new THREE.Vector3(); O.q = new THREE.Quaternion(); O.up = new THREE.Vector3(0, 1, 0);
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
function setIRot(mesh, i, x, y, z, s, ry) {
  const e = mesh.instanceMatrix.array, o = i * 16, c = Math.cos(ry) * s, sn = Math.sin(ry) * s;
  e[o] = c; e[o + 1] = 0; e[o + 2] = -sn; e[o + 3] = 0;
  e[o + 4] = 0; e[o + 5] = s; e[o + 6] = 0; e[o + 7] = 0;
  e[o + 8] = sn; e[o + 9] = 0; e[o + 10] = c; e[o + 11] = 0;
  e[o + 12] = x; e[o + 13] = y; e[o + 14] = z; e[o + 15] = 1;
}
function done(mesh, n) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }

function placeCam(cam, set, v, vo = 0) {
  const o = OFF[set];
  cam.position.set(v[0] + o[0], v[1] + o[1], v[2] + o[2]);
  cam.lookAt(v[3] + o[0], v[4] + o[1], v[5] + o[2]);
  cam.fov = v[6];
  if (vo) cam.setViewOffset(W, H, 0, vo, W, H); else cam.clearViewOffset();
  cam.updateProjectionMatrix(); cam.updateMatrixWorld();
}

// environment per set
function env(set, camLocalY) {
  O.hemi.position.set(0, 1, 0);
  const o = OFF[set];
  if (set === 'L') {
    scene.background.setHex(0x8fbbe6);
    scene.fog.color.setHex(0xf6dcb3); scene.fog.near = 140; scene.fog.far = 1500;
    O.hemi.color.setHex(0xfff1dc); O.hemi.groundColor.setHex(0x9a7a52); O.hemi.intensity = 1.55;
    O.dir.color.setHex(0xffe0b0); O.dir.intensity = 2.5;
    O.dir.position.set(o[0] + 70, 90, o[2] + 60); O.dir.target.position.set(o[0], 0, o[2]);
  } else if (set === 'J') {
    scene.background.setHex(0x8fbbe6);
    scene.fog.color.setHex(0xdfeaf0); scene.fog.near = 160; scene.fog.far = 1500;
    O.hemi.color.setHex(0xf3f8ff); O.hemi.groundColor.setHex(0x4f7a8f); O.hemi.intensity = 1.6;
    O.dir.color.setHex(0xfff1d6); O.dir.intensity = 2.4;
    O.dir.position.set(o[0] - 60, 100, o[2] + 80); O.dir.target.position.set(o[0], 0, o[2]);
  } else if (set === 'S') {
    if (camLocalY >= 0) {
      scene.background.setHex(0x27306e);
      scene.fog.color.setHex(0xf2ab84); scene.fog.near = 160; scene.fog.far = 1700;
      O.hemi.color.setHex(0xffe2c4); O.hemi.groundColor.setHex(0x34587a); O.hemi.intensity = 1.7;
      O.dir.color.setHex(0xffc08a); O.dir.intensity = 2.6;
      O.dir.position.copy(O.sunDir).multiplyScalar(100).add(new THREE.Vector3(70, 60, 80)); O.dir.target.position.set(0, 0, 0);
    } else {
      const dd = clamp(-camLocalY / 140);
      const fc = new THREE.Color(0x1d8cb5).lerp(new THREE.Color(0x0b3f5f), dd);
      scene.background.copy(fc); scene.fog.color.copy(fc);
      scene.fog.near = 3; scene.fog.far = lerp(170, 190, dd);
      O.hemi.color.setHex(0xa8ecff); O.hemi.groundColor.setHex(0x0d3048); O.hemi.intensity = 2.0;
      O.dir.color.setHex(0xdaf6ff); O.dir.intensity = 1.6;
      O.dir.position.set(20, 100, 40); O.dir.target.position.set(0, 0, 0);
    }
  } else if (set === 'D') {
    scene.background.setHex(0x0f2236);
    scene.fog.color.setHex(0x0f2236); scene.fog.near = 400; scene.fog.far = 1200;
    O.hemi.color.setHex(0xffffff); O.hemi.groundColor.setHex(0x4a5a70); O.hemi.intensity = 1.9;
    O.dir.color.setHex(0xfff4e0); O.dir.intensity = 2.0;
    O.dir.position.set(o[0] + 60, 80, o[2] + 120); O.dir.target.position.set(o[0], -20, o[2]);
  } else {
    scene.background.setHex(0x0d1a2e);
    scene.fog.color.setHex(0x0d1a2e); scene.fog.near = 180; scene.fog.far = 420;
    O.hemi.color.setHex(0xffffff); O.hemi.groundColor.setHex(0x3a4a66); O.hemi.intensity = 1.8;
    O.dir.color.setHex(0xffffff); O.dir.intensity = 2.1;
    O.dir.position.set(o[0] + 50, 70, o[2] + 80); O.dir.target.position.set(o[0], 5, o[2]);
  }
}

function showOnly(set) { for (const k in O.sets) O.sets[k].visible = k === set; }

// ---------------------------------------------------------------- dynamic state per set
function stateLand(t, v) {
  O.skyL.position.set(v[0], 0, v[2]);
  const act = win(t, 15.5, 17.4, 0.3, 0.4) + win(t, 19.0, 20.6, 0.3, 0.3);
  O.bopL.set({ glow: 0, act: act * (0.6 + 0.4 * Math.sin(t * 9)) });
  let n = 0;
  if (act > 0.01) {
    const t0 = t < 18 ? 15.5 : 19.0;
    for (let h = 0; h < O.hoses.length; h++) for (let k = 0; k < 10; k++) {
      const u = fract((t - t0) * 0.55 + k / 10 + h * 0.03);
      if (u > (t - t0) * 0.7 + 0.02) continue;
      const p = O.hoses[h].getPointAt(u);
      setI(O.pulseL, n++, p.x, p.y, p.z, 0.9 * Math.min(1, act * 1.5));
    }
  }
  done(O.pulseL, n);
}
function stateJack(t, v) {
  O.skyJ.position.set(v[0], 0, v[2]);
  waveOcean(O.oceanJ, t, 0.7);
  O.flameJ.scale.set(1 + 0.15 * Math.sin(t * 13), 1 + 0.25 * Math.sin(t * 9.3), 1);
  O.bopJ.set({ glow: win(t, 22.4, 24.3, 0.3, 0.3) * (0.5 + 0.5 * Math.sin(t * 6)) });
}
const RIS_T = t => (t < 42 ? 0 : 0.11 * eio((t - 42.3) / 1.8) + 0.05 * sstep(44.0, 46.0, t));
function stateSea(t, v) {
  const under = v[1] < 0;
  O.skyS.position.set(v[0], 0, v[2]);
  O.skyS.visible = O.sun.visible = O.sunGlow.visible = !under;
  O.rays.visible = under;
  waveOcean(O.oceanS, t, 1);
  const sh = O.ship.group;
  sh.position.y = 0.35 * Math.sin(t * 0.9); sh.rotation.x = 0.012 * Math.sin(t * 0.7); sh.rotation.z = 0.008 * Math.sin(t * 0.55);
  O.semi.position.y = 0.3 * Math.sin(t * 0.8 + 1);
  // subsea BOP state
  const st = { glow: 0 };
  if (t < 10) st.glow = 0;
  st.hiU = win(t, 33.9, 35.9, 0.3, 0.3) * (0.6 + 0.4 * Math.sin(t * 7));
  st.hiL = win(t, 34.5, 35.9, 0.3, 0.3) * (0.6 + 0.4 * Math.sin(t * 7 + 1));
  st.pods = win(t, 35.9, 38.9, 0.3, 0.3) * (0.55 + 0.45 * Math.sin(t * 8));
  st.acc = win(t, 37.3, 38.9, 0.3, 0.3) * (0.55 + 0.45 * Math.sin(t * 8));
  st.panel = win(t, 40.5, 42.2, 0.3, 0.3) * (0.5 + 0.5 * Math.sin(t * 9));
  st.shear = win(t, 43.0, 46.0, 0.15, 0.4) * (0.65 + 0.35 * Math.sin(t * 10));
  const th = RIS_T(t);
  const lift = t > 44 ? 6.5 * eio((t - 44.05) / 1.9) : 0;
  st.lift = lift; st.phi = th * 0.6 * sstep(44.05, 44.6, t); st.dx = lift * Math.sin(th) * 1.2;
  O.bopS.set(st);
  const tp = O.bopS.top(O.v3);
  O.riser.position.set(tp.x, SB + tp.y, tp.z); O.riser.rotation.z = -th;
  // MUX pulses down the umbilicals
  let n = 0;
  const pa = win(t, 35.9, 38.9, 0.3, 0.3);
  if (pa > 0) {
    for (let i = 0; i < 40; i++) {
      const s = i % 2 ? 1 : -1, u = fract(-(t * 0.5) + (i >> 1) / 20);
      setI(O.pulseS, n, s * 1.0, 1.2 + u * 46, 1.1, 0.9 * pa);
      O.pulseS.instanceColor.array[n * 3] = s > 0 ? 0.55 : 1; O.pulseS.instanceColor.array[n * 3 + 1] = s > 0 ? 0.8 : 0.9; O.pulseS.instanceColor.array[n * 3 + 2] = s > 0 ? 1 : 0.3;
      n++;
    }
  }
  done(O.pulseS, n);
  // ROV
  const R = O.rov.group;
  const dock = [0.95, SB + 1.45, 5.95];
  if (t < 38.9 || t > 46.5) R.visible = false;
  else {
    R.visible = true;
    const u = eio((t - 39.0) / 1.6), b = eio((t - 42.4) / 2.0);
    const x = lerp(18, dock[0], u) + b * 7, y = lerp(SB + 7.5, dock[1], u) + b * 2.5 + 0.08 * Math.sin(t * 2.3), z = lerp(17, dock[2], u) + b * 6;
    R.position.set(x, y, z); R.rotation.y = lerp(-0.7, 0, u) + b * 0.5; R.rotation.z = 0.03 * Math.sin(t * 1.7);
    O.rov.arm.position.z = -1.35 - 0.5 * eout((t - 40.6) / 0.4) * (1 - b);
  }
  // marine snow & fish
  if (under) {
    const N = 320, S = 44;
    for (let i = 0; i < N; i++) {
      const px = hash(i, 51) * S + t * 0.6, py = hash(i, 52) * S - t * 0.4, pz = hash(i, 53) * S + t * 0.3;
      const wx = ((px - v[0]) % S + S) % S - S / 2 + v[0];
      const wy = ((py - v[1]) % S + S) % S - S / 2 + v[1];
      const wz = ((pz - v[2]) % S + S) % S - S / 2 + v[2];
      const dc = Math.hypot(wx - v[0], wy - v[1], wz - v[2]);
      setI(O.snow, i, wx, wy, wz, dc < 9 ? 0 : 0.6 + hash(i, 54) * 0.8);
    }
    done(O.snow, N);
    for (let i = 0; i < 36; i++) {
      const school = i < 20 ? 0 : 1;
      const yc = school ? -100 : -50, Rr = (school ? 26 : 20) + hash(i, 61) * 6, w = (school ? -0.22 : 0.26);
      const ang = t * w + hash(i, 62) * 0.9 + school * 2;
      const x = Math.cos(ang) * Rr, z = Math.sin(ang) * Rr, y = yc + (hash(i, 63) - 0.5) * 6 + Math.sin(t * 2 + i) * 0.4;
      setIRot(O.fish, i, x, y, z, 0.9 + hash(i, 64) * 0.4, Math.atan2(-Math.cos(ang) * w, -Math.sin(ang) * w));
    }
    done(O.fish, 36);
  } else { done(O.snow, 0); done(O.fish, 0); }
}
function stateDio(t) {
  const why = t >= 64;
  O.dioLand.visible = !why;
  // water surface ripples
  const a = O.dioSurf.geometry.attributes.position, b = O.dioSurf.userData.base;
  for (let i = 0; i < a.array.length; i += 3) a.array[i + 1] = 0.35 * Math.sin(b[i] * 0.4 + t * 2.2) + 0.25 * Math.sin(b[i + 2] * 0.5 - t * 1.6);
  a.needsUpdate = true;
  const drift = why ? 6 * eio((t - 64.6) / 3.0) + 10 * eio((t - 68.2) / 2.8) : 0;
  const sh = O.dioShip.group;
  const sx = 22 + drift;
  sh.position.set(sx, 0.3 * Math.sin(t * 2.1) + 0.1, 0);
  sh.rotation.x = (why ? 0.07 : 0.03) * Math.sin(t * 1.7); sh.rotation.z = (why ? 0.05 : 0.02) * Math.sin(t * 1.3);
  // BOPs
  const glow = t < 10 ? win(t, 6.0, 10.2, 0.5, 0.3) * (0.55 + 0.45 * Math.sin(t * 6)) : 0;
  O.bopDL.set({ glow });
  const st = { glow, shear: why ? win(t, 67.7, 71.2, 0.2, 0.3) * (0.6 + 0.4 * Math.sin(t * 10)) : 0 };
  const unl = why ? eio((t - 68.2) / 2.4) : 0;
  const bopTopY = DSB + 15.9 * 0.45;
  // after unlatching the LMRP hangs off the riser and follows the ship
  st.lift = unl * 10 / 0.45; st.dx = (sx - 22) * unl * 0.85 / 0.45; st.phi = 0;
  O.bopDS.set(st);
  const tp = O.bopDS.top(O.v3);
  const B = O.v3b.set(22 + tp.x * 0.45, DSB + tp.y * 0.45, 0);
  const A = O.v3.set(sx, sh.position.y - 1.6, 0);
  const d = A.clone().sub(B), len = d.length();
  O.dioRiser.position.copy(B); O.dioRiser.scale.set(1, len, 1);
  O.dioRiser.quaternion.setFromUnitVectors(O.up, d.normalize());
  O.dioTop = bopTopY;
}
function stateStudio(t) {
  O.pedS.rotation.y = 0.35 * Math.sin(t * 0.35) + 0.25;
  O.pedU.rotation.y = 0.35 * Math.sin(t * 0.35 + 1) - 0.35;
  const sz = t < 64 ? win(t, 55.0, 58.0, 0.3, 0.3) * (0.5 + 0.5 * Math.sin(t * 6)) : 0;
  const endG = t >= 71 ? sstep(71.3, 72.3, t) * (0.35 + 0.15 * Math.sin(t * 3)) : 0;
  O.bopTS.set({ glow: sz * 0.6 + endG, act: t < 64 ? win(t, 57.8, 60.6, 0.3, 0.3) * (0.5 + 0.5 * Math.sin(t * 8)) : 0 });
  O.bopTU.set({ glow: sz * 0.6 + endG, pods: t < 64 ? win(t, 57.8, 60.6, 0.3, 0.3) * (0.5 + 0.5 * Math.sin(t * 8)) : 0 });
}

function applyState(t) {
  if (O.lastT === t) return;
  O.lastT = t;
  const s = O.shot = shotFor(t);
  if (s.set === 'L' || s.set2 === 'L') stateLand(t, s.set === 'L' ? s.v : s.v2);
  if (s.set === 'J') stateJack(t, s.v);
  if (s.set === 'S' || s.set2 === 'S') stateSea(t, s.set === 'S' ? s.v : s.v2);
  if (s.set === 'D') stateDio(t);
  if (s.set === 'T') stateStudio(t);
  placeCam(camera, s.set, s.v, s.vo || 0);
  if (s.set2) placeCam(camR, s.set2, s.v2);
  scene.updateMatrixWorld();
}

function renderFrame(t) {
  applyState(t);
  const s = O.shot;
  if (s.set2) {
    renderer.setScissorTest(true);
    const half = W / 2;
    camera.aspect = half / H; camera.updateProjectionMatrix();
    showOnly(s.set); env(s.set, s.v[1]);
    renderer.setViewport(0, 0, half, H); renderer.setScissor(0, 0, half, H);
    renderer.render(scene, camera);
    camR.aspect = half / H; camR.updateProjectionMatrix();
    showOnly(s.set2); env(s.set2, s.v2[1]);
    renderer.setViewport(half, 0, half, H); renderer.setScissor(half, 0, half, H);
    renderer.render(scene, camR);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H);
    camera.aspect = W / H; camera.updateProjectionMatrix();
  } else {
    camera.aspect = W / H; placeCam(camera, s.set, s.v, s.vo || 0);
    showOnly(s.set); env(s.set, s.v[1]);
    renderer.render(scene, camera);
  }
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
function callout(ctx, t, t0, t1, anchor, local, px, py, en, th, color, size = 34, align = 'center') {
  const a = win(t, t0, t1, 0.35, 0.3);
  if (a <= 0) return;
  const P = proj(anchor, local);
  if (!P.ok) return;
  if (px === null) { px = clamp(P.x + py[0], 200, 820); py = clamp(P.y + py[1], 290, 1250); }
  const k = eout((t - t0) / 0.45);
  const b = pillBounds(ctx, px, py, en, th, size, align);
  const ex = clamp(P.x, b.x + b.h / 2, b.x + b.w - b.h / 2), ey = P.y > b.y + b.h ? b.y + b.h : P.y < b.y ? b.y : b.y + b.h / 2;
  const sx = P.y > b.y + b.h || P.y < b.y ? ex : (P.x < b.x ? b.x : b.x + b.w);
  const lx = lerp(sx, P.x, k), ly = lerp(ey, P.y, k);
  ctx.save(); ctx.globalAlpha = a;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.moveTo(sx, ey); ctx.lineTo(lx, ly); ctx.stroke();
  if (k > 0.95) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(P.x, P.y, 9, 0, 7); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
    const ph = fract((t - t0) * 1.2);
    ctx.globalAlpha = a * (1 - ph); ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(P.x, P.y, 10 + ph * 26, 0, 7); ctx.stroke();
  }
  ctx.restore();
  pill(ctx, px, py + (1 - k) * 14, en, th, color, a, size, align);
}

function chapter(ctx, t, t0, t1, num, th, en) {
  const a = win(t, t0, t1, 0.4, 0.3);
  if (a <= 0) return;
  const big = 1 - sstep(t0 + 1.5, t0 + 2.0, t);
  ctx.save();
  if (big > 0.01) {
    const k = eout((t - t0) / 0.5);
    ctx.globalAlpha = a * big;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 24;
    ctx.font = F(600, 30); ctx.fillStyle = '#ffd166';
    ctx.fillText(`${num}  ·  ${en}`, 510, 300 - (1 - k) * 30);
    ctx.font = F(600, 86); const tw = ctx.measureText(th).width;
    if (tw > 860) ctx.font = F(600, Math.floor(86 * 860 / tw));
    ctx.fillStyle = '#ffffff';
    ctx.fillText(th, 510, 380 - (1 - k) * 30);
    ctx.fillStyle = '#ffd166'; ctx.shadowBlur = 0; rr(ctx, 510 - 50 * k, 438, 100 * k, 8, 4); ctx.fill();
  }
  const sm = sstep(t0 + 1.6, t0 + 2.1, t);
  if (sm > 0) {
    ctx.globalAlpha = a * sm;
    ctx.font = F(600, 26); const label = `${num}  ${th}  ·  ${en}`; const w = ctx.measureText(label).width + 44;
    ctx.fillStyle = 'rgba(10,18,36,0.72)'; rr(ctx, 70, 168, w, 50, 25); ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(94, 193, 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(label, 108, 194);
  }
  ctx.restore();
}

function badge(ctx, t, t0, t1, cx, cy, en, th, color, size = 46) {
  const a = win(t, t0, t1, 0.3, 0.3); if (a <= 0) return;
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
function alarm(ctx, t, t0, t1, en, th, cy = 520) {
  const a = win(t, t0, t1, 0.15, 0.4); if (a <= 0) return;
  const p = 0.5 + 0.5 * Math.sin((t - t0) * Math.PI * 4);
  ctx.save();
  const g = ctx.createRadialGradient(540, 960, 600, 540, 960, 1250);
  g.addColorStop(0, 'rgba(255,30,30,0)'); g.addColorStop(1, `rgba(255,20,20,${0.45 * p * a})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const k = eout((t - t0) / 0.3);
  ctx.globalAlpha = a; ctx.translate(510, cy); ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k);
  ctx.font = F(600, 84); const w = ctx.measureText(en).width + 170;
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 30;
  ctx.fillStyle = `rgba(${200 + 55 * p | 0},30,40,0.95)`; rr(ctx, -w / 2, -70, w, 140, 30); ctx.fill();
  ctx.shadowColor = 'transparent';
  warnIcon(ctx, -w / 2 + 70, -2, 70, '#fff', '#dc2626');
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(en, -w / 2 + 125, 2);
  if (th) { ctx.font = F(600, 38); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 14; ctx.fillText(th, 0, 114); }
  ctx.restore();
}
function fade(ctx, t, tc, color, half = 0.2) {
  const d = Math.abs(t - tc); if (d >= half) return;
  ctx.save(); ctx.globalAlpha = 1 - d / half; ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); ctx.restore();
}

function depthMeter(ctx, t) {
  const a = win(t, 29.8, 33.2, 0.4, 0.4); if (a <= 0) return;
  const cy = camera.position.y, d = clamp(-cy / (-SB - 8)) * 1500;
  const x = 92, y0 = 520, y1 = 1150;
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(10,18,36,0.45)'; rr(ctx, x - 40, y0 - 70, 270, y1 - y0 + 150, 26); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
  for (let i = 0; i <= 6; i++) { const yy = lerp(y0, y1, i / 6); ctx.beginPath(); ctx.moveTo(x - 10, yy); ctx.lineTo(x + 10, yy); ctx.stroke(); }
  const my = lerp(y0, y1, d / 1500);
  ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(x + 14, my); ctx.lineTo(x + 34, my - 12); ctx.lineTo(x + 34, my + 12); ctx.fill();
  ctx.font = F(600, 42); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10;
  ctx.fillText(`${(Math.round(d / 10) * 10).toLocaleString('en-US')} m`, x + 44, my);
  ctx.font = F(400, 26); ctx.fillStyle = 'rgba(220,240,255,0.95)'; ctx.fillText('ความลึก · DEPTH', x - 20, y0 - 38);
  ctx.font = F(600, 26); ctx.fillStyle = '#ffd166'; ctx.fillText('สูงสุด ~3,000 m', x - 20, y1 + 48);
  ctx.restore();
}

// vertical dimension bracket between two projected points
function dimBar(ctx, a, P0, P1, x, label, sub, color = '#ffd166', side = 1, ly = null) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.moveTo(x, P0); ctx.lineTo(x, P1);
  ctx.moveTo(x - 14, P0); ctx.lineTo(x + 14, P0); ctx.moveTo(x - 14, P1); ctx.lineTo(x + 14, P1); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = side > 0 ? 'left' : 'right';
  ctx.font = F(600, 44); ctx.fillText(label, x + side * 24, ly !== null ? ly : (P0 + P1) / 2 - (sub ? 22 : 0));
  if (sub) { ctx.font = F(400, 30); ctx.fillStyle = color; ctx.fillText(sub, x + side * 24, (P0 + P1) / 2 + 24); }
  ctx.restore();
}

// bracket for LMRP vs lower stack
function partBracket(ctx, a, y0, y1, x, color, en, th) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.moveTo(x - 18, y0); ctx.lineTo(x, y0); ctx.lineTo(x, y1); ctx.lineTo(x - 18, y1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, (y0 + y1) / 2); ctx.lineTo(x + 18, (y0 + y1) / 2); ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.font = F(600, 38); const w = Math.max(ctx.measureText(en).width, (ctx.font = F(400, 32), ctx.measureText(th).width)) + 44;
  const bx = Math.min(x + 26, 958 - w), by = (y0 + y1) / 2 - 52;
  ctx.fillStyle = 'rgba(10,18,36,0.82)'; rr(ctx, bx, by, w, 104, 22); ctx.fill();
  ctx.fillStyle = color; rr(ctx, bx, by, 8, 104, 4); ctx.fill();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = F(600, 38); ctx.fillStyle = '#fff'; ctx.fillText(en, bx + 24, by + 33);
  ctx.font = F(400, 32); ctx.fillStyle = color; ctx.fillText(th, bx + 24, by + 74);
  ctx.restore();
}

function arrowRight(ctx, x, y, len, a, color = '#fff', label = '') {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len - 20, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + len, y); ctx.lineTo(x + len - 30, y - 20); ctx.lineTo(x + len - 30, y + 20); ctx.closePath(); ctx.fill();
  if (label) { ctx.font = F(600, 36); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(label, x + len / 2, y - 16); }
  ctx.restore();
}

// ---- comparison table
const ROWS = [
  { th: 'ตำแหน่ง', en: 'LOCATION', s: 'บนผิว ใต้พื้นแท่น', u: 'บนพื้นทะเล', t: 46.6, ic: 'pin' },
  { th: 'แท่นเจาะ', en: 'RIG TYPE', s: 'บนบก · Jack-up · Fixed', u: 'Semi-sub · Drillship', t: 49.4, ic: 'rig' },
  { th: 'ความลึกน้ำ', en: 'WATER DEPTH', s: 'บนบก / น้ำตื้น', u: 'น้ำลึก ถึง ~3,000 m', t: 52.2, ic: 'wave' },
  { th: 'ขนาด', en: 'SIZE', s: 'กะทัดรัด สูง ~5 m', u: 'สูง ~15 m · ~350 ตัน', t: 55.0, ic: 'size' },
  { th: 'การควบคุม', en: 'CONTROL', s: 'ไฮดรอลิกตรง (Koomey)', u: 'MUX ไฟฟ้า-ไฮดรอลิก', t: 57.8, ic: 'ctrl' },
  { th: 'การเข้าถึงซ่อมบำรุง', en: 'ACCESS', s: 'คนเดินเข้าไปตรวจได้', u: 'ใช้ ROV / ดึงขึ้นหลายวัน', t: 60.6, ic: 'tool' },
];
function rowIcon(ctx, kind, x, y, col) {
  ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (kind === 'pin') {
    ctx.beginPath(); ctx.arc(x, y - 4, 10, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(x, y + 14); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y - 4, 3.5, 0, 7); ctx.fill();
  } else if (kind === 'rig') {
    ctx.beginPath(); ctx.moveTo(x - 10, y + 14); ctx.lineTo(x - 3, y - 14); ctx.lineTo(x + 3, y - 14); ctx.lineTo(x + 10, y + 14);
    ctx.moveTo(x - 7, y + 2); ctx.lineTo(x + 7, y + 2); ctx.moveTo(x - 14, y + 14); ctx.lineTo(x + 14, y + 14); ctx.stroke();
  } else if (kind === 'wave') {
    ctx.beginPath(); for (let i = 0; i <= 12; i++) { const xx = x - 14 + i * 28 / 12; ctx.lineTo(xx, y - 8 + Math.sin(i * 1.05) * 3); } ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x, y + 14); ctx.moveTo(x - 5, y + 9); ctx.lineTo(x, y + 14); ctx.lineTo(x + 5, y + 9); ctx.stroke();
  } else if (kind === 'size') {
    ctx.beginPath(); ctx.moveTo(x - 6, y - 14); ctx.lineTo(x - 6, y + 14); ctx.moveTo(x - 11, y - 14); ctx.lineTo(x - 1, y - 14); ctx.moveTo(x - 11, y + 14); ctx.lineTo(x - 1, y + 14); ctx.stroke();
    ctx.fillRect(x + 2, y - 2, 10, 16);
  } else if (kind === 'ctrl') {
    ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 8, y - 8); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(x - 11, y + 11); ctx.lineTo(x + 3, y - 3); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 6, y - 6, 7, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
  }
  ctx.restore();
}
function fitText(ctx, text, weight, size, maxW, minS = 32) {
  let s = size; ctx.font = F(weight, s);
  while (ctx.measureText(text).width > maxW && s > minS) { s -= 1; ctx.font = F(weight, s); }
  return s;
}
function compTable(ctx, t) {
  const A = win(t, 46.1, 64.0, 0.4, 0.3); if (A <= 0) return;
  const X0 = 70, X1 = 950, cw = (X1 - X0 - 16) / 2, c1 = X0, c2 = X0 + cw + 16;
  ctx.save(); ctx.globalAlpha = A;
  // column headers (under the live 3D stacks)
  const hy = 596;
  for (const [cx, col, en, th] of [[c1 + cw / 2, HEX.surf, 'SURFACE BOP', 'บนผิว'], [c2 + cw / 2, HEX.sub, 'SUBSEA BOP', 'ใต้ทะเล']]) {
    ctx.font = F(600, 38); const w1 = ctx.measureText(en).width; ctx.font = F(400, 32); const w2 = ctx.measureText(th).width;
    const w = w1 + w2 + 70;
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 16;
    ctx.fillStyle = col; rr(ctx, cx - w / 2, hy - 30, w, 60, 30); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#0b1220';
    ctx.font = F(600, 38); ctx.fillText(en, cx - w / 2 + 26, hy + 2);
    ctx.font = F(400, 32); ctx.fillText(th, cx - w / 2 + 44 + w1, hy + 2);
  }
  const R0 = 646, RH = 104;
  ROWS.forEach((r, i) => {
    const a = sstep(r.t, r.t + 0.4, t); if (a <= 0) return;
    const k = eout((t - r.t) / 0.5);
    const active = i === ROWS.length - 1 ? win(t, r.t, 64.5, 0.2, 0.3) : win(t, r.t, ROWS[i + 1].t, 0.2, 0.25);
    const y0 = R0 + i * RH;
    ctx.save(); ctx.globalAlpha = A * a;
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    ctx.fillStyle = `rgba(10,18,36,${0.78 + 0.1 * active})`; rr(ctx, X0, y0, X1 - X0, RH - 10, 22); ctx.fill();
    ctx.shadowColor = 'transparent';
    if (active > 0) { ctx.strokeStyle = `rgba(255,209,102,${0.85 * active})`; ctx.lineWidth = 3; rr(ctx, X0, y0, X1 - X0, RH - 10, 22); ctx.stroke(); }
    rowIcon(ctx, r.ic, X0 + 30, y0 + 24, '#ffd166');
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = F(600, 30); ctx.fillStyle = '#ffd166'; ctx.fillText(r.th, X0 + 54, y0 + 25);
    const tw = ctx.measureText(r.th).width;
    ctx.font = F(400, 24); ctx.fillStyle = 'rgba(200,215,240,0.8)'; ctx.fillText(r.en, X0 + 66 + tw, y0 + 27);
    // values
    for (const [cx, val, col, dir] of [[c1, r.s, HEX.surf, -1], [c2, r.u, HEX.sub, 1]]) {
      ctx.save(); ctx.translate(dir * (1 - k) * 40, 0);
      ctx.fillStyle = col; rr(ctx, cx + 16, y0 + 52, 8, 34, 4); ctx.fill();
      fitText(ctx, val, 600, 36, cw - 44, 32);
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.fillText(val, cx + 36, y0 + 70);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(c2 - 8, y0 + 50, 2, 36);
    ctx.restore();
  });
  ctx.restore();
}

function endCard(ctx, t) {
  const a = win(t, 71.3, 80, 0.6, 0.1); if (a <= 0) return;
  const k = eout((t - 71.3) / 0.7);
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 28;
  ctx.font = F(600, 30); ctx.fillStyle = '#ffd166'; ctx.fillText('SURFACE  vs  SUBSEA', 510, 290 - (1 - k) * 20);
  ctx.font = F(600, 104); ctx.fillStyle = '#fff'; ctx.fillText('หน้าที่เดียวกัน', 510, 390 - (1 - k) * 30);
  ctx.shadowBlur = 0; ctx.fillStyle = '#ffb627'; rr(ctx, 510 - 80 * k, 462, 160 * k, 10, 5); ctx.fill();
  ctx.shadowBlur = 24;
  ctx.font = F(600, 56); ctx.fillStyle = '#ffffff'; ctx.fillText('ปิดผนึกหลุมเมื่อเกิดเหตุ', 510, 538);
  ctx.font = F(400, 38); ctx.fillStyle = '#bfe3ff'; ctx.fillText('Same job, different place', 510, 604);
  ctx.restore();
}

function titleCard(ctx, t) {
  const a = sstep(0.15, 0.8, t) * (1 - sstep(4.5, 5.0, t)); if (a <= 0) return;
  const k = eout((t - 0.2) / 0.9), k2 = eout((t - 0.7) / 0.6), k3 = eout((t - 1.6) / 0.6);
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // split divider
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.15, 'rgba(255,255,255,0.95)'); g.addColorStop(0.85, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(537, 0, 6, H * k);
  ctx.shadowColor = 'rgba(20,10,40,0.6)'; ctx.shadowBlur = 26;
  ctx.font = F(600, 30); ctx.fillStyle = '#ffd59a'; ctx.fillText('OIL & GAS 101 · EP.02', 510, 250 - (1 - k) * 20);
  ctx.font = F(600, 92); ctx.fillStyle = '#fff';
  ctx.fillText('Surface', 285 - (1 - k2) * 60, 360); ctx.fillText('Subsea', 780 + (1 - k2) * 60, 360);
  ctx.font = F(600, 120); ctx.fillStyle = HEX.surf; ctx.fillText('BOP', 285 - (1 - k2) * 60, 462);
  ctx.fillStyle = HEX.sub; ctx.fillText('BOP', 780 + (1 - k2) * 60, 462);
  ctx.font = F(400, 40); ctx.fillStyle = '#fff3d6'; ctx.fillText('บนบก · น้ำตื้น', 285, 548); ctx.fillText('ใต้ทะเลลึก', 780, 548);
  // VS badge
  const s = 0.6 + 0.4 * k3 + 0.1 * Math.sin(clamp((t - 1.6) / 0.6) * Math.PI);
  ctx.save(); ctx.translate(540, 700); ctx.scale(s, s); ctx.globalAlpha = a * sstep(1.6, 1.9, t);
  ctx.fillStyle = '#ffb627'; ctx.beginPath(); ctx.arc(0, 0, 70, 0, 7); ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = '#0b1220'; ctx.font = F(600, 64); ctx.fillText('VS', 0, 4);
  ctx.restore();
  // question pill
  const q = sstep(2.2, 2.7, t);
  if (q > 0) {
    ctx.globalAlpha = a * q; ctx.font = F(600, 50); const qt = 'BOP มี 2 แบบ ต่างกันอย่างไร?'; const w = ctx.measureText(qt).width + 80;
    ctx.fillStyle = 'rgba(10,18,36,0.82)'; rr(ctx, 540 - w / 2, 1150 - 46 + (1 - q) * 20, w, 92, 46); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.shadowBlur = 0; ctx.fillText(qt, 540, 1152 + (1 - q) * 20);
  }
  ctx.restore();
}

function drawOverlay(ctx, t) {
  applyState(t);
  ctx.save(); ctx.textBaseline = 'middle';
  const SETL = O.sets.L, SETJ = O.sets.J, SETS = O.sets.S, SETD = O.sets.D, SETT = O.sets.T;
  if (t < 5.2) titleCard(ctx, t);
  // ---- HOOK (dioramas)
  if (t >= 5 && t < 10.2) {
    const bl = O.bopDL.group, bs = O.bopDS.group;
    callout(ctx, t, 5.6, 10.0, [0, 3.5, 0.6], bl, 300, 420, 'Surface BOP', 'บนผิว', HEX.surf, 36);
    callout(ctx, t, 6.4, 10.0, [0, 12, 3], bs, 700, 1180, 'Subsea BOP', 'บนพื้นทะเล', HEX.sub, 36);
    // depth bar on the sea block
    const a = win(t, 7.0, 10.0, 0.4, 0.3);
    if (a > 0) {
      const P0 = proj([51.5, 0, 9], SETD), P1 = proj([51.5, DSB, 9], SETD);
      const yy = lerp(P0.y, P1.y, eout((t - 7.0) / 1.2));
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 5; ctx.setLineDash([12, 10]);
      ctx.beginPath(); ctx.moveTo(P0.x + 12, P0.y); ctx.lineTo(P0.x + 12, yy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(P0.x + 12, yy + 6); ctx.lineTo(P0.x, yy - 14); ctx.lineTo(P0.x + 24, yy - 14); ctx.fill();
      ctx.restore();
      const PL = proj([-21, 0, 9], SETD);
      ctx.save(); ctx.globalAlpha = a; ctx.font = F(600, 36); ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 10;
      ctx.fillText('0 m', PL.x, PL.y + 120);
      ctx.textAlign = 'right'; ctx.fillText('1,500–3,000 m', Math.min(950, P1.x + 30), P1.y + 56);
      ctx.restore();
    }
    const vs = win(t, 5.3, 10.0, 0.4, 0.3);
    if (vs > 0) {
      ctx.save(); ctx.globalAlpha = vs; ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 20;
      ctx.font = F(600, 64); ctx.fillStyle = '#fff'; ctx.fillText('บนผิว  vs  ใต้ทะเล', 510, 250);
      ctx.font = F(400, 32); ctx.fillStyle = '#bfe3ff'; ctx.fillText('AT THE SURFACE  vs  ON THE SEABED', 510, 312);
      ctx.restore();
    }
  }
  // ---- SURFACE BOP
  if (t >= 10 && t < 26.2) {
    chapter(ctx, t, 10.0, 26.0, '01', 'Surface BOP', 'บนผิว · AT THE SURFACE');
    if (t < 20.6) {
      callout(ctx, t, 10.5, 12.5, [0, 26, 0], SETL, 320, 520, 'Land Rig', 'แท่นเจาะบนบก', HEX.surf, 34);
      callout(ctx, t, 11.2, 12.9, [5, 7.0, 7.5], SETL, 640, 1120, 'Rig Floor', 'พื้นแท่นเจาะ', '#94a3b8', 32);
      callout(ctx, t, 13.4, 16.2, [-2.6, 6.5, 2.0], SETL, 300, 300, 'Rig Floor ↑', 'พื้นแท่นเจาะ', '#94a3b8', 32);
      callout(ctx, t, 13.6, 17.3, [0.62, 3.0, 0.45], O.bopL.group, 720, 440, 'Surface BOP', 'บนปากหลุม', HEX.surf, 36);
      callout(ctx, t, 14.0, 17.3, [0.45, 0.4, 0.4], O.bopL.group, 690, 1180, 'Wellhead', 'ปากหลุม', HEX.conn, 34);
      callout(ctx, t, 15.6, 17.4, [-2.25, 0.15, 1.0], SETL, 280, 560, 'Hydraulic lines', 'ท่อไฮดรอลิก', HEX.hyd, 32);
      // scale: BOP ~5 m vs worker 1.8 m
      const sa = win(t, 14.5, 17.3, 0.35, 0.3);
      if (sa > 0) {
        const B0 = proj([-1.2, 0, 0], O.bopL.group), B1 = proj([-1.2, 4.82, 0], O.bopL.group);
        dimBar(ctx, sa, B0.y, B1.y, Math.min(B0.x, B1.x) - 70, '~5 m', '≈ 3× คน', '#ffd166', -1);
      }
      callout(ctx, t, 17.9, 20.5, [0, 3.0, 0], O.koomey, 600, 440, 'Accumulator Unit', 'Koomey', HEX.shear, 34);
      callout(ctx, t, 18.4, 20.5, [-2.6, 1.0, 0.95], O.koomey, 300, 1150, 'Hydraulic', 'แรงดัน 3,000 psi', HEX.hyd, 30);
    } else {
      callout(ctx, t, 20.9, 24.2, [-10, 40, 0], SETJ, 330, 450, 'Jack-up', 'แท่นขาหยั่ง', HEX.surf, 36);
      callout(ctx, t, 21.4, 24.2, [-19 + 2.6, JSB + 3, 16], SETJ, 650, 1170, 'Legs on seabed', 'ขาตั้งบนพื้นทะเล', '#f2a516', 32);
      callout(ctx, t, 22.6, 24.4, [0.6, 3.0, 0.5], O.bopJ.group, 720, 520, 'Surface BOP', 'ใต้พื้นแท่น เหนือน้ำ', HEX.surf, 34);
      callout(ctx, t, 23.0, 24.4, [-40, -6, 0], SETJ, 300, 1100, 'Conductor', 'ท่อกรุถึงพื้นทะเล', '#94a3b8', 30);
      callout(ctx, t, 24.8, 26.0, [0, 28, 0], O.fixed, 520, 520, 'Fixed Platform', 'แท่นแบบติดตายตัว', HEX.surf, 36);
    }
  }
  // ---- SUBSEA BOP
  if (t >= 26 && t < 46.2) {
    chapter(ctx, t, 26.0, 46.0, '02', 'Subsea BOP', 'ใต้ทะเล · ON THE SEABED');
    callout(ctx, t, 26.5, 29.4, [0, 40, 0], O.ship.group, 330, 560, 'Drillship', 'เรือขุดเจาะ', HEX.sub, 36);
    callout(ctx, t, 27.1, 29.4, [0, 30, 0], O.semi, 690, 330, 'Semi-submersible', 'แท่นกึ่งดำน้ำ', HEX.sub, 30);
    callout(ctx, t, 30.6, 32.4, [-0.8, camera.position.y - 12, 0], null, 700, 520, 'Marine Riser', 'ท่อไรเซอร์', '#94a3b8', 34);
    depthMeter(ctx, t);
    const bs = O.bopS.group;
    // size + human scale
    const sa = win(t, 32.9, 34.1, 0.3, 0.3);
    if (sa > 0) {
      const B0 = proj([-4.3, 0, 2.7], bs), B1 = proj([-4.3, 15.9, 2.7], bs);
      dimBar(ctx, sa, B0.y, B1.y, Math.max(200, B0.x - 50), '~15 m', '~350 ตัน', '#ffd166', -1);
      callout(ctx, t, 32.9, 34.1, [0, 1.9, 0], O.ghost, 760, 1150, 'คน 1.8 m', '', '#ffffff', 30);
    }
    // LMRP vs lower stack
    const ba = win(t, 33.9, 35.9, 0.3, 0.3);
    if (ba > 0) {
      const U0 = proj([4.3, 15.9, 0], bs), U1 = proj([4.3, 10.6, 0], bs), L0 = proj([4.3, 10.3, 0], bs), L1 = proj([4.3, 0.2, 0], bs);
      const x = Math.max(U0.x, U1.x, L0.x, L1.x) + 26;
      partBracket(ctx, ba, U0.y, U1.y, x, HEX.lmrp, 'LMRP', 'ส่วนบน ปลดได้');
      partBracket(ctx, ba * sstep(34.4, 34.7, t), L0.y + 6, L1.y, x, HEX.lower, 'Lower Stack', 'ชุดแรมปิดหลุม');
    }
    callout(ctx, t, 35.95, 38.8, O.bopS.anchors.podB, bs, 760, 1160, 'Blue Pod', 'พ็อดน้ำเงิน', '#3b82f6', 34);
    callout(ctx, t, 36.15, 38.8, O.bopS.anchors.podY, bs, 280, 1160, 'Yellow Pod', 'พ็อดเหลือง', '#eab308', 34);
    callout(ctx, t, 36.5, 38.8, [-1.0, 30, 1.1], O.riser, 330, 330, 'Umbilical (MUX)', 'สายควบคุม', '#e2e8f0', 32);
    callout(ctx, t, 37.4, 38.8, O.bopS.anchors.acc, bs, 720, 960, 'Accumulators', 'ถังแรงดัน', '#7dd3fc', 32);
    callout(ctx, t, 39.4, 42.0, [0, 2.1, 0], O.rov.group, 330, 420, 'ROV', 'หุ่นยนต์ใต้น้ำ', '#facc15', 36);
    callout(ctx, t, 40.7, 42.1, O.bopS.anchors.panel, bs, 680, 1140, 'Hot Stab', 'เสียบสั่งปิด BOP', '#f97316', 34);
    alarm(ctx, t, 42.4, 43.9, 'EDS!', 'แท่นลอยออกนอกตำแหน่ง', 470);
    if (t > 42.6 && t < 44.6) arrowRight(ctx, 560, 270, 300, win(t, 42.6, 44.6, 0.2, 0.3), '#ffd166', 'Drift-off');
    callout(ctx, t, 43.2, 44.6, O.bopS.anchors.shear, bs, 300, 1150, 'Shear Ram', 'ตัด + ปิดหลุม', HEX.shear, 32);
    callout(ctx, t, 44.4, 46.0, [0, 13, 1.5], O.bopS.lmrp, 720, 330, 'LMRP', 'ปลดออก ↑', HEX.lmrp, 36);
    badge(ctx, t, 44.9, 46.0, 510, 1170, 'Lower stack keeps the well sealed', 'หลุมยังปิดสนิท ✓', '#16a34a', 46);
  }
  // ---- COMPARISON
  if (t >= 46 && t < 64.3) {
    chapter(ctx, t, 46.0, 64.0, '03', 'เปรียบเทียบ', 'SURFACE vs SUBSEA');
    compTable(ctx, t);
    const sa = win(t, 55.0, 57.8, 0.3, 0.3);
    if (sa > 0) {
      const S0 = proj([-1.4, 0, 0], O.bopTS.group), S1 = proj([-1.4, 4.82, 0], O.bopTS.group);
      const U0 = proj([-4.4, 0, 0], O.bopTU.group), U1 = proj([-4.4, 15.9, 0], O.bopTU.group);
      dimBar(ctx, sa, S0.y, S1.y, S0.x - 28, '5 m', '', HEX.surf, -1, S1.y - 26);
      dimBar(ctx, sa, U0.y, U1.y, U0.x - 24, '15 m', '', HEX.sub, -1, U1.y + 30);
    }
  }
  // ---- WHY
  if (t >= 64 && t < 71.2) {
    chapter(ctx, t, 64.0, 71.0, '04', 'ทำไมต้องอยู่ใต้ทะเล?', 'WHY ON THE SEABED');
    callout(ctx, t, 64.6, 67.8, [0, 14, 0], O.dioShip.group, 330, 440, 'Heave & drift', 'แท่นลอย โคลง+เลื่อน', HEX.sub, 32);
    arrowRight(ctx, 560, 560, 260, win(t, 65.0, 70.8, 0.3, 0.3), '#ffd166', 'คลื่น / ลม');
    callout(ctx, t, 65.4, 68.0, [0, 8, 3], O.bopDS.group, 700, 1120, 'BOP', 'อยู่กับที่บนพื้นทะเล', HEX.sub, 34);
    callout(ctx, t, 68.4, 70.9, [0, 13, 1.5], O.bopDS.lmrp, 720, 700, 'LMRP', 'ปลดตามแท่นไป', HEX.lmrp, 32);
    badge(ctx, t, 69.0, 70.9, 510, 1140, 'Lower stack seals the well', 'หลุมยังปิดสนิท ✓', '#16a34a', 46);
  }
  // ---- END
  if (t >= 71) {
    const dim = win(t, 71.0, 80, 0.4, 0.1);
    endCard(ctx, t);
    const la = win(t, 72.0, 80, 0.4, 0.1);
    if (la > 0) {
      const A = proj([0, 5.6, 0], O.bopTS.group), B = proj([0, 16.6, 0], O.bopTU.group);
      pill(ctx, A.x, A.y - 50, 'Surface', 'บนผิว', HEX.surf, la * dim, 32);
      pill(ctx, B.x, B.y - 50, 'Subsea', 'ใต้ทะเล', HEX.sub, la * dim, 32);
    }
  }
  // ---- transitions
  fade(ctx, t, 5.0, '#ffffff', 0.18);
  fade(ctx, t, 10.0, '#06101e');
  fade(ctx, t, 20.6, '#06101e');
  fade(ctx, t, 26.0, '#06101e');
  fade(ctx, t, 46.0, '#06101e');
  fade(ctx, t, 64.0, '#06101e');
  fade(ctx, t, 71.0, '#06101e');
  if (t > 74.4) { ctx.save(); ctx.globalAlpha = sstep(74.4, 75, t); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  ctx.restore();
}

// ---------------------------------------------------------------- captions & cues
const captions = [
  { t0: 0, t1: 5, th: 'BOP มี 2 แบบ: Surface BOP และ Subsea BOP', en: 'Two kinds of BOP: surface vs subsea' },
  { t0: 5, t1: 10, th: 'ตัวหนึ่งอยู่บนผิว อีกตัวอยู่ลึกบนพื้นทะเล', en: 'One sits at the surface, the other on the seabed' },
  { t0: 10, t1: 14, th: 'Surface BOP ติดตั้งบนปากหลุม ใต้พื้นแท่นเจาะ', en: 'Surface BOP: on the wellhead, right under the rig floor' },
  { t0: 14, t1: 17.4, th: 'ตัวกะทัดรัด สูงราว 3 เท่าของคน เดินเข้าไปตรวจได้', en: 'Compact, about 3× human height, easy to reach' },
  { t0: 17.4, t1: 20.6, th: 'ควบคุมด้วยท่อไฮดรอลิกตรงจากชุด Accumulator (Koomey)', en: 'Hydraulic lines from the accumulator (Koomey) unit' },
  { t0: 20.6, t1: 26, th: 'ใช้กับแท่นบนบก แท่น Jack-up และแท่นแบบติดตายตัว', en: 'Used on land rigs, jack-ups and fixed platforms' },
  { t0: 26, t1: 29.4, th: 'Subsea BOP อยู่บนพื้นทะเล ใช้กับแท่นลอยน้ำ เช่น Semi-submersible และ Drillship', en: 'Subsea BOPs serve floating rigs: semi-subs & drillships' },
  { t0: 29.4, t1: 32.6, th: 'ท่อ Marine Riser ต่อจากแท่นลงไปถึง BOP ลึกได้ถึง ~3,000 m', en: 'A marine riser links rig to BOP — up to ~3,000 m deep' },
  { t0: 32.6, t1: 35.8, th: 'สูง ~15 m หนัก ~350 ตัน แบ่งเป็น 2 ส่วน: LMRP ด้านบน และ Lower BOP Stack ด้านล่าง', en: '~15 m, ~350 t: LMRP on top, lower BOP stack below' },
  { t0: 35.8, t1: 38.8, th: 'ควบคุมด้วยไฟฟ้า-ไฮดรอลิกผ่าน Control Pod สีน้ำเงินและเหลือง', en: 'Electro-hydraulic MUX control: blue & yellow pods' },
  { t0: 38.8, t1: 42, th: 'ระบบสำรอง: ROV ดำลงไปเสียบ Hot Stab สั่งปิด BOP ได้', en: 'Backup: an ROV can hot-stab to close the BOP' },
  { t0: 42, t1: 46, th: 'ถ้าแท่นลอยออกนอกตำแหน่ง ระบบ EDS จะปิดหลุมแล้วปลด LMRP ออก', en: 'Drift-off? EDS seals the well and unlatches the LMRP' },
  { t0: 46, t1: 52, th: 'เทียบกันชัด ๆ: ต่างกันที่ตำแหน่ง และชนิดของแท่นเจาะ', en: 'Side by side: different location, different rig type' },
  { t0: 52, t1: 58, th: 'Subsea ใช้ในน้ำลึกกว่ามาก และตัวใหญ่กว่าหลายเท่า', en: 'Subsea: far deeper water, a far bigger stack' },
  { t0: 58, t1: 64, th: 'Surface คุมด้วยไฮดรอลิก เดินไปซ่อมได้ ส่วน Subsea ใช้ MUX + ROV', en: 'Surface: hydraulic, hands-on. Subsea: MUX, ROVs, days to pull up' },
  { t0: 64, t1: 67.5, th: 'แท่นลอยน้ำโคลงและเคลื่อนไปตามคลื่นลมตลอดเวลา', en: 'A floating rig heaves and drifts with wind & waves' },
  { t0: 67.5, t1: 71, th: 'BOP จึงอยู่บนพื้นทะเล ปิดหลุมได้แม้แท่นต้องปลดตัวออก', en: 'So the BOP stays on the seabed — the well stays sealed' },
  { t0: 71, t1: 75, th: 'หน้าที่เหมือนกัน คือปิดผนึกหลุมเมื่อเกิดเหตุ', en: 'Same job: seal the well — just a different place' },
];

const cues = [
  { t: 0.2, sfx: 'whoosh' }, { t: 1.6, sfx: 'impact' }, { t: 2.2, sfx: 'blip' },
  { t: 4.9, sfx: 'whoosh' }, { t: 5.6, sfx: 'blip' }, { t: 6.4, sfx: 'blip' }, { t: 7.0, sfx: 'bubble' },
  { t: 9.9, sfx: 'whoosh' }, { t: 10.5, sfx: 'blip' }, { t: 11.2, sfx: 'blip' }, { t: 12.5, sfx: 'whoosh' },
  { t: 13.6, sfx: 'blip' }, { t: 14.0, sfx: 'blip' }, { t: 14.5, sfx: 'blip' },
  { t: 15.5, sfx: 'pump' }, { t: 15.6, sfx: 'hiss' }, { t: 16.4, sfx: 'clunk' },
  { t: 17.5, sfx: 'whoosh' }, { t: 17.9, sfx: 'blip' }, { t: 19.0, sfx: 'hiss' },
  { t: 20.5, sfx: 'whoosh' }, { t: 20.9, sfx: 'blip' }, { t: 21.4, sfx: 'blip' }, { t: 22.6, sfx: 'blip' },
  { t: 24.4, sfx: 'whoosh' }, { t: 24.8, sfx: 'blip' },
  { t: 25.9, sfx: 'whoosh' }, { t: 26.5, sfx: 'blip' }, { t: 27.1, sfx: 'blip' },
  { t: 29.5, sfx: 'whoosh' }, { t: 30.0, sfx: 'bubble' }, { t: 30.6, sfx: 'blip' }, { t: 31.8, sfx: 'bubble' },
  { t: 32.9, sfx: 'blip' }, { t: 33.9, sfx: 'blip' }, { t: 34.4, sfx: 'blip' },
  { t: 35.95, sfx: 'blip' }, { t: 36.3, sfx: 'hiss' }, { t: 37.4, sfx: 'blip' },
  { t: 39.0, sfx: 'bubble' }, { t: 39.4, sfx: 'blip' }, { t: 40.7, sfx: 'blip' }, { t: 41.0, sfx: 'clunk' }, { t: 41.2, sfx: 'hiss' },
  { t: 42.4, sfx: 'alarm' }, { t: 43.0, sfx: 'impact' }, { t: 43.1, sfx: 'hiss' },
  { t: 44.05, sfx: 'clunk' }, { t: 44.3, sfx: 'whoosh' }, { t: 44.9, sfx: 'success' },
  { t: 45.9, sfx: 'whoosh' }, { t: 46.6, sfx: 'blip' }, { t: 49.4, sfx: 'blip' }, { t: 52.2, sfx: 'blip' },
  { t: 55.0, sfx: 'blip' }, { t: 57.8, sfx: 'blip' }, { t: 58.0, sfx: 'hiss' }, { t: 60.6, sfx: 'blip' },
  { t: 63.9, sfx: 'whoosh' }, { t: 64.6, sfx: 'blip' }, { t: 65.0, sfx: 'bubble' }, { t: 65.4, sfx: 'blip' },
  { t: 67.7, sfx: 'hiss' }, { t: 68.2, sfx: 'clunk' }, { t: 68.4, sfx: 'whoosh' }, { t: 69.0, sfx: 'blip' },
  { t: 70.9, sfx: 'whoosh' }, { t: 71.3, sfx: 'success' },
];

export default { DURATION, init, renderFrame, drawOverlay, captions, cues };
