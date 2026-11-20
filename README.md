# namman.story — วิดีโอสาระวงการ Oil & Gas

โปรเจกต์สร้างคลิปความรู้แนวตั้ง (9:16) สำหรับ Instagram Reels / TikTok ของช่อง **namman.story**
ทุกอย่างสร้างด้วยโค้ด: ภาพ 3D (three.js), เพลงและเสียงประกอบ (WebAudio), คำบรรยายไทย แล้ว render เป็น MP4

## ตอนต่าง ๆ
| ตอน | โฟลเดอร์ | วิดีโอ |
|---|---|---|
| Subsea BOP (3D) | `bop-3d/` | `video/BOP_3D_pilot.mp4` |
| BOP (8-bit, ต้นแบบแรก) | `audio.js`, `scenes.js`, `render/` | `video/BOP_8bit_loop.mp4` |

## Render ตอน 3D
```bash
cd bop-3d && npm install
node render.js ../video/BOP_3D_pilot.mp4 --jobs 3          # ทั้งคลิป
node render.js ../video/p.mp4 --preview 3,20,40            # ดูภาพนิ่งบางเฟรม
```
ต้องมี Node, Playwright (Chromium) และ ffmpeg

## โครงสร้างแต่ละตอน
- `scene3d.js` — ฉาก 3D, ป้ายกำกับ, คำบรรยาย (`captions`), จังหวะเสียงเอฟเฟกต์ (`cues`)
- `music.js` — เพลงและเสียงเอฟเฟกต์ (สังเคราะห์ทั้งหมด ไม่มีลิขสิทธิ์ติด)
- `frame.html` / `render.js` — รวมภาพ + คำบรรยาย แล้วเข้ารหัสเป็น MP4
- `SPEC.md` — สตอรีบอร์ดและสัญญาระหว่างส่วนต่าง ๆ

## แบรนด์
- `brand/` — รูปโปรไฟล์และไฟล์ต้นฉบับ
