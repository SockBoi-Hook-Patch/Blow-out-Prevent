// scene3d.js — BOP (Blowout Preventer) low-poly 3D explainer, 75 s, 1080x1920.
// Contract: see SPEC.md. renderFrame(t) / drawOverlay(ctx,t) are pure functions of t.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DURATION = 75;
let THREE, renderer, scene, camera;
let W = 1080, H = 1920;

const SB = -140;      // seabed height (world set A)
const DX = 4000;      // diorama (set B) x offset
const BS = 2.5;       // BOP scale inside diorama

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
const C = {
  annular: 0xf59e0b, shear: 0xef4444, pipe: 0x3b82f6, ck: 0x10b981, conn: 0x8b5cf6,
  steel: 0xcbd5e1, steelD: 0x64748b, frame: 0xfacc15, rubber: 0x262b33,
  mud: 0xa8743f, mudP: 0xf1cfa2, kill: 0x6d28d9, killP: 0xd8c8ff, gas: 0xfff6cf,
};
const HEX = {
  annular: '#f59e0b', shear: '#ef4444', pipe: '#3b82f6', ck: '#10b981', conn: '#8b5cf6',
  mud: '#c8925a', kill: '#8b5cf6', gas: '#fde68a', safe: '#22c55e', danger: '#ef4444', ink: '#0f172a',
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
function strip(geos) { return mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g)); }

// custom donut (annular packing element) with updatable major radius
function makeDonut(seg = 22, tseg = 8) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array((seg + 1) * (tseg + 1) * 3);
  const idx = [];
  for (let i = 0; i < seg; i++) for (let j = 0; j < tseg; j++) {
    const a = i * (tseg + 1) + j, b = (i + 1) * (tseg + 1) + j;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  g.setIndex(idx);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.userData = { seg, tseg };
  return g;
}
function updateDonut(g, R, r, hs) {
  const { seg, tseg } = g.userData; const p = g.attributes.position.array; let k = 0;
  for (let i = 0; i <= seg; i++) {
    const u = i / seg * Math.PI * 2, cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= tseg; j++) {
      const v = j / tseg * Math.PI * 2, rr = R + r * Math.cos(v);
      p[k++] = rr * cu; p[k++] = r * hs * Math.sin(v); p[k++] = rr * su;
    }
  }
  g.attributes.position.needsUpdate = true;
}

// ---------------- BOP stack (local units: seabed at y=0, stack ~13.4 tall)
// returns { group, set(state), anchors }
function buildBOP(clip, withPipe) {
  const g = new THREE.Group();
  const backs = new Map();
  const cm = (c, o = {}) => {
    const f = lam(c, { clippingPlanes: clip, ...o });
    backs.set(f, lam(new THREE.Color(c).multiplyScalar(0.42).getHex(), { clippingPlanes: clip, side: THREE.BackSide }));
    return f;
  };
  const M = {
    annular: cm(C.annular), shearB: cm(C.shear), pipeB: cm(C.pipe), body: cm(C.steel),
    conn: cm(C.conn), wh: cm(0x94a3b8), rubber: cm(0x353c48),
    ck: lam(C.ck), valve: lam(0x0f766e), frame: lam(C.frame, { clippingPlanes: clip }), base: lam(0x475569),
    pipeBlk: lam(0x7fb2ff), shearBlk: lam(0xff8a8a), blade: lam(0xf8fafc, { emissive: 0x334155 }), rod: lam(0x94a3b8),
    podY: lam(0xfbbf24, { clippingPlanes: clip }), podB: lam(0x2563eb, { clippingPlanes: clip }), flex: cm(0x9ca3af),
  };
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m);
    const b = backs.get(mat);
    if (b) { const mb = new THREE.Mesh(geo, b); m.add(mb); }
    return m;
  };
  // guide base + wellhead housing
  add(g, box(7, 0.5, 7), M.base, 0, 0.25, 0);
  add(g, cyl(1.0, 2.4, 12), M.wh, 0, 0.6, 0);
  // wellhead connector
  add(g, cyl(1.75, 1.4, 14), M.conn, 0, 2.3, 0);
  add(g, cyl(1.95, 0.3, 14), M.conn, 0, 3.05, 0);
  // choke & kill spool + outlets/valves
  add(g, cyl(1.3, 1.1, 12), M.body, 0, 3.7, 0);
  const valves = [];
  for (const s of [1, -1]) {
    const d = new THREE.Vector3(s, 0, -0.5).normalize();
    const P = r => [d.x * r, 3.7, d.z * r];
    const geos = [cylBetween(P(1.1), P(2.0), 0.24, 8), cylBetween(P(2.6), P(3.1), 0.2, 8),
      cylBetween([d.x * 3.1, 3.6, d.z * 3.1], [d.x * 3.1, 13.9, d.z * 3.1], 0.17, 8)];
    add(g, strip(geos), M.ck);
    const vb = add(g, box(0.75, 0.75, 0.75), M.valve, ...P(2.3));
    vb.rotation.y = -Math.atan2(d.z, d.x);
    add(g, cyl(0.2, 0.5, 8), M.ck, d.x * 2.3, 4.3, d.z * 2.3);
    const wheel = add(g, new THREE.TorusGeometry(0.34, 0.07, 4, 10), M.ck, d.x * 2.3, 4.6, d.z * 2.3);
    wheel.rotation.x = Math.PI / 2;
    valves.push({ wheel, side: s, pos: P(2.3) });
  }
  // ram preventer body helper
  function ramBody(yc, bonMat) {
    add(g, box(2.8, 1.8, 2.5), M.body, 0, yc, 0);
    for (const s of [1, -1]) {
      add(g, xCyl(0.78, 2.0, 12), bonMat, s * 2.4, yc, 0);
      add(g, xCyl(0.9, 0.3, 12), bonMat, s * 3.45, yc, 0);
    }
  }
  // pipe rams (y 4.3..6.1)
  const yP = 5.2, yS = 7.2;
  ramBody(yP, M.pipeB);
  const sh = new THREE.Shape();
  sh.moveTo(0, -0.8); sh.lineTo(1.2, -0.8); sh.lineTo(1.2, 0.8); sh.lineTo(0, 0.8); sh.lineTo(0, 0.35);
  sh.absarc(0, 0, 0.35, Math.PI / 2, -Math.PI / 2, true); sh.lineTo(0, -0.8);
  const ramGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.9, bevelEnabled: false, curveSegments: 6 });
  ramGeo.rotateX(-Math.PI / 2); ramGeo.translate(0, -0.45, 0);
  const pipeRams = [], shearRams = [], rods = [];
  for (const s of [1, -1]) {
    const grp = new THREE.Group(); g.add(grp);
    const m = add(grp, ramGeo, M.pipeBlk); if (s < 0) m.rotation.y = Math.PI;
    grp.position.y = yP; pipeRams.push({ grp, s });
    const rod = add(g, xCyl(0.12, 1, 6), M.rod, 0, yP, 0); rods.push({ rod, s, y: yP });
  }
  // blind shear rams (y 6.3..8.1)
  ramBody(yS, M.shearB);
  for (const s of [1, -1]) {
    const grp = new THREE.Group(); g.add(grp);
    const hy = s < 0 ? 0.23 : -0.23; // left(-x) block upper half, right(+x) block lower half
    add(grp, box(1.4, 0.44, 1.6), M.shearBlk, s * 0.7 + s * 0.15, hy, 0);
    const bl = add(grp, box(0.3, 0.44, 1.6), M.blade, s * 0.15, hy, 0);
    bl.scale.y = 0.98;
    grp.position.y = yS; shearRams.push({ grp, s });
    const rod = add(g, xCyl(0.12, 1, 6), M.rod, 0, yS, 0); rods.push({ rod, s, y: yS });
  }
  // spacer + LMRP connector
  add(g, cyl(1.3, 1.2, 12), M.body, 0, 8.7, 0);
  add(g, cyl(1.7, 0.5, 14), M.conn, 0, 8.75, 0);
  // annular body (lathe)
  const prof = [[0.95, 9.3], [2.1, 9.3], [2.25, 9.7], [2.2, 10.9], [1.85, 11.6], [1.25, 12.05], [0.95, 12.1]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  add(g, new THREE.LatheGeometry(prof, 16), M.annular);
  const donutGeo = makeDonut();
  const donut = add(g, donutGeo, M.rubber, 0, 10.6, 0); donut.frustumCulled = false; donut.children[0].frustumCulled = false;
  // flex joint + riser adapter
  add(g, new THREE.IcosahedronGeometry(0.85, 1), M.flex, 0, 12.6, 0);
  add(g, cyl(0.75, 1.2, 12), M.flex, 0, 13.0, 0);
  // frame
  const fg = [];
  const px = 3.1, pz = 2.7;
  for (const x of [-px, px]) for (const z of [-pz, pz]) fg.push(cylBetween([x, 0.5, z], [x, 13.0, z], 0.16, 4));
  for (const y of [0.7, 13.0]) {
    fg.push(cylBetween([-px, y, -pz], [px, y, -pz], 0.13, 4), cylBetween([-px, y, pz], [px, y, pz], 0.13, 4),
      cylBetween([-px, y, -pz], [-px, y, pz], 0.13, 4), cylBetween([px, y, -pz], [px, y, pz], 0.13, 4));
  }
  add(g, strip(fg), M.frame);
  add(g, box(0.9, 1.6, 0.7), M.podY, -1.2, 11.2, -2.75);
  add(g, box(0.9, 1.6, 0.7), M.podB, 1.2, 11.2, -2.75);
  let plate = null;
  if (withPipe) { // equipment ID tag (namman.story easter egg), bolted to the front-left frame post
    plate = new THREE.Group(); g.add(plate);
    add(plate, box(2.12, 0.86, 0.06), lam(0x6b7280), 0, 0, -0.04);
    add(plate, new THREE.PlaneGeometry(2.0, 2.0 * 200 / 512), new THREE.MeshLambertMaterial({ map: plateTex(), emissive: 0x3a3f46 }), 0, 0, 0.0);
    add(plate, box(0.9, 0.12, 0.16), lam(0x6b7280), -0.95, 0, -0.1);
    plate.position.set(-2.05, 4.75, 2.9);
  }
  // drill pipe through the stack (set A only)
  let upper = null, lower = null, stub = null;
  if (withPipe) {
    const pm = lam(0x7b8794);
    const tj = [];
    lower = new THREE.Group(); g.add(lower);
    add(lower, cyl(0.32, yS + 0.6, 10), pm, 0, (yS - 0.6) / 2, 0);
    upper = new THREE.Group(); g.add(upper);
    const top = 160;
    add(upper, cyl(0.32, top - yS, 10), pm, 0, (top + yS) / 2, 0);
    for (let y = yS + 9.5; y < top; y += 9.3) tj.push(cyl(0.42, 0.5, 10).translate(0, y, 0));
    add(upper, strip(tj), pm);
    stub = add(g, cyl(0.12, 0.25, 8, false, 0.36), pm, 0, yS + 0.05, 0); stub.visible = false;
  }
  const hiMats = {
    annular: [M.annular, M.rubber], shear: [M.shearB, M.shearBlk], pipe: [M.pipeB, M.pipeBlk],
    ck: [M.ck, M.valve], wh: [M.conn, M.wh],
  };
  const hiCol = { annular: C.annular, shear: C.shear, pipe: C.pipe, ck: C.ck, wh: C.conn };
  function set(st) {
    const a = st.ann || 0, p = st.pipe || 0, s = st.shear || 0;
    updateDonut(donutGeo, lerp(1.5, 0.87, a), 0.55, 1.1 - 0.12 * a);
    for (const r of pipeRams) r.grp.position.x = r.s * lerp(1.42, 0.0, p);
    for (const r of shearRams) r.grp.position.x = r.s * lerp(1.45, -0.5, s);
    for (const r of rods) {
      const front = r.y === yP ? lerp(1.42, 0, p) : lerp(1.45, -0.5, s);
      const x0 = front + (r.y === yP ? 1.2 : 1.6), x1 = 3.45;
      r.rod.scale.x = Math.max(0.01, x1 - x0); r.rod.position.x = r.s * (x0 + x1) / 2;
    }
    for (const v of valves) v.wheel.rotation.z = (st.valve || 0) * Math.PI * 2 * v.side;
    for (const k in hiMats) {
      const h = (st.hi && st.hi[k]) || 0;
      for (const m of hiMats[k]) {
        m.emissive.setHex(hiCol[k]).multiplyScalar(h * 0.55);
        const b = backs.get(m); if (b) b.emissive.setHex(hiCol[k]).multiplyScalar(h * 0.35);
      }
    }
    if (withPipe) {
      const cut = st.cut || 0;
      upper.position.y = cut * 0.45; stub.visible = cut > 0;
      lower.scale.y = 1; lower.position.y = -cut * 0.1;
    }
  }
  const d = new THREE.Vector3(1, 0, -0.5).normalize();
  const anchors = {
    annular: [1.0, 10.6, 0.2], annularTop: [1.4, 11.7, 0.5], shear: [0.0, 7.25, 0.3], pipe: [0.6, 5.2, 0.3],
    choke: [d.x * 2.3, 3.9, d.z * 2.3], kill: [-d.x * 2.3, 3.9, d.z * 2.3], wh: [1.4, 2.5, 0.9],
    chokeLine: [d.x * 3.1, 3.7, d.z * 3.1], top: [0, 13.4, 0],
  };
  return { group: g, set, anchors, yP, yS, chokeDir: d, plate };
}

// ---------------- offshore semi-submersible rig
// ---- easter-egg textures (namman.story)
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
  x.save(); x.translate(512, 230); x.scale(1, 2.1); // tall stencil lettering (reads well at grazing angles)
  x.lineJoin = 'round'; x.lineWidth = 9; x.strokeStyle = '#ffd23f'; x.strokeText('NAMMAN.STORY', 0, 0);
  x.fillStyle = '#ffffff'; x.fillText('NAMMAN.STORY', 0, 0);
  x.restore();
  x.fillStyle = '#ffd23f'; x.fillRect(90, 462, 844, 22);
  // worn paint: knock out speckles & scuffs (seeded)
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
function plateTex() {
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
  fitFont(x, 'namman.story', 600, 92, 430); x.fillText('namman.story', 256, 86);
  x.fillStyle = '#374151'; fitFont(x, 'SUBSEA BOP · 15K PSI', 600, 32, 400); x.fillText('SUBSEA BOP · 15K PSI', 256, 152);
  return canvasTex(c);
}

function buildRig() {
  const g = new THREE.Group();
  const white = lam(0xe8ecf1), gray = lam(0x8d97a3), dark = lam(0x4b5563), orange = lam(0xf97316),
    red = lam(0xe11d48), yellow = lam(0xfbbf24), green = lam(0x1f6f5c), glow = basic(0xffe6a3);
  for (const z of [-16, 16]) { add(g, box(66, 5, 10), gray, 0, -7, z); }
  for (const x of [-22, 22]) for (const z of [-16, 16]) {
    add(g, cyl(4, 18, 10), white, x, 1, z);
    add(g, cyl(4.12, 3.2, 10), orange, x, 0.2, z);
  }
  add(g, cylBetween([-22, -6, -16], [-22, -6, 16], 1.2, 6), gray);
  add(g, cylBetween([22, -6, -16], [22, -6, 16], 1.2, 6), gray);
  add(g, box(58, 5, 42), gray, 0, 12.5, 0);
  add(g, box(58.6, 0.7, 42.6), dark, 0, 15.2, 0);
  add(g, box(13, 3, 13), dark, 0, 17, 0);
  // derrick lattice
  const geos = [], H0 = 18.5, HT = 34, b0 = 5, b1 = 1.6, lv = 6;
  const P = (sx, sz, k) => { const u = k / lv, b = lerp(b0, b1, u); return [sx * b, H0 + HT * u, sz * b]; };
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) geos.push(cylBetween(P(sx, sz, 0), P(sx, sz, lv), 0.35, 5));
  for (let k = 0; k <= lv; k++) for (let c = 0; c < 4; c++) {
    const [ax, az] = corners[c], [bx, bz] = corners[(c + 1) % 4];
    geos.push(cylBetween(P(ax, az, k), P(bx, bz, k), 0.18, 4));
    if (k < lv) geos.push(cylBetween(P(ax, az, k), P(bx, bz, k + 1), 0.13, 4));
  }
  add(g, strip(geos), white);
  add(g, box(4.4, 2.2, 4.4), red, 0, H0 + HT + 1, 0);
  add(g, box(1, 1, 1), glow, 0, H0 + HT + 2.6, 0);
  // living quarters + windows
  add(g, box(15, 10, 17), white, -18, 20, 9);
  add(g, box(15.2, 0.8, 17.2), red, -18, 25.2, 9);
  for (let r = 0; r < 3; r++) add(g, box(15.3, 0.7, 13), glow, -18, 17.2 + r * 2.6, 9);
  // helideck
  add(g, cyl(10, 0.7, 10), green, -27, 27, 12);
  add(g, new THREE.TorusGeometry(9.0, 0.25, 3, 20), yellow, -27, 27.4, 12).rotation.x = Math.PI / 2;
  const decalGeo = new THREE.PlaneGeometry(15.5, 15.5 * 512 / 1024); decalGeo.rotateX(-Math.PI / 2);
  const decal = add(g, decalGeo, new THREE.MeshLambertMaterial({ map: helideckTex(), transparent: true, depthWrite: false, emissive: 0x2a2a2a }), -27, 27.37, 12);
  decal.rotation.y = -0.38;
  add(g, cylBetween([-21, 25, 7], [-27, 26.6, 12], 0.35, 4), gray);
  // cranes
  add(g, cyl(1.2, 7, 8), yellow, 22, 18.5, -15);
  add(g, cylBetween([22, 21, -15], [6, 34, -24], 0.5, 4), yellow);
  add(g, cyl(1.2, 7, 8), yellow, 24, 18.5, 15);
  add(g, cylBetween([24, 21, 15], [38, 30, 22], 0.5, 4), yellow);
  // pipe rack
  for (let i = 0; i < 6; i++) add(g, xCyl(0.5, 16, 6), gray, 14, 16.2 + (i % 2) * 0.8, 6 + i * 1.1);
  // flare boom
  add(g, cylBetween([28, 14, -18], [48, 30, -28], 0.45, 5), gray);
  const flame = add(g, new THREE.ConeGeometry(1.2, 4.5, 6), basic(0xffb347), 48, 32.5, -28);
  // tanks on deck
  add(g, cyl(2.4, 4, 10), white, 18, 17.5, -2);
  add(g, cyl(2.4, 4, 10), white, 18, 17.5, 4);
  return { group: g, flame };
}

// ---------------------------------------------------------------- state
const O = {};

// time functions (diorama flows)
const RATE_D = [[20, 8], [41.6, 8], [42.2, 0], [46.0, 0], [46.4, 35], [51.4, 35], [52.2, 10], [80, 10]];
const RATE_G = [[38, 10], [41.6, 10], [42.2, 1.0], [46.0, 0.5], [46.4, 35], [51.4, 35], [52.2, 10], [80, 10]];
const RATE_ROT = [[20, 5], [41.4, 5], [42.0, 0], [80, 0]];
const T_SW = 42.7;     // annular closed -> returns diverted to choke
const T_KILL = 46.0;   // kill mud pumping starts
const Y_INJ = 60, Y_RISER = 13.4 * BS;
const yBit = t => -52 - 9.2 * clamp((t - 28) / 11.4);
const yChoke = 3.7 * BS;

// bubble front (blowout, riser)
const yFront = t => { const s = Math.max(0, t - 53); return SB + 12 + 6 * s + 6.6 * s * s; };

// ---------------------------------------------------------------- camera
const TITLE_DIVE = [
  { t: 0, v: [-150, 112, 262, 0, 30, 0, 38] },
  { t: 4.5, v: [-64, 84, 110, -12, 22, 4, 38], stop: true },
  { t: 6.4, v: [-42, 5, 62, 0, -2, 0, 42] },
  { t: 7.5, v: [-12, -5, 18, 0, -18, 0, 45] },
  { t: 9.7, v: [-10, -58, 16, 0, -78, 0, 45] },
  { t: 11.7, v: [-14, -113, 25, 0, -128, 0, 42] },
];
const ANAT = [ // az, el, dist, focusY, fov (relative to BOP)
  { t: 13.0, v: [-40, 10, 38, 7.0, 40] },
  { t: 14.5, v: [-26, 12, 25, 10.3, 40] },
  { t: 17.0, v: [-16, 10, 24.5, 10.1, 40] },
  { t: 17.9, v: [-10, 6, 24, 7.3, 40] },
  { t: 20.3, v: [-3, 5, 23.5, 7.1, 40] },
  { t: 21.2, v: [3, 5, 23.5, 5.3, 40] },
  { t: 23.8, v: [9, 6, 23.5, 5.1, 40] },
  { t: 24.7, v: [13, 16, 23, 4.0, 40] },
  { t: 26.2, v: [18, 16, 23, 3.7, 40] },
  { t: 27.0, v: [22, 15, 23, 2.8, 40] },
  { t: 28.0, v: [27, 13, 25, 3.6, 40] },
];
function sph(v, cy = SB) {
  const [az, el, d, fy, fov] = v;
  return [d * Math.cos(el * D2R) * Math.sin(az * D2R), cy + fy + d * Math.sin(el * D2R), d * Math.cos(el * D2R) * Math.cos(az * D2R), 0, cy + fy, 0, fov];
}
TITLE_DIVE.push({ t: 13.0, v: sph(ANAT[0].v) });
const DIO = [ // local diorama coords
  { t: 28.0, v: [5, 24, 40, 0, 20, 0, 40] },
  { t: 29.6, v: [4, 6, 38, 0, 3, 0, 40] },
  { t: 32.6, v: [3, -46, 34, 0, -51, 0, 40] },
  { t: 35.4, v: [2, -43, 42, 0, -48, 0, 40] },
  { t: 38.0, v: [0, -52, 32, 0, -57, 0, 40] },
  { t: 40.8, v: [-1, -53, 29, 0, -58, 0, 40], stop: true },
  { t: 42.3, v: [6, 21, 64, 0, 18, 0, 40], stop: true },
  { t: 45.4, v: [3, 20, 60, 0, 17, 0, 40], stop: true },
  { t: 47.6, v: [0, -10, 158, 0, -14, 0, 40] },
  { t: 51.0, v: [0, -12, 146, 0, -15, 0, 40] },
  { t: 53.0, v: [0, -11, 136, 0, -14, 0, 40] },
];
const SURF1 = [{ t: 57.0, v: [-128, 62, 176, 0, 31, 0, 40] }, { t: 60.2, v: [-108, 54, 150, 0, 31, 0, 40] }];
const SHEAR = [{ t: 60.2, v: [-12, 6, 21, 7.0, 40] }, { t: 62.8, v: [4, 7, 19, 7.2, 40] }];
const SURF2 = [{ t: 62.8, v: [-84, 96, 130, -8, 30, 0, 40] }, { t: 66.0, v: [-98, 104, 152, -8, 32, 0, 40] }];
const HERO = [
  { t: 66.0, v: [38, 4, 31, 9.5, 40] },
  { t: 71.0, v: [16, 6, 26, 8.2, 40] },
  { t: 75.0, v: [-2, 5, 18, 5.0, 40] },
];

// shift camera+target down by k*dist so the subject sits above screen centre (clear of caption box)
function lift(v, k = 0.05) {
  const d = Math.hypot(v[0] - v[3], v[1] - v[4], v[2] - v[5]);
  v[1] -= k * d; v[4] -= k * d; return v;
}
function camState(t) {
  if (t < 13) return { set: 'A', v: t > 11.7 ? lift(track(TITLE_DIVE, t), 0.05 * sstep(11.7, 13, t)) : track(TITLE_DIVE, t) };
  if (t < 28) return { set: 'A', v: lift(sph(track(ANAT, t))) };
  if (t < 53) { const v = lift(track(DIO, t)); v[0] += DX; v[3] += DX; return { set: 'B', v }; }
  if (t < 57) {
    const s = t - 53, yf = yFront(t - 0.35);
    const az = (-30 + s * 8) * D2R, d = 13 + s * 0.5;
    return { set: 'A', v: lift([d * Math.sin(az), yf - 1.0, d * Math.cos(az), 0, yf - 1.5, 0, 42], 0.06) };
  }
  if (t < 60.2) return { set: 'A', v: track(SURF1, t) };
  if (t < 62.8) return { set: 'A', v: lift(sph(track(SHEAR, t))) };
  if (t < 66) return { set: 'A', v: track(SURF2, t) };
  return { set: 'A', v: sph(track(HERO, t)) };
}

// ---------------------------------------------------------------- init
async function init(opts) {
  THREE = opts.THREE; renderer = opts.renderer; W = opts.width || 1080; H = opts.height || 1920;
  renderer.localClippingEnabled = true;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, W / H, 0.3, 4000);
  scene.fog = new THREE.Fog(0x000000, 10, 1000);
  scene.background = new THREE.Color();

  O.hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1.5); scene.add(O.hemi);
  O.dir = new THREE.DirectionalLight(0xffffff, 2.2); scene.add(O.dir); scene.add(O.dir.target);
  O.fireLight = new THREE.PointLight(0xff7a1a, 0, 0, 1.6); O.fireLight.position.set(0, 30, 0); scene.add(O.fireLight);

  // ======================= SET A (world) =======================
  const A = O.A = new THREE.Group(); scene.add(A);
  O.clipA = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e4);
  // sky dome
  const sky = new THREE.SphereGeometry(2500, 32, 16);
  const sc = [], sp = sky.attributes.position;
  const cTop = new THREE.Color(0x27306e), cMid = new THREE.Color(0xa8558f), cHor = new THREE.Color(0xffb37d), cLow = new THREE.Color(0x28506e);
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i) / 2500; const c = new THREE.Color();
    if (y < 0) c.copy(cHor).lerp(cLow, clamp(-y * 6));
    else if (y < 0.18) c.copy(cHor).lerp(cMid, y / 0.18);
    else c.copy(cMid).lerp(cTop, clamp((y - 0.18) / 0.5));
    sc.push(c.r, c.g, c.b);
  }
  sky.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  O.sky = add(A, sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  O.sky.renderOrder = -10;
  const sunDir = new THREE.Vector3(-0.15, 0.07, -1).normalize();
  O.sunDir = sunDir;
  O.sun = add(A, new THREE.CircleGeometry(70, 28), basic(0xfff1c9, { fog: false }), ...sunDir.clone().multiplyScalar(2300).toArray());
  O.sun.lookAt(0, 0, 0);
  O.sunGlow = add(A, new THREE.CircleGeometry(260, 28), basic(0xffc58a, { fog: false, transparent: true, opacity: 0.35, depthWrite: false }), ...sunDir.clone().multiplyScalar(2320).toArray());
  O.sunGlow.lookAt(0, 0, 0);

  // ocean surface (non-uniform grid, denser near rig)
  const og = new THREE.PlaneGeometry(2, 2, 72, 72); og.rotateX(-Math.PI / 2);
  const op = og.attributes.position;
  for (let i = 0; i < op.count; i++) {
    const m = v => Math.sign(v) * Math.pow(Math.abs(v), 1.6) * 1800;
    op.setX(i, m(op.getX(i))); op.setZ(i, m(op.getZ(i)));
  }
  O.oceanBase = Float32Array.from(op.array);
  O.ocean = add(A, og, new THREE.MeshPhongMaterial({ color: 0x1d6890, specular: 0xffc895, shininess: 70, flatShading: true, side: THREE.DoubleSide }));
  O.ocean.frustumCulled = false;

  O.rig = buildRig(); A.add(O.rig.group);

  // riser + buoyancy + aux lines
  const riserMat = lam(0xd4d9e0, { clippingPlanes: [O.clipA] });
  const riserIn = lam(0x4a5866, { clippingPlanes: [O.clipA], side: THREE.BackSide });
  const buoyMat = lam(0xf2f4f7, { clippingPlanes: [O.clipA] });
  const rTop = 12, rBot = SB + 13.4;
  const pair = (geo, mf, mb) => { add(A, geo, mf); add(A, geo, mb); };
  pair(cyl(0.75, rTop - rBot, 12, true).translate(0, (rTop + rBot) / 2, 0), riserMat, riserIn);
  const bg = [], rg = [];
  for (let y = -112; y < -14; y += 14) bg.push(cyl(1.3, 11, 12, true).translate(0, y, 0));
  for (let y = rBot + 6; y < rTop; y += 14) rg.push(cyl(0.95, 0.5, 12, true).translate(0, y, 0));
  pair(mergeGeometries(bg), buoyMat, riserIn);
  pair(mergeGeometries(rg), riserMat, riserIn);
  O.riserMud = add(A, cyl(0.7, rTop - rBot + 6, 12, true).translate(0, (rTop + rBot - 6) / 2, 0), lam(0x8a5a2e, { clippingPlanes: [O.clipA], side: THREE.BackSide }));
  const aux = lam(0x10b981);
  add(A, strip([cylBetween([1.45, rBot + 1, -0.7], [1.45, rTop, -0.7], 0.12, 5), cylBetween([-1.45, rBot + 1, -0.7], [-1.45, rTop, -0.7], 0.12, 5),
    cylBetween([2.77, SB + 13.9, -1.39], [1.45, rBot + 1, -0.7], 0.14, 5), cylBetween([-2.77, SB + 13.9, -1.39], [-1.45, rBot + 1, -0.7], 0.14, 5)]), aux);

  // seabed
  const sg = new THREE.PlaneGeometry(700, 700, 44, 44); sg.rotateX(-Math.PI / 2);
  const spp = sg.attributes.position;
  for (let i = 0; i < spp.count; i++) {
    const x = spp.getX(i), z = spp.getZ(i), r = Math.hypot(x, z);
    const n = Math.sin(x * 0.05) * Math.cos(z * 0.043) * 2.2 + Math.sin(x * 0.13 + z * 0.09) * 0.9 + (hash(i, 3) - 0.5) * 1.2;
    spp.setY(i, SB + n * sstep(12, 40, r) - 0.3);
  }
  add(A, sg, lam(0xcdb489));
  const rocks = [];
  for (let i = 0; i < 26; i++) {
    const a = hash(i, 1) * Math.PI * 2, r = 14 + hash(i, 2) * 70, s = 0.8 + hash(i, 4) * 2.4;
    const gq = new THREE.DodecahedronGeometry(s, 0); gq.scale(1, 0.6, 1.1); gq.rotateY(hash(i, 5) * 3);
    rocks.push(gq.translate(Math.cos(a) * r, SB + s * 0.2, Math.sin(a) * r));
  }
  add(A, mergeGeometries(rocks), lam(0x7d8a96));
  const coral = [];
  for (let i = 0; i < 14; i++) {
    const a = hash(i, 7) * Math.PI * 2, r = 16 + hash(i, 8) * 40;
    coral.push(new THREE.ConeGeometry(0.6, 2 + hash(i, 9) * 2.5, 5).translate(Math.cos(a) * r, SB + 1, Math.sin(a) * r));
  }
  add(A, mergeGeometries(coral), lam(0xf472b6));

  // BOP on wellhead
  O.bopA = buildBOP([O.clipA], true);
  O.bopA.group.position.set(0, SB, 0); A.add(O.bopA.group);

  // light rays (underwater)
  const rayMat = basic(0xc8f3ff, { transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const rays = [];
  for (let i = 0; i < 9; i++) {
    const p = new THREE.PlaneGeometry(4 + hash(i, 11) * 6, 170);
    p.translate(0, -85, 0); p.rotateZ(0.18 + hash(i, 12) * 0.08); p.rotateY(hash(i, 13) * 3.1);
    p.translate(-30 + hash(i, 14) * 60, 0, -25 + hash(i, 15) * 50);
    rays.push(p);
  }
  O.rays = add(A, mergeGeometries(rays), rayMat);

  // marine snow
  O.snow = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.08), basic(0xe6fbff), 320);
  O.snow.frustumCulled = false; A.add(O.snow);
  // fish
  const fishG = mergeGeometries([new THREE.ConeGeometry(0.5, 2.0, 5).rotateZ(-Math.PI / 2),
    new THREE.ConeGeometry(0.45, 0.7, 3).rotateZ(Math.PI / 2).translate(-1.25, 0, 0)].map(g => g.toNonIndexed()));
  O.fish = new THREE.InstancedMesh(fishG, lam(0xffb020), 36);
  O.fish.frustumCulled = false; A.add(O.fish);

  // blowout gas bubbles (riser / BOP bore)
  O.gasA = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshLambertMaterial({ color: 0xfffbea, emissive: 0x8a7a50 }), 260);
  O.gasA.frustumCulled = false; A.add(O.gasA);
  // eruption
  O.erMud = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), lam(0x7a4a24), 260);
  O.erGas = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), lam(0xf3f4f6, { transparent: true, opacity: 0.7 }), 120);
  O.fire = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), basic(0xffffff), 120);
  O.smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), lam(0x2b2f36, { transparent: true, opacity: 0.8, depthWrite: false }), 48);
  for (const m of [O.erMud, O.erGas, O.fire, O.smoke]) { m.frustumCulled = false; A.add(m); }
  O.fire.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(120 * 3), 3);

  // ======================= SET B (diorama cross-section) =======================
  const B = O.B = new THREE.Group(); B.position.x = DX; scene.add(B);
  O.clipB = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const cb = (c, o = {}) => lam(c, { clippingPlanes: [O.clipB], side: THREE.DoubleSide, ...o });
  const Wd = 90, Dd = 40, RC = 2.6, RO = 2.25, Y_SHOE = -34;
  O.layers = [
    { y0: 0, y1: -12, c: 0xd9bf8c, name: 'sed' },
    { y0: -12, y1: -25, c: 0x97a08a },
    { y0: -25, y1: -38, c: 0xe1b98c },
    { y0: -38, y1: -49, c: 0xbdb5a8 },
    { y0: -49, y1: -60, c: 0x7c8273 },
    { y0: -60, y1: -71, c: 0xe07a3f, gas: true },
    { y0: -71, y1: -140, c: 0x5d6158 },
  ];
  const lg = {};
  for (const L of O.layers) {
    const segs = [];
    if (L.y0 > Y_SHOE && L.y1 < Y_SHOE) segs.push([L.y0, Y_SHOE, RC], [Y_SHOE, L.y1, RO]);
    else segs.push([L.y0, L.y1, L.y0 > Y_SHOE - 0.01 && L.y1 >= Y_SHOE ? RC : RO]);
    const geos = [];
    for (const [a, b, R] of segs) {
      const h = a - b, yc = (a + b) / 2;
      geos.push(box(Wd - R, h, Dd).translate(-(R + Wd) / 2, yc, -Dd / 2));
      geos.push(box(Wd - R, h, Dd).translate((R + Wd) / 2, yc, -Dd / 2));
      geos.push(box(2 * R, h, Dd - R).translate(0, yc, -R - (Dd - R) / 2));
      if (R === RO) add(B, cyl(R, h, 16, true), cb(new THREE.Color(L.c).multiplyScalar(0.62).getHex()), 0, yc, 0);
    }
    add(B, mergeGeometries(geos), lam(L.c));
    if (L.y1 < Y_SHOE) { // solid rock plug below the bit (hole not yet drilled)
      const pg = box(2 * RO + 0.02, 1, RO + 0.2).translate(0, -0.5, -(RO + 0.2) / 2);
      L.plug = add(B, pg, lam(L.c));
    }
  }
  // texture pebbles on the cut face
  const peb = { light: [], dark: [], gas: [] };
  for (let i = 0; i < 260; i++) {
    const x = (hash(i, 21) - 0.5) * 2 * 70, y = -hash(i, 22) * 100;
    if (Math.abs(x) < 3.4) continue;
    const L = O.layers.find(l => y <= l.y0 && y > l.y1);
    const r = 0.25 + hash(i, 23) * 0.6;
    const gq = new THREE.CircleGeometry(r, 5).translate(x, y, 0.03);
    if (L && L.gas) peb.gas.push(gq); else (hash(i, 24) < 0.5 ? peb.light : peb.dark).push(gq);
  }
  for (let i = 0; i < 90; i++) { // gas pores
    const x = (hash(i, 31) - 0.5) * 2 * 60, y = -60.6 - hash(i, 32) * 9.8;
    if (Math.abs(x) < 3) continue;
    peb.gas.push(new THREE.CircleGeometry(0.22 + hash(i, 33) * 0.3, 6).translate(x, y, 0.04));
  }
  add(B, mergeGeometries(peb.light), basic(0xffffff, { transparent: true, opacity: 0.16, depthWrite: false }));
  add(B, mergeGeometries(peb.dark), basic(0x000000, { transparent: true, opacity: 0.13, depthWrite: false }));
  O.gasPores = add(B, mergeGeometries(peb.gas), basic(0xfff2b0, { transparent: true, opacity: 0.75 }));
  // seabed top strip
  add(B, box(2 * Wd, 0.4, Dd).translate(0, 0.2, -Dd / 2), lam(0xe9d3a3));
  // cement + casing (cased section)
  add(B, cyl(RC, -Y_SHOE + 1, 16, true), cb(0xc9c3b6), 0, Y_SHOE / 2 - 0.5, 0);
  add(B, cyl(RO, -Y_SHOE + 1, 16, true), cb(0x9aa6b4), 0, Y_SHOE / 2 - 0.5, 0);
  const cs = [];
  for (const s of [1, -1]) {
    cs.push(box(RC - RO, -Y_SHOE, 0.2).translate(s * (RC + RO) / 2, Y_SHOE / 2, -0.1));
  }
  add(B, mergeGeometries(cs), lam(0xb8b2a6));
  add(B, mergeGeometries([1, -1].map(s => box(0.16, -Y_SHOE + 1, 0.2).translate(s * RO, Y_SHOE / 2 - 0.5, -0.1))), lam(0x475569));
  add(B, mergeGeometries([1, -1].map(s => box(0.5, 0.8, 0.3).translate(s * (RO + 0.1), Y_SHOE - 0.2, -0.1))), lam(0x475569));
  // fluid columns
  O.annFluid = add(B, cyl(2.2, 1, 16, true).translate(0, 0.5, 0), cb(C.mud));
  O.annFluidR = add(B, cyl(1.78, 100, 16, true).translate(0, 50, 0), cb(C.mud), 0, Y_RISER, 0);
  O.pipeFluid = add(B, cyl(0.74, 1, 12, true).translate(0, 0.5, 0), cb(C.mud));
  O.annKill = add(B, cyl(2.15, 1, 16, true).translate(0, 0.5, 0), cb(C.kill));
  O.pipeKill = add(B, cyl(0.71, 1, 12, true).translate(0, 0.5, 0), cb(C.kill));
  // riser stub in diorama
  add(B, cyl(1.875, 100, 16, true), cb(0xd4d9e0), 0, Y_RISER + 50, 0);
  add(B, mergeGeometries([1, -1].map(s => box(0.16, 100, 0.2).translate(s * 1.875, Y_RISER + 50, -0.1))), lam(0x94a3b8));
  // BOP (scaled)
  O.bopB = buildBOP([O.clipB], false);
  O.bopB.group.scale.setScalar(BS); B.add(O.bopB.group);
  // drill string (moves with bit)
  const ds = O.ds = new THREE.Group(); B.add(ds);
  const pipeM = cb(0x8792a2), tjM = cb(0xaab4c3);
  O.dsRot = new THREE.Group(); ds.add(O.dsRot);
  add(O.dsRot, cyl(0.8, 150, 14, true), pipeM, 0, 14 + 75, 0);
  add(O.dsRot, cyl(1.1, 11.4, 14, true), cb(0x6b7684), 0, 2.6 + 5.7, 0);
  const tjs = [], stripes = [];
  for (let y = 20; y < 160; y += 12) {
    tjs.push(cyl(0.98, 1.1, 14, true).translate(0, y, 0));
    stripes.push(box(0.25, 1.15, 0.12).translate(0.97, y, 0), box(0.25, 1.15, 0.12).translate(-0.97, y, 0));
  }
  add(O.dsRot, mergeGeometries(tjs), tjM);
  add(O.dsRot, mergeGeometries(stripes), cb(0x1e293b));
  // pipe wall cut edges (static, don't rotate)
  add(ds, mergeGeometries([1, -1].map(s => box(0.1, 150, 0.15).translate(s * 0.77, 89, -0.08))), lam(0x475569));
  add(ds, mergeGeometries([1, -1].map(s => box(0.36, 11.4, 0.15).translate(s * 0.92, 8.3, -0.08))), lam(0x475569));
  // bit
  const bit = O.bit = new THREE.Group(); ds.add(bit);
  add(bit, cyl(2.05, 1.3, 10), lam(0x9ca3af), 0, 1.95, 0);
  add(bit, new THREE.ConeGeometry(2.05, 1.4, 10).rotateX(Math.PI), lam(0xb0b7c2), 0, 0.6, 0);
  const teeth = [];
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2, r = 0.7 + (i % 2) * 0.8;
    teeth.push(new THREE.ConeGeometry(0.28, 0.6, 4).rotateX(Math.PI).translate(Math.cos(a) * r, 0.5 - (r - 0.7) * 0.45 - 0.2, Math.sin(a) * r));
  }
  add(bit, mergeGeometries(teeth), lam(0xfbbf24));
  // particles: mud loop (2 sets) + gas bubbles
  const NP = O.NP = 900;
  O.mudP = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 0), basic(0xffffff), NP * 2);
  O.mudP.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NP * 2 * 3), 3);
  O.mudP.frustumCulled = false; B.add(O.mudP);
  O.gasB = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshLambertMaterial({ color: 0xfffbea, emissive: 0x8a7a48 }), 110);
  O.gasB.frustumCulled = false; B.add(O.gasB);

  O.m4 = new THREE.Matrix4(); O.col = new THREE.Color();
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
function setC(mesh, i, hex) { O.col.setHex(hex); O.col.toArray(mesh.instanceColor.array, i * 3); }
function done(mesh, n) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }

// mud loop path (diorama local coords) -> writes into out [x,y,z], returns visible
function mudPath(s, i, yb, chokeMode, out) {
  const yPB = yb + 2.6, LA = Y_INJ - yPB, LB = 4;
  const jx = (hash(i, 41) - 0.5) * 1.0, jz = -0.45 + hash(i, 42) * 0.8;
  const side = hash(i, 43) < 0.5 ? -1 : 1, lane = 1.2 + hash(i, 44) * 0.8, lz = -0.4 + hash(i, 45) * 0.9;
  if (s < LA) { out[0] = jx * 0.55; out[1] = Y_INJ - s; out[2] = jz * 0.7; return 1; }
  if (s < LA + LB) {
    const u = (s - LA) / LB;
    out[0] = lerp(jx * 0.55, side * lane, u); out[1] = lerp(yPB, yb + 0.2, u) - Math.sin(u * Math.PI) * 2.4; out[2] = lerp(jz * 0.7, lz, u);
    return 1;
  }
  const c = s - LA - LB;
  const y = yb + 0.2 + c;
  const wob = Math.sin(y * 0.7 + i) * 0.08;
  if (!chokeMode || y < yChoke) {
    const ln = y > Y_RISER ? 1.0 + (lane - 1.2) * 0.75 : lane;
    out[0] = side * ln + wob; out[1] = y; out[2] = lz; return y < Y_INJ + 1 ? 1 : 0;
  }
  // choke route: outlet then up the choke line (in front of line surface)
  const ex = O.bopB.chokeDir.x * 3.1 * BS, ez = O.bopB.chokeDir.z * 3.1 * BS + 0.55;
  const x0 = side * lane, LD = Math.hypot(ex - x0, ez - lz);
  const e = y - yChoke;
  if (e < LD) { const u = e / LD; out[0] = lerp(x0, ex, u); out[1] = yChoke + Math.sin(u * Math.PI) * 0.3; out[2] = lerp(lz, ez, u); return 1; }
  out[0] = ex; out[1] = yChoke + (e - LD); out[2] = ez; return out[1] < 13.6 * BS ? 1 : 0;
}

function bopAState(t) {
  const st = { ann: 0, pipe: 0, shear: 0, cut: 0, valve: 0, hi: {} };
  if (t >= 13 && t < 28) {
    st.ann = sstep(15.3, 15.9, t) * (1 - sstep(16.8, 17.3, t));
    st.shear = 0.55 * sstep(18.6, 19.0, t) * (1 - sstep(19.8, 20.3, t));
    st.pipe = sstep(21.9, 22.35, t) * (1 - sstep(23.2, 23.7, t));
    st.valve = sstep(24.7, 25.8, t);
    const pul = 0.55 + 0.45 * Math.sin(t * 7);
    st.hi.annular = win(t, 14.0, 17.4) * pul; st.hi.shear = win(t, 17.4, 20.8) * pul;
    st.hi.pipe = win(t, 20.8, 24.2) * pul; st.hi.ck = win(t, 24.2, 26.4) * pul; st.hi.wh = win(t, 26.4, 28.2) * pul;
  }
  if (t >= 60.2 && t < 66) {
    st.shear = sstep(61.0, 61.22, t); st.cut = sstep(61.12, 61.3, t);
    st.hi.shear = win(t, 60.4, 62.8) * (0.55 + 0.45 * Math.sin(t * 9));
  }
  return st;
}

// ---------------------------------------------------------------- apply state for time t
function applyState(t) {
  if (O.lastT === t) return;
  O.lastT = t;
  const cs = camState(t), v = cs.v;
  camera.position.set(v[0], v[1], v[2]);
  camera.lookAt(v[3], v[4], v[5]);
  camera.fov = v[6]; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  O.set = cs.set;
  O.A.visible = cs.set === 'A'; O.B.visible = cs.set === 'B';
  if (cs.set === 'A') applyA(t, v); else applyB(t, v);
}

const cA = new Float32Array(3);
function applyA(t, v) {
  const camY = v[1];
  const under = camY < 0.0;
  // environment
  if (!under) {
    scene.background.setHex(0x27306e);
    scene.fog.color.setHex(0xf2ab84); scene.fog.near = 160; scene.fog.far = 1700;
    O.hemi.color.setHex(0xffe2c4); O.hemi.groundColor.setHex(0x34587a); O.hemi.intensity = 1.7;
    O.dir.color.setHex(0xffc08a); O.dir.intensity = 2.6;
    O.dir.position.copy(O.sunDir).multiplyScalar(100).add(new THREE.Vector3(60, 60, 60)); O.dir.target.position.set(0, 0, 0);
  } else {
    const dd = clamp(-camY / 140);
    const fc = new THREE.Color(0x1d8cb5).lerp(new THREE.Color(0x0b3f5f), dd);
    scene.background.copy(fc); scene.fog.color.copy(fc);
    scene.fog.near = 3; scene.fog.far = lerp(170, 105, dd);
    O.hemi.color.setHex(0xa8ecff); O.hemi.groundColor.setHex(0x0d3048); O.hemi.intensity = 2.0;
    O.dir.color.setHex(0xdaf6ff); O.dir.intensity = 1.6;
    O.dir.position.set(20, 100, 40); O.dir.target.position.set(0, 0, 0);
  }
  O.sky.visible = O.sun.visible = O.sunGlow.visible = !under;
  O.sky.position.set(v[0], 0, v[2]);
  O.rays.visible = under;
  // ocean waves
  const op = O.ocean.geometry.attributes.position, a = op.array, b = O.oceanBase;
  for (let i = 0; i < a.length; i += 3) {
    const x = b[i], z = b[i + 2];
    a[i + 1] = 0.9 * Math.sin(0.045 * x + 1.1 * t) + 0.7 * Math.sin(0.06 * z - 0.9 * t + 0.012 * x) + 0.45 * Math.sin(0.11 * (x + z) + 1.7 * t);
  }
  op.needsUpdate = true;
  O.rig.flame.scale.set(1 + 0.15 * Math.sin(t * 13), 1 + 0.25 * Math.sin(t * 9.3), 1);
  // clip plane (cutaway facing camera)
  let cut = 0;
  if (t >= 13 && t < 28) cut = eio((t - 13.2) / 1.3);
  else if (t >= 53 && t < 57) cut = 1;
  else if (t >= 60.2 && t < 62.8) cut = 1;
  {
    const hx = v[0], hz = v[2], l = Math.hypot(hx, hz) || 1;
    O.clipA.normal.set(-hx / l, 0, -hz / l);
    O.clipA.constant = cut <= 0 ? 1e4 : lerp(7, -0.02, cut);
  }
  O.bopA.set(bopAState(t));
  O.bopA.plate.visible = t < 13.5 || (t >= 25.6 && t < 28) || t >= 66;
  O.riserMud.visible = (t >= 53 && t < 57) || (t >= 60.2 && t < 62.8);
  // marine snow around camera
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
  } else done(O.snow, 0);
  // fish schools
  if (under) {
    for (let i = 0; i < 36; i++) {
      const school = i < 20 ? 0 : 1;
      const yc = school ? -96 : -52, R = (school ? 26 : 20) + hash(i, 61) * 6, w = (school ? -0.22 : 0.26);
      const ang = t * w + hash(i, 62) * 0.9 + school * 2;
      const x = Math.cos(ang) * R, z = Math.sin(ang) * R, y = yc + (hash(i, 63) - 0.5) * 6 + Math.sin(t * 2 + i) * 0.4;
      const heading = Math.atan2(-Math.cos(ang) * w, -Math.sin(ang) * w) ;
      setIRot(O.fish, i, x, y, z, 0.9 + hash(i, 64) * 0.4, heading);
    }
    done(O.fish, 36);
  } else done(O.fish, 0);

  // gas bubbles in riser / BOP
  let ng = 0;
  if (t >= 53 && t < 57) {
    const yf = yFront(t);
    for (let j = 0; j < 260; j++) {
      const y = yf - j * 0.55 - hash(j, 71) * 0.4;
      if (y < SB + 1.5) break;
      const frac = clamp((y - SB) / 140);
      const r = 0.12 + 0.26 * frac + hash(j, 72) * 0.05;
      const th = hash(j, 73) * Math.PI * 2 + y * 0.2, rr = y < SB + 13 ? 0.62 : 0.32 + 0.22 * (1 - frac);
      setI(O.gasA, ng++, Math.cos(th) * rr, y, Math.sin(th) * rr, r);
    }
  } else if (t >= 60.2 && t < 62.8) {
    const yS = SB + O.bopA.yS;
    for (let j = 0; j < 140; j++) {
      const H = 40, sp = 9;
      const base = tt => SB + 0.5 + ((hash(j, 74) * H + tt * sp) % H);
      let y = base(t);
      const y0 = base(61.05);
      if (t > 61.05 && y0 < yS - 0.3) { y = Math.min(base(61.05), yS - 0.6 - hash(j, 76) * 0.4); }
      else if (t > 61.05) { y = y0 + (t - 61.05) * sp; }
      if (y < SB + 1.6) continue;
      const th = hash(j, 75) * Math.PI * 2;
      setI(O.gasA, ng++, Math.cos(th) * 0.6, y, Math.sin(th) * 0.6, 0.2 + hash(j, 77) * 0.08);
    }
  }
  done(O.gasA, ng);

  // eruption / fire / smoke at the rig
  const I = t >= 57 && t < 66 ? sstep(57.3, 57.7, t) * (1 - sstep(62.9, 64.4, t)) : 0;
  const F = t >= 57 && t < 66 ? sstep(57.9, 58.5, t) * (1 - sstep(63.2, 65.6, t)) : 0;
  const Sm = t >= 57 && t < 66 ? sstep(58.2, 59.5, t) * (1 - sstep(64.5, 66, t)) : 0;
  let nm = 0, ngs = 0, nf = 0, ns = 0;
  if (I > 0 || F > 0 || Sm > 0) {
    const env = tt => (tt >= 57.3 ? sstep(57.3, 57.7, tt) * (1 - sstep(62.9, 64.4, tt)) : 0);
    for (let i = 0; i < 260; i++) {
      const life = 2.2, age = fract(t / life + hash(i, 81)) * life, born = t - age;
      if (hash(i, 82) > env(born)) continue;
      const vy = 34 + hash(i, 83) * 14, ang = hash(i, 84) * 6.283, hv = 2 + hash(i, 85) * 7;
      const x = Math.cos(ang) * hv * age, z = Math.sin(ang) * hv * age, y = 18.5 + vy * age - 15 * age * age;
      if (y < 10) continue;
      setI(O.erMud, nm++, x, y, z, 0.5 + hash(i, 86) * 0.7);
    }
    for (let i = 0; i < 120; i++) {
      const life = 1.8, age = fract(t / life + hash(i, 87)) * life, born = t - age;
      if (hash(i, 88) > env(born)) continue;
      const ang = hash(i, 89) * 6.283, hv = 1 + hash(i, 90) * 4;
      const y = 19 + (40 + hash(i, 91) * 12) * age - 8 * age * age;
      setI(O.erGas, ngs++, Math.cos(ang) * hv * age * 2, y, Math.sin(ang) * hv * age * 2, 0.6 + age * 1.6);
    }
    const fenv = tt => (tt >= 57.9 ? sstep(57.9, 58.5, tt) * (1 - sstep(63.2, 65.6, tt)) : 0);
    for (let i = 0; i < 120; i++) {
      const life = 0.9 + hash(i, 92) * 0.4, age = fract(t / life + hash(i, 93)), born = t - age * life;
      const fe = fenv(born); if (fe <= 0.02) continue;
      const ang = hash(i, 94) * 6.283 + age * 2, rr = (1 - age) * 3.5 * hash(i, 95) + 0.5;
      const y = 18.5 + age * (16 + 12 * fe) * (0.6 + hash(i, 96) * 0.6);
      setI(O.fire, nf, Math.cos(ang) * rr, y, Math.sin(ang) * rr, (1 - age * 0.8) * (2.0 + hash(i, 97) * 2.0) * (0.4 + 0.6 * fe));
      setC(O.fire, nf, age < 0.25 ? 0xfff3a0 : age < 0.55 ? 0xffb020 : 0xff5a1f);
      nf++;
    }
    const senv = tt => (tt >= 58.2 ? sstep(58.2, 59.5, tt) * (1 - sstep(64.5, 66, tt)) : 0);
    for (let i = 0; i < 48; i++) {
      const life = 4, age = fract(t / life + hash(i, 98)), born = t - age * life;
      if (hash(i, 99) > senv(born)) continue;
      const y = 34 + age * 70, x = age * 40 * (0.6 + hash(i, 100)) + (hash(i, 101) - 0.5) * 6, z = (hash(i, 102) - 0.5) * 12 - age * 10;
      setI(O.smoke, ns++, x, y + 8, z, 2 + age * 6.5);
    }
  }
  done(O.erMud, nm); done(O.erGas, ngs); done(O.fire, nf); done(O.smoke, ns);
  O.fireLight.intensity = F * (5000 + 1800 * Math.sin(t * 23) + 1200 * Math.sin(t * 37));
}

const pp = [0, 0, 0];
function applyB(t, v) {
  scene.background.setHex(0x0f5274);
  scene.fog.color.setHex(0x0f5274); scene.fog.near = 120; scene.fog.far = 900;
  O.hemi.color.setHex(0xffffff); O.hemi.groundColor.setHex(0x7a8796); O.hemi.intensity = 1.9;
  O.dir.color.setHex(0xffffff); O.dir.intensity = 1.9;
  O.dir.position.set(DX + 40, 70, 90); O.dir.target.position.set(DX, -10, 0);
  O.fireLight.intensity = 0;
  const yb = yBit(t);
  O.ds.position.y = yb;
  for (const L of O.layers) if (L.plug) {
    const top = Math.min(L.y0, yb - 0.1);
    L.plug.visible = top > L.y1; L.plug.position.y = top; L.plug.scale.y = Math.max(0.01, top - L.y1);
  }
  O.dsRot.rotation.y = pwlIntegral(RATE_ROT, t);
  O.bit.rotation.y = O.dsRot.rotation.y;
  // BOP state in diorama
  const ann = sstep(42.7, 43.2, t), pip = sstep(44.0, 44.45, t);
  const pul = 0.55 + 0.45 * Math.sin(t * 8);
  O.bopB.set({ ann, pipe: pip, shear: 0, valve: sstep(45.0, 45.8, t), hi: { annular: win(t, 42.6, 45.2) * pul, pipe: win(t, 43.9, 45.8) * pul, ck: win(t, 45.0, 48.5) * pul } });
  // fluid columns
  const D = pwlIntegral(RATE_D, t), Dk = pwlIntegral(RATE_D, T_KILL), kf = t >= T_KILL ? D - Dk : -1;
  const yPB = yb + 2.6;
  O.pipeFluid.position.y = yPB; O.pipeFluid.scale.y = 100 - yPB;
  O.annFluid.position.y = yb; O.annFluid.scale.y = -0.5 - yb;
  const LA = Y_INJ - yPB, LB = 4;
  if (kf > 0) {
    const yk = Math.max(yPB, Y_INJ - kf);
    O.pipeKill.visible = true; O.pipeKill.position.y = yk; O.pipeKill.scale.y = 100 - yk;
    const ha = kf - LA - LB;
    if (ha > 0) { O.annKill.visible = true; O.annKill.position.y = yb; O.annKill.scale.y = Math.min(ha, -0.6 - yb); }
    else O.annKill.visible = false;
  } else { O.pipeKill.visible = false; O.annKill.visible = false; }
  // mud particles
  const NP = O.NP, L = LA + LB + (Y_INJ - yb - 0.2);
  const choke = t >= T_SW;
  let n = 0;
  for (let i = 0; i < NP; i++) {
    const s = ((hash(i, 40) * L + D) % L + L) % L;
    if (!mudPath(s, i, yb, choke, pp)) continue;
    const isKill = kf > 0 && s <= kf;
    const cutting = s > LA + LB && hash(i, 46) < 0.18;
    setI(O.mudP, n, pp[0], pp[1], pp[2], cutting ? 1.25 : 1);
    setC(O.mudP, n, isKill ? C.killP : cutting ? 0x5b4a3a : C.mudP);
    n++;
  }
  if (choke) { // frozen particles above the choke outlet (annulus/riser static after shut-in)
    const Dsw = pwlIntegral(RATE_D, T_SW), ybs = yBit(T_SW), Ls = (Y_INJ - ybs - 2.6) + LB + (Y_INJ - ybs - 0.2);
    for (let i = 0; i < NP; i++) {
      const s = ((hash(i, 40) * Ls + Dsw) % Ls + Ls) % Ls;
      if (s < (Y_INJ - ybs - 2.6) + LB) continue;
      if (!mudPath(s, i, ybs, false, pp)) continue;
      if (pp[1] < Y_RISER + 0.5) continue;
      setI(O.mudP, n, pp[0], pp[1], pp[2], 1);
      setC(O.mudP, n, hash(i, 46) < 0.18 ? 0x5b4a3a : C.mudP);
      n++;
    }
  }
  done(O.mudP, n);
  // gas bubbles (kick)
  let ng = 0;
  if (t > 38.9) {
    const Gt = pwlIntegral(RATE_G, t);
    for (let j = 0; j < 110; j++) {
      const te = 38.9 + j * 0.034;
      if (t < te) break;
      const p = Gt - pwlIntegral(RATE_G, te);
      const side = hash(j, 111) < 0.5 ? -1 : 1, lane = 1.25 + hash(j, 112) * 0.7, lz = -0.3 + hash(j, 113) * 0.8;
      const ye = -60.4 - hash(j, 114) * Math.max(0.3, yBit(te) - -60.4 < 0 ? -60.4 - yBit(te) : 0.3);
      let x, y, z, r;
      const ent = 1.2;
      if (p < ent) { const u = p / ent; x = side * lerp(2.3, lane, u); y = ye + u * 0.4; z = lz; }
      else {
        y = ye + 0.4 + (p - ent); x = side * lane + Math.sin(y * 0.8 + j) * 0.12; z = lz;
        if (y > yChoke) {
          if (t < T_SW) { if (y > Y_INJ) continue; }
          else {
            const ex = O.bopB.chokeDir.x * 3.1 * BS, ez = O.bopB.chokeDir.z * 3.1 * BS + 0.6;
            const LD = Math.hypot(ex - x, ez - z), e = y - yChoke;
            if (e < LD) { const u = e / LD; x = lerp(x, ex, u); z = lerp(z, ez, u); y = yChoke; }
            else { x = ex; z = ez; y = yChoke + e - LD; if (y > 13.6 * BS) continue; }
          }
        }
      }
      r = 0.24 + 0.3 * clamp((y - ye) / 70) + hash(j, 115) * 0.08;
      if (y >= yChoke && t >= T_SW) r = Math.min(r, 0.4);
      setI(O.gasB, ng++, x, y, z, r);
    }
  }
  done(O.gasB, ng);
  O.gasPores.material.opacity = 0.55 + 0.25 * Math.sin(t * 3);
}

function renderFrame(t) {
  applyState(t);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- overlay (2D)
const V = () => new THREE.Vector3();
function proj(p, local) {
  const v = new THREE.Vector3(p[0], p[1], p[2]);
  if (local) v.applyMatrix4(local.matrixWorld);
  v.project(camera);
  return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, ok: v.z < 1 };
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const F = (w, s) => `${w} ${s}px Kanit`;

// pill label: en (bold) + th; returns bounds
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

// callout: pill at (px,py) + leader line to projected anchor
function callout(ctx, t, t0, t1, anchor, local, px, py, en, th, color, size = 34, align = 'center') {
  const a = win(t, t0, t1, 0.35, 0.3);
  if (a <= 0) return;
  const P = proj(anchor, local);
  if (!P.ok) return;
  if (px === null) { px = clamp(P.x + py[0], 200, 820); py = clamp(P.y + py[1], 290, 1250); }
  const k = eout((t - t0) / 0.45);
  const b = pillBounds(ctx, px, py, en, th, size, align);
  // leader from nearest pill edge point
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
function pillBounds(ctx, cx, cy, en, th, size, align) {
  ctx.save(); ctx.font = F(600, size); const we = ctx.measureText(en).width;
  ctx.font = F(400, size * 0.9); const wt = th ? ctx.measureText(th).width : 0; ctx.restore();
  const w = 52 + 16 + 14 + we + (th ? 22 : 0) + wt, h = size * 1.75;
  let x = align === 'center' ? cx - w / 2 : align === 'left' ? cx : cx - w;
  x = clamp(x, 62, 958 - w);
  return { x, y: cy - h / 2, w, h };
}

function chapter(ctx, t, t0, t1, num, th, en) {
  const a = win(t, t0, t1, 0.4, 0.3);
  if (a <= 0) return;
  // big intro for first 1.6 s, then small tag
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

// anatomy info card at top with leader to part
function partCard(ctx, t, t0, t1, n, en, th, desc, color, anchor) {
  const a = win(t, t0, t1, 0.35, 0.3); if (a <= 0) return;
  const k = eout((t - t0) / 0.45);
  const x = 80, y = 248, w = 860, h = 168;
  const P = proj(anchor, O.bopA.group);
  ctx.save(); ctx.globalAlpha = a;
  // leader
  if (P.ok) {
    const sx = clamp(P.x, x + 60, x + w - 60), sy = y + h;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 4; ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(lerp(sx, P.x, k), lerp(sy, P.y, k)); ctx.stroke();
    if (k > 0.95) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(P.x, P.y, 11, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
      const ph = fract((t - t0) * 1.1); ctx.globalAlpha = a * (1 - ph); ctx.strokeStyle = color;
      ctx.beginPath(); ctx.arc(P.x, P.y, 12 + ph * 30, 0, 7); ctx.stroke(); ctx.globalAlpha = a;
    }
  }
  ctx.translate(0, (1 - k) * -20);
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  ctx.fillStyle = 'rgba(255,255,255,0.96)'; rr(ctx, x, y, w, h, 30); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = color; rr(ctx, x, y, 16, h, 8); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 82, y + h / 2, 42, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = F(600, 50); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(n), x + 82, y + h / 2 + 2);
  ctx.textAlign = 'left'; ctx.fillStyle = HEX.ink; ctx.font = F(600, 44);
  ctx.fillText(en, x + 146, y + 52);
  ctx.font = F(600, 36); ctx.fillStyle = color; ctx.fillText(th, x + 146, y + 100);
  ctx.font = F(400, 28); ctx.fillStyle = '#475569'; ctx.fillText(desc, x + 146, y + 140);
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

function alarm(ctx, t, t0, t1, en, th) {
  const a = win(t, t0, t1, 0.15, 0.4); if (a <= 0) return;
  const p = 0.5 + 0.5 * Math.sin((t - t0) * Math.PI * 4);
  ctx.save();
  const g = ctx.createRadialGradient(540, 960, 600, 540, 960, 1250);
  g.addColorStop(0, 'rgba(255,30,30,0)'); g.addColorStop(1, `rgba(255,20,20,${0.55 * p * a})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // banner
  const k = eout((t - t0) / 0.3);
  ctx.globalAlpha = a; ctx.translate(510, 520); ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k);
  ctx.font = F(600, 84); const w = ctx.measureText(en).width + 170;
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 30;
  ctx.fillStyle = `rgba(${200 + 55 * p | 0},30,40,0.95)`; rr(ctx, -w / 2, -70, w, 140, 30); ctx.fill();
  ctx.shadowColor = 'transparent';
  warnIcon(ctx, -w / 2 + 70, -2, 70, '#fff', '#dc2626');
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(en, -w / 2 + 125, 2);
  if (th) { ctx.font = F(600, 36); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 12; ctx.fillText(th, 0, 112); }
  ctx.restore();
}

function pressureGauge(ctx, t, a) {
  if (a <= 0) return;
  const pm = lerp(0.62, 0.84, sstep(48.6, 51.4, t));
  const pf = lerp(0.47, 0.76, sstep(38.7, 39.4, t));
  const safe = pm > pf;
  const x = 712, y = 640, w = 244, h = 400;
  ctx.save(); ctx.globalAlpha = a;
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 20;
  ctx.fillStyle = 'rgba(10,18,36,0.80)'; rr(ctx, x, y, w, h, 26); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.font = F(600, 28); ctx.fillText('แรงดัน', x + w / 2, y + 34);
  ctx.font = F(400, 20); ctx.fillStyle = 'rgba(200,215,240,0.85)'; ctx.fillText('PRESSURE', x + w / 2, y + 62);
  const bh = 196, by = y + 88;
  const bars = [[pm, safe ? '#60a5fa' : '#60a5fa', 'โคลน', 'Mud', x + 70], [pf, '#f87171', 'ชั้นหิน', 'Rock', x + w - 70]];
  for (const [val, col, th, en, bx] of bars) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(ctx, bx - 26, by, 52, bh, 12); ctx.fill();
    const hh = bh * val;
    ctx.fillStyle = col; rr(ctx, bx - 26, by + bh - hh, 52, hh, 12); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = F(600, 24); ctx.fillText(th, bx, by + bh + 26);
    ctx.font = F(400, 18); ctx.fillStyle = 'rgba(200,215,240,0.85)'; ctx.fillText(en, bx, by + bh + 50);
  }
  ctx.font = F(600, 30); ctx.fillStyle = '#fff'; ctx.fillText(safe ? '>' : '<', x + w / 2, by + bh * 0.45);
  const col = safe ? HEX.safe : HEX.danger;
  ctx.fillStyle = col; rr(ctx, x + 18, y + h - 64, w - 36, 48, 24); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = F(600, 24);
  ctx.fillText(safe ? 'ปลอดภัย SAFE' : 'อันตราย KICK', x + w / 2, y + h - 39);
  ctx.restore();
}

function pitGauge(ctx, t, a) {
  if (a <= 0) return;
  const gain = sstep(39.3, 42.4, t) * (1 - 0.85 * sstep(47.5, 51.5, t));
  const x = 66, y = 660, w = 232, h = 340;
  ctx.save(); ctx.globalAlpha = a;
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 20;
  ctx.fillStyle = 'rgba(10,18,36,0.80)'; rr(ctx, x, y, w, h, 26); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.font = F(600, 28); ctx.fillText('ระดับบ่อโคลน', x + w / 2, y + 34);
  ctx.font = F(400, 20); ctx.fillStyle = 'rgba(200,215,240,0.85)'; ctx.fillText('PIT VOLUME', x + w / 2, y + 62);
  const tx = x + 48, ty = y + 88, tw = w - 96, th = 160;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 4; rr(ctx, tx, ty, tw, th, 14); ctx.stroke();
  const lvl = 0.45 + 0.4 * gain, lh = (th - 8) * lvl;
  ctx.save(); rr(ctx, tx + 4, ty + 4, tw - 8, th - 8, 10); ctx.clip();
  ctx.fillStyle = '#c8925a'; ctx.fillRect(tx + 4, ty + th - 4 - lh, tw - 8, lh);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  const wv = Math.sin(t * 5) * 4; ctx.fillRect(tx + 4, ty + th - 4 - lh + wv * 0, tw - 8, 6);
  ctx.restore();
  // normal level marker
  ctx.setLineDash([8, 8]); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
  const ny = ty + th - 4 - (th - 8) * 0.45; ctx.beginPath(); ctx.moveTo(tx - 10, ny); ctx.lineTo(tx + tw + 10, ny); ctx.stroke(); ctx.setLineDash([]);
  const bbl = Math.round(gain * 20);
  const up = gain > 0.05 && t < 47.5;
  ctx.fillStyle = up ? HEX.danger : (gain > 0.05 ? '#f59e0b' : HEX.safe); rr(ctx, x + 18, y + h - 64, w - 36, 48, 24); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = F(600, 26);
  ctx.fillText(gain > 0.05 ? `▲ +${bbl} bbl` : 'ปกติ NORMAL', x + w / 2, y + h - 39);
  ctx.restore();
}

function depthMeter(ctx, t) {
  const a = win(t, 7.0, 12.8, 0.4, 0.4); if (a <= 0) return;
  const cy = camera.position.y, d = clamp(-cy / (-SB - 8)) * 1500;
  const x = 92, y0 = 560, y1 = 1180;
  ctx.save(); ctx.globalAlpha = a;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
  for (let i = 0; i <= 6; i++) { const yy = lerp(y0, y1, i / 6); ctx.beginPath(); ctx.moveTo(x - 10, yy); ctx.lineTo(x + 10, yy); ctx.stroke(); }
  const my = lerp(y0, y1, d / 1500);
  ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(x + 14, my); ctx.lineTo(x + 34, my - 12); ctx.lineTo(x + 34, my + 12); ctx.fill();
  ctx.font = F(600, 40); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10;
  ctx.fillText(`${Math.round(d / 10) * 10} m`, x + 44, my);
  ctx.font = F(400, 24); ctx.fillStyle = 'rgba(220,240,255,0.9)'; ctx.fillText('ความลึก · DEPTH', x - 20, y0 - 34);
  ctx.restore();
}

function stepCard(ctx, t, t0, i, color, th, en, desc, icon) {
  const a = win(t, t0, 70.9, 0.4, 0.4); if (a <= 0) return;
  const k = eout((t - t0) / 0.5);
  const x = 90, y = 330 + i * 250, w = 840, h = 210;
  ctx.save(); ctx.globalAlpha = a; ctx.translate((1 - k) * -80, 0);
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 8;
  ctx.fillStyle = 'rgba(255,255,255,0.96)'; rr(ctx, x, y, w, h, 34); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + 110, y + h / 2, 72, 0, 7); ctx.fill();
  icon(ctx, x + 110, y + h / 2, t - t0);
  ctx.fillStyle = color; ctx.font = F(600, 30); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(`${i + 1}  ${en}`, x + 212, y + 52);
  ctx.fillStyle = HEX.ink; ctx.font = F(600, 62); ctx.fillText(th, x + 210, y + 110);
  ctx.fillStyle = '#475569'; ctx.font = F(400, 28); ctx.fillText(desc, x + 212, y + 166);
  ctx.restore();
}
const iconDetect = (ctx, x, y, u) => {
  ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y + 14, 42, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
  const ang = Math.PI * (1.15 + 0.65 * eout(u / 0.8)) + Math.sin(u * 12) * 0.04;
  ctx.beginPath(); ctx.moveTo(x, y + 14); ctx.lineTo(x + Math.cos(ang) * 36, y + 14 + Math.sin(ang) * 36); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y + 14, 8, 0, 7); ctx.fill(); ctx.restore();
};
const iconShut = (ctx, x, y, u) => {
  const c = eout(u / 0.6);
  ctx.save(); ctx.fillStyle = '#fff';
  const g = lerp(30, 0, c);
  ctx.fillRect(x - 50 - g, y - 22, 46, 44); ctx.fillRect(x + 4 + g, y - 22, 46, 44);
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x - 4, y - 50, 8, 100);
  ctx.restore();
};
const iconKill = (ctx, x, y, u) => {
  ctx.save(); ctx.fillStyle = '#fff';
  const dy = Math.sin(u * 4) * 4;
  ctx.beginPath(); ctx.moveTo(x, y - 44 + dy); ctx.bezierCurveTo(x + 40, y + 4 + dy, x + 34, y + 40 + dy, x, y + 40 + dy);
  ctx.bezierCurveTo(x - 34, y + 40 + dy, x - 40, y + 4 + dy, x, y - 44 + dy); ctx.fill();
  ctx.fillStyle = '#7c3aed'; ctx.font = F(600, 34); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('↓', x, y + 14 + dy);
  ctx.restore();
};

function fade(ctx, t, tc, color, half = 0.2) {
  const d = Math.abs(t - tc); if (d >= half) return;
  ctx.save(); ctx.globalAlpha = 1 - d / half; ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); ctx.restore();
}

function drawOverlay(ctx, t) {
  applyState(t);
  ctx.save();
  ctx.textBaseline = 'middle';
  const BA = O.bopA.group, BB = O.bopB.group;

  // ---- TITLE
  if (t < 5.2) {
    const a = sstep(0.2, 0.9, t) * (1 - sstep(4.3, 4.9, t));
    if (a > 0) {
      const k = eout((t - 0.2) / 0.9);
      ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(30,10,50,0.55)'; ctx.shadowBlur = 30;
      ctx.font = F(600, 30); ctx.fillStyle = '#ffd59a';
      ctx.fillText('OFFSHORE DRILLING SAFETY', 510, 300 - (1 - k) * 30);
      ctx.font = F(600, 250); const tw = ctx.measureText('Subsea BOP').width;
      ctx.font = F(600, Math.min(250, Math.floor(250 * 880 / tw))); ctx.fillStyle = '#ffffff';
      ctx.fillText('Subsea BOP', 510, 470 - (1 - k) * 50);
      ctx.shadowBlur = 0; ctx.fillStyle = '#ffb627'; rr(ctx, 510 - 90 * k, 575, 180 * k, 10, 5); ctx.fill();
      ctx.shadowBlur = 24;
      ctx.font = F(600, 62); ctx.fillStyle = '#ffffff'; ctx.fillText('Subsea Blowout Preventer', 510, 650);
      ctx.font = F(400, 50); ctx.fillStyle = '#ffe3a3'; ctx.fillText('อุปกรณ์ป้องกันการพลุ่งใต้ทะเล', 510, 728);
      ctx.restore();
    }
  }
  // ---- DIVE
  if (t >= 5 && t < 13.5) {
    callout(ctx, t, 5.2, 6.2, [0, 30, 0], null, 330, 420, 'Drilling Rig', 'แท่นขุดเจาะ', '#f97316', 32);
    callout(ctx, t, 8.4, 11.4, [0, camera.position.y - 14, 0], null, 640, 470, 'Riser', 'ท่อไรเซอร์', '#94a3b8', 34);
    callout(ctx, t, 11.0, 13.4, [0, SB + 12.5, 0], null, 560, 380, 'Subsea BOP Stack', 'บนปากหลุมใต้ทะเล', '#f59e0b', 34);
    depthMeter(ctx, t);
    // splash entering water
    const sp = win(t, 6.75, 7.25, 0.12, 0.25);
    if (sp > 0) {
      ctx.save(); ctx.globalAlpha = sp * 0.55; ctx.fillStyle = '#bff3ff'; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = sp; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4;
      for (let i = 0; i < 40; i++) {
        const bx = hash(i, 201) * W, by = H - fract(hash(i, 202) + (t - 6.75) * (1 + hash(i, 203))) * H, br = 8 + hash(i, 204) * 30;
        ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.stroke();
      }
      ctx.restore();
    }
  }
  // ---- ANATOMY
  if (t >= 13 && t < 28.3) {
    chapter(ctx, t, 13.0, 28.0, '01', 'ส่วนประกอบ Subsea BOP', 'ANATOMY');
    const an = O.bopA.anchors;
    partCard(ctx, t, 14.6, 17.4, 1, 'Annular Preventer', 'แอนนูลาร์', 'ยางรูปโดนัท บีบรัดรอบก้านเจาะได้ทุกขนาด', HEX.annular, an.annular);
    partCard(ctx, t, 17.6, 20.8, 2, 'Blind Shear Ram', 'แรมตัดก้านเจาะ', 'ใบมีดเฉือนก้านเจาะ แล้วปิดผนึกหลุม', HEX.shear, an.shear);
    partCard(ctx, t, 21.0, 24.2, 3, 'Pipe Rams', 'แรมปิดรอบก้านเจาะ', 'แรมครึ่งวงกลม ประกบรอบตัวก้านเจาะ', HEX.pipe, an.pipe);
    partCard(ctx, t, 24.4, 26.4, 4, 'Choke & Kill Lines', 'ท่อโช้ก & ท่อคิล', 'วาล์วข้างตัว: ระบายแรงดัน / สูบโคลนเข้าหลุม', HEX.ck, an.choke);
    partCard(ctx, t, 26.5, 28.1, 5, 'Wellhead Connector', 'ข้อต่อหัวหลุม', 'ยึด BOP เข้ากับปากหลุมใต้ทะเล', HEX.conn, an.wh);
    if (t > 24.4 && t < 26.4) callout(ctx, t, 24.9, 26.4, an.kill, BA, 300, 1150, 'Kill', 'สูบโคลนเข้า', HEX.ck, 30);
    if (t > 24.4 && t < 26.4) callout(ctx, t, 24.9, 26.4, an.choke, BA, 720, 1150, 'Choke', 'ระบายออก', HEX.ck, 30);
  }
  // ---- DRILLING
  if (t >= 28 && t < 38.3) {
    chapter(ctx, t, 28.0, 38.0, '02', 'การเจาะหลุม', 'DRILLING');
    const yb = yBit(t);
    callout(ctx, t, 28.6, 31.6, [0.3, camera.position.y - 6 - DX * 0, 0.4], O.B, 780, 760, 'Drill Pipe', 'ก้านเจาะ', '#64748b', 30, 'center');
    callout(ctx, t, 28.9, 31.6, [-0.2, camera.position.y - 2, 0.4], O.B, 300, 640, 'Mud ↓', 'โคลนไหลลง', HEX.mud, 30);
    callout(ctx, t, 30.2, 32.0, [-2.25, -18, 0.2], O.B, 260, 900, 'Casing', 'ท่อกรุ', '#94a3b8', 30);
    callout(ctx, t, 32.6, 37.8, [0, yb + 0.6, 1.4], O.B, 300, 1180, 'Drill Bit', 'หัวเจาะ', '#fbbf24', 30);
    callout(ctx, t, 33.2, 37.8, [1.7, yb + 9, 0.4], O.B, 300, 400, 'Annulus ↑', 'โคลนไหลกลับขึ้น', HEX.mud, 30);
  }
  if (t >= 33 && t < 53.3) {
    pressureGauge(ctx, t, win(t, 33.6, 42.5, 0.4, 0.3) + win(t, 45.6, 53.1, 0.4, 0.2));
    pitGauge(ctx, t, win(t, 39.2, 42.5, 0.4, 0.3) + win(t, 45.6, 53.1, 0.4, 0.2));
  }
  // ---- KICK
  if (t >= 38 && t < 53.3) {
    chapter(ctx, t, 38.0, 53.0, '03', 'Kick!', 'WELL CONTROL');
    const yb = yBit(t);
    callout(ctx, t, 38.4, 41.0, [-5, -62, 0.1], O.B, 330, 1180, 'High-pressure gas', 'ชั้นก๊าซ', '#e07a3f', 30);
    callout(ctx, t, 39.4, 41.0, [1.7, -56, 0.5], O.B, 700, 420, 'Gas influx', 'ก๊าซไหลเข้า', '#eab308', 30);
    alarm(ctx, t, 40.2, 42.4, 'KICK!', 'ก๊าซแรงดันสูงไหลเข้าหลุม');
    const an = O.bopB.anchors;
    callout(ctx, t, 42.8, 45.4, an.annular, BB, 300, 360, 'Annular', 'ปิดแล้ว ✓', HEX.annular, 32);
    callout(ctx, t, 44.1, 45.4, an.pipe, BB, 720, 1160, 'Pipe Ram', 'ปิดแล้ว ✓', HEX.pipe, 32);
    callout(ctx, t, 45.0, 47.6, [an.chokeLine[0], an.chokeLine[1] + 1.4, an.chokeLine[2] + 0.2], BB, 700, 1100, 'Choke', 'ระบายก๊าซออก', HEX.ck, 32);
    if (t >= 46.2) {
      const D = pwlIntegral(RATE_D, t), kf = D - pwlIntegral(RATE_D, T_KILL);
      const yk = Math.max(yb + 2.6, Y_INJ - kf);
      callout(ctx, t, 46.4, 50.6, [0, yk, 0.6], O.B, null, [-250, 0], 'Kill Mud ↓', 'โคลนหนัก', HEX.kill, 32);
      callout(ctx, t, 47.0, 50.6, [6.9, 30, -3], O.B, 700, 300, 'Gas out', 'ก๊าซออกทาง Choke', HEX.ck, 30);
    }
    badge(ctx, t, 51.4, 53.0, 510, 470, 'WELL UNDER CONTROL', 'ควบคุมหลุมได้แล้ว', '#16a34a', 56);
  }
  // ---- BLOWOUT
  if (t >= 53 && t < 66.3) {
    chapter(ctx, t, 53.0, 66.0, '04', 'ถ้าควบคุมไม่ได้...', 'BLOWOUT');
    if (t < 57) callout(ctx, t, 54.2, 56.8, [0.3, camera.position.y - 1, 0.3], null, 300, 1120, 'Gas expands', 'ก๊าซขยายตัว', '#eab308', 32);
    if (t < 57) callout(ctx, t, 53.6, 56.8, [-0.75, camera.position.y + 3, 0], null, 700, 380, 'Riser', 'ท่อไรเซอร์', '#94a3b8', 30);
    if (t >= 57 && t < 60.2) alarm(ctx, t, 57.35, 60.15, 'BLOWOUT!', 'โคลน + ก๊าซพุ่งขึ้นแท่น');
    if (t >= 60.2 && t < 62.8) {
      callout(ctx, t, 60.35, 62.8, O.bopA.anchors.shear, BA, 330, 380, 'Blind Shear Ram', 'ทางสุดท้าย', HEX.shear, 34);
      badge(ctx, t, 61.25, 62.8, 510, 1130, 'CUT & SEAL', 'ตัดก้านเจาะ + ปิดผนึก', '#dc2626', 50);
    }
    if (t >= 62.8) badge(ctx, t, 63.9, 66.0, 510, 470, 'WELL SECURED', 'ปิดหลุมสำเร็จ', '#16a34a', 56);
  }
  // ---- SUMMARY
  if (t >= 66) {
    chapter(ctx, t, 66.0, 75.2, '05', 'สรุป', 'SUMMARY');
    const dim = win(t, 66.2, 70.9, 0.4, 0.5);
    if (dim > 0) { ctx.save(); ctx.globalAlpha = dim * 0.35; ctx.fillStyle = '#06121f'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    stepCard(ctx, t, 66.6, 0, '#f59e0b', 'ตรวจจับ', 'DETECT', 'สังเกตบ่อโคลนเพิ่ม / แรงดันผิดปกติ', iconDetect);
    stepCard(ctx, t, 67.9, 1, '#3b82f6', 'ปิดหลุม', 'SHUT IN', 'Annular → Pipe Ram ปิดรอบก้านเจาะ', iconShut);
    stepCard(ctx, t, 69.2, 2, '#7c3aed', 'ฆ่าหลุม', 'KILL', 'สูบโคลนหนัก ไล่ก๊าซออกทาง Choke', iconKill);
    const fa = win(t, 71.2, 80, 0.6, 0.1);
    if (fa > 0) {
      const k = eout((t - 71.2) / 0.7);
      ctx.save(); ctx.globalAlpha = fa; ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 28;
      ctx.font = F(600, 140); ctx.fillStyle = '#fff'; ctx.fillText('Subsea BOP', 510, 400 - (1 - k) * 30);
      ctx.shadowBlur = 0; ctx.fillStyle = '#ffb627'; rr(ctx, 510 - 80 * k, 480, 160 * k, 10, 5); ctx.fill();
      ctx.shadowBlur = 24;
      ctx.font = F(600, 60); ctx.fillStyle = '#ffffff'; ctx.fillText('ด่านสุดท้ายของความปลอดภัย', 510, 560);
      ctx.font = F(400, 36); ctx.fillStyle = '#bfe3ff'; ctx.fillText('The last line of defense', 510, 625);
      ctx.restore();
    }
  }
  // ---- transitions
  fade(ctx, t, 28.0, '#06101e');
  fade(ctx, t, 53.0, '#06101e');
  fade(ctx, t, 57.0, '#ffffff');
  fade(ctx, t, 60.2, '#06101e');
  fade(ctx, t, 62.8, '#06101e');
  fade(ctx, t, 66.0, '#06101e');
  if (t > 74.4) { ctx.save(); ctx.globalAlpha = sstep(74.4, 75, t); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  ctx.restore();
}

// ---------------------------------------------------------------- captions & cues
const captions = [
  { t0: 0, t1: 4.2, th: 'Subsea BOP คืออุปกรณ์ป้องกันการพลุ่ง ติดตั้งบนปากหลุมเจาะที่พื้นทะเล', en: 'Subsea BOP = subsea blowout preventer on the seabed wellhead' },
  { t0: 4.2, t1: 8.6, th: 'แท่นขุดเจาะกลางทะเล ต่อท่อ Riser ลงสู่ก้นทะเล', en: 'A riser links the rig to the seabed' },
  { t0: 8.6, t1: 13, th: 'ต่างจาก Surface BOP ที่ติดตั้งบนแท่นเจาะบนบกหรือแท่นแบบ jack-up', en: 'Unlike a surface BOP on land or jack-up rigs' },
  { t0: 13, t1: 17.4, th: 'บนสุดคือ Annular ยางรูปโดนัท บีบรัดรอบก้านเจาะ', en: 'Annular: a rubber donut that squeezes the pipe' },
  { t0: 17.4, t1: 20.8, th: 'Blind Shear Ram ใบมีดตัดก้านเจาะและปิดหลุม', en: 'Blind shear ram: blades cut the pipe & seal' },
  { t0: 20.8, t1: 24.2, th: 'Pipe Ram แรมครึ่งวงกลม ปิดรอบตัวก้านเจาะ', en: 'Pipe rams close around the pipe body' },
  { t0: 24.2, t1: 28, th: 'วาล์ว Choke & Kill ด้านข้าง และ Wellhead ด้านล่าง', en: 'Choke & kill valves, wellhead connector below' },
  { t0: 28, t1: 32.5, th: 'น้ำโคลนถูกสูบลงในก้านเจาะ ออกที่หัวเจาะ', en: 'Mud is pumped down the drill pipe, out the bit' },
  { t0: 32.5, t1: 38, th: 'แล้วไหลกลับขึ้นทาง Annulus แรงดันโคลนกดชั้นหินไว้', en: 'It returns up the annulus. Mud pressure holds the rock back' },
  { t0: 38, t1: 42, th: 'Kick! ก๊าซแรงดันสูงไหลเข้าหลุม', en: 'Kick! Formation pressure > mud pressure' },
  { t0: 42, t1: 46, th: 'ปิดหลุม: Annular บีบรอบก้านเจาะ ตามด้วย Pipe Ram', en: 'Shut in: annular first, then pipe rams' },
  { t0: 46, t1: 50, th: 'สูบโคลนหนัก (Kill Mud) ไล่ก๊าซออกทาง Choke', en: 'Pump kill mud, circulate the gas out via the choke' },
  { t0: 50, t1: 53, th: 'แรงดันโคลนชนะแรงดันชั้นหิน = ควบคุมหลุมได้', en: 'Mud pressure wins: well under control' },
  { t0: 53, t1: 57, th: 'แต่ถ้าไม่มีใครสังเกต Kick ก๊าซจะขยายตัวขณะลอยขึ้น', en: 'If a kick is missed, gas expands as it rises' },
  { t0: 57, t1: 60.5, th: 'Blowout = Kick ที่ควบคุมไม่ได้', en: 'Blowout = an uncontrolled kick' },
  { t0: 60.5, t1: 66, th: 'ทางสุดท้าย: Blind Shear Ram ตัดก้านเจาะและปิดผนึกหลุม', en: 'Last resort: the blind shear ram cuts the pipe & seals the well' },
  { t0: 66, t1: 70.5, th: 'จำ 3 ขั้นตอน: ตรวจจับ → ปิดหลุม → ฆ่าหลุม', en: 'Detect → Shut in → Kill' },
  { t0: 70.5, t1: 75, th: 'Subsea BOP = ด่านสุดท้ายของความปลอดภัย', en: 'Subsea BOP: the last line of defense' },
];

const cues = [
  { t: 0.2, sfx: 'whoosh' }, { t: 5.0, sfx: 'whoosh' }, { t: 5.5, sfx: 'blip' }, { t: 6.85, sfx: 'bubble' },
  { t: 8.5, sfx: 'blip' }, { t: 9.6, sfx: 'bubble' }, { t: 11.0, sfx: 'blip' }, { t: 12.4, sfx: 'whoosh' },
  { t: 14.6, sfx: 'blip' }, { t: 15.3, sfx: 'clunk' }, { t: 16.8, sfx: 'hiss' },
  { t: 17.6, sfx: 'blip' }, { t: 18.6, sfx: 'clunk' },
  { t: 21.0, sfx: 'blip' }, { t: 21.9, sfx: 'clunk' }, { t: 23.2, sfx: 'hiss' },
  { t: 24.4, sfx: 'blip' }, { t: 24.8, sfx: 'hiss' }, { t: 26.5, sfx: 'blip' },
  { t: 27.8, sfx: 'whoosh' }, { t: 28.5, sfx: 'pump' }, { t: 28.6, sfx: 'blip' }, { t: 32.6, sfx: 'blip' }, { t: 33.6, sfx: 'blip' },
  { t: 38.5, sfx: 'impact' }, { t: 39.0, sfx: 'bubble' }, { t: 40.2, sfx: 'alarm' }, { t: 40.9, sfx: 'whoosh' },
  { t: 42.7, sfx: 'clunk' }, { t: 44.0, sfx: 'clunk' }, { t: 45.0, sfx: 'hiss' }, { t: 46.0, sfx: 'pump' },
  { t: 47.0, sfx: 'bubble' }, { t: 47.0, sfx: 'whoosh' }, { t: 51.4, sfx: 'success' },
  { t: 52.8, sfx: 'whoosh' }, { t: 53.6, sfx: 'bubble' }, { t: 55.4, sfx: 'bubble' }, { t: 56.8, sfx: 'whoosh' },
  { t: 57.3, sfx: 'impact' }, { t: 57.4, sfx: 'alarm' }, { t: 57.9, sfx: 'fire' },
  { t: 60.0, sfx: 'whoosh' }, { t: 61.0, sfx: 'impact' }, { t: 61.05, sfx: 'clunk' }, { t: 62.6, sfx: 'whoosh' },
  { t: 63.2, sfx: 'hiss' }, { t: 63.9, sfx: 'success' },
  { t: 65.8, sfx: 'whoosh' }, { t: 66.6, sfx: 'blip' }, { t: 67.9, sfx: 'blip' }, { t: 69.2, sfx: 'blip' },
  { t: 70.9, sfx: 'whoosh' }, { t: 71.3, sfx: 'success' },
];

export default { DURATION, init, renderFrame, drawOverlay, captions, cues };
