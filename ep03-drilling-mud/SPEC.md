# namman.story EP03 — น้ำโคลนเจาะ (Drilling Mud) — Spec / Contract

Same production format as EP01/EP02 (`../bop-3d/`, `../ep02-surface-vs-subsea/`): MP4 1080x1920 (9:16), 30 fps,
**DURATION = 120 s** (longer & SLOWER than EP02 — viewers said EP02 was too fast to read), not looped.
Stylized LOW-POLY 3D motion graphics (same look/palette as EP01–02), Thai captions burned in by the integrator
(Kanit card at y≈1310–1560), music + SFX, NO voice-over this time.
Brand: "namman.story" only as easter eggs inside the 3D world.

API identical to EP01/EP02 (`scene3d.js` default export: DURATION, init, renderFrame(t) pure fn of t, drawOverlay,
captions, cues; `music.js` global `Score.renderWav(duration, cues)`). three@0.160.0 in ./node_modules.
Safe zones: visuals/labels y 160–1280, x 60–960; caption zone y 1310–1560 calm; y>1600 background only.
SFX names: 'whoosh','alarm','clunk','impact','hiss','fire','pump','success','blip','bubble'.

## READABILITY RULES (most important change)
- Each caption on screen **5–8 s**, Thai text **≤ 45 characters**, English ≤ 60 characters.
- Caption duration ≥ 1.5 s + (Thai chars ÷ 9) s.
- On-screen labels/cards: max ~6 words, stay visible ≥ 3 s; never more than 2 new labels at once.
- Camera moves slower and holds 1–2 s on each key view before moving on. Fewer, bigger ideas per scene.

## Facts to get right
- Drilling fluid ("mud") is an engineered fluid, not dirt: base fluid (water / oil / synthetic) + additives
  (bentonite clay for viscosity, BARITE to make it heavier, polymers, etc.).
- Circulation loop (land rig): mud pits/tanks → mud pumps (triplex) → standpipe → (kelly hose) → top drive →
  DOWN inside drill pipe → out through BIT NOZZLES (jets) → UP the ANNULUS carrying rock CUTTINGS → flowline →
  SHALE SHAKER (vibrating screens remove cuttings) → (desander/desilter, degasser) → back to the pits.
- Main jobs: 1) control formation pressure — hydrostatic pressure of the mud column holds back fluids
  (P = 0.052 × mud weight ppg × depth ft); 2) carry cuttings up & clean the hole; 3) cool & lubricate the bit;
  4) stabilise the wellbore wall by forming a thin FILTER CAKE; 5) transmit hydraulic power / data
  (mud-pulse telemetry from MWD tools to surface); also suspend cuttings when pumps stop (gel strength).
- Mud weight window: must stay ABOVE pore (formation) pressure (too light → KICK, link to EP01) and BELOW
  fracture pressure (too heavy → fractures the rock → LOST CIRCULATION, mud leaks into formation).
- Types: WBM (water-based, most common, cheaper), OBM (oil-based, better for reactive shale/hot wells),
  SBM (synthetic-based, used offshore, lower environmental impact than OBM).
- Mud engineer checks density (mud balance) and viscosity (Marsh funnel) regularly.

## Storyboard (120 s)
| time | scene |
|---|---|
| 0–8 | TITLE: land rig at dusk; "น้ำโคลนเจาะ" big, "Drilling Mud"; hook line "ทำไมเจาะหลุมต้องใช้โคลน?" |
| 8–18 | NOT DIRT: close-up of mud tank with swirling mud; sacks of BARITE and BENTONITE; "ของเหลวที่ออกแบบมาโดยเฉพาะ" |
| 18–45 | CIRCULATION LOOP: follow the mud step by step (hold on each): pits → mud pump → standpipe/top drive → down drill pipe → bit nozzles jet → annulus up with cuttings → shale shaker removes cuttings → back to pits. Loop diagram overlay builds up as we go |
| 45–85 | 5 JOBS (≈8 s each, numbered card + small 3D demo): 1 คุมแรงดัน (mud column vs formation gauge), 2 พาเศษหินขึ้นมา, 3 ระบายความร้อน/หล่อลื่นหัวเจาะ (bit glows hot → cools), 4 ฉาบผนังหลุม (filter cake layer forms on wall), 5 ส่งสัญญาณข้อมูล (mud-pulse waves from MWD tool up to surface) |
| 85–103 | MUD WEIGHT WINDOW: vertical gauge with pore pressure & fracture pressure lines; mud weight slider: too light → bubbles/KICK (red), too heavy → cracks + mud leaking (LOST CIRCULATION, orange), just right → green; barite sacks added to raise weight |
| 103–113 | 3 TYPES: cards WBM / OBM / SBM with simple icons and one-line pros |
| 113–120 | SUMMARY: "โคลนเจาะ = เลือดของหลุมเจาะ" style ending (or similar), hero shot of loop; fade out |

## Easter eggs ("namman.story")
- Stencilled on the side of a mud tank / pit (readable ≥ 2 s, e.g. 8–18 s or during the loop).
- Printed on a BARITE sack label (readable ≥ 2 s).
