# BOP 8-bit Animation — Spec / Contract

Single static web page, no build step. Files:
- `index.html` — shell: canvas, start overlay, caption bar, timeline loop (owner: integrator)
- `audio.js`  — 8-bit chiptune + SFX via WebAudio (owner: audio agent)
- `scenes.js` — pixel-art scenes drawn on canvas (owner: visuals agent)

## Timing
Total loop = 60.0 s. Master clock `t` in seconds, `t ∈ [0, 60)`, wraps to 0.

## Canvas
Logical resolution 320 x 180, `ctx.imageSmoothingEnabled=false`, scaled up by CSS (pixelated).
Only integer coordinates. Palette: NES/PICO-8 style, limited (~16 colors).

## audio.js API (global `window.ChipMusic`)
```js
ChipMusic.init()          // create AudioContext (called inside a user click)
ChipMusic.start(t0)       // start music at loop position t0 seconds (0..60), loops seamlessly every 60 s
ChipMusic.stop()
ChipMusic.setMuted(bool)
ChipMusic.sfx(name)       // one-shot: 'alarm','kick','close','boom','fire','pump','success','blip'
ChipMusic.now()           // current loop position in seconds (0..60) derived from AudioContext time, or null if not running
```
Music: 60 s exactly (e.g. 120 BPM = 30 bars of 4/4), sections matching the scenes below
(calm intro → steady drilling groove → tense kick section → alarm/danger blowout section → triumphant resolution),
square/triangle/noise channels like NES. The 60 s must loop with no gap.

## scenes.js API (global `window.BOPScenes`)
```js
BOPScenes.draw(ctx, t)    // draw full frame for loop time t (seconds). W=320,H=180. Must be deterministic from t (no internal state required).
BOPScenes.cues            // [{t: 25.0, sfx: 'kick'}, ...] SFX cue times (integrator fires them when t crosses)
BOPScenes.captions        // [{t0, t1, th: 'ข้อความไทย', en: 'English'}] caption bar text (integrator renders as HTML, NOT on canvas)
```
Small English labels on canvas (e.g. "ANNULAR", "PSI") may use a built-in 3x5 pixel font drawn by scenes.js.
Thai text ONLY goes in captions (rendered by HTML).

## Storyboard (60 s)
| time | scene | content |
|---|---|---|
| 0–6 | TITLE | Offshore rig at night, waves, title "BOP" in big pixel letters, "BLOWOUT PREVENTER" subtitle |
| 6–16 | ANATOMY | Cutaway: rig floor → riser → BOP stack on seabed → wellhead → casing. Stack parts labelled & highlighted one by one: ANNULAR, PIPE RAM, BLIND/SHEAR RAM, CHOKE/KILL LINES |
| 16–24 | NORMAL DRILLING | Drill string rotating, mud pumped down the pipe and returning up the annulus. Gauge: mud hydrostatic pressure (P_mud) > formation pressure (P_form). Green "OK" |
| 24–37 | KICK | Bit enters high-pressure zone; gas bubbles (influx) enter annulus; pit-volume gauge rises; ALARM; driller hits button → ANNULAR closes around pipe, then PIPE RAMS close; choke line opens, heavy kill mud pumped; bubbles circulated out through choke; gauge back to OK, "WELL CONTROLLED" |
| 37–50 | BLOWOUT | Case: kick not detected/BOP not closed in time → gas expands rapidly up riser, mud + gas erupt over rig floor, fire/flames on rig, screen shake, red flashing. Then emergency: BLIND SHEAR RAMS activate, cut the pipe and seal the well; flow stops, flames die down, "WELL SECURED" |
| 50–60 | SUMMARY | 3 pixel icons/steps: 1 DETECT (pit gain/flow) → 2 SHUT IN (close BOP) → 3 KILL (heavy mud via kill line). Last ~1 s fades to match frame at t=0 for seamless loop |
