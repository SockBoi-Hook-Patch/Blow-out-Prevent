# namman.story EP02 — Surface BOP vs Subsea BOP — Spec / Contract

Same production format as EP01 (`../bop-3d/`): MP4 1080x1920 (9:16), 30 fps, DURATION = 75 s, not looped.
Stylized LOW-POLY 3D motion graphics (same look & palette as EP01), Thai captions burned in by the integrator
(Kanit, card at y≈1310–1560), music + SFX, no voice-over.
Brand: "namman.story" ONLY as easter eggs inside the 3D world (no corner watermark).

Files / API are identical to EP01 — see `../bop-3d/SPEC.md`:
- `scene3d.js` (ES module default export: DURATION, init, renderFrame(t) pure fn of t, drawOverlay(ctx,t), captions, cues)
- `music.js` (global `Score.renderWav(duration, cues)`)
- `frame.html`, `render.js` (integrator, already present). three@0.160.0 in ./node_modules.
Safe zones: visuals/labels y 160–1280, x 60–960; caption zone y 1310–1560 calm; y>1600 background only.
SFX names: 'whoosh','alarm','clunk','impact','hiss','fire','pump','success','blip','bubble'.

## Facts to get right
- Surface BOP: installed on the wellhead AT THE SURFACE, directly under the rig floor — in the cellar of a LAND rig,
  under the drill floor of a JACK-UP (legs stand on the seabed, shallow water, wellhead brought up to the rig by a
  conductor/high-pressure riser) and on fixed PLATFORMS. Compact stack (annular + 2–3 ram cavities). Controlled
  directly by hydraulic lines from an accumulator unit ("Koomey unit") on the rig. Crew can walk up to it:
  easy inspection, testing and maintenance.
- Subsea BOP: on the wellhead on the SEABED, used by FLOATING rigs — SEMI-SUBMERSIBLE and DRILLSHIP — because the
  rig moves with waves/currents; a marine riser connects BOP to rig (with flex joint and riser tensioners).
  Much bigger/heavier (~12–15 m tall, ~300–400 t). Two parts: LOWER BOP STACK (rams, incl. blind shear rams) and
  LMRP (Lower Marine Riser Package: annular(s), control pods) which can disconnect.
  Controlled electro-hydraulically through redundant control pods (BLUE & YELLOW, MUX = multiplex) via umbilical
  cable, with subsea accumulator bottles. Backups: ROV intervention (hot stab), Emergency Disconnect Sequence (EDS)
  that shears/seals and disconnects the LMRP if the rig drifts off, deadman/autoshear.
  Water depths up to ~3,000 m. Retrieval for maintenance means pulling it up through the riser — takes days.
- Key takeaway: both do the same job (seal the well) — the difference is WHERE it sits and HOW it's controlled.

## Storyboard (75 s)
| time | scene |
|---|---|
| 0–5 | TITLE: split screen, left a land rig (desert/sand), right a drillship at sea; title "Surface BOP vs Subsea BOP", Thai "BOP มี 2 แบบ ต่างกันอย่างไร?" |
| 5–10 | HOOK: both BOPs light up — one under the rig floor at the surface, one on the seabed far below. "อยู่บนผิว vs อยู่ใต้ทะเล" |
| 10–26 | SURFACE BOP: land rig cutaway → camera down to the cellar: compact BOP on wellhead under the rig floor; a tiny worker figure next to it for scale; hydraulic hoses to the accumulator (Koomey) unit; then quick switch to a JACK-UP (legs on seabed, BOP under drill floor above water) and a fixed platform icon. Labels: Rig floor, Surface BOP, Wellhead, Accumulator unit |
| 26–46 | SUBSEA BOP: drillship/semi-sub floating, camera dives down the marine riser (depth meter to ~1,500–3,000 m), huge BOP stack on seabed with tiny worker silhouette for scale (~15 m, ~350 t); highlight LMRP vs Lower BOP stack; BLUE/YELLOW control pods + umbilical; subsea accumulator bottles; ROV arrives and does a hot stab; EDS demo: rig drifts, LMRP disconnects and lifts away while the lower stack keeps the well sealed |
| 46–64 | COMPARISON: side-by-side cards (overlay) animated row by row with small 3D icons: ตำแหน่ง (Location), แท่นเจาะ (Rig type), ความลึกน้ำ (Water depth), ขนาด (Size), การควบคุม (Control: hydraulic vs MUX electro-hydraulic), การบำรุงรักษา (Access). |
| 64–71 | WHY: floating rig bobs and drifts → BOP must stay on the seabed so the well can be sealed even if the rig disconnects |
| 71–75 | END: both stacks side by side, "หน้าที่เดียวกัน: ปิดผนึกหลุมเมื่อเกิดเหตุ" / "Same job, different place". Fade out |

## Easter eggs ("namman.story")
- Painted on the drillship's helideck (readable during 26–32 s or similar).
- Stencilled on the surface accumulator unit or a nameplate on the surface BOP (readable during 12–24 s).
- Optional: on the ROV's side.
