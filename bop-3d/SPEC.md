# BOP 3D Explainer — Spec / Contract

Deliverable: MP4, 1080x1920 (9:16), 30 fps, DURATION = 75 s, not looped, for Instagram Reels / TikTok.
Style: stylized LOW-POLY 3D (flat/soft shading, clean bright colors, like a modern motion-graphics explainer). NOT photoreal.
Thai captions (burned in by the integrator, font Kanit), background music + SFX. No voice-over. No credit/watermark.

Rendered offline, frame by frame, in headless Chromium (WebGL2 via SwiftShader = CPU, no GPU) by `bop-3d/render.js`.
Library: three@0.160.0 (installed in bop-3d/node_modules, ES modules via import map: "three" and "three/addons/").

## Files
- `scene3d.js` — 3D scenes (owner: 3D agent)
- `music.js`   — score + SFX renderer (owner: music agent)
- `frame.html`, `render.js` — compositor + captions + encoder (owner: integrator)

## scene3d.js API (ES module, default export)
```js
export default {
  DURATION: 75,
  async init({ THREE, renderer, width, height }) {},   // build everything once. renderer: THREE.WebGLRenderer 1080x1920, antialias on
  renderFrame(t) {},          // set camera/objects for time t (seconds) and call renderer.render(scene, camera). PURE function of t (no Math.random/Date/clock; use seeded hash). Must work for any t in any order.
  drawOverlay(ctx, t) {},     // 2D canvas 1080x1920 drawn on top of 3D: part labels/callouts (project 3D points to screen), gauges, scene titles. Font: '600 40px Kanit' etc (Kanit is loaded). NOT the captions.
  captions: [{ t0, t1, th, en }],   // full coverage 0..75, each 3–6 s, concise Thai + short English
  cues: [{ t, sfx }],               // sfx names: 'whoosh','alarm','clunk','impact','hiss','fire','pump','success','blip','bubble'
}
```
## Safe zones (Reels/TikTok UI covers bottom & right)
- Key visuals & overlay labels: y 160–1280, x 60–960.
- Captions box (integrator): y ≈ 1310–1560. Keep that zone visually calm (no labels).
- y > 1600: platform UI zone — background only.

## Performance
SwiftShader is slow: target < 400 ms per frame at 1080x1920. Keep geometry modest (<~150k tris), no shadows maps or 1 cheap shadow at most, no heavy post-processing. Prefer MeshStandardMaterial/MeshLambertMaterial with flatShading, hemisphere + directional light, fog for depth.

## Storyboard (75 s)
| time | scene |
|---|---|
| 0–5 | TITLE: low-poly ocean (animated vertex waves), offshore semi-sub rig at dusk, slow drone push-in. Big title "BOP" + "Blowout Preventer" (overlay) |
| 5–13 | DIVE: camera follows the riser down from rig through water (particles, light rays, fish optional) to the seabed where the BOP stack sits on the wellhead |
| 13–28 | ANATOMY: camera orbits the BOP stack; it becomes semi-transparent / cutaway. Highlight in order with labels: ANNULAR (rubber donut, top), BLIND SHEAR RAM, PIPE RAMS, CHOKE & KILL LINES (side valves), WELLHEAD. Each part pulses/glows and does a mini close-open demo |
| 28–38 | DRILLING: vertical cutaway below seabed: casing, rock layers, rotating drill string, bit. Mud particles flow DOWN inside pipe and UP the annulus. Overlay gauge: mud pressure > formation pressure ("ปลอดภัย") |
| 38–53 | KICK: bit enters high-pressure gas layer, gas bubbles enter annulus and rise; pit volume up; red alarm light pulses; ANNULAR closes around pipe, then PIPE RAMS close; flow diverted through CHOKE line; heavy KILL MUD (different color) pumped down; bubbles circulated out; gauge back to safe — "ควบคุมหลุมได้" |
| 53–66 | BLOWOUT: case where kick is missed: bubbles expand as they rise up the riser, mud+gas erupt over the rig floor, stylized fire; then BLIND SHEAR RAMS slam, cut the pipe and seal; flow stops, fire dies |
| 66–75 | SUMMARY: 3 steps with 3D icons/cards: 1 ตรวจจับ (DETECT) → 2 ปิดหลุม (SHUT IN) → 3 ฆ่าหลุม (KILL). End on hero shot of BOP with "BOP = ด่านสุดท้ายของความปลอดภัย" |

## music.js API (classic script, global `window.Score`)
```js
Score.renderWav(duration, cues) -> Promise<Uint8Array>   // 48 kHz stereo 16-bit WAV, exactly `duration` s
```
