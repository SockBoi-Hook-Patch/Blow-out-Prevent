/* audio.js — 8-bit chiptune + SFX for the BOP animation (WebAudio, no deps).
 * Global: window.ChipMusic = { init, start(t0), stop, setMuted(bool), sfx(name), now() }
 * Original composition. 120 BPM, 4/4, 30 bars = 60.0 s exact, seamless loop.
 *
 * Song map (bar = 2 s, 16th = 0.125 s):
 *   bars  0-2   0-6 s   INTRO      Am  Fmaj7 E        calm, sparse, echoing arps, sea swells
 *   bars  3-7   6-16 s  EXPLAINER  C Am F G G7        curious bouncy theme
 *   bars  8-11 16-24 s  DRILLING   Am Am F G          steady groove, 16th riff, full kit
 *   bars 12-18 24-37 s  KICK       Dm Dm Bb A Dm E E7 tense minor build, heartbeat kick, riser at 36 s
 *   bars 18-22 37-46 s  BLOWOUT    Am|F Dm|E ...      fast 16th arps, driving drums, crashes
 *   bars 23-24 46-50 s  SEAL       F|Dm Gsus4|G       easing (half-time), snare fill into...
 *   bars 25-29 50-60 s  RESOLVE    C F|G C|Am F|G C   triumphant major, thins out into bar 0
 */
(function (root) {
  'use strict';

  var BPM = 120;
  var S = 60 / BPM / 4;          // one 16th = 0.125 s
  var STEPS = 480;               // 30 bars * 16
  var LOOP = STEPS * S;          // 60.0 s
  var LOOKAHEAD = 0.2;
  var TICK_MS = 25;
  var MASTER_VOL = 0.25;

  var AC = root && (root.AudioContext || root.webkitAudioContext);

  var ctx = null, master = null, musicGain = null, sfxGain = null, musicBus = null;
  var noiseBuf = null, waves = {};
  // Active render engine {ctx, noiseBuf, waves}: set synchronously before any
  // scheduling call, so the same voice/sequencer code drives live and offline contexts.
  var E = null, liveE = null;
  var muted = false, running = false, timer = null;
  var startTime = 0, nextK = 0, nextTime = 0;

  // ---------------------------------------------------------------- music data
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  var NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function noteToMidi(n) {
    var m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
    if (!m) return null;
    var pc = NOTE_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return 12 * (parseInt(m[3], 10) + 1) + pc;
  }

  var CHORD_TYPES = {
    '': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'm7': [0, 3, 7, 10],
    'maj7': [0, 4, 7, 11], 'sus4': [0, 5, 7]
  };
  function parseChord(name) {
    var m = /^([A-G])(#|b)?(.*)$/.exec(name);
    var pc = NOTE_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    pc = (pc + 12) % 12;
    return { pc: pc, iv: CHORD_TYPES[m[3]] || CHORD_TYPES[''] };
  }

  // One entry per bar; "X|Y" = two chords, one per half bar.
  var BAR_CHORDS = [
    'Am', 'Fmaj7', 'E',                       // 0-2   intro
    'C', 'Am', 'F', 'G', 'G7',                // 3-7   explainer
    'Am', 'Am', 'F', 'G',                     // 8-11  drilling
    'Dm', 'Dm', 'Bb', 'A', 'Dm', 'E',         // 12-17 kick (tense)
    'E7|Am', 'Am|F', 'Dm|E', 'Am|F', 'Dm|E',  // 18-22 blowout
    'F|Dm', 'Gsus4|G',                        // 23-24 shear rams seal
    'C', 'F|G', 'C|Am', 'F|G', 'C'            // 25-29 resolution
  ];
  var HALF_CHORDS = [];
  BAR_CHORDS.forEach(function (b) {
    var p = b.split('|');
    HALF_CHORDS.push(parseChord(p[0]));
    HALF_CHORDS.push(parseChord(p[1] || p[0]));
  });

  // Lead melody per bar: "NOTE:len16ths" tokens, "-" = rest. Each bar sums to 16.
  var LEAD_BARS = {
    0: '-:8 E5:4 A5:4',
    1: 'C6:8 B5:4 A5:4',
    2: 'B5:8 G#5:8',
    3: 'E5:2 G5:2 C6:3 B5:1 G5:4 E5:2 D5:2',
    4: 'C5:2 E5:2 A5:3 G5:1 E5:6 D5:2',
    5: 'F5:2 A5:2 C6:2 A5:2 G5:2 F5:2 E5:2 F5:2',
    6: 'G5:3 F5:1 E5:2 D5:2 B4:4 -:2 D5:2',
    7: 'F5:2 E5:2 D5:2 B4:2 G4:2 A4:2 B4:2 D5:2',
    8: 'A4:6 C5:2 E5:4 D5:4',
    9: 'C5:6 B4:2 A4:8',
    10: 'A4:6 C5:2 F5:4 E5:4',
    11: 'D5:6 B4:2 G4:4 B4:4',
    12: 'D5:12 F5:4',
    13: 'E5:8 C5:8',
    14: 'D5:12 F5:2 G5:2',
    15: 'A5:8 C#6:8',
    16: 'D6:12 C6:2 A5:2',
    17: 'G#5:8 B5:8',
    18: 'E5:1 F5:1 F#5:1 G5:1 G#5:1 A5:1 A#5:1 B5:1 A5:2 C6:2 E6:2 A6:2',
    19: 'A6:3 E6:3 C6:2 F6:4 C6:4',
    20: 'D6:3 F6:3 A6:2 G#6:4 E6:4',
    21: 'A6:3 E6:3 C6:2 F6:2 E6:2 C6:2 A5:2',
    22: 'D6:2 E6:2 F6:2 D6:2 B5:2 G#5:2 E5:2 G#5:2',
    23: 'A5:8 F5:4 A5:4',
    24: 'G5:8 D6:4 B5:4',
    25: 'C5:2 E5:2 G5:2 C6:6 B5:2 C6:2',
    26: 'A5:4 C6:2 A5:2 B5:4 D6:2 B5:2',
    27: 'C6:3 B5:1 G5:2 E5:2 A5:4 C6:4',
    28: 'F6:4 E6:2 D6:2 D6:3 E6:1 F6:2 D6:2',
    29: 'E6:8 C6:4 -:4'
  };
  var LEAD = new Array(STEPS);
  Object.keys(LEAD_BARS).forEach(function (k) {
    var pos = parseInt(k, 10) * 16;
    LEAD_BARS[k].split(/\s+/).forEach(function (tok) {
      var p = tok.split(':'), len = parseInt(p[1], 10);
      if (p[0] !== '-') LEAD[pos] = { m: noteToMidi(p[0]), d: len };
      pos += len;
    });
  });

  function sectionAt(t) {
    if (t < 6) return 'intro';
    if (t < 16) return 'explain';
    if (t < 24) return 'drill';
    if (t < 37) return 'tense';
    if (t < 46) return 'danger';
    if (t < 50) return 'ease';
    return 'triumph';
  }

  function arpNote(ch, i, base) {
    var n = ch.iv.length;
    return base + ch.pc + ch.iv[i % n] + 12 * Math.floor(i / n);
  }

  // ---------------------------------------------------------------- voices
  function pulseWave(duty) {
    var ctx = E.ctx, waves = E.waves;
    if (waves[duty]) return waves[duty];
    var N = 64, re = new Float32Array(N), im = new Float32Array(N);
    for (var n = 1; n < N; n++) re[n] = 2 * Math.sin(n * Math.PI * duty) / (n * Math.PI);
    waves[duty] = ctx.createPeriodicWave(re, im);
    return waves[duty];
  }

  // wave: number = pulse duty, or OscillatorNode type string
  function tone(time, freq, dur, vol, wave, dest, opt) {
    opt = opt || {};
    var ctx = E.ctx;
    var o = ctx.createOscillator();
    if (typeof wave === 'number') {
      try { o.setPeriodicWave(pulseWave(wave)); } catch (e) { o.type = 'square'; }
    } else o.type = wave;
    o.frequency.setValueAtTime(freq, time);
    if (opt.slideTo) o.frequency.exponentialRampToValueAtTime(opt.slideTo, time + (opt.slideTime || dur));
    var g = ctx.createGain();
    var a = 0.004, rel = Math.min(0.03, dur * 0.3);
    var sus = opt.sustain == null ? 0.75 : opt.sustain;
    var dEnd = time + a + Math.max(0.001, Math.min(0.1, (dur - a - rel) * 0.5));
    var rStart = Math.max(dEnd + 0.001, time + dur - rel);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + a);
    g.gain.linearRampToValueAtTime(vol * sus, dEnd);
    g.gain.linearRampToValueAtTime(vol * sus, rStart);
    g.gain.linearRampToValueAtTime(0, rStart + rel);
    var lfo = null;
    if (opt.vibrato && dur > 0.45) {
      lfo = ctx.createOscillator();
      var lg = ctx.createGain();
      lfo.frequency.value = 6;
      lg.gain.setValueAtTime(0, time);
      lg.gain.linearRampToValueAtTime(freq * 0.012, time + 0.35);
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(time); lfo.stop(rStart + rel + 0.02);
    }
    o.connect(g); g.connect(dest);
    o.start(time); o.stop(rStart + rel + 0.02);
    o.onended = function () { try { o.disconnect(); g.disconnect(); } catch (e) {} };
  }

  function noise(time, dur, vol, ftype, ffreq, dest, opt) {
    opt = opt || {};
    var ctx = E.ctx;
    var src = ctx.createBufferSource();
    src.buffer = E.noiseBuf; src.loop = true;
    if (opt.rate) {
      src.playbackRate.setValueAtTime(opt.rate, time);
      if (opt.rateTo) src.playbackRate.exponentialRampToValueAtTime(opt.rateTo, time + dur);
    }
    var f = ctx.createBiquadFilter();
    f.type = ftype; f.frequency.setValueAtTime(ffreq, time);
    if (opt.freqTo) f.frequency.exponentialRampToValueAtTime(opt.freqTo, time + dur);
    if (opt.q) f.Q.value = opt.q;
    var g = ctx.createGain();
    if (opt.attack) {
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(vol, time + opt.attack);
    } else {
      g.gain.setValueAtTime(vol, time);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(time, Math.random() * 1.5);
    src.stop(time + dur + 0.02);
    src.onended = function () { try { src.disconnect(); f.disconnect(); g.disconnect(); } catch (e) {} };
  }

  function kick(t, v, d) {
    tone(t, 160, 0.16, v, 'triangle', d, { slideTo: 42, slideTime: 0.12, sustain: 0.6 });
    noise(t, 0.025, v * 0.3, 'lowpass', 2500, d);
  }
  function snare(t, v, d) {
    noise(t, 0.14, v, 'highpass', 1200, d);
    tone(t, 230, 0.05, v * 0.3, 0.5, d, { slideTo: 120 });
  }
  function hat(t, v, d, open) { noise(t, open ? 0.14 : 0.035, v, 'highpass', 7000, d); }
  function crash(t, v, d) { noise(t, 0.9, v, 'highpass', 3500, d); }

  // ---------------------------------------------------------------- step sequencer
  function scheduleStep(s, time, d) {
    var bar = s >> 4, st = s & 15, t = s * S;
    var sec = sectionAt(t);
    var ch = HALF_CHORDS[s >> 3];
    var bass = 36 + ch.pc;                 // octave 2
    var even = (st % 2 === 0);

    // ---- lead (pulse 1)
    var ev = LEAD[s];
    if (ev) {
      var duty = 0.25, lv = 0.12;
      if (sec === 'intro') lv = 0.09;
      else if (sec === 'drill') { duty = 0.5; lv = 0.09; }
      else if (sec === 'danger') { duty = 0.5; lv = 0.1; }
      else if (sec === 'tense') lv = 0.08 + 0.04 * ((t - 24) / 13);
      tone(time, mtof(ev.m), ev.d * S * 0.92, lv, duty, d, { vibrato: true });
      if (sec === 'intro' || sec === 'triumph') // soft echo on pulse 2
        tone(time + 3 * S, mtof(ev.m), ev.d * S * 0.8, lv * 0.3, 0.125, d, { vibrato: false });
    }

    switch (sec) {
      case 'intro':
        if (st === 0) {
          tone(time, mtof(bass + 12 - (ch.pc > 6 ? 12 : 0)), 16 * S * 0.97, 0.28, 'triangle', d, { sustain: 0.85 });
          noise(time, 1.9, 0.06, 'lowpass', 700, d, { attack: 0.8, freqTo: 300 }); // sea swell
        }
        if (even) {
          var ia = [0, 1, 2, 3, 2, 1, 2, 3][st / 2];
          tone(time, mtof(arpNote(ch, ia, 60)), S * 1.6, 0.05, 0.125, d);
        }
        if (bar === 2 && st >= 12) hat(time, 0.02 + (st - 12) * 0.01, d);
        break;

      case 'explain':
        if (even) {
          tone(time, mtof(bass + (st % 4 === 0 ? 12 : 19)), S * 1.4, 0.3, 'triangle', d);
          tone(time, mtof(arpNote(ch, (st / 2) % 4, 60)), S * 0.9, 0.04, 0.5, d);
          hat(time, st % 4 === 2 ? 0.05 : 0.03, d);
        }
        if (st === 0 || st === 10) kick(time, 0.35, d);
        if (st === 4 || st === 12) snare(time, 0.12, d);
        break;

      case 'drill':
        if (even) tone(time, mtof(bass + (st % 4 === 0 ? 0 : 12)), S * 1.5, 0.32, 'triangle', d);
        var RIFF = [0, null, 0, 12, null, 0, 7, null, 0, null, 0, 12, null, 7, 12, null];
        if (RIFF[st] !== null) tone(time, mtof(48 + ch.pc + RIFF[st]), S * 0.7, 0.06, 0.125, d, { sustain: 0.5 });
        if (st === 0 || st === 8 || st === 6) kick(time, 0.42, d);
        if (st === 4 || st === 12) snare(time, 0.18, d);
        hat(time, st % 4 === 2 ? 0.07 : 0.035, d);
        if (bar === 8 && st === 0) crash(time, 0.08, d);
        break;

      case 'tense':
        var c = Math.min(1, (t - 24) / 12);
        if (t >= 36) { // riser into blowout
          snare(time, 0.08 + (st / 8) * 0.14, d);
          if (even) kick(time, 0.4, d);
          tone(time, mtof(bass + st), S * 0.9, 0.3, 'triangle', d);
          break;
        }
        if (even) tone(time, mtof(bass), S * 1.5, 0.3, 'triangle', d);
        var OST = [0, 7, 12, 7];
        tone(time, mtof(50 + ch.pc % 12 - (ch.pc > 6 ? 12 : 0) + OST[st % 4] + (ch.iv[1] === 3 && st % 4 === 3 ? -4 : 0)),
          S * 0.8, 0.035 + 0.035 * c, 0.25, d, { sustain: 0.5 });
        if (st % 8 === 0 || st % 8 === 2) kick(time, (st % 8 === 0 ? 0.45 : 0.3), d); // heartbeat
        if (c > 0.35 && st % 4 === 2) hat(time, 0.03 + 0.03 * c, d);
        if (t >= 30 && (st === 4 || st === 12)) snare(time, 0.1 + 0.06 * c, d);
        break;

      case 'danger':
        var ARP = [0, 1, 2, 3, 4, 5, 4, 3];
        tone(time, mtof(arpNote(ch, ARP[st % 8], 72)), S * 0.85, 0.06, 0.25, d, { sustain: 0.6 });
        if (even) tone(time, mtof(bass + (st % 4 === 0 ? 0 : 12)), S * 1.4, 0.34, 'triangle', d);
        if (st % 4 === 0 || st === 10) kick(time, 0.45, d);
        if (st === 4 || st === 12) snare(time, 0.22, d);
        if (st === 15 && bar % 2 === 0) snare(time, 0.12, d);
        hat(time, st % 4 === 2 ? 0.06 : 0.04, d, st % 4 === 2);
        if (s === 296 || (st === 0 && bar % 2 === 1)) crash(time, 0.12, d);
        break;

      case 'ease':
        if (even) tone(time, mtof(arpNote(ch, (st / 2) % 6, 72)), S * 1.6, 0.045, 0.25, d);
        if (st % 8 === 0) tone(time, mtof(bass), 8 * S * 0.95, 0.3, 'triangle', d, { sustain: 0.8 });
        if (st === 0 || st === 8) kick(time, 0.35, d);
        if (bar === 24 && st >= 12) snare(time, 0.08 + (st - 12) * 0.04, d); // fill into resolution
        else if (st === 12) snare(time, 0.12, d);
        if (even) hat(time, 0.025, d);
        if (s === 368) crash(time, 0.06, d);
        break;

      case 'triumph':
        if (bar === 29) { // wind down so bar 0 follows cleanly
          if (st === 0) { tone(time, mtof(bass), 8 * S, 0.3, 'triangle', d, { sustain: 0.7 }); kick(time, 0.3, d); crash(time, 0.08, d); }
          if (st === 12) tone(time, mtof(40), 4 * S * 0.9, 0.18, 'triangle', d, { sustain: 0.7 }); // E2 pickup into Am
          break;
        }
        if (even) {
          tone(time, mtof(bass + [0, 7, 12, 7][(st / 2) % 4]), S * 1.4, 0.32, 'triangle', d);
          tone(time, mtof(arpNote(ch, (st / 2) % 4, 60)), S * 0.9, 0.04, 0.5, d);
          hat(time, st % 4 === 2 ? 0.05 : 0.03, d);
        }
        if (st === 0 || st === 8) kick(time, 0.4, d);
        if (st === 4 || st === 12) snare(time, 0.16, d);
        if (bar === 25 && st === 0) crash(time, 0.12, d);
        break;
    }
  }

  function tick() {
    if (!running || !ctx) return;
    try {
      var now = ctx.currentTime;
      // after tab throttling, skip stale steps instead of bursting them
      while (nextTime < now - 0.05) { nextK++; nextTime = startTime + nextK * S; }
      E = liveE;
      while (nextTime < now + LOOKAHEAD) {
        scheduleStep(((nextK % STEPS) + STEPS) % STEPS, nextTime, musicBus);
        nextK++;
        nextTime = startTime + nextK * S;
      }
    } catch (e) { /* never throw from the scheduler */ }
  }

  // ---------------------------------------------------------------- SFX
  var SFX = {
    alarm: function (t, d) {
      var ctx = E.ctx;
      var o = ctx.createOscillator(), g = ctx.createGain();
      try { o.setPeriodicWave(pulseWave(0.5)); } catch (e) { o.type = 'square'; }
      for (var i = 0; i < 8; i++) {
        var f = i % 2 ? 660 : 880, ti = t + i * 0.15;
        o.frequency.setValueAtTime(f, ti);
        o.frequency.linearRampToValueAtTime(f * 1.06, ti + 0.14);
      }
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.01);
      g.gain.setValueAtTime(0.16, t + 1.15);
      g.gain.linearRampToValueAtTime(0, t + 1.2);
      o.connect(g); g.connect(d);
      o.start(t); o.stop(t + 1.22);
      o.onended = function () { try { o.disconnect(); g.disconnect(); } catch (e) {} };
    },
    kick: function (t, d) {
      tone(t, 110, 0.18, 0.22, 0.25, d, { slideTo: 330 });
      tone(t + 0.22, 110, 0.26, 0.22, 0.25, d, { slideTo: 440 });
    },
    close: function (t, d) {
      tone(t, 140, 0.25, 0.5, 'triangle', d, { slideTo: 45, sustain: 0.5 });
      noise(t, 0.3, 0.45, 'lowpass', 900, d, { freqTo: 150 });
      tone(t, 95, 0.05, 0.12, 0.5, d);
      noise(t + 0.07, 0.06, 0.15, 'bandpass', 2600, d, { q: 4 }); // metal clink
    },
    boom: function (t, d) {
      noise(t, 0.08, 0.35, 'highpass', 2000, d);
      noise(t, 1.5, 0.7, 'lowpass', 4000, d, { freqTo: 120, rate: 1, rateTo: 0.25 });
      tone(t, 90, 1.0, 0.5, 'triangle', d, { slideTo: 28, sustain: 0.5 });
    },
    fire: function (t, d) {
      noise(t, 1.0, 0.15, 'lowpass', 500, d, { attack: 0.1 });
      for (var i = 0; i < 28; i++) {
        noise(t + Math.random() * 0.95, 0.02 + Math.random() * 0.04, 0.08 + Math.random() * 0.18,
          'bandpass', 1500 + Math.random() * 4000, d, { q: 2 });
      }
    },
    pump: function (t, d) {
      for (var i = 0; i < 4; i++) {
        var ti = t + i * 0.25;
        tone(ti, 95, 0.12, 0.35, 'triangle', d, { slideTo: 55, sustain: 0.5 });
        noise(ti, 0.1, 0.2, 'lowpass', 900, d);
        noise(ti + 0.12, 0.05, 0.06, 'highpass', 4000, d); // valve hiss
      }
    },
    success: function (t, d) {
      [72, 76, 79, 84].forEach(function (m, i) { tone(t + i * 0.07, mtof(m), 0.09, 0.14, 0.25, d); });
      tone(t + 0.3, mtof(84), 0.4, 0.13, 0.25, d, { vibrato: false });
      tone(t + 0.3, mtof(88), 0.4, 0.09, 0.5, d);
      tone(t + 0.3, mtof(60), 0.4, 0.3, 'triangle', d);
    },
    blip: function (t, d) {
      tone(t, 1320, 0.05, 0.12, 0.5, d);
      tone(t + 0.05, 1760, 0.04, 0.08, 0.5, d);
    }
  };

  // ---------------------------------------------------------------- public API
  function makeBus() {
    var b = ctx.createGain();
    b.gain.value = 1;
    b.connect(musicGain);
    return b;
  }

  function makeNoiseBuffer(c) {
    var len = Math.floor(c.sampleRate * 2);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    // NES-ish noise: sample-and-hold white noise for a gritty texture
    var v = 0;
    for (var i = 0; i < len; i++) { if (i % 2 === 0) v = Math.random() * 2 - 1; data[i] = v; }
    return buf;
  }

  // Offline render of exactly one 60 s loop + SFX cues -> 16-bit PCM stereo WAV bytes.
  // Renders 60 s + TAIL, then folds the tail back onto the start so the file loops seamlessly.
  function renderWav(cues) {
    var P = root && root.Promise;
    try {
      var OAC = root && (root.OfflineAudioContext || root.webkitOfflineAudioContext);
      if (!OAC) return P ? P.reject(new Error('OfflineAudioContext unavailable')) : null;
      var RATE = 48000, TAIL = 3, CH = 2;
      var N = Math.round(LOOP * RATE), total = N + TAIL * RATE;
      var oc = new OAC(CH, total, RATE);
      var prevE = E;
      E = { ctx: oc, noiseBuf: makeNoiseBuffer(oc), waves: {} };
      var mg = oc.createGain(); mg.gain.value = 0.8; mg.connect(oc.destination);
      var sg = oc.createGain(); sg.gain.value = 1.0; sg.connect(oc.destination);
      try {
        for (var s = 0; s < STEPS; s++) scheduleStep(s, s * S, mg);
        (cues || []).forEach(function (c) {
          if (!c || !Object.prototype.hasOwnProperty.call(SFX, c.sfx)) return;
          var t = Number(c.t);
          if (!isFinite(t)) return;
          t = ((t % LOOP) + LOOP) % LOOP;
          try { SFX[c.sfx](t, sg); } catch (e) {}
        });
      } finally { E = prevE; }
      return oc.startRendering().then(function (buf) {
        var chans = [], peak = 0, i, c;
        for (c = 0; c < CH; c++) {
          var src = buf.getChannelData(Math.min(c, buf.numberOfChannels - 1));
          var out = new Float32Array(N);
          out.set(src.subarray(0, N));
          for (i = N; i < src.length; i++) out[i - N] += src[i]; // wrap tail onto start
          for (i = 0; i < N; i++) { var a = Math.abs(out[i]); if (a > peak) peak = a; }
          chans.push(out);
        }
        var gain = peak > 0 ? Math.pow(10, -1 / 20) / peak : 1; // normalize to -1 dBFS
        return encodeWav(chans, RATE, gain);
      });
    } catch (e) {
      return P ? P.reject(e) : null;
    }
  }

  function encodeWav(chans, rate, gain) {
    var nc = chans.length, n = chans[0].length, bytes = n * nc * 2;
    var ab = new ArrayBuffer(44 + bytes), dv = new DataView(ab);
    function str(o, x) { for (var i = 0; i < x.length; i++) dv.setUint8(o + i, x.charCodeAt(i)); }
    str(0, 'RIFF'); dv.setUint32(4, 36 + bytes, true); str(8, 'WAVE');
    str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
    dv.setUint16(22, nc, true); dv.setUint32(24, rate, true);
    dv.setUint32(28, rate * nc * 2, true); dv.setUint16(32, nc * 2, true); dv.setUint16(34, 16, true);
    str(36, 'data'); dv.setUint32(40, bytes, true);
    var o = 44;
    for (var i = 0; i < n; i++) {
      for (var c = 0; c < nc; c++) {
        var v = chans[c][i] * gain;
        v = v > 1 ? 1 : v < -1 ? -1 : v;
        dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
      }
    }
    return new Uint8Array(ab);
  }

  var ChipMusic = {
    init: function () {
      try {
        if (!ctx) {
          if (!AC) return false;
          ctx = new AC();
          master = ctx.createGain();
          master.gain.value = muted ? 0 : MASTER_VOL;
          var out = ctx.destination;
          try {
            var comp = ctx.createDynamicsCompressor();
            comp.threshold.value = -10; comp.knee.value = 10; comp.ratio.value = 4;
            comp.attack.value = 0.003; comp.release.value = 0.15;
            comp.connect(out); out = comp;
          } catch (e) {}
          master.connect(out);
          musicGain = ctx.createGain(); musicGain.gain.value = 0.8; musicGain.connect(master);
          sfxGain = ctx.createGain(); sfxGain.gain.value = 1.0; sfxGain.connect(master);
          noiseBuf = makeNoiseBuffer(ctx);
          liveE = { ctx: ctx, noiseBuf: noiseBuf, waves: waves };
        }
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
        return true;
      } catch (e) { ctx = null; return false; }
    },

    start: function (t0) {
      try {
        if (!ctx && !ChipMusic.init()) return;
        if (!ctx) return;
        if (running) ChipMusic.stop();
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
        t0 = Number(t0);
        if (!isFinite(t0)) t0 = 0;
        t0 = ((t0 % LOOP) + LOOP) % LOOP;
        var k0 = Math.round(t0 / S) % STEPS;
        musicBus = makeBus();
        nextK = k0;
        startTime = ctx.currentTime + 0.06 - k0 * S;
        nextTime = startTime + nextK * S;
        running = true;
        tick();
        timer = setInterval(tick, TICK_MS);
      } catch (e) {}
    },

    stop: function () {
      running = false;
      if (timer) { clearInterval(timer); timer = null; }
      try {
        if (ctx && musicBus) {
          var b = musicBus, n = ctx.currentTime;
          b.gain.cancelScheduledValues(n);
          b.gain.setValueAtTime(b.gain.value, n);
          b.gain.linearRampToValueAtTime(0, n + 0.05);
          setTimeout(function () { try { b.disconnect(); } catch (e) {} }, 400);
        }
      } catch (e) {}
      musicBus = null;
    },

    setMuted: function (m) {
      muted = !!m;
      try {
        if (ctx && master) {
          var n = ctx.currentTime;
          master.gain.cancelScheduledValues(n);
          master.gain.setValueAtTime(master.gain.value, n);
          master.gain.linearRampToValueAtTime(muted ? 0 : MASTER_VOL, n + 0.08);
        }
      } catch (e) {}
    },

    sfx: function (name) {
      try {
        if (!ctx || !sfxGain || !Object.prototype.hasOwnProperty.call(SFX, name)) return;
        E = liveE;
        SFX[name](ctx.currentTime + 0.01, sfxGain);
      } catch (e) {}
    },

    now: function () {
      if (!running || !ctx) return null;
      var p = (ctx.currentTime - startTime) % LOOP;
      if (p < 0) p += LOOP;
      return p;
    },

    renderWav: renderWav,

    LOOP: LOOP,
    BPM: BPM
  };

  if (root) root.ChipMusic = ChipMusic;
})(typeof window !== 'undefined' ? window : this);
