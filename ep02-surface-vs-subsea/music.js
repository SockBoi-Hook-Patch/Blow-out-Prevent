/* music.js — original synthesized score + SFX for namman.story EP02 "Surface BOP vs Subsea BOP".
 * Classic browser script. Defines window.Score.renderWav(duration, cues) -> Promise<Uint8Array>
 * (16-bit PCM WAV, 48 kHz, stereo, exactly `duration` seconds), rendered with OfflineAudioContext.
 * Same synth engine / SFX / mix chain as EP01 (../bop-3d/music.js) for a consistent channel sound.
 *
 * Tempo 120 BPM (beat 0.5 s, bar 2 s) so every storyboard boundary (5, 10, 26, 46, 64, 71) lands on a beat.
 * Key: F major (title/hook/comparison/ending), F mixolydian colour (surface/land), D minor (subsea).
 * "namman.story" SIGNATURE MOTIF (series-wide, scale degrees 5-1-2-3, rhythm 8th-8th-8th-long):
 *   C5 F5 G5 A5 (MIDI 72 77 79 81) — played on bells at 1.0 s and resolved at 71.0 s.
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
    F:      { b: 41, pad: [53, 60, 65, 69],     arp: [65, 69, 72, 77] },
    Fadd9:  { b: 41, pad: [53, 60, 65, 67, 69], arp: [65, 67, 69, 72] },
    Eb:     { b: 39, pad: [51, 55, 58, 63],     arp: [63, 67, 70, 75] },
    Bb:     { b: 46, pad: [50, 53, 58, 62],     arp: [62, 65, 70, 74] },
    Bbmaj7: { b: 34, pad: [50, 53, 57, 62],     arp: [62, 65, 69, 74] },
    C:      { b: 36, pad: [52, 55, 60, 64],     arp: [64, 67, 72, 76] },
    Csus4:  { b: 36, pad: [53, 55, 60, 65],     arp: [65, 67, 72, 77] },
    Dm:     { b: 38, pad: [50, 57, 62, 65],     arp: [62, 65, 69, 74] },
    DmC:    { b: 36, pad: [50, 57, 62, 65],     arp: [62, 65, 69, 74] },
    Dm9:    { b: 38, pad: [53, 57, 60, 64],     arp: [62, 64, 65, 69] },
    Gm:     { b: 43, pad: [50, 55, 58, 62],     arp: [58, 62, 67, 70] },
    Gm9:    { b: 43, pad: [53, 57, 58, 62],     arp: [58, 62, 65, 69] },
    A:      { b: 33, pad: [49, 52, 57, 61],     arp: [61, 64, 69, 73] },
    Asus4:  { b: 33, pad: [50, 52, 57, 62],     arp: [62, 64, 69, 74] }
  };
  // Series signature motif ("nam-man-sto-ry"): degrees 5-1-2-3 of the home key.
  var SIG = [72, 77, 79, 81];

  function renderWav(duration, cues) {
    duration = +duration > 0 ? +duration : 75;
    cues = Array.isArray(cues) ? cues : [];
    var len = Math.max(1, Math.round(duration * SR));
    var END = len / SR;
    var ctx = new OfflineAudioContext({ numberOfChannels: 2, length: len, sampleRate: SR });
    var rnd = mulberry32(0xE902B0B);

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
    var arc = [[0, 0.82], [5, 0.85], [9.9, 0.95], [10, 0.9], [25.8, 0.9], [26, 0.84], [39.8, 0.86], [40, 1.0], [45, 1.08], [45.9, 0.95], [46, 0.88], [63.9, 0.88], [64, 0.85], [71, 1.0], [75, 1.0]];
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
    var ARP_DESERT = [0, 3, 1, 2, 3, 1, 0, 2];
    var TRESILLO = [0, 0.375, 0.75, 1.0, 1.375, 1.75]; // 3+3+2 per bar (seconds at 120 BPM)
    var s, e;

    // ============ SCORE ============
    // ---- TITLE 0–5: bright, inviting; signature motif ----
    pad(0, 4.7, CH.Fadd9.pad, { vol: 0.12, att: 2.6, rel: 1.2, cut0: 500, cut1: 3200, wet: 0.65, width: 0.85 });
    pad(0.4, 4.7, [77, 81, 84], { type: 'triangle', vol: 0.04, att: 3.0, rel: 1.0, cut0: 2500, cut1: 6500, wet: 0.8, width: 0.9 });
    sig(1.0, 0.075, { last: 2.6 });
    bass(1.75, 2.9, 41, { vol: 0.13, att: 0.8, rel: 0.4 });
    // sparkling answer (motif shape inverted, higher, softer)
    var ans = [84, 81, 79, 84, 86, 84];
    for (var ai3 = 0; ai3 < ans.length; ai3++) bell(3.0 + ai3 * 0.25, ans[ai3], 0.028 + ai3 * 0.004, { dur: 1.0, pan: (ai3 % 2 ? 0.5 : -0.5), wet: 0.75 });
    for (s = 0; s < 8; s++) shaker(3.0 + s * 0.25, 0.015 + s * 0.006, { pan: s % 2 ? 0.3 : -0.3 });
    riser(3.4, 5.0, 0.08, 500, 4500);

    // ---- HOOK 5–10: playful build; high (surface) calls vs low (subsea) answers ----
    crash(5, 0.08); kick(5, 0.5);
    var hook = [['Bb', 5, 1], ['C', 6, 1], ['Dm', 7, 1], ['C', 8, 1], ['Bb', 9, 0.5], ['Csus4', 9.5, 0.25], ['C', 9.75, 0.25]];
    for (var hi = 0; hi < hook.length; hi++) {
      var hc = CH[hook[hi][0]], ht0 = hook[hi][1], hL = hook[hi][2];
      pad(ht0, ht0 + hL, hc.pad, { vol: 0.07 + hi * 0.008, att: 0.05, rel: 0.2, cut0: 1400 + hi * 250, cut1: 1800 + hi * 250, wet: 0.45 });
      bass(ht0, hL * 0.45, hc.b, { vol: 0.17 }); if (hL >= 1) bass(ht0 + 0.5, 0.2, hc.b + 12, { vol: 0.12 });
    }
    // call (high, staccato) — answer (low, bubbly)
    var call1 = [77, 79, 81, 84], resp1 = [53, 57, 60, 57];
    var call2 = [81, 84, 86, 89], resp2 = [50, 53, 57, 55];
    function callResp(t0, c, r) {
      for (var i = 0; i < 4; i++) pluck(t0 + i * 0.125, c[i], { vol: 0.075, dur: 0.12, cut: 3200, pan: 0.35, wet: 0.25 });
      for (i = 0; i < 4; i++) pluck(t0 + 0.5 + i * 0.125, r[i], { vol: 0.08, dur: 0.18, cut: 700, pan: -0.35, wet: 0.5 });
      bubble(t0 + 0.6, 420, 0.03, { pan: -0.5 }); bubble(t0 + 0.85, 560, 0.025, { pan: -0.3 });
    }
    callResp(5.0, call1, resp1); callResp(6.0, call1.map(function (m) { return m + 2; }), resp1.map(function (m) { return m - 2; }));
    callResp(7.0, call2, resp2); callResp(8.0, call2.map(function (m) { return m - 1; }), resp2);
    for (s = 0; s < 8; s++) pluck(9 + s * 0.125, [77, 81, 84, 89, 84, 81, 84, 89][s], { vol: 0.06 + s * 0.004, dur: 0.12, cut: 3500, pan: s % 2 ? 0.3 : -0.3, wet: 0.3 });
    for (var kt = 7; kt < 10; kt += 0.5) kick(kt, 0.42 + (kt - 7) * 0.04);
    for (var ht = 8; ht < 10; ht += 0.25) shaker(ht, 0.03 + 0.02 * (ht - 8), { pan: 0.25 });
    snare(8.5, 0.08, { dec: 0.1, f: 3200 }); snare(9.5, 0.1, { dec: 0.1, f: 3200 });
    snare(9.625, 0.11); snare(9.75, 0.14); snare(9.875, 0.17);
    riser(8.2, 10, 0.1, 400, 5000);

    // ---- SURFACE 10–26: warm, dry, 'land/desert' (F mixolydian, tresillo plucks, shaker, frame drum) ----
    crash(10, 0.06);
    var surf = ['F', 'Eb', 'Bb', 'F', 'F', 'Eb', 'Bb', 'C'];
    var lead = [ // [bar, beatOffset(s), midi, dur] — dry twangy lead in bars 3-4 and 7-8
      [2, 0, 77, 0.4], [2, 0.5, 79, 0.2], [2, 0.75, 81, 0.4], [2, 1.25, 84, 0.6],
      [3, 0, 81, 0.3], [3, 0.375, 79, 0.3], [3, 0.75, 75, 0.5], [3, 1.25, 77, 0.7],
      [6, 0, 84, 0.4], [6, 0.5, 86, 0.2], [6, 0.75, 84, 0.4], [6, 1.25, 81, 0.6],
      [7, 0, 79, 0.3], [7, 0.375, 81, 0.3], [7, 0.75, 79, 0.3], [7, 1.0, 76, 0.4], [7, 1.5, 72, 0.5]
    ];
    for (var si2 = 0; si2 < surf.length; si2++) {
      var st = 10 + si2 * 2, sc = CH[surf[si2]];
      pad(st, st + 2, sc.pad, { vol: 0.055, att: 0.3, rel: 0.4, cut0: 1100, cut1: 1300, wet: 0.25, width: 0.4 });
      // tresillo plucks (dry)
      for (s = 0; s < TRESILLO.length; s++) {
        var pt = st + TRESILLO[s];
        pluck(pt, sc.arp[ARP_DESERT[s]] - (s % 3 === 0 ? 12 : 0), { vol: s % 3 === 0 ? 0.08 : 0.065, dur: 0.28, cut: 2200, pan: (s % 2 ? 0.3 : -0.3), wet: 0.12 });
      }
      // soft 8th-note ghost plucks from bar 3 on
      if (si2 >= 2) for (s = 1; s < 16; s += 4) pluck(st + s * 0.125, sc.arp[3] + 12, { vol: 0.03, dur: 0.1, cut: 4000, pan: 0.55, wet: 0.15 });
      // bass: tresillo root/5th
      bass(st, 0.3, sc.b, { vol: 0.2 }); bass(st + 0.75, 0.2, sc.b + 7, { vol: 0.14 }); bass(st + 1.0, 0.3, sc.b, { vol: 0.17 }); bass(st + 1.5, 0.2, sc.b + 12, { vol: 0.12 });
      // drums: kick 1 & the 'and' of 2, rimshot 3, shaker 16ths, frame drum fill on 4th bar
      kick(st, 0.5); kick(st + 0.75, 0.32);
      snare(st + 1.0, 0.07, { dec: 0.06, f: 4200, wet: 0.08 });
      for (s = 0; s < 16; s++) shaker(st + s * 0.125, s % 4 === 2 ? 0.045 : (s % 2 ? 0.02 : 0.03), { pan: 0.3 });
      if (si2 % 4 === 3) { tom(st + 1.5, 110, 0.2, { pan: -0.3, dec: 0.3 }); tom(st + 1.75, 92, 0.22, { pan: 0.3, dec: 0.35 }); }
      else tom(st + 1.5, 98, 0.1, { pan: -0.4, dec: 0.25 });
    }
    for (var li = 0; li < lead.length; li++) {
      var ld = lead[li];
      pluck(10 + ld[0] * 2 + ld[1], ld[2], { vol: 0.065, dur: ld[3], cut: 2600, q: 4, wet: 0.18, pan: 0.1 });
    }
    // second half (jack-up / platform): a little lift
    pad(18, 25.8, [72, 77], { type: 'triangle', vol: 0.025, att: 2, rel: 0.4, cut0: 2000, cut1: 3500, wet: 0.5, width: 0.8 });
    riser(24.6, 26, 0.08, 2500, 300); // downward sweep into the dive

    // ---- SUBSEA 26–46: deep, wide, underwater; half-time pulse; tension 40–45 (EDS) ----
    boom(26, 0.32, { dur: 2.4, wet: 0.65 });
    var deep = [['Dm9', 26], ['Bbmaj7', 28], ['Gm9', 30], ['Dm9', 32], ['Bbmaj7', 34], ['Gm9', 36], ['Asus4', 38]];
    for (var di = 0; di < deep.length; di++) {
      var dc = CH[deep[di][0]], dt = deep[di][1], dp = di / 7;
      pad(dt, dt + 2, dc.pad, { vol: 0.085, att: di === 0 ? 1.2 : 0.5, rel: 0.8, cut0: 450 + 300 * dp, cut1: 550 + 350 * dp, wet: 0.75, width: 0.95, lfo: 0.25 });
      pad(dt, dt + 2, dc.pad.map(function (m) { return m + 12; }), { type: 'triangle', vol: 0.03, att: 0.8, rel: 0.8, cut0: 900, cut1: 1100, wet: 0.85, width: 1 });
      bass(dt, 1.85, dc.b, { vol: 0.15, att: 0.15, rel: 0.3 });
      kick(dt, 0.45, { dec: 0.55, f1: 42 }); // half-time pulse
      if (di >= 3) snare(dt + 1.0, 0.07, { dec: 0.35, f: 1200, wet: 0.6 });
      // slow, filtered plucks (quarter notes, descending) — 'sonar' bells every bar
      for (s = 0; s < 4; s++) pluck(dt + s * 0.5, dc.arp[3 - s], { vol: 0.05, dur: 0.5, cut: 700 + 200 * dp, wet: 0.65, pan: (s % 2 ? 0.55 : -0.55) });
      if (di % 2 === 0) bell(dt + 0.02, 81, 0.03, { dur: 2.0, wet: 0.85, pan: 0.5 });
      else bell(dt + 1.0, 76, 0.022, { dur: 1.8, wet: 0.85, pan: -0.5 });
      for (var bb = 0; bb < 4; bb++) bubble(dt + Math.floor(rnd() * 16) * 0.125, 300 + rnd() * 600, 0.028, { pan: rnd() * 1.6 - 0.8, wet: 0.7 });
    }
    drone(26, 40, [26, 38], 0.03, { cut: 220, cut1: 320, att: 2, rel: 1, trem: 0.25 });
    // tension 40–45 (rig drifts, EDS): ticking hats, pulsing 8th bass, rising filter
    var tens = [['Dm', 40, 1], ['DmC', 41, 1], ['Bb', 42, 1], ['Gm', 43, 1], ['A', 44, 1]];
    for (var ti = 0; ti < tens.length; ti++) {
      var tc = CH[tens[ti][0]], tt0 = tens[ti][1], tp = ti / 5;
      pad(tt0, tt0 + 1, tc.pad, { vol: 0.09 + 0.03 * tp, att: 0.05, rel: 0.15, cut0: 700 + 1400 * tp, cut1: 900 + 1500 * tp, wet: 0.55, width: 0.8 });
      for (e = 0; e < 4; e++) bass(tt0 + e * 0.25, 0.17, tc.b, { vol: 0.18, drive: ti >= 3, cut: 650 });
      for (s = 0; s < 8; s++) {
        hat(tt0 + s * 0.125, s % 2 ? 0.022 : 0.04, { f: 9000, dec: 0.025, pan: 0.35 });
        pluck(tt0 + s * 0.125, tc.arp[[0, 2, 1, 2][s % 4]] + (s % 4 === 3 ? 12 : 0), { vol: 0.045 + 0.02 * tp, dur: 0.14, cut: 900 + 1500 * tp, wet: 0.35, pan: (s % 2 ? 0.3 : -0.3) });
      }
      kick(tt0, 0.5); kick(tt0 + 0.5, 0.35);
      if (ti >= 2) snare(tt0 + 0.5, 0.1, { dec: 0.15 });
    }
    pad(42, 45, [69, 81], { vol: 0.035, att: 2.5, rel: 0.1, cut0: 900, cut1: 4000, wet: 0.5, lfo: 5 });
    riser(42.5, 44.9, 0.13, 300, 5000);
    // ~45: LMRP lets go — release, then lift into the major comparison
    boom(45, 0.3, { dur: 1.6, wet: 0.6 }); crash(45, 0.06, { dec: 1.4 });
    pad(45, 45.9, CH.Csus4.pad, { vol: 0.07, att: 0.05, rel: 0.4, cut0: 1600, cut1: 2400, wet: 0.6 });
    bass(45, 0.85, 36, { vol: 0.15, att: 0.05 });
    for (s = 0; s < 4; s++) bubble(45.1 + s * 0.17, 350 + s * 140, 0.035, { pan: (s % 2 ? 0.4 : -0.4) });
    riser(45.2, 46, 0.07, 800, 4500);
    snare(45.75, 0.08); snare(45.875, 0.11);

    // ---- COMPARISON 46–64: steady, positive groove, sparse mids for reading ----
    crash(46, 0.08);
    var comp = ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C', 'F'];
    var BASSPAT = [[0, 0.3, 0], [0.75, 0.15, 12], [1.0, 0.3, 0], [1.5, 0.15, 7], [1.75, 0.15, 12]];
    var top = [ // high bell counter-melody, one phrase per 2 bars (quiet, above the caption mids)
      [0, 81], [0.75, 84], [1.5, 86], [2.0, 84], [3.0, 79],
      [0, 81], [0.75, 77], [1.5, 79], [2.0, 81], [3.0, 74]
    ];
    for (var ci = 0; ci < comp.length; ci++) {
      var ct = 46 + ci * 2, cc = CH[comp[ci]];
      pad(ct, ct + 2, cc.pad, { vol: 0.05, att: 0.15, rel: 0.3, cut0: 850, cut1: 950, wet: 0.4, width: 0.9 });
      for (var bp2 = 0; bp2 < BASSPAT.length; bp2++) bass(ct + BASSPAT[bp2][0], BASSPAT[bp2][1], cc.b + BASSPAT[bp2][2], { vol: BASSPAT[bp2][2] ? 0.13 : 0.2 });
      // offbeat high plucks (above the mids), skipping some for air
      for (s = 0; s < 8; s++) {
        if (s % 2 === 0 || (s === 5 && ci % 2)) continue;
        pluck(ct + s * 0.25, cc.arp[ARP_UP[s]] + 12, { vol: 0.045, dur: 0.16, cut: 4200, pan: (s % 4 === 1 ? 0.45 : -0.45), wet: 0.3 });
      }
      for (var b4 = 0; b4 < 4; b4++) {
        var tb4 = ct + b4 * 0.5;
        if (b4 % 2 === 0) kick(tb4, 0.5); else snare(tb4, 0.11, { dec: 0.12, f: 2600, wet: 0.2 });
        hat(tb4 + 0.25, 0.04);
        shaker(tb4 + 0.125, 0.015, { pan: -0.35 }); shaker(tb4 + 0.375, 0.015, { pan: -0.35 });
      }
      if (ci % 2 === 1) kick(ct + 1.75, 0.3);
      if (ci < 8) {
        var phr = (ci % 4 < 2) ? 0 : 5, half = ci % 2;
        for (var tp2 = phr; tp2 < phr + 5; tp2++) {
          var to = top[tp2][0] - half * 2;
          if (to >= 0 && to < 2) bell(ct + to, top[tp2][1], 0.028, { dur: 1.2, pan: 0.35, wet: 0.6 });
        }
      }
    }

    // ---- WHY 64–71: gentle build ----
    var why = [['Bb', 64, 2], ['C', 66, 2], ['Dm', 68, 1], ['Bb', 69, 1], ['Csus4', 70, 0.5], ['C', 70.5, 0.5]];
    for (var wi = 0; wi < why.length; wi++) {
      var wc = CH[why[wi][0]], wt = why[wi][1], wL = why[wi][2], wp = (wt - 64) / 7;
      pad(wt, wt + wL, wc.pad, { vol: 0.07 + 0.04 * wp, att: wi === 0 ? 0.6 : 0.1, rel: 0.25, cut0: 1000 + 1800 * wp, cut1: 1300 + 1900 * wp, wet: 0.5, width: 0.85 });
      var step = wp < 0.55 ? 0.25 : 0.125;
      for (s = 0; s < wL / step; s++) pluck(wt + s * step, wc.arp[ARP_UP[s % 8]] + (s % 8 >= 4 ? 12 : 0), { vol: 0.05 + 0.025 * wp, dur: 0.2, cut: 1800 + 1800 * wp, pan: (s % 2 ? 0.4 : -0.4), wet: 0.4 });
      for (e = 0; e < wL / 0.5; e++) bass(wt + e * 0.5, 0.4, wc.b, { vol: 0.16 + 0.05 * wp });
      for (var b5 = 0; b5 < wL / 0.5; b5++) {
        var tb5 = wt + b5 * 0.5;
        if (!(wp < 0.3 && b5 % 2)) kick(tb5, wp < 0.3 ? 0.4 : 0.45 + 0.15 * wp);
        hat(tb5 + 0.25, 0.03 + 0.03 * wp);
        if (wp > 0.25 && b5 % 2 === 1) snare(tb5, 0.1 + 0.08 * wp);
      }
    }
    for (var fl = 0; fl < 8; fl++) snare(70 + fl * 0.125, 0.06 + fl * 0.02, { pan: (fl % 2 ? 0.2 : -0.2) });
    riser(68.5, 71, 0.12, 400, 6000);

    // ---- END 71–75: resolve on the signature motif, clean tail ----
    kick(71, 0.6); crash(71, 0.13, { dec: 2.4 }); boom(71, 0.22, { dur: 1.8 });
    pad(71, 72.6, CH.Fadd9.pad.concat([77]), { vol: 0.13, att: 0.02, rel: 1.4, cut0: 3200, cut1: 900, wet: 0.65, width: 0.85 });
    sig(71.0, 0.085, { last: 2.6 });
    bass(71, 1.6, 41, { vol: 0.2, rel: 0.9 });
    bass(71, 1.6, 29, { vol: 0.08, rel: 0.9 });
    kick(71.75, 0.35);
    // final sparkle: F major add9 bells
    var fin = [77, 81, 84, 89];
    for (var fi = 0; fi < fin.length; fi++) bell(72.0 + fi * 0.08, fin[fi], 0.035, { dur: 1.8, pan: (fi - 1.5) * 0.3, wet: 0.7 });

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

  window.Score = { renderWav: renderWav, SAMPLE_RATE: SR, BPM: 120 };
})();
