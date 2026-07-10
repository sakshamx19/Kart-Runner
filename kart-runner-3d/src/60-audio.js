'use strict';
/* ============================================================
   60-audio.js — WebAudio: synth engine hum, screech, UI blips
   ============================================================ */

const SFX = (() => {
  let ac = null, master = null;
  let eng = null; // engine nodes
  const ready = () => {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain();
        master.gain.value = DB.settings.muted ? 0 : 0.5;
        master.connect(ac.destination);
      } catch (e) { return false; }
    }
    if (ac.state === 'suspended') ac.resume();
    return true;
  };

  function setMuted(m) {
    DB.settings.muted = m; saveDB();
    if (master) master.gain.linearRampToValueAtTime(m ? 0 : 0.5, ac.currentTime + 0.1);
  }

  function startEngine() {
    if (!ready()) return;
    stopEngine();
    const o1 = ac.createOscillator(), o2 = ac.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'square';
    const g = ac.createGain(); g.gain.value = 0.0;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 2;
    // screech: filtered noise
    const nBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = nBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ac.createBufferSource(); noise.buffer = nBuf; noise.loop = true;
    const nf = ac.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2400; nf.Q.value = 4;
    const ng = ac.createGain(); ng.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
    noise.connect(nf); nf.connect(ng); ng.connect(master);
    o1.start(); o2.start(); noise.start();
    eng = { o1, o2, g, f, ng, paused: false };
  }
  function engine(speedN, throttle, sliding, boosting) {
    if (!eng || !ac || eng.paused) return;
    const t = ac.currentTime;
    const rpm = 0.15 + speedN * 0.85 + throttle * 0.08;
    const base = 52 + rpm * 165 + (boosting ? 30 : 0);
    eng.o1.frequency.setTargetAtTime(base, t, 0.05);
    eng.o2.frequency.setTargetAtTime(base * 1.5 + 3, t, 0.05);
    eng.f.frequency.setTargetAtTime(400 + rpm * 1900, t, 0.08);
    eng.g.gain.setTargetAtTime(0.05 + rpm * 0.075 + throttle * 0.02, t, 0.1);
    eng.ng.gain.setTargetAtTime(sliding > 0.3 ? 0.05 * sliding : 0, t, 0.06);
  }
  function pauseEngine(p) {
    if (!eng) return;
    eng.paused = p;
    eng.g.gain.setTargetAtTime(p ? 0 : 0.08, ac.currentTime, 0.05);
    eng.ng.gain.setTargetAtTime(0, ac.currentTime, 0.05);
  }
  function stopEngine() {
    if (!eng) return;
    try { eng.o1.stop(); eng.o2.stop(); } catch (e) {}
    try { eng.g.disconnect(); eng.ng.disconnect(); } catch (e) {}
    eng = null;
  }

  function tone(freq, dur, type = 'square', vol = 0.18, when = 0) {
    if (!ready()) return;
    const t = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  return {
    setMuted, get muted() { return DB.settings.muted; },
    startEngine, engine, stopEngine, pauseEngine,
    click: () => tone(660, 0.06, 'square', 0.1),
    blip: up => tone(up ? 880 : 330, 0.09, 'square', 0.12),
    beep: () => tone(440, 0.18, 'square', 0.2),
    go: () => { tone(880, 0.35, 'square', 0.22); tone(1320, 0.5, 'square', 0.14, 0.05); },
    lap: () => { tone(740, 0.1, 'triangle', 0.16); tone(988, 0.14, 'triangle', 0.16, 0.1); },
    thud: v => tone(90 + Math.random() * 40, 0.15, 'sawtooth', Math.min(0.3, 0.1 + v * 0.02)),
    pit: () => { tone(520, 0.08, 'square', 0.14); tone(660, 0.08, 'square', 0.14, 0.09); tone(880, 0.12, 'square', 0.14, 0.18); },
    finish: won => {
      const seq = won ? [523, 659, 784, 1047, 784, 1047] : [523, 659, 784];
      seq.forEach((fq, i) => tone(fq, 0.22, 'triangle', 0.2, i * 0.13));
    },
  };
})();
