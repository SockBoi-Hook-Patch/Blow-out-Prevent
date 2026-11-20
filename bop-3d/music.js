/* music.js — original synthesized score + SFX for the BOP explainer.
 * Classic browser script. Defines window.Score.renderWav(duration, cues) -> Promise<Uint8Array>
 * (16-bit PCM WAV, 48 kHz, stereo, exactly `duration` seconds), rendered with OfflineAudioContext.
 *
 * Tempo 120 BPM (beat 0.5 s, bar 2 s) so every storyboard boundary (5, 13, 28, 38, 53, 66) lands on a beat.
 * Key: D major (title/anatomy/summary), B minor colour (dive/drilling), D minor (kick/blowout).
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
    D:     { b: 38, pad: [50, 57, 62, 66],     arp: [62, 66, 69, 74] },
    Dadd9: { b: 38, pad: [50, 57, 64, 66, 69], arp: [62, 64, 66, 69] },
    A:     { b: 33, pad: [49, 57, 61, 64],     arp: [61, 64, 69, 73] },
    Asus4: { b: 33, pad: [50, 57, 62, 64],     arp: [62, 64, 69, 74] },
    Bm:    { b: 35, pad: [47, 54, 59, 62],     arp: [59, 62, 66, 71] },
    G:     { b: 43, pad: [50, 55, 59, 62],     arp: [59, 62, 67, 71] },
    Em:    { b: 40, pad: [52, 55, 59, 64],     arp: [59, 64, 67, 71] },
    Em7:   { b: 40, pad: [50, 55, 59, 64],     arp: [59, 62, 64, 67] },
    Dm:    { b: 38, pad: [50, 57, 62, 65],     arp: [62, 65, 69, 74] },
    Bb:    { b: 34, pad: [50, 53, 58, 62],     arp: [58, 62, 65, 70] },
    Gm:    { b: 43, pad: [50, 55, 58, 62],     arp: [58, 62, 67, 70] },
    F:     { b: 41, pad: [48, 53, 57, 60],     arp: [60, 65, 69, 72] }
  };

  function renderWav(duration, cues) {
    duration = +duration > 0 ? +duration : 75;
    cues = Array.isArray(cues) ? cues : [];
    var len = Math.max(1, Math.round(duration * SR));
    var END = len / SR;
    var ctx = new OfflineAudioContext({ numberOfChannels: 2, length: len, sampleRate: SR });
    var rnd = mulberry32(0xB0B5EED);

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
    var arc = [[0, 0.8], [5, 0.75], [12.9, 0.8], [13, 0.9], [28, 1.0], [38, 0.92], [45, 0.95], [52.9, 1.25], [53, 1.12], [58.9, 1.1], [60, 1.0], [65.9, 0.8], [66.2, 0.95], [75, 0.95]];
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

    // ---------- instruments ----------
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

    var ARP_UP = [0, 1, 2, 3, 2, 1, 2, 3];
    var ARP_DRIVE = [0, 2, 1, 3, 2, 0, 3, 1];
    var ARP_MIN = [0, 2, 1, 2, 3, 2, 1, 2];

    // ============ SCORE ============
    // ---- TITLE 0–5: airy, wide, hopeful swell ----
    pad(0, 4.6, CH.Dadd9.pad, { vol: 0.13, att: 3.2, rel: 1.4, cut0: 450, cut1: 2800, wet: 0.65, width: 0.8 });
    pad(0.5, 4.6, [74, 78, 81], { type: 'triangle', vol: 0.045, att: 3.5, rel: 1.2, cut0: 2500, cut1: 6000, wet: 0.8, width: 0.9 });
    var motif = [81, 78, 74, 76, 78, 81, 83, 81, 86, 83, 81, 78, 76, 78, 81, 83];
    for (var mi = 0; mi < motif.length; mi++) {
      var mt = 1.0 + mi * 0.25;
      if (mt >= 5) break;
      bell(mt, motif[mi], 0.02 + 0.035 * (mt / 5), { pan: (mi % 2 ? 0.45 : -0.45), wet: 0.75, dur: 1.2 });
    }
    bass(2.5, 2.2, 38, { vol: 0.12, att: 1.5, rel: 0.4 });
    riser(3.0, 5.0, 0.07, 400, 3500);

    // ---- DIVE 5–13: descending, deep, underwater, building ----
    boom(5.0, 0.35, { dur: 2.2, wet: 0.6 });
    var dive = ['Bm', 'G', 'Em', 'A'];
    for (var di = 0; di < 4; di++) {
      var dt = 5 + di * 2, ch = CH[dive[di]];
      pad(dt, dt + 2, ch.pad, { vol: 0.11, att: di === 0 ? 0.3 : 0.15, rel: 0.5, cut0: 1700 - di * 300, cut1: 1300 - di * 250, wet: 0.55 });
      bass(dt, 1.92, ch.b, { vol: 0.18 + di * 0.02, att: 0.05 });
      var a = ch.arp, seq = [a[3] + 12, a[2] + 12, a[1] + 12, a[0] + 12, a[3], a[2], a[1], a[0]];
      for (var k = 0; k < 8; k++) {
        pluck(dt + k * 0.25, seq[k], { vol: 0.055 + di * 0.006, dur: 0.35, cut: 1300 - di * 180, pan: (k % 2 ? 0.4 : -0.4), wet: 0.55 });
      }
      for (var bb = 0; bb < 5; bb++) {
        var bt = dt + Math.floor(rnd() * 16) * 0.125;
        bubble(bt, 380 + rnd() * 700, 0.035, { pan: rnd() * 1.4 - 0.7, wet: 0.6 });
      }
    }
    for (var kt = 9; kt < 11; kt += 1) kick(kt, 0.4, { dec: 0.5 });
    for (kt = 11; kt < 13; kt += 0.5) kick(kt, 0.5);
    for (var ht = 12; ht < 13; ht += 0.125) hat(ht, 0.02 + 0.04 * (ht - 12));
    riser(11, 13, 0.12, 300, 5000);
    snare(12.5, 0.1); snare(12.75, 0.14); snare(12.875, 0.18);

    // ---- ANATOMY 13–28: curious, steady pulsing groove, light ----
    var anat = ['D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'A'];
    crash(13, 0.07);
    for (var ai2 = 0; ai2 < anat.length; ai2++) {
      var t0 = 13 + ai2 * 2, L = Math.min(2, 28 - t0), c2 = CH[anat[ai2]];
      pad(t0, t0 + L, c2.pad, { vol: 0.07, att: 0.1, rel: 0.3, cut0: 1300, cut1: 1600, wet: 0.4 });
      for (var s = 0; s < L / 0.125; s++) {
        var nt = c2.arp[ARP_UP[s % 8]] + ((s >= 8 && ai2 % 2) ? 12 : 0);
        pluck(t0 + s * 0.125, nt, { vol: s % 4 === 0 ? 0.08 : 0.06, dur: 0.22, cut: 2000, pan: (s % 2 ? 0.35 : -0.35), wet: 0.35 });
      }
      for (var e = 0; e < L / 0.25; e++) bass(t0 + e * 0.25, 0.16, c2.b, { vol: e % 2 ? 0.14 : 0.2 });
      for (var bt2 = 0; bt2 < L / 0.5; bt2++) {
        var tb = t0 + bt2 * 0.5;
        if (bt2 % 2 === 0) kick(tb, 0.55); else snare(tb, 0.12, { dec: 0.12, f: 3000 });
        hat(tb + 0.25, 0.05);
      }
      if (ai2 % 2 === 1 && L === 2) kick(t0 + 1.75, 0.35);
    }

    // ---- DRILLING 28–38: driving rhythmic groove ----
    var drill = ['Bm', 'G', 'D', 'A', 'A'];
    crash(28, 0.12);
    for (var dr = 0; dr < drill.length; dr++) {
      var t1 = 28 + dr * 2, c3 = CH[drill[dr]];
      pad(t1, t1 + 2, c3.pad, { vol: 0.08, att: 0.05, rel: 0.25, cut0: 2000, cut1: 2400, wet: 0.35 });
      for (s = 0; s < 16; s++) {
        pluck(t1 + s * 0.125, c3.arp[ARP_DRIVE[s % 8]] + (s % 8 >= 4 ? 12 : 0), { vol: 0.075, dur: 0.18, cut: 2700, pan: (s % 2 ? 0.4 : -0.4), wet: 0.3 });
      }
      for (e = 0; e < 8; e++) bass(t1 + e * 0.25, 0.2, c3.b + (e % 2 ? 12 : 0), { vol: 0.22, drive: true, cut: 900 });
      for (var b3 = 0; b3 < 4; b3++) {
        var tb3 = t1 + b3 * 0.5;
        if (!(dr === 4 && b3 >= 2)) kick(tb3, 0.65);
        if (b3 % 2 === 1 && !(dr === 4 && b3 === 3)) snare(tb3, 0.26);
        for (var h = 0; h < 4; h++) hat(tb3 + h * 0.125, h === 2 ? 0.065 : 0.035, { pan: h % 2 ? 0.3 : -0.1 });
        hat(tb3 + 0.25, 0.03, { open: true, pan: -0.3 });
      }
    }
    for (var fl = 0; fl < 8; fl++) snare(37 + fl * 0.125, 0.1 + fl * 0.03, { pan: (fl % 2 ? 0.2 : -0.2) });
    riser(36, 38, 0.13, 400, 6000);

    // ---- KICK 38–53: tension, D minor, ticking hats, rising ----
    var kickProg = ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'Gm', 'A'];
    boom(38, 0.3, { dur: 1.6 });
    for (var ki = 0; ki < kickProg.length; ki++) {
      var t2 = 38 + ki * 2, L2 = Math.min(2, 53 - t2), c4 = CH[kickProg[ki]];
      var p = (t2 - 38) / 15;
      pad(t2, t2 + L2, c4.pad, { vol: 0.07 + 0.05 * p, att: 0.1, rel: 0.3, cut0: 500 + 2600 * p, cut1: 500 + 2600 * (p + 2 / 15), wet: 0.4 });
      for (s = 0; s < L2 / 0.125; s++) {
        pluck(t2 + s * 0.125, c4.arp[ARP_MIN[s % 8]], { vol: 0.06 + 0.02 * p, dur: 0.16, cut: 900 + 2200 * p, pan: (s % 2 ? 0.3 : -0.3), wet: 0.3 });
      }
      var step = p > 0.5 ? 0.125 : 0.25;
      for (e = 0; e < L2 / step; e++) bass(t2 + e * step, step * 0.7, c4.b, { vol: 0.19, drive: p > 0.5, cut: 700 });
      for (s = 0; s < L2 / 0.125; s++) hat(t2 + s * 0.125, s % 2 ? 0.025 : 0.045, { f: 9000, dec: 0.025, pan: 0.35 });
      kick(t2, 0.6); if (L2 > 0.875) kick(t2 + 0.875, 0.35); if (L2 > 1) kick(t2 + 1, 0.55);
      if (t2 >= 46) { snare(t2 + 0.5, 0.2); if (L2 > 1.5) snare(t2 + 1.5, 0.2); }
    }
    pad(45, 53, [69, 81], { vol: 0.05, att: 4, rel: 0.1, cut0: 900, cut1: 4500, wet: 0.5, lfo: 6 });
    riser(49, 53, 0.2, 250, 7000);
    for (var sr = 0; sr < 16; sr++) snare(51 + sr * 0.125, 0.06 + sr * 0.015, { dec: 0.12 });

    // ---- BLOWOUT 53–66: dramatic, heavy, dark; shear ram hit at 59; de-escalate ----
    boom(53, 0.85, { dur: 2.5 }); crash(53, 0.2); kick(53, 0.9);
    drone(53, 61.5, [26, 38, 45], 0.11, { cut: 300, cut1: 700, att: 0.3, rel: 2.5, trem: 2 });
    drone(53, 59, [51], 0.03, { cut: 900, att: 2, rel: 1 }); // dark b2 colour
    var blow = [['Dm', 53, 2], ['Bb', 55, 2], ['Gm', 57, 2]];
    for (var bi = 0; bi < blow.length; bi++) {
      var c5 = CH[blow[bi][0]], t3 = blow[bi][1];
      pad(t3, t3 + blow[bi][2] - 0.1, c5.pad, { vol: 0.1, att: 0.05, rel: 0.2, cut0: 1100, cut1: 900, wet: 0.45 });
      bass(t3, blow[bi][2] - 0.15, c5.b, { vol: 0.22, drive: true, cut: 600 });
      for (s = 0; s < 16; s++) {
        if (t3 + s * 0.125 >= 58.875) break;
        pluck(t3 + s * 0.125, c5.arp[0] - 12 + (s % 4 === 3 ? 12 : (s % 2 ? 7 : 0)), { vol: 0.07, dur: 0.15, cut: 900, wet: 0.2 });
      }
    }
    for (var bt4 = 53; bt4 < 58; bt4 += 0.5) {
      var beatI = Math.round((bt4 - 53) / 0.5);
      if (bt4 > 53) kick(bt4, 0.75);
      if (beatI % 2 === 1) snare(bt4, 0.35, { dec: 0.3, wet: 0.35 });
      tom(bt4 + 0.25, beatI % 4 === 3 ? 82 : 98, 0.3, { pan: beatI % 2 ? 0.3 : -0.3 });
      hat(bt4 + 0.25, 0.04);
    }
    var toms = [130, 130, 110, 110, 98, 98, 82, 82];
    for (var ti = 0; ti < 7; ti++) tom(58 + ti * 0.125, toms[ti], 0.32 + ti * 0.03, { pan: (ti % 2 ? 0.4 : -0.4), dec: 0.3 });
    riser(57, 58.95, 0.22, 300, 8000);
    // THE SHEAR RAM SLAM
    boom(59, 1.0, { dur: 2.6, wet: 0.55 }); kick(59, 1.0, { dec: 0.6 }); snare(59, 0.45, { dec: 0.6, wet: 0.5 }); crash(59, 0.28, { dec: 2.5 });
    pad(59, 60.2, CH.Dm.pad.concat([38, 45]), { vol: 0.15, att: 0.01, rel: 1.6, cut0: 2200, cut1: 300, wet: 0.6 });
    // de-escalation 60.5–66: warming toward major
    var calm = [['Bb', 60.5, 2], ['F', 62.5, 2], ['Asus4', 64.5, 0.75], ['A', 65.25, 0.75]];
    for (var ci = 0; ci < calm.length; ci++) {
      var c6 = CH[calm[ci][0]], t4 = calm[ci][1], L4 = calm[ci][2];
      pad(t4, t4 + L4, c6.pad, { vol: 0.075, att: ci === 0 ? 1.0 : 0.3, rel: 0.5, cut0: 800, cut1: 1400, wet: 0.55 });
      bass(t4, L4 - 0.05, c6.b, { vol: 0.13, att: 0.2 });
      for (s = 0; s < L4 / 0.5; s++) pluck(t4 + s * 0.5, c6.arp[(s * 2 + ci) % 4] + 12, { vol: 0.04, dur: 0.6, cut: 1500, pan: (s % 2 ? 0.5 : -0.5), wet: 0.6 });
    }
    for (var hb = 61; hb < 64.5; hb += 1) { kick(hb, 0.25, { dec: 0.35 }); kick(hb + 0.25, 0.15, { dec: 0.3 }); }
    riser(64.5, 66, 0.1, 500, 5000);

    // ---- SUMMARY 66–75: uplifting resolution, D major, clean ending ----
    crash(66, 0.15); boom(66, 0.3, { dur: 1.5 });
    var summ = [['G', 66, 2], ['A', 68, 2], ['Em7', 70, 1], ['Asus4', 71, 0.5], ['A', 71.5, 0.5]];
    for (var si = 0; si < summ.length; si++) {
      var c7 = CH[summ[si][0]], t5 = summ[si][1], L5 = summ[si][2];
      pad(t5, t5 + L5, c7.pad, { vol: 0.1, att: 0.05, rel: 0.25, cut0: 2400, cut1: 2800, wet: 0.5 });
      for (s = 0; s < L5 / 0.125; s++) {
        pluck(t5 + s * 0.125, c7.arp[ARP_UP[s % 8]] + (s % 8 >= 4 ? 12 : 0), { vol: 0.07, dur: 0.22, cut: 3000, pan: (s % 2 ? 0.4 : -0.4), wet: 0.4 });
      }
      for (e = 0; e < L5 / 0.25; e++) bass(t5 + e * 0.25, 0.2, c7.b, { vol: e % 2 ? 0.15 : 0.2 });
      for (var b5 = 0; b5 < L5 / 0.5; b5++) {
        var tb5 = t5 + b5 * 0.5, gb = Math.round((tb5 - 66) / 0.5);
        if (gb % 2 === 0) kick(tb5, 0.55); else snare(tb5, 0.2, { wet: 0.3 });
        hat(tb5 + 0.25, 0.05); hat(tb5, 0.025);
      }
    }
    snare(71.75, 0.15); snare(71.875, 0.2);
    // final chord
    kick(72, 0.6); crash(72, 0.16, { dec: 2.4 }); boom(72, 0.25, { dur: 2 });
    pad(72, 73.0, [50, 57, 62, 64, 66, 69, 74], { vol: 0.17, att: 0.02, rel: 1.5, cut0: 3500, cut1: 1000, wet: 0.65, width: 0.8 });
    bass(72, 1.0, 38, { vol: 0.2, rel: 1.0 });
    var fin = [74, 78, 81, 86];
    for (var fi = 0; fi < fin.length; fi++) bell(72 + fi * 0.09, fin[fi], 0.05, { dur: 2.2, pan: (fi - 1.5) * 0.3, wet: 0.7 });

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
