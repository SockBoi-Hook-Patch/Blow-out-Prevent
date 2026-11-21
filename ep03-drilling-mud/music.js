/* music.js — original synthesized score + SFX for namman.story EP03 "น้ำโคลนเจาะ (Drilling Mud)", 120 s.
 * Classic browser script. Defines window.Score.renderWav(duration, cues) -> Promise<Uint8Array>
 * (16-bit PCM WAV, 48 kHz, stereo, exactly `duration` seconds), rendered with OfflineAudioContext.
 * Same synth engine / SFX / mix chain as EP01/EP02 (../ep02-surface-vs-subsea/music.js) for a consistent
 * channel sound; new composition (melody / groove / harmony).
 *
 * Tempo 120 BPM grid felt in HALF-TIME (relaxed, ~60 BPM pulse; beat 0.5 s, bar 2 s) for a slower, readable
 * episode. One 2/4 bar at 44–45 realigns so every card boundary (8, 18, 45, 53, 61, 69, 77, 85, 97, 103, 113)
 * lands on a downbeat.
 * Key: D major (Bm / Bb / F#7 colour for the 89–97 mud-weight tension).
 * Sections: 0–8 title (sig + curious lydian answer) · 8–18 playful staccato 'not dirt' · 18–45 circulation
 *   (rotating 6-step riff over 8ths, triplex pump pulse, panning flow swells; bells go down then up the hole)
 *   · 45–85 five jobs (half-time groove, lift at each card) · 85–103 mud-weight window (tension 89–97, release
 *   at 97) · 103–113 three types (bright) · 113–120 signature resolution, tail to silence.
 * "namman.story" SIGNATURE MOTIF (series-wide, scale degrees 5-1-2-3, rhythm 8th-8th-8th-long):
 *   A4 D5 E5 F#5 (MIDI 69 74 76 78) — bells + pluck at 1.0 s and resolved at 113.0 s.
 */
(function () {
  'use strict';

  var SR = 48000;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // Chord table: bass root (MIDI), pad voicing, arpeggio tones.
  var CH = {
    D:      { b: 38, pad: [50, 57, 62, 66],     arp: [62, 66, 69, 74] },
    Dadd9:  { b: 38, pad: [50, 57, 62, 64, 66], arp: [62, 64, 66, 69] },
    Dmaj7:  { b: 38, pad: [50, 57, 61, 66],     arp: [61, 66, 69, 73] },
    DF:     { b: 42, pad: [54, 57, 62, 66],     arp: [62, 66, 69, 74] }, // D/F#
    G:      { b: 43, pad: [55, 59, 62, 67],     arp: [62, 67, 71, 74] },
    Gmaj7:  { b: 43, pad: [54, 59, 62, 67],     arp: [62, 66, 71, 74] },
    Gadd9:  { b: 43, pad: [55, 57, 62, 67],     arp: [62, 67, 69, 71] },
    A:      { b: 45, pad: [52, 57, 61, 64],     arp: [61, 64, 69, 73] },
    Asus4:  { b: 45, pad: [52, 57, 62, 64],     arp: [62, 64, 69, 74] },
    AC:     { b: 37, pad: [52, 57, 61, 64],     arp: [61, 64, 69, 73] }, // A/C#
    Bm:     { b: 35, pad: [50, 54, 59, 62],     arp: [59, 62, 66, 71] },
    Bm7:    { b: 35, pad: [50, 54, 57, 62],     arp: [59, 62, 66, 69] },
    Em7:    { b: 40, pad: [50, 55, 59, 62],     arp: [59, 62, 64, 67] },
    FSm7:   { b: 42, pad: [52, 57, 61, 64],     arp: [61, 64, 66, 69] },
    FS7:    { b: 42, pad: [52, 58, 61, 64],     arp: [58, 61, 64, 66] }, // F#7 (dominant of Bm)
    Bb:     { b: 34, pad: [50, 53, 58, 62],     arp: [58, 62, 65, 70] }
  };
  // Series signature motif ("nam-man-sto-ry"): degrees 5-1-2-3 of the home key (D major).
  var SIG = [69, 74, 76, 78];

  function renderWav(duration, cues) {
    duration = +duration > 0 ? +duration : 120;
    cues = Array.isArray(cues) ? cues : [];
    var len = Math.max(1, Math.round(duration * SR));
    var END = len / SR;
    var ctx = new OfflineAudioContext({ numberOfChannels: 2, length: len, sampleRate: SR });
    var rnd = mulberry32(0xE903D0D);

    // ---------- shared buffers ----------
    var noiseBuf = ctx.createBuffer(2, SR * 3, SR);
    for (var c = 0; c < 2; c++) {
      var nd = noiseBuf.getChannelData(c);
      for (var i = 0; i < nd.length; i++) nd[i] = rnd() * 2 - 1;
    }
    function makeIR(sec, decay) {
      var n = Math.floor(sec * SR), b = ctx.createBuffer(2, n, SR);
      for (var ch = 0; ch < 2; ch++) {
        var d = b.getChannelData(ch), y = 0;
        for (var k = 0; k < n; k++) {
          var t = k / SR;
          var x = (rnd() * 2 - 1) * Math.exp(-t / decay);
          var a = 0.8 * Math.exp(-t / 1.1) + 0.06; // gets darker as it decays
          y += a * (x - y);
          d[k] = t < 0.015 ? 0 : y;
        }
      }
      return b;
    }
    var IR = makeIR(3.2, 0.6);

    // ---------- buses ----------
    var master = ctx.createGain();
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 30; hp.Q.value = 0.7;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3;
    comp.attack.value = 0.008; comp.release.value = 0.25;
    var ls = filt('lowshelf', 160); ls.gain.value = -5;
    var pk = filt('peaking', 2500, 0.8); pk.gain.value = 3;
    master.connect(hp); hp.connect(ls); ls.connect(pk); pk.connect(comp); comp.connect(ctx.destination);
    master.gain.setValueAtTime(1, 0);
    master.gain.setValueAtTime(1, Math.max(0, END - 1.4));
    master.gain.linearRampToValueAtTime(0, Math.max(0.01, END - 0.03));

    var musicBus = ctx.createGain();
    var section = ctx.createGain();
    var duck = ctx.createGain();
    musicBus.connect(section); section.connect(duck); duck.connect(master);
    var musicVerbIn = ctx.createGain();
    var musicVerb = ctx.createConvolver(); musicVerb.buffer = IR;
    musicVerbIn.connect(musicVerb); musicVerb.connect(section);

    var sfxBus = ctx.createGain(); sfxBus.gain.value = 1.0; sfxBus.connect(master);
    var sfxVerbIn = ctx.createGain();
    var sfxVerb = ctx.createConvolver(); sfxVerb.buffer = IR;
    sfxVerbIn.connect(sfxVerb); sfxVerb.connect(master);

    // section loudness arc (music only)
    var arc = [[0, 0.8], [7.9, 0.84], [8, 0.84], [17.9, 0.87], [18, 0.86], [44.9, 0.92], [45, 0.95], [84.9, 0.95], [85, 0.88], [89, 0.88], [96.6, 0.98], [97, 0.95], [103, 0.97], [113, 1.0], [120, 1.0]];
    section.gain.setValueAtTime(arc[0][1], 0);
    for (var ai = 1; ai < arc.length; ai++) section.gain.linearRampToValueAtTime(arc[ai][1], arc[ai][0]);

    // ---------- helpers ----------
    function outTo(node, o) {
      o = o || {};
      var bus = o.sfx ? sfxBus : musicBus;
      var vin = o.sfx ? sfxVerbIn : musicVerbIn;
      var n = node;
      if (o.pan) { var p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); node.connect(p); n = p; }
      n.connect(bus);
      var wet = o.wet == null ? 0.2 : o.wet;
      if (wet > 0) { var g = ctx.createGain(); g.gain.value = wet; n.connect(g); g.connect(vin); }
      return n;
    }
    function osc(type, f, t0, t1) {
      var o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      o.start(t0); o.stop(t1); return o;
    }
    function noise(t, dur) {
      var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      s.start(t, rnd() * 2.5); s.stop(t + dur + 0.05); return s;
    }
    function filt(type, f, q) {
      var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b;
    }
    function gain(v) { var g = ctx.createGain(); g.gain.value = v == null ? 1 : v; return g; }
    function decayEnv(g, t, vol, dur, att) {
      att = att || 0.003;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + att);
      g.gain.exponentialRampToValueAtTime(0.0003, t + dur);
    }
    function ok(t) { return t < END && t >= 0; }

    // ---------- instruments (same engine as EP01) ----------
    function pad(t0, t1, notes, o) {
      o = o || {};
      if (!ok(t0)) return;
      var vol = 1.3 * (o.vol == null ? 0.1 : o.vol), att = o.att == null ? 0.4 : o.att, rel = o.rel == null ? 0.6 : o.rel;
      var cut0 = o.cut0 || 1200, cut1 = o.cut1 || cut0, det = o.det == null ? 11 : o.det;
      var type = o.type || 'sawtooth', width = o.width == null ? 0.55 : o.width;
      var stop = t1 + rel + 0.05;
      var f = filt('lowpass', cut0, o.q == null ? 0.9 : o.q);
      f.frequency.setValueAtTime(cut0, t0);
      f.frequency.exponentialRampToValueAtTime(cut1, t1 + rel);
      var lfo = osc('sine', o.lfo || 0.13, t0, stop);
      var lg = gain(Math.min(cut0, cut1) * 0.3); lfo.connect(lg); lg.connect(f.frequency);
      var g = gain(0);
      var per = vol / Math.sqrt(notes.length);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(per, t0 + att);
      g.gain.setValueAtTime(per, Math.max(t0 + att, t1));
      g.gain.linearRampToValueAtTime(0, t1 + rel);
      for (var n = 0; n < notes.length; n++) {
        for (var k = -1; k <= 1; k += 2) {
          var oc = osc(type, mtof(notes[n]), t0, stop);
          oc.detune.value = k * det + (rnd() - 0.5) * 5;
          var p = ctx.createStereoPanner(); p.pan.value = k * width * (0.6 + 0.4 * (n % 2));
          var lv = gain(0.5); oc.connect(lv); lv.connect(p); p.connect(f);
        }
      }
      f.connect(g);
      outTo(g, { wet: o.wet == null ? 0.45 : o.wet });
    }

    function pluck(t, m, o) {
      o = o || {};
      if (!ok(t)) return;
      var vol = 1.45 * (o.vol == null ? 0.08 : o.vol), dur = o.dur || 0.3, cut = o.cut || 1800;
      var fr = mtof(m);
      var f = filt('lowpass', cut, o.q == null ? 2.5 : o.q);
      f.frequency.setValueAtTime(Math.min(cut * 5, 16000), t);
      f.frequency.exponentialRampToValueAtTime(cut, t + 0.1);
      var o1 = osc('sawtooth', fr, t, t + dur + 0.02); o1.detune.value = -7;
      var o2 = osc('square', fr, t, t + dur + 0.02); o2.detune.value = 7;
      var g2 = gain(0.35); o1.connect(f); o2.connect(g2); g2.connect(f);
      var g = gain(0); decayEnv(g, t, vol, dur, 0.004);
      f.connect(g);
      outTo(g, { pan: o.pan || 0, wet: o.wet == null ? 0.3 : o.wet });
    }

    function bell(t, m, vol, o) {
      o = o || {};
      if (!ok(t)) return;
      var dur = o.dur || 1.4, fr = mtof(m), sfx = !!o.sfx;
      var g = gain(0); decayEnv(g, t, vol, dur, 0.004);
      var parts = [[1, 1], [2, 0.35], [3.01, 0.12], [4.2, 0.06]];
      for (var i = 0; i < parts.length; i++) {
        var oc = osc('sine', fr * parts[i][0], t, t + dur + 0.02);
        var pg = gain(parts[i][1]);
        if (i > 0) { pg.gain.setValueAtTime(parts[i][1], t); pg.gain.exponentialRampToValueAtTime(0.0005, t + dur * 0.4); }
        oc.connect(pg); pg.connect(g);
      }
      outTo(g, { pan: o.pan || 0, wet: o.wet == null ? 0.5 : o.wet, sfx: sfx });
    }

    function bubble(t, f0, vol, o) {
      o = o || {};
      if (!ok(t)) return;
      var d = o.dur || 0.12;
      var oc = osc('sine', f0, t, t + d + 0.02);
      oc.frequency.setValueAtTime(f0, t);
      oc.frequency.exponentialRampToValueAtTime(f0 * 2.2, t + d);
      var g = gain(0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0005, t + d);
      oc.connect(g);
      outTo(g, { pan: o.pan || 0, wet: o.wet == null ? 0.5 : o.wet, sfx: !!o.sfx });
    }

    function bass(t, dur, m, o) {
      o = o || {};
      if (!ok(t)) return;
      var vol = o.vol == null ? 0.2 : o.vol, att = o.att || 0.008, rel = o.rel || 0.07;
      var fr = mtof(m), stop = t + dur + rel + 0.02;
      var g = gain(0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att);
      g.gain.setValueAtTime(vol, Math.max(t + att, t + dur));
      g.gain.linearRampToValueAtTime(0, t + dur + rel);
      var s = osc('sine', fr, t, stop); var sg = gain(0.55); s.connect(sg); sg.connect(g);
      // harmonics for phone-speaker presence
      var lp = filt('lowpass', o.cut || 650, 1.2);
      var tr = osc(o.drive ? 'sawtooth' : 'triangle', fr * 2, t, stop); tr.detune.value = 4;
      var tg = gain(o.drive ? 0.4 : 0.6); tr.connect(tg); tg.connect(lp); lp.connect(g);
      outTo(g, { wet: 0.04 });
    }

    function kick(t, vol, o) {
      o = o || {};
      if (!ok(t)) return;
      var dec = o.dec || 0.34;
      var oc = osc('sine', o.f0 || 155, t, t + dec + 0.02);
      oc.frequency.setValueAtTime(o.f0 || 155, t);
      oc.frequency.exponentialRampToValueAtTime(o.f1 || 47, t + 0.11);
      var g = gain(0); decayEnv(g, t, vol, dec, 0.002); oc.connect(g);
      var n = noise(t, 0.03), hf = filt('highpass', 2500), ng = gain(0);
      decayEnv(ng, t, vol * 0.3, 0.03, 0.001);
      n.connect(hf); hf.connect(ng); ng.connect(g);
      outTo(g, { wet: o.wet == null ? 0.04 : o.wet });
    }

    function snare(t, vol, o) {
      o = o || {};
      if (!ok(t)) return;
      var dec = o.dec || 0.2;
      var n = noise(t, dec), bp = filt('bandpass', o.f || 2000, 0.7), hpf = filt('highpass', 350);
      var g = gain(0); decayEnv(g, t, vol, dec, 0.002);
      n.connect(bp); bp.connect(hpf); hpf.connect(g);
      var tr = osc('triangle', 200, t, t + 0.12);
      tr.frequency.setValueAtTime(210, t); tr.frequency.exponentialRampToValueAtTime(160, t + 0.08);
      var tg = gain(0); decayEnv(tg, t, vol * 0.7, 0.1, 0.002); tr.connect(tg); tg.connect(g);
      outTo(g, { pan: o.pan || 0, wet: o.wet == null ? 0.22 : o.wet });
    }

    function hat(t, vol, o) {
      o = o || {};
      if (!ok(t)) return;
      var dec = o.open ? 0.22 : (o.dec || 0.045);
      var n = noise(t, dec), hf = filt('highpass', o.f || 7500, 0.8);
      var g = gain(0); decayEnv(g, t, vol, dec, 0.001);
      n.connect(hf); hf.connect(g);
      outTo(g, { pan: o.pan == null ? 0.25 : o.pan, wet: 0.1 });
    }

    function crash(t, vol, o) {
      o = o || {};
      if (!ok(t)) return;
      var dec = o.dec || 1.8;
      var n = noise(t, dec), hf = filt('highpass', 4200, 0.5), sh = filt('peaking', 8000, 1); sh.gain.value = 4;
      var g = gain(0); decayEnv(g, t, vol, dec, 0.002);
      n.connect(hf); hf.connect(sh); sh.connect(g);
      outTo(g, { wet: 0.35, sfx: !!o.sfx });
    }

    function tom(t, f0, vol, o) {
      o = o || {};
      if (!ok(t)) return;
      var dec = o.dec || 0.5;
      var oc = osc('sine', f0, t, t + dec + 0.02);
      oc.frequency.setValueAtTime(f0 * 1.5, t); oc.frequency.exponentialRampToValueAtTime(f0 * 0.75, t + dec);
      var g = gain(0); decayEnv(g, t, vol, dec, 0.002); oc.connect(g);
      var n = noise(t, 0.08), lp = filt('lowpass', 1200), ng = gain(0);
      decayEnv(ng, t, vol * 0.35, 0.08, 0.001); n.connect(lp); lp.connect(ng); ng.connect(g);
      outTo(g, { pan: o.pan || 0, wet: 0.3 });
    }

    function riser(t0, t1, vol, f0, f1, o) {
      o = o || {};
      if (!ok(t0)) return;
      var n = noise(t0, t1 - t0 + 0.1), bp = filt('bandpass', f0, o.q || 2.5);
      bp.frequency.setValueAtTime(f0, t0); bp.frequency.exponentialRampToValueAtTime(f1, t1);
      var g = gain(0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol * 0.3, t0 + (t1 - t0) * 0.6);
      g.gain.linearRampToValueAtTime(vol, t1 - 0.01);
      g.gain.linearRampToValueAtTime(0, t1 + 0.05);
      n.connect(bp); bp.connect(g);
      outTo(g, { wet: o.wet == null ? 0.5 : o.wet, sfx: !!o.sfx, pan: o.pan || 0 });
    }

    function boom(t, vol, o) {
      o = o || {};
      if (!ok(t)) return;
      var dur = o.dur || 2.0;
      var oc = osc('sine', 75, t, t + dur + 0.02);
      oc.frequency.setValueAtTime(o.f0 || 78, t); oc.frequency.exponentialRampToValueAtTime(o.f1 || 30, t + dur * 0.8);
      var g = gain(0); decayEnv(g, t, vol, dur, 0.004); oc.connect(g);
      // mid body so it reads on phones
      var body = osc('triangle', 110, t, t + 0.6);
      body.frequency.setValueAtTime(140, t); body.frequency.exponentialRampToValueAtTime(55, t + 0.5);
      var bg = gain(0); decayEnv(bg, t, vol * 0.45, 0.55, 0.003); body.connect(bg); bg.connect(g);
      var n = noise(t, dur * 0.7), lp = filt('lowpass', 3000, 0.7), ng = gain(0);
      lp.frequency.setValueAtTime(4000, t); lp.frequency.exponentialRampToValueAtTime(90, t + dur * 0.6);
      decayEnv(ng, t, vol * 0.7, dur * 0.65, 0.003);
      n.connect(lp); lp.connect(ng); ng.connect(g);
      outTo(g, { wet: o.wet == null ? 0.45 : o.wet, sfx: !!o.sfx });
    }

    function drone(t0, t1, notes, vol, o) {
      o = o || {};
      if (!ok(t0)) return;
      var att = o.att || 1.0, rel = o.rel || 1.5, stop = t1 + rel + 0.05;
      var lp = filt('lowpass', o.cut || 400, 1.5);
      lp.frequency.setValueAtTime(o.cut || 400, t0);
      lp.frequency.linearRampToValueAtTime(o.cut1 || o.cut || 400, t1);
      var g = gain(0);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + att);
      g.gain.setValueAtTime(vol, t1); g.gain.linearRampToValueAtTime(0, t1 + rel);
      var trem = osc('sine', o.trem || 0.5, t0, stop), tg = gain(vol * 0.25);
      trem.connect(tg); tg.connect(g.gain);
      for (var i = 0; i < notes.length; i++) {
        for (var k = -1; k <= 1; k += 2) {
          var oc = osc('sawtooth', mtof(notes[i]), t0, stop); oc.detune.value = k * 9;
          var p = ctx.createStereoPanner(); p.pan.value = k * 0.4;
          oc.connect(p); p.connect(lp);
        }
      }
      lp.connect(g);
      outTo(g, { wet: 0.4 });
    }

    // extra light percussion for the dry 'land' groove (soft-attack shaker)
    function shaker(t, vol, o) {
      o = o || {};
      if (!ok(t)) return;
      var dec = o.dec || 0.07;
      var n = noise(t, dec + 0.02), bp = filt('bandpass', o.f || 5800, 1.1);
      var g = gain(0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.018);
      g.gain.exponentialRampToValueAtTime(0.0003, t + dec);
      n.connect(bp); bp.connect(g);
      outTo(g, { pan: o.pan == null ? -0.3 : o.pan, wet: o.wet == null ? 0.06 : o.wet });
    }
    function sig(t0, vol, o) { // the namman.story signature: 8th, 8th, 8th, long
      o = o || {};
      var tr = o.tr || 0;
      for (var i = 0; i < 4; i++) {
        var tt = t0 + i * 0.25;
        bell(tt, SIG[i] + tr, vol * (i === 3 ? 1.15 : 1), { dur: i === 3 ? (o.last || 2.4) : 1.0, pan: (i - 1.5) * 0.22, wet: o.wet == null ? 0.6 : o.wet });
        if (!o.noPluck) pluck(tt, SIG[i] + tr - 12, { vol: vol * 0.9, dur: i === 3 ? 0.9 : 0.3, cut: 2600, wet: 0.35, pan: (i - 1.5) * -0.15 });
      }
    }

    var ARP_UP = [0, 1, 2, 3, 2, 1, 2, 3];
    var ROT = [0, 1, 2, 3, 2, 1]; // 6-step cell over 8ths: rotates against the bar -> 'circulating' riff
    var s, e;

    // ---------- EP03 extra music voices ----------
    function pumpStroke(t, v) { // soft triplex-pump pulse (musical, much quieter than the 'pump' SFX)
      if (!ok(t)) return;
      var oc = osc('sine', 96, t, t + 0.27);
      oc.frequency.setValueAtTime(96, t); oc.frequency.exponentialRampToValueAtTime(48, t + 0.16);
      var g = gain(0); decayEnv(g, t, v, 0.25, 0.006); oc.connect(g);
      var n = noise(t, 0.2), lp = filt('lowpass', 320, 1.2), ng = gain(0);
      ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(v * 0.5, t + 0.04);
      ng.gain.exponentialRampToValueAtTime(0.0004, t + 0.2);
      n.connect(lp); lp.connect(ng); ng.connect(g);
      outTo(g, { wet: 0.08 });
    }
    function flow(t0, t1, vol, p0, p1) { // slow filtered-noise swell that travels across the stereo field
      if (!ok(t0)) return;
      var n = noise(t0, t1 - t0 + 0.1), bp = filt('bandpass', 350, 1.4), mid = (t0 + t1) / 2;
      bp.frequency.setValueAtTime(350, t0);
      bp.frequency.exponentialRampToValueAtTime(950, mid);
      bp.frequency.exponentialRampToValueAtTime(350, t1);
      var g = gain(0);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, mid); g.gain.linearRampToValueAtTime(0, t1);
      var pn = ctx.createStereoPanner();
      pn.pan.setValueAtTime(p0, t0); pn.pan.linearRampToValueAtTime(p1, t1);
      n.connect(bp); bp.connect(g); g.connect(pn);
      outTo(pn, { wet: 0.5 });
    }
    function chime(t, ch, vol) { // small 'new card' lift: rolled bell triad
      for (var i = 0; i < 3; i++) bell(t + i * 0.06, ch.arp[i + 1] + 12, vol * (1 - i * 0.15), { dur: 1.6, pan: (i - 1) * 0.4, wet: 0.7 });
    }
    // relaxed half-time groove for one bar (2 s): kick 1 (+ pickup), soft snare on 3, offbeat hats,
    // whisper shaker, bouncy bass, sparse offbeat high plucks (keeps the caption mids clear)
    var GB = [[0, 0.28, 0, 0.19], [0.75, 0.14, 7, 0.12], [1.0, 0.3, 0, 0.17], [1.5, 0.16, 12, 0.11]];
    function groove(bt, c, bi, o) {
      o = o || {};
      var lv = o.lv == null ? 1 : o.lv, br = o.br || 0;
      for (var k = 0; k < GB.length; k++) bass(bt + GB[k][0], GB[k][1], c.b + GB[k][2], { vol: GB[k][3] * (0.85 + 0.15 * lv) });
      if (!o.noKick1) kick(bt, 0.45 * lv);
      if (bi % 2 === 1) kick(bt + 1.75, 0.22 * lv);
      snare(bt + 1.0, 0.085 * lv, { dec: 0.14, f: 2400, wet: 0.25 });
      for (var q = 0; q < 4; q++) {
        hat(bt + q * 0.5 + 0.25, 0.03 * lv);
        shaker(bt + q * 0.5 + 0.125, 0.012 * lv, { pan: -0.35 }); shaker(bt + q * 0.5 + 0.375, 0.012 * lv, { pan: -0.35 });
      }
      for (var s2 = 1; s2 < 8; s2 += 2) {
        if (s2 === 5 && bi % 2 === 0) continue;
        pluck(bt + s2 * 0.25, c.arp[ARP_UP[s2]] + 12, { vol: 0.04 * lv, dur: 0.15, cut: 3800 + br * 1200, pan: (s2 % 4 === 1 ? 0.45 : -0.45), wet: 0.3 });
      }
    }
    function bells(bt, list, vol, o) {
      o = o || {};
      for (var k = 0; k < list.length; k++) bell(bt + list[k][0], list[k][1], vol, { dur: o.dur || 1.3, pan: (k % 2 ? -0.3 : 0.3), wet: o.wet || 0.6 });
    }

    // ============ SCORE ============
    // ---- TITLE 0–8: inviting; signature motif at 1.0, curious lydian answer ----
    pad(0, 3.9, CH.Dadd9.pad, { vol: 0.11, att: 2.6, rel: 1.0, cut0: 450, cut1: 2600, wet: 0.65, width: 0.85 });
    pad(0.4, 3.9, [74, 78, 81], { type: 'triangle', vol: 0.035, att: 2.8, rel: 1.0, cut0: 2200, cut1: 5500, wet: 0.8, width: 0.9 });
    sig(1.0, 0.075, { last: 2.6 });
    bass(1.75, 2.1, 38, { vol: 0.12, att: 0.8, rel: 0.5 });
    var ask = [81, 83, 86, 85]; // ...ends on C# over Gmaj7 (#11) = a question
    for (s = 0; s < ask.length; s++) bell(3.25 + s * 0.25, ask[s], 0.03 + s * 0.003, { dur: s === 3 ? 2.0 : 1.0, pan: (s % 2 ? 0.45 : -0.45), wet: 0.75 });
    var ttl = [['Gmaj7', 4, 2], ['Asus4', 6, 1], ['A', 7, 1]];
    for (var tl = 0; tl < ttl.length; tl++) {
      var tc = CH[ttl[tl][0]], t0 = ttl[tl][1], tL = ttl[tl][2];
      pad(t0, t0 + tL, tc.pad, { vol: 0.07, att: tl === 0 ? 0.6 : 0.1, rel: 0.4, cut0: 1000 + tl * 300, cut1: 1300 + tl * 300, wet: 0.55, width: 0.8 });
      bass(t0, tL - 0.15, tc.b, { vol: 0.13, att: 0.05, rel: 0.3 });
    }
    // hint of the circulation riff: quarters, then 8ths
    var hc = 0;
    for (var ht = 4; ht < 8 - 0.01; ht += (ht < 6 ? 0.5 : 0.25)) {
      var hch = ht < 6 ? CH.Gmaj7 : (ht < 7 ? CH.Asus4 : CH.A);
      pluck(ht, hch.arp[ROT[hc % 6]], { vol: 0.028 + 0.004 * (ht - 4), dur: 0.25, cut: 1500, pan: (ROT[hc % 6] - 1.5) * 0.25, wet: 0.4 });
      hc++;
    }
    for (s = 0; s < 8; s++) shaker(6 + s * 0.25, 0.012 + s * 0.004, { pan: s % 2 ? 0.3 : -0.3 });
    kick(7, 0.3); kick(7.5, 0.33);
    riser(6.5, 8, 0.07, 500, 4200);

    // ---- NOT DIRT 8–18: playful, light (staccato plucks, finger-snap, gloopy bubbles) ----
    crash(8, 0.05);
    var nd = ['D', 'Bm7', 'Gmaj7', 'Em7', 'A'];
    var ndMel = [
      [[0.5, 78], [0.75, 81], [1.0, 78], [1.5, 74]],
      [[0.5, 78], [0.75, 81], [1.0, 83], [1.5, 81]],
      [[0.5, 79], [0.75, 83], [1.0, 86], [1.25, 83], [1.5, 79]],
      [[0.5, 79], [0.75, 78], [1.0, 76], [1.5, 74]],
      [[0, 76], [0.25, 78], [0.5, 81], [1.0, 85]]
    ];
    var NB = [[0, 0.22, 0, 0.18], [0.75, 0.12, 12, 0.11], [1.0, 0.22, 7, 0.14], [1.5, 0.12, 12, 0.1]];
    for (var ni = 0; ni < nd.length; ni++) {
      var nt = 8 + ni * 2, nc = CH[nd[ni]];
      pad(nt, nt + 2, nc.pad, { vol: 0.045, att: 0.2, rel: 0.35, cut0: 900, cut1: 1000, wet: 0.4, width: 0.7 });
      for (var nb = 0; nb < NB.length; nb++) bass(nt + NB[nb][0], NB[nb][1], nc.b + NB[nb][2], { vol: NB[nb][3] });
      kick(nt, 0.42); kick(nt + 1.0, 0.28);
      snare(nt + 0.5, 0.045, { dec: 0.05, f: 4500, wet: 0.15 }); snare(nt + 1.5, 0.05, { dec: 0.05, f: 4500, wet: 0.15 });
      for (s = 0; s < 8; s++) shaker(nt + s * 0.25, s % 2 ? 0.025 : 0.015, { pan: 0.3 });
      var nm = ndMel[ni];
      for (var mi = 0; mi < nm.length; mi++) {
        var lastN = ni === 4 && mi === nm.length - 1;
        pluck(nt + nm[mi][0], nm[mi][1], { vol: 0.06, dur: lastN ? 0.6 : 0.13, cut: 3400, q: 3, pan: 0.2, wet: 0.28 });
        if (lastN) bell(nt + nm[mi][0], nm[mi][1] + 12, 0.025, { dur: 1.4, wet: 0.7 });
      }
      bubble(nt + 0.375, 220 + rnd() * 120, 0.03, { dur: 0.16, pan: -0.4, wet: 0.5 });
      bubble(nt + 1.25, 260 + rnd() * 150, 0.025, { dur: 0.14, pan: -0.2, wet: 0.5 });
    }
    snare(17.5, 0.05); snare(17.625, 0.06); snare(17.75, 0.07); snare(17.875, 0.08);
    riser(16.8, 18, 0.06, 600, 4000);

    // ---- CIRCULATION 18–45: rotating 8th riff (pans with the cell), triplex pump pulse (3 strokes + rest),
    //      flow swells circling L->R->L. Pass 1 plain, pass 2 descending bells (mud goes DOWN the pipe),
    //      pass 3 ascending bells + rising bubbles (cuttings come UP the annulus). ----
    crash(18, 0.05);
    var loop = [['Dmaj7', 0, 2], ['Bm7', 2, 2], ['Gmaj7', 4, 2], ['Asus4', 6, 1], ['A', 7, 1]];
    var down = [[[0, 86], [1.0, 83], [1.5, 81]], [[0, 83], [1.0, 81], [1.5, 78]], [[0, 79], [1.0, 78], [1.5, 74]], [[0, 76], [1.0, 73], [1.5, 69]]];
    var up = [[[0, 69], [1.0, 73], [1.5, 76]], [[0, 74], [1.0, 78], [1.5, 81]], [[0, 79], [1.0, 83], [1.5, 86]], [[0, 81], [1.0, 85], [1.5, 88]]];
    var rc = 0;
    function riff(t, c, L, p) {
      for (var k = 0; k < L / 0.25; k++) {
        var idx = ROT[rc % 6]; rc++;
        pluck(t + k * 0.25, c.arp[idx], { vol: (k % 2 ? 0.034 : 0.044) + p * 0.004, dur: 0.22, cut: 1300 + p * 250, q: 2, pan: (idx - 1.5) * 0.3, wet: 0.35 });
      }
    }
    function pumpBar(b, lv) { pumpStroke(b, 0.3 * lv); pumpStroke(b + 0.5, 0.22 * lv); pumpStroke(b + 1.0, 0.25 * lv); kick(b, 0.32 * lv, { f1: 45 }); }
    for (var pass = 0; pass < 3; pass++) {
      var base = 18 + pass * 8;
      for (var li = 0; li < loop.length; li++) {
        var lc = CH[loop[li][0]], lt = base + loop[li][1], lL = loop[li][2];
        pad(lt, lt + lL, lc.pad, { vol: 0.045 + pass * 0.005, att: 0.3, rel: 0.35, cut0: 800, cut1: 950, wet: 0.5, width: 0.9 });
        riff(lt, lc, lL, pass);
        if (lL === 2) { bass(lt, 0.9, lc.b, { vol: 0.17 }); bass(lt + 1.0, 0.4, lc.b, { vol: 0.14 }); bass(lt + 1.5, 0.3, lc.b + 7, { vol: 0.11 }); }
        else { bass(lt, 0.45, lc.b, { vol: 0.16 }); bass(lt + 0.5, 0.35, lc.b + 7, { vol: 0.11 }); }
      }
      for (var bar = 0; bar < 4; bar++) {
        var bt0 = base + bar * 2;
        pumpBar(bt0, 1 + pass * 0.08);
        if (pass >= 1) for (s = 0; s < 4; s++) hat(bt0 + s * 0.5 + 0.25, 0.022);
        if (pass === 2) for (s = 0; s < 16; s++) if (s % 4) shaker(bt0 + s * 0.125, 0.011, { pan: 0.35 });
        if (pass === 1) bells(bt0, down[bar], 0.026, { dur: 1.4, wet: 0.65 });
        if (pass === 2) {
          bells(bt0, up[bar], 0.026, { dur: 1.4, wet: 0.65 });
          for (s = 0; s < 3; s++) bubble(bt0 + 0.25 + s * 0.5, 280 + s * 160 + rnd() * 60, 0.02, { dur: 0.12, pan: rnd() * 1.2 - 0.6, wet: 0.6 });
        }
      }
      flow(base, base + 4, 0.03, -0.6, 0.6); flow(base + 4, base + 8, 0.03, 0.6, -0.6);
    }
    // 42–44: back to the top of the loop; 44–45: half-bar pickup into the five jobs
    pad(42, 44, CH.Dmaj7.pad, { vol: 0.06, att: 0.3, rel: 0.3, cut0: 900, cut1: 1300, wet: 0.5, width: 0.9 });
    riff(42, CH.Dmaj7, 2, 3);
    bass(42, 0.9, 38, { vol: 0.17 }); bass(43, 0.4, 38, { vol: 0.14 }); bass(43.5, 0.3, 45, { vol: 0.11 });
    pumpBar(42, 1.2); for (s = 0; s < 4; s++) hat(42 + s * 0.5 + 0.25, 0.025);
    bell(42, 86, 0.03, { dur: 2.0, wet: 0.7 }); flow(42, 45, 0.03, -0.6, 0.6);
    pad(44, 45, CH.Asus4.pad, { vol: 0.065, att: 0.05, rel: 0.25, cut0: 1300, cut1: 2200, wet: 0.5 });
    bass(44, 0.85, 45, { vol: 0.15 }); kick(44, 0.4);
    for (s = 0; s < 4; s++) snare(44.5 + s * 0.125, 0.045 + s * 0.015, { pan: (s % 2 ? 0.2 : -0.2) });
    riser(43.6, 45, 0.08, 500, 4500);

    // ---- FIVE JOBS 45–85: positive steady half-time groove; each card (45/53/61/69/77) gets a lift:
    //      riser into it, soft crash, rolled bell chime, new top-line; brightness creeps up card by card ----
    var cards = [
      { ch: ['D', 'AC', 'Bm7', 'G'], mel: [[[0, 78], [0.75, 81], [1.0, 83]], [[0, 81], [1.0, 76]], [[0, 78], [0.75, 74], [1.0, 76]], [[0, 74], [1.0, 79], [1.5, 78]]] },
      { ch: ['D', 'AC', 'Bm7', 'A'], mel: [[[0, 81], [0.75, 83], [1.0, 86]], [[0, 85], [1.0, 81]], [[0, 83], [0.75, 81], [1.0, 78]], [[0, 76], [1.0, 81], [1.5, 83]]] },
      { ch: ['Gmaj7', 'D', 'Em7', 'A'], mel: [[[0, 83], [1.0, 86]], [[0, 86], [0.75, 85], [1.0, 81]], [[0, 79], [1.0, 83]], [[0, 81], [0.75, 85], [1.0, 88]]] },
      { ch: ['D', 'AC', 'Bm7', 'A'], mel: [[[0, 86], [1.0, 85]], [[0, 81], [1.0, 88]], [[0, 86], [0.75, 85], [1.0, 83]], [[0, 81], [1.0, 76], [1.5, 78]]] },
      { ch: ['Gmaj7', 'A', 'FSm7', 'G'], mel: [[[0, 83], [0.75, 86], [1.0, 90]], [[0, 88], [1.0, 85]], [[0, 81], [1.0, 85]], [[0, 83], [1.0, 79]]] }
    ];
    for (var cn = 0; cn < cards.length; cn++) {
      var cs = 45 + cn * 8, cd = cards[cn], br = cn / 4;
      if (cn > 0) riser(cs - 1.0, cs, 0.05, 800, 4500);
      crash(cs, 0.045, { dec: 1.6 }); kick(cs, 0.5);
      chime(cs + 0.02, CH[cd.ch[0]], 0.032);
      for (var bi = 0; bi < 4; bi++) {
        var bt = cs + bi * 2, cc = CH[cd.ch[bi]];
        pad(bt, bt + 2, cc.pad, { vol: 0.045, att: 0.15, rel: 0.3, cut0: 850 + br * 250, cut1: 950 + br * 250, wet: 0.45, width: 0.9 });
        groove(bt, cc, bi, { br: br, noKick1: bi === 0 });
        bells(bt, cd.mel[bi], 0.03);
      }
      if (cn === 0) drone(cs, cs + 7.4, [26, 33], 0.02, { cut: 200, cut1: 260, att: 1.5, rel: 1, trem: 0.3 }); // pressure: low column
      if (cn === 1) for (s = 0; s < 8; s++) bubble(cs + 0.6 + s * 0.9, 260 + s * 70, 0.02, { dur: 0.12, pan: s % 2 ? 0.5 : -0.5, wet: 0.6 }); // cuttings rise
      if (cn === 2) pad(cs + 0.5, cs + 7.6, [81, 86, 88], { type: 'triangle', vol: 0.025, att: 1.5, rel: 0.6, cut0: 4500, cut1: 1500, wet: 0.8, width: 1 }); // cooling
      if (cn === 3) pad(cs + 0.5, cs + 7.6, [62, 66, 69], { type: 'triangle', vol: 0.022, att: 4, rel: 0.6, cut0: 800, cut1: 1600, wet: 0.6, width: 1 }); // layer forms
      if (cn === 4) for (bi = 0; bi < 4; bi++) { // mud-pulse telemetry: short-long ticks
        var pt0 = cs + bi * 2, offs = [0.25, 0.375, 0.75, 1.25, 1.375, 1.75];
        for (s = 0; s < offs.length; s++) bell(pt0 + offs[s], 93, 0.011, { dur: 0.25, pan: 0.5, wet: 0.4 });
      }
    }

    // ---- MUD-WEIGHT WINDOW 85–103: calm set-up, light tension 89–97 (too light / too heavy), release at 97 ----
    chime(85, CH.Bm7, 0.028);
    var wset = [['Bm7', 85], ['Gmaj7', 87]];
    for (var wi = 0; wi < wset.length; wi++) {
      var wc = CH[wset[wi][0]], wt = wset[wi][1];
      pad(wt, wt + 2, wc.pad, { vol: 0.05, att: 0.3, rel: 0.3, cut0: 800, cut1: 850, wet: 0.5, width: 0.9 });
      bass(wt, 1.4, wc.b, { vol: 0.16, att: 0.05 }); bass(wt + 1.5, 0.35, wc.b + 7, { vol: 0.1 });
      kick(wt, 0.4);
      for (s = 0; s < 4; s++) { hat(wt + s * 0.5 + 0.25, 0.02); pluck(wt + s * 0.5 + 0.25, wc.arp[ARP_UP[s * 2 + 1]] + 12, { vol: 0.035, dur: 0.18, cut: 3000, pan: s % 2 ? -0.4 : 0.4, wet: 0.35 }); }
    }
    var tens = [['Bm', 89], ['Bb', 91], ['Em7', 93], ['FS7', 95]];
    for (var ti = 0; ti < tens.length; ti++) {
      var tcc = CH[tens[ti][0]], tt0 = tens[ti][1], tp = ti / 4;
      pad(tt0, tt0 + 2, tcc.pad, { vol: 0.06 + 0.02 * tp, att: 0.1, rel: 0.2, cut0: 700 + 900 * tp, cut1: 900 + 1100 * tp, wet: 0.5, width: 0.85 });
      for (e = 0; e < 8; e++) {
        bass(tt0 + e * 0.25, 0.17, tcc.b, { vol: 0.13 + 0.03 * tp, cut: 600, drive: ti >= 3 });
        hat(tt0 + e * 0.25, e % 2 ? 0.016 : 0.026, { f: 9000, dec: 0.025, pan: 0.35 });
        pluck(tt0 + e * 0.25, tcc.arp[[0, 2, 1, 2][e % 4]], { vol: 0.032 + 0.012 * tp, dur: 0.14, cut: 900 + 1000 * tp, wet: 0.35, pan: (e % 2 ? 0.3 : -0.3) });
      }
      kick(tt0, 0.45); kick(tt0 + 1.0, 0.35);
      if (ti >= 2) snare(tt0 + 1.0, 0.07, { dec: 0.15 });
      if (ti === 1) for (s = 0; s < 6; s++) bubble(tt0 + 0.2 + s * 0.3, 200 + s * 90, 0.028, { dur: 0.14, pan: rnd() - 0.5, wet: 0.6 }); // gas creeping in
      if (ti >= 2) for (s = 0; s < 6; s++) hat(tt0 + Math.floor(rnd() * 16) * 0.125 + 0.06, 0.03, { f: 3000, dec: 0.015, pan: rnd() * 1.4 - 0.7 }); // rock cracking
    }
    pad(89, 96.9, [66, 78], { vol: 0.03, att: 3, rel: 0.1, cut0: 900, cut1: 3500, wet: 0.5, lfo: 5 });
    riser(95.2, 96.95, 0.09, 400, 5000);
    // 97: 'just right' -> release
    crash(97, 0.07, { dec: 2.2 }); kick(97, 0.5); boom(97, 0.12, { dur: 1.4 });
    chime(97.02, CH.D, 0.04);
    var relc = [['D', 97, 2], ['Gmaj7', 99, 2], ['Asus4', 101, 1], ['A', 102, 1]];
    for (var ri = 0; ri < relc.length; ri++) {
      var rcc = CH[relc[ri][0]], rt = relc[ri][1], rL = relc[ri][2];
      pad(rt, rt + rL, rcc.pad, { vol: 0.05, att: ri === 0 ? 0.05 : 0.2, rel: 0.3, cut0: 1000, cut1: 1100, wet: 0.5, width: 0.9 });
      if (rL === 2) groove(rt, rcc, ri, { lv: 0.85, br: 0.5, noKick1: ri === 0 });
      else { bass(rt, 0.45, rcc.b, { vol: 0.16 }); bass(rt + 0.5, 0.3, rcc.b + 12, { vol: 0.1 }); kick(rt, 0.38); hat(rt + 0.25, 0.025); hat(rt + 0.75, 0.025); }
    }
    bells(97, [[0.5, 78], [1.0, 81], [1.5, 86]], 0.028); bells(99, [[0, 86], [1.0, 83]], 0.026); bells(101, [[0, 81], [1.0, 85]], 0.026);
    riser(101.8, 103, 0.06, 700, 5000);

    // ---- THREE TYPES 103–113: light & bright (higher plucks, sparkly bells, little glints per card) ----
    crash(103, 0.06, { dec: 1.8 }); kick(103, 0.5);
    var ty = [['D', 103, 2], ['Gadd9', 105, 2], ['DF', 107, 2], ['Gmaj7', 109, 2], ['Asus4', 111, 1], ['A', 112, 1]];
    var tyMel = [[[0, 86], [0.75, 88], [1.0, 90]], [[0, 91], [1.0, 86]], [[0, 90], [0.75, 88], [1.0, 86]], [[0, 83], [0.75, 86], [1.0, 90]], [[0, 88]], [[0, 85], [0.5, 81]]];
    for (var yi = 0; yi < ty.length; yi++) {
      var yc = CH[ty[yi][0]], yt = ty[yi][1], yL = ty[yi][2];
      pad(yt, yt + yL, yc.pad, { vol: 0.045, att: 0.2, rel: 0.3, cut0: 1100, cut1: 1300, wet: 0.5, width: 0.95 });
      pad(yt, yt + yL, yc.pad.map(function (m) { return m + 24; }).slice(1), { type: 'triangle', vol: 0.018, att: 0.4, rel: 0.4, cut0: 5000, cut1: 5000, wet: 0.8, width: 1 });
      if (yL === 2) groove(yt, yc, yi, { lv: 0.9, br: 1, noKick1: yi === 0 });
      else { bass(yt, 0.45, yc.b, { vol: 0.16 }); bass(yt + 0.5, 0.3, yc.b + 12, { vol: 0.1 }); kick(yt, 0.4); hat(yt + 0.25, 0.028); hat(yt + 0.75, 0.028); pluck(yt + 0.75, yc.arp[3] + 12, { vol: 0.04, dur: 0.15, cut: 5000, pan: 0.4, wet: 0.3 }); }
      bells(yt, tyMel[yi], 0.027, { dur: 1.2 });
    }
    chime(106.5, CH.Gadd9, 0.022); chime(110, CH.Gmaj7, 0.022);
    for (s = 0; s < 4; s++) snare(112.5 + s * 0.125, 0.04 + s * 0.015, { pan: (s % 2 ? 0.2 : -0.2) });
    riser(111.6, 113, 0.07, 500, 5500);

    // ---- END 113–120: resolve on the signature motif (D major), clean tail to silence ----
    kick(113, 0.5); crash(113, 0.1, { dec: 2.6 }); boom(113, 0.16, { dur: 1.8 });
    pad(113, 114.6, CH.Dadd9.pad.concat([74]), { vol: 0.12, att: 0.02, rel: 2.6, cut0: 3000, cut1: 700, wet: 0.7, width: 0.85 });
    sig(113.0, 0.085, { last: 3.0 });
    bass(113, 1.8, 38, { vol: 0.19, rel: 1.2 });
    bass(113, 1.8, 26, { vol: 0.07, rel: 1.2 });
    var fin = [78, 81, 86, 88];
    for (var fi = 0; fi < fin.length; fi++) bell(114.1 + fi * 0.09, fin[fi], 0.032, { dur: 2.2, pan: (fi - 1.5) * 0.3, wet: 0.7 });

    // ============ SFX ============
    var SFXLEN = { whoosh: 0.8, alarm: 1.5, clunk: 0.6, impact: 2.0, hiss: 1.2, fire: 2.0, pump: 1.5, success: 1.0, blip: 0.15, bubble: 0.8 };
    var DUCK = { whoosh: 0.85, alarm: 0.75, clunk: 0.8, impact: 0.65, hiss: 0.8, fire: 0.72, pump: 0.8, success: 0.8, blip: 0.95, bubble: 0.88 };

    var SFX = {
      whoosh: function (t) {
        var n = noise(t, 0.85), bp = filt('bandpass', 300, 1.6);
        bp.frequency.setValueAtTime(300, t);
        bp.frequency.exponentialRampToValueAtTime(3200, t + 0.45);
        bp.frequency.exponentialRampToValueAtTime(700, t + 0.8);
        var g = gain(0);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.55, t + 0.42);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.82);
        var pn = ctx.createStereoPanner();
        pn.pan.setValueAtTime(-0.7, t); pn.pan.linearRampToValueAtTime(0.7, t + 0.8);
        n.connect(bp); bp.connect(g); g.connect(pn);
        outTo(pn, { sfx: true, wet: 0.3 });
      },
      alarm: function (t) {
        var g = gain(0), lp = filt('lowpass', 2600, 0.7);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.03);
        g.gain.setValueAtTime(0.16, t + 1.35); g.gain.linearRampToValueAtTime(0, t + 1.5);
        var o1 = osc('triangle', 660, t, t + 1.55), o2 = osc('sine', 660, t, t + 1.55);
        for (var k = 0; k < 6; k++) {
          var f = k % 2 ? 784 : 622;
          o1.frequency.setValueAtTime(f, t + k * 0.25); o2.frequency.setValueAtTime(f * 2, t + k * 0.25);
        }
        var g2 = gain(0.25); o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
        outTo(g, { sfx: true, wet: 0.25 });
      },
      clunk: function (t) {
        function hit(tt, v) {
          var oc = osc('sine', 110, tt, tt + 0.45);
          oc.frequency.setValueAtTime(120, tt); oc.frequency.exponentialRampToValueAtTime(48, tt + 0.3);
          var g = gain(0); decayEnv(g, tt, v, 0.4, 0.002); oc.connect(g);
          var n = noise(tt, 0.12), bp = filt('bandpass', 500, 1.2), ng = gain(0);
          decayEnv(ng, tt, v * 0.8, 0.1, 0.001); n.connect(bp); bp.connect(ng); ng.connect(g);
          var parts = [523, 1131, 1873, 2650];
          for (var i = 0; i < parts.length; i++) {
            var po = osc('sine', parts[i], tt, tt + 0.3), pg = gain(0);
            decayEnv(pg, tt, v * 0.12 / (i + 1), 0.25 - i * 0.04, 0.001); po.connect(pg); pg.connect(g);
          }
          outTo(g, { sfx: true, wet: 0.2 });
        }
        hit(t, 0.8); hit(t + 0.13, 0.45);
      },
      impact: function (t) {
        boom(t, 1.0, { sfx: true, dur: 2.0, f0: 85, f1: 26, wet: 0.5 });
        crash(t, 0.12, { sfx: true, dec: 1.5 });
        var oc = osc('sine', 55, t, t + 2.0);
        oc.frequency.setValueAtTime(60, t); oc.frequency.exponentialRampToValueAtTime(28, t + 1.8);
        var g = gain(0); decayEnv(g, t, 0.45, 2.0, 0.01); oc.connect(g);
        outTo(g, { sfx: true, wet: 0 });
      },
      hiss: function (t) {
        var n = noise(t, 1.25), hpf = filt('highpass', 2500, 0.7), bp = filt('peaking', 6000, 1); bp.gain.value = 6;
        var g = gain(0);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.08);
        g.gain.linearRampToValueAtTime(0.16, t + 0.8); g.gain.linearRampToValueAtTime(0, t + 1.2);
        n.connect(hpf); hpf.connect(bp); bp.connect(g);
        outTo(g, { sfx: true, wet: 0.15 });
      },
      fire: function (t) {
        var d = 2.0;
        var n = noise(t, d), lp = filt('lowpass', 900, 0.8), g = gain(0);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.15);
        g.gain.setValueAtTime(0.5, t + 1.3); g.gain.linearRampToValueAtTime(0, t + d);
        var flick = osc('sine', 7, t, t + d), fg = gain(0.15); flick.connect(fg); fg.connect(g.gain);
        n.connect(lp); lp.connect(g);
        outTo(g, { sfx: true, wet: 0.25 });
        var rum = noise(t, d), rl = filt('lowpass', 160, 1), rg = gain(0);
        rg.gain.setValueAtTime(0, t); rg.gain.linearRampToValueAtTime(0.6, t + 0.2);
        rg.gain.linearRampToValueAtTime(0, t + d);
        rum.connect(rl); rl.connect(rg); outTo(rg, { sfx: true, wet: 0 });
        for (var i = 0; i < 26; i++) {
          var ct = t + rnd() * (d - 0.2), cn = noise(ct, 0.02), cb = filt('bandpass', 1500 + rnd() * 3500, 2), cg = gain(0);
          decayEnv(cg, ct, 0.15 + rnd() * 0.25, 0.015 + rnd() * 0.02, 0.001);
          cn.connect(cb); cb.connect(cg); outTo(cg, { sfx: true, wet: 0.1, pan: rnd() * 1.2 - 0.6 });
        }
      },
      pump: function (t) {
        for (var k = 0; k < 3; k++) {
          var tt = t + k * 0.5;
          var oc = osc('sine', 70, tt, tt + 0.3);
          oc.frequency.setValueAtTime(90, tt); oc.frequency.exponentialRampToValueAtTime(45, tt + 0.2);
          var g = gain(0); decayEnv(g, tt, 0.5, 0.28, 0.005); oc.connect(g);
          var n = noise(tt, 0.3), lp = filt('lowpass', 400, 1.5), ng = gain(0);
          ng.gain.setValueAtTime(0, tt); ng.gain.linearRampToValueAtTime(0.4, tt + 0.05);
          ng.gain.exponentialRampToValueAtTime(0.0005, tt + 0.3);
          n.connect(lp); lp.connect(ng); ng.connect(g);
          var cn = noise(tt + 0.32, 0.03), ch = filt('bandpass', 2400, 3), cg = gain(0);
          decayEnv(cg, tt + 0.32, 0.25, 0.03, 0.001); cn.connect(ch); ch.connect(cg); cg.connect(g);
          outTo(g, { sfx: true, wet: 0.12 });
        }
      },
      success: function (t) {
        var notes = [86, 90, 93];
        for (var k = 0; k < 3; k++) bell(t + k * 0.13, notes[k], 0.16, { sfx: true, dur: k === 2 ? 1.6 : 0.9, wet: 0.5, pan: (k - 1) * 0.3 });
        bell(t + 0.26, 98, 0.04, { sfx: true, dur: 1.2, wet: 0.6 });
      },
      blip: function (t) {
        var oc = osc('sine', 900, t, t + 0.15);
        oc.frequency.setValueAtTime(900, t); oc.frequency.exponentialRampToValueAtTime(1400, t + 0.05);
        var g = gain(0); decayEnv(g, t, 0.14, 0.13, 0.004); oc.connect(g);
        outTo(g, { sfx: true, wet: 0.2 });
      },
      bubble: function (t) {
        for (var k = 0; k < 7; k++) {
          bubble(t + rnd() * 0.65, 300 + rnd() * 600, 0.15, { sfx: true, dur: 0.06 + rnd() * 0.08, pan: rnd() * 1.2 - 0.6, wet: 0.3 });
        }
      }
    };

    // ducking curve for music under SFX
    var DR = 50, dn = Math.max(2, Math.ceil(END * DR) + 1);
    var dcurve = new Float32Array(dn);
    for (i = 0; i < dn; i++) dcurve[i] = 1;
    for (var q = 0; q < cues.length; q++) {
      var cu = cues[q];
      if (!cu || typeof cu.t !== 'number' || !SFX.hasOwnProperty(cu.sfx)) continue;
      if (cu.t < 0 || cu.t >= END) continue;
      SFX[cu.sfx](cu.t);
      var ds = cu.t - 0.08, de = cu.t + SFXLEN[cu.sfx], amt = DUCK[cu.sfx];
      for (i = 0; i < dn; i++) {
        var tt = i / DR, w = 0;
        if (tt >= ds && tt <= de) w = 1;
        else if (tt > de && tt < de + 0.4) w = 1 - (tt - de) / 0.4;
        else if (tt < ds && tt > ds - 0.08) w = 1 - (ds - tt) / 0.08;
        var v = 1 - (1 - amt) * w;
        if (v < dcurve[i]) dcurve[i] = v;
      }
    }
    duck.gain.setValueCurveAtTime(dcurve, 0, END);

    return ctx.startRendering().then(function (buf) {
      var Lc = buf.getChannelData(0), Rc = buf.getChannelData(1), n = buf.length;
      var peak = 0;
      for (var i = 0; i < n; i++) {
        var a = Math.abs(Lc[i]), b = Math.abs(Rc[i]);
        if (a > peak) peak = a; if (b > peak) peak = b;
      }
      var g = peak > 1e-9 ? Math.pow(10, -1 / 20) / peak : 1;
      var fadeN = Math.min(n, Math.round(0.02 * SR));
      var dataLen = n * 4, out = new Uint8Array(44 + dataLen), dv = new DataView(out.buffer);
      function str(o, s) { for (var k = 0; k < s.length; k++) out[o + k] = s.charCodeAt(k); }
      str(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); str(8, 'WAVE');
      str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
      dv.setUint32(24, SR, true); dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
      str(36, 'data'); dv.setUint32(40, dataLen, true);
      var off = 44;
      for (i = 0; i < n; i++) {
        var f = i >= n - fadeN ? (n - 1 - i) / fadeN : 1;
        var l = Math.max(-1, Math.min(1, Lc[i] * g * f)), r = Math.max(-1, Math.min(1, Rc[i] * g * f));
        dv.setInt16(off, Math.round(l * 32767), true);
        dv.setInt16(off + 2, Math.round(r * 32767), true);
        off += 4;
      }
      return out;
    });
  }

  window.Score = { renderWav: renderWav, SAMPLE_RATE: SR, BPM: 120, DURATION: 120 };
})();
