'use strict';
/* ============================================================
   50-race.js — race controller: loop, HUD, camera, results
   ============================================================ */

const Input = { throttle: 0, brake: 0, left: 0, right: 0, drift: false };

const Race = {
  active: false, paused: false,
  mode: 'race',            // 'race' | 'weekly' | 'training'
  cfg: null, track: null,
  karts: [], player: null, ais: [],
  raceT: 0, state: 'grid', goTime: 0,
  renderer: null, particles: [],
  acc: 0, lastTs: 0, rafId: 0,
  hud: {}, summary: null,
  ghost: null, ghostBuf: [], ghostStep: 0,
  camRot: 0,
  toastQueue: [],
  finishTimer: 0,
  lastPosSeen: 1,
};

/* ---------------- setup ---------------- */
function startRace(cfg) {
  // cfg: { trackId, laps, mode, lobby: rival[], compound }
  if (typeof screenCleanup === 'function') { screenCleanup(); screenCleanup = null; }
  const track = TRACKS[cfg.trackId];
  Race.cfg = cfg; Race.mode = cfg.mode || 'race';
  Race.track = track;
  Race.raceT = 0; Race.state = 'grid';
  Race.goTime = 4.2 + Math.random() * 0.9;
  Race.particles = [];
  Race.karts = []; Race.ais = [];
  Race.summary = null; Race.finishTimer = 0;
  Race.toastQueue = [];

  const p = DB.profile;
  const mods = skillMods(p.skills);
  const training = Race.mode === 'training';
  const online = Race.mode === 'online';

  const player = new Kart({
    isPlayer: true, id: online ? NET.myId : 'me', name: p.name || 'RACER', color: p.color, number: p.number,
    flag: p.flag, elo: p.elo, clanTag: clanTagOf(p), mods, track,
    compound: cfg.compound, assists: { ...DB.settings.assists },
  });
  player.pitNextCompound = cfg.compound;
  Race.player = player;
  Race.karts.push(player);

  if (online) {
    for (const pr of (cfg.roster || NET.playerList)) {
      if (pr.id === NET.myId) continue;
      Race.karts.push(new RemoteKart(pr, track));
    }
    Race.goTime = 4.0;   // fixed, so every browser launches together
    wireNetForRace();
  } else if (!training) {
    const lobby = cfg.lobby || pickLobby();
    lobby.forEach((rv, i) => {
      const kart = new Kart({
        id: rv.id, name: rv.name, color: rv.color, number: 2 + i * 11 % 90, flag: rv.flag,
        elo: rv.elo, clanTag: clanTagOf(rv), mods: skillMods([]), track,
        compound: cfg.laps >= 7 ? (Math.random() < 0.5 ? 'medium' : 'hard') : (Math.random() < 0.45 ? 'soft' : 'medium'),
      });
      kart.pitNextCompound = 'medium';
      Race.karts.push(kart);
      Race.ais.push(new AIDriver(kart, rv, cfg.laps));
    });
  }

  // grid order: online = host's published order; offline = shuffled
  const slots = track.gridSlots;
  let order;
  if (online && cfg.grid) {
    order = cfg.grid.map(id => Race.karts.find(k => k.id === id)).filter(Boolean);
    for (const k of Race.karts) if (!order.includes(k)) order.push(k);
  } else {
    order = [...Race.karts];
    for (let i = order.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[order[i], order[j]] = [order[j], order[i]]; }
  }
  order.forEach((k, i) => { k.placeAt(slots[training ? 0 : i]); k.pos = i + 1; });

  // ghost
  Race.ghost = training && DB.ghosts[cfg.trackId] || null;
  Race.ghostBuf = []; Race.ghostStep = 0;

  // canvas + renderer
  const layer = document.getElementById('race-layer');
  layer.hidden = false;
  const cv = document.getElementById('race-canvas');
  Race.renderer = new Renderer(cv, track);
  Race.renderer.clearSkids();
  Race.camRot = player.heading;
  Race.renderer.cam.x = player.x; Race.renderer.cam.y = player.y;

  buildHUD();
  Race.active = true; Race.paused = false;
  Race.lastTs = 0; Race.acc = 0;
  Race.lastPosSeen = Race.karts.length;
  SFX.startEngine();
  cancelAnimationFrame(Race.rafId);
  Race.rafId = requestAnimationFrame(raceLoop);

  // online: if the tab is backgrounded, rAF stops — keep the sim and the
  // pose stream alive on a timer so the room doesn't see us freeze
  clearInterval(Race.bgTick);
  if (online) {
    Race.bgTick = setInterval(() => {
      if (!Race.active) return;
      const now = performance.now();
      if (now - Race.lastTs < 350) return;    // rAF is healthy
      Race.acc += (now - Race.lastTs) / 1000;
      Race.lastTs = now;
      Race.acc = Math.min(Race.acc, 1.2);
      let steps = 0;
      while (Race.acc >= DT && steps < 150) { stepSim(); Race.acc -= DT; steps++; }
    }, 250);
  }
}

/* world event hooks (physics → juice) */
const WORLD = {
  get raceT() { return Race.raceT; },
  onWallHit(kart, v) {
    if (!kart.isPlayer) return;
    Race.renderer.cam.shake = Math.min(0.6, v * 0.05);
    SFX.thud(v);
    spawnSparks(kart.x, kart.y, 6);
  },
  onBump(v) { Race.renderer.cam.shake = Math.min(0.4, v * 0.04); SFX.thud(v * 0.7); },
  onLap(kart, lt) {
    if (kart.isPlayer) {
      const total = Race.cfg.laps;
      if (kart.lap > total && !kart.finished) return; // finish handled in step
      if (kart.lap <= total) {
        const pb = kart.lapTimes.length > 1 && lt <= Math.min(...kart.lapTimes.slice(0, -1));
        toast(fmtTime(lt) + (pb ? ' · PERSONAL BEST!' : ''), pb ? 'good' : '');
        if (kart.lap === total) centerMsg('FINAL LAP', 'med');
        SFX.lap();
      }
      // friends room: tell the others
      if (Race.mode === 'online' && kart.lap <= total + 1) {
        NET.sendLap(Math.round(lt * 1000), Math.round((kart.bestLap || lt) * 1000));
      }
      // training ghost: keep best lap
      if (Race.mode === 'training') {
        if (Race.ghostBuf.length > 10 && (!Race.ghost || lt < Race.ghost.lapMs)) {
          Race.ghost = { dt: DT * 4, pts: Race.ghostBuf.slice(), lapMs: lt };
          DB.ghosts[Race.cfg.trackId] = Race.ghost;
          toast('GHOST UPDATED', 'good');
        }
        Race.ghostBuf = [];
      }
    }
  },
  onPitEnter(kart) { if (kart.isPlayer) toast('PIT LANE — LIMITER ON', 'warn'); },
  onPitDone(kart) { if (kart.isPlayer) { toast('TYRES: ' + kart.compound.name + ' ✓', 'good'); SFX.pit(); } },
};

/* ---------------- main loop ---------------- */
function raceLoop(ts) {
  if (!Race.active) return;
  Race.rafId = requestAnimationFrame(raceLoop);
  if (!Race.lastTs) Race.lastTs = ts;
  let frame = (ts - Race.lastTs) / 1000;
  Race.lastTs = ts;
  if (Race.paused && Race.mode !== 'online') return;  // online races never freeze
  frame = Math.min(frame, 0.1);
  Race.acc += frame;
  let steps = 0;
  while (Race.acc >= DT && steps < 12) { stepSim(); Race.acc -= DT; steps++; }
  drawFrame(frame);
}

function stepSim() {
  const R = Race, tr = R.track;
  const wasGrid = R.state === 'grid';
  R.raceT += DT;

  if (R.state === 'grid') {
    const t = R.raceT;
    const lights = Math.min(5, Math.floor(t / 0.75));
    updateLights(lights, false);
    if (t >= R.goTime) {
      R.state = 'racing';
      R.raceT = 0;
      for (const k of R.karts) k.lapStart = 0;
      updateLights(5, true);
      centerMsg('GO!', 'big');
      SFX.go();
      setTimeout(() => updateLights(-1, false), 900);
    } else {
      const prevLights = Math.min(5, Math.floor((t - DT) / 0.75));
      if (lights > prevLights && lights <= 5) SFX.beep();
    }
  }

  const racing = R.state !== 'grid';

  // AI decisions at 60 Hz
  if ((R._aiTick = (R._aiTick || 0) + 1) % 2 === 0 && racing) {
    for (const ai of R.ais) ai.update(DT * 2, R.karts, R.player, R.raceT);
  }

  // player inputs
  const p = R.player;
  if (racing && !p.finished) {
    p.inThrottle = Input.throttle;
    p.inBrake = Input.brake;
    p.inSteer = Input.right - Input.left;
    p.inDrift = Input.drift;
    // auto-brake assist
    if (p.assists.autobrake) {
      const dsAvg = tr.len / tr.n;
      const bi = (p.idx + Math.round(clamp(p.speed * 0.55, 4, 24) / dsAvg)) % tr.n;
      const vT = tr.line[bi].v * 0.99;
      if (p.speed > vT + 0.8) {
        p.inBrake = Math.max(p.inBrake, clamp((p.speed - vT) / 5, 0.35, 1));
        p.inThrottle = Math.min(p.inThrottle, 0.25);
      }
    }
  } else if (p.finished) {
    // cruise after the flag
    p.inThrottle = 0.3; p.inBrake = 0; p.inDrift = false;
    const dsAvg = tr.len / tr.n;
    const ti = (p.idx + Math.round(10 / dsAvg)) % tr.n;
    const L = tr.line[ti], sm = tr.samples[ti];
    p.inSteer = clamp(angWrap(Math.atan2(L.y - p.y, L.x - p.x) - p.heading) * 2, -1, 1);
  }

  const online = R.mode === 'online';
  if (racing) {
    for (const k of R.karts) {
      if (k.isRemote) {
        k.update();
        if (!k.finished && k.lap > R.cfg.laps && !R.player.finished) toastOnce(k.name + ' finished', '', 'fin-' + k.id);
        continue;
      }
      k.step(R.raceT, WORLD);
      updatePitState(k, WORLD);
      // finish detection
      if (!k.finished && k.lap > R.cfg.laps) {
        k.finished = true; k.finishT = R.raceT;
        if (k.isPlayer) {
          if (online) NET.sendFinish(Math.round(R.raceT * 1000));
          onPlayerFinish();
        } else if (!R.player.finished) toastOnce(k.name + ' finished', '', 'fin-' + k.id);
      }
    }
    if (online) {
      collideLocalRemote(p);
      sendPoseThrottled(p, 60);
    } else {
      collideKarts(R.karts, WORLD);
    }
    updateSlipstream(R.karts);
  } else {
    for (const k of R.karts) if (!k.isRemote) { k.vx = k.vy = 0; }
    if (online) {
      sendPoseThrottled(p, 140);
      for (const k of R.karts) if (k.isRemote) k.update();
    }
  }

  // positions
  const ranked = [...R.karts].sort((a, b) => {
    if (a.finished && b.finished) return a.finishT - b.finishT;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
  ranked.forEach((k, i) => k.pos = i + 1);

  // overtake feedback (cooldown so pack shuffles don't spam toasts)
  if (racing && !p.finished && p.pos !== R.lastPosSeen) {
    const now = performance.now();
    if (now - (R._posToastAt || 0) > 1500) {
      R._posToastAt = now;
      if (p.pos < R.lastPosSeen) { toast('P' + p.pos + ' ▲', 'good'); SFX.blip(1); }
      else SFX.blip(0);
      R.lastPosSeen = p.pos;
    }
  }

  // ghost record/playback (training)
  if (Race.mode === 'training' && racing && !p.finished) {
    if ((R.ghostStep = (R.ghostStep + 1) % 4) === 0) Race.ghostBuf.push(p.x, p.y, p.heading);
  }

  // particles from karts
  for (const k of R.karts) {
    if (k.sliding > 0.35 && k.speed > 8 && Math.random() < 0.45) {
      // off-track dust matches the world: sand, ash, snow, grass…
      spawnSmoke(k.x - Math.cos(k.heading) * 0.9, k.y - Math.sin(k.heading) * 0.9, k.surf === 'grass' ? R.track.colors.ground2 : '#F0EEF5');
      Race.renderer.skidMark(k);
    } else if ((k.driftActive || k.boostT > 0) && Math.random() < 0.5) {
      Race.renderer.skidMark(k);
    } else {
      Race.renderer.skidBreak(k);
    }
    if (k.surf === 'grass' && k.speed > 6 && Math.random() < 0.3) {
      spawnGrass(k.x, k.y, R.track.theme === 'meadow' || R.track.theme === 'forest' ? '#36A857' : R.track.colors.ground2);
    }
  }
  // particle physics
  for (let i = R.particles.length - 1; i >= 0; i--) {
    const pt = R.particles[i];
    pt.life -= DT;
    pt.x += pt.vx * DT; pt.y += pt.vy * DT;
    pt.vx *= 0.96; pt.vy *= 0.96;
    if (pt.rot != null) pt.rot += pt.vr * DT;
    if (pt.life <= 0) R.particles.splice(i, 1);
  }

  // finish countdown to results
  if (R.finishTimer > 0) {
    R.finishTimer -= DT;
    if (R.finishTimer <= 0) endRace();
  }

  // engine audio
  SFX.engine(p.speed / PHYS.TOP, p.inThrottle, p.sliding, p.boostT > 0);

  // camera
  const cam = R.renderer.cam;
  const lead = clamp(p.speed * 0.05, 0.4, 2.2);
  const tx2 = p.x + Math.cos(p.heading) * lead, ty2 = p.y + Math.sin(p.heading) * lead;
  cam.x = lerp(cam.x, tx2, 1 - Math.pow(0.0018, DT));
  cam.y = lerp(cam.y, ty2, 1 - Math.pow(0.0018, DT));
  R.camRot += angWrap(p.heading - R.camRot) * (1 - Math.pow(0.05, DT));
  cam.rot = R.camRot;
  const zTarget = wasGrid && R.state === 'grid' ? 11.5 : 13.8 - clamp(p.speed, 0, 40) * 0.085;
  cam.zoom = lerp(cam.zoom, zTarget, 1 - Math.pow(0.02, DT));
}

function onPlayerFinish() {
  const p = Race.player;
  centerMsg(p.pos === 1 ? '🏆 P1!' : 'P' + p.pos, 'big');
  SFX.finish(p.pos === 1);
  // confetti at the gantry
  const s0 = Race.track.samples[0];
  for (let i = 0; i < 90; i++) {
    Race.particles.push({
      kind: 'confetti', x: s0.x + (Math.random() - 0.5) * s0.w * 2, y: s0.y + (Math.random() - 0.5) * s0.w * 2,
      vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8,
      rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12,
      size: 0.35 + Math.random() * 0.3, c: KART_COLORS[i % KART_COLORS.length],
      life: 2.2 + Math.random(), life0: 3,
    });
  }
  Race.finishTimer = 2.6;
}

/* ---------------- online glue ---------------- */
// wall-clock gated so background catch-up bursts don't flood the wire
function sendPoseThrottled(p, minGapMs) {
  const now = performance.now();
  if (now - (Race._lastPoseAt || 0) < minGapMs) return;
  Race._lastPoseAt = now;
  NET.sendPose(packPose(p));
}

function wireNetForRace() {
  const find = id => Race.karts.find(k => k.id === id);
  NET.handlers.onPose = (id, d) => { const k = find(id); if (k && k.isRemote) k.pushPose(d); };
  NET.handlers.onLap = (id, ms, bestMs) => {
    const k = find(id);
    if (k && k.isRemote) {
      k.lastLap = ms / 1000;
      k.lapTimes.push(ms / 1000);
      const b = bestMs / 1000;
      if (k.bestLap == null || b < k.bestLap) k.bestLap = b;
    }
  };
  NET.handlers.onFinish = (id, ms) => {
    const k = find(id);
    if (k && k.isRemote && !k.finished) { k.finished = true; k.finishT = ms / 1000; }
  };
  NET.handlers.onRoster = () => {
    for (const k of Race.karts) if (k.isRemote && !NET.players.has(k.id) && !k.gone) {
      k.gone = true;
      toast(k.name + ' disconnected', 'warn');
    }
  };
  NET.handlers.onClosed = msg => { if (Race.active) toast(msg, 'warn'); };
  NET.handlers.onStart = null;
  NET.handlers.onError = null;
}

// local kart vs remote poses: push only ourselves (their sim owns their kart)
function collideLocalRemote(p) {
  if (p.finished) return;
  for (const o of Race.karts) {
    if (!o.isRemote || o.gone) continue;
    const dx = p.x - o.x, dy = p.y - o.y;
    const d2 = dx * dx + dy * dy, min = KART_R * 2;
    if (d2 > min * min || d2 === 0) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    p.x += nx * (min - d); p.y += ny * (min - d);
    const vn = p.vx * nx + p.vy * ny;
    if (vn < 0) {
      p.vx -= nx * vn * 1.3; p.vy -= ny * vn * 1.3;
      p.vx *= 0.85; p.vy *= 0.85;
      if (Math.abs(vn) > 3.5) WORLD.onBump(Math.abs(vn));
    }
  }
}

/* particles */
function spawnSmoke(x, y, c) {
  Race.particles.push({ kind: 'smoke', x, y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, size: 0.5 + Math.random() * 0.4, c, life: 0.5 + Math.random() * 0.3, life0: 0.8, a: 0.7 });
}
function spawnGrass(x, y, c = '#36A857') {
  Race.particles.push({ kind: 'confetti', x, y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, rot: Math.random() * TAU, vr: 8, size: 0.22, c, life: 0.5, life0: 0.5 });
}
function spawnSparks(x, y, nSparks) {
  for (let i = 0; i < nSparks; i++) {
    Race.particles.push({ kind: 'spark', x, y, vx: (Math.random() - 0.5) * 22, vy: (Math.random() - 0.5) * 22, c: Math.random() < 0.5 ? '#FFD23F' : '#FF4D2E', life: 0.3, life0: 0.3 });
  }
}

/* ---------------- HUD ---------------- */
function buildHUD() {
  const hud = document.getElementById('hud');
  hud.innerHTML = '';
  const H = Race.hud = {};

  H.tower = el('div.hud-card', { id: 'hud-tower' });
  H.laps = el('div.hud-card', { id: 'hud-laps' });
  H.speed = el('div.hud-card', { id: 'hud-speed' });
  H.map = el('div.hud-card', { id: 'hud-map' });
  H.center = el('div', { id: 'hud-center' });
  H.toast = el('div', { id: 'hud-toast' });
  H.pit = el('div', { id: 'hud-pit', hidden: true });

  // speed cluster
  H.kmh = el('div.v', {}, '0');
  H.tyre = el('span.tyre', { style: { '--c': Race.player.compound.hex, width: '38px', height: '38px' } }, Race.player.compound.letter);
  H.wearBar = el('i');
  H.boostBar = el('i');
  H.boostWrap = el('div.bar');
  H.boostWrap.append(H.boostBar);
  H.speed.append(
    el('div', { id: 'hud-boost' }, el('div.bl', {}, 'DRIFT BOOST'), H.boostWrap),
    el('div.tyrebox', {},
      H.tyre,
      el('div.bar', { style: { width: '46px', height: '8px' } }, H.wearBar),
      el('div.wear-l', {}, 'TYRE')),
    el('div.kmh', {}, H.kmh, el('div.u', {}, 'KM/H')),
  );

  // minimap
  H.mapCv = el('canvas', { width: 168, height: 128 });
  H.map.append(H.mapCv);
  H.mapBase = document.createElement('canvas');
  H.mapBase.width = 168; H.mapBase.height = 128;
  H.mapFit = paintTrackMap(H.mapBase, Race.track, { bg: '#FFFDF7' });

  hud.append(H.tower, H.laps, H.speed, H.map, H.center, H.toast, H.pit);
  updateHUDText(true);
}

function updateLights(count, go) {
  const H = Race.hud;
  if (!H.lights) {
    H.lights = el('div', { id: 'hud-lights' });
    for (let i = 0; i < 5; i++) H.lights.append(el('i'));
    H.center.append(H.lights);
  }
  if (count < 0) { H.lights.remove(); H.lights = null; return; }
  [...H.lights.children].forEach((dot, i) => {
    dot.className = go ? 'go' : (i < count ? 'on' : '');
  });
}

function centerMsg(text, size) {
  const H = Race.hud;
  const node = el('div.hud-' + (size === 'big' ? 'big' : 'med'), {}, text);
  H.center.append(node);
  setTimeout(() => node.remove(), size === 'big' ? 1400 : 2000);
}

function toast(text, kind) {
  const H = Race.hud;
  if (!H.toast) return;
  const node = el('div.toast' + (kind ? '.' + kind : ''), {}, text);
  H.toast.append(node);
  while (H.toast.children.length > 3) H.toast.firstChild.remove();
  setTimeout(() => node.remove(), 2600);
}
const _toastSeen = new Set();
function toastOnce(text, kind, key) {
  if (_toastSeen.has(key)) return;
  _toastSeen.add(key);
  toast(text, kind);
}

function drawFrame(frame) {
  const R = Race, p = R.player;
  R.renderer.render({
    karts: R.karts, particles: R.particles, raceT: R.raceT, track: R.track,
    showLine: p.assists.line, showMarkers: p.assists.markers,
    ghostPose: ghostPose(),
  });
  updateHUDText();
}

function ghostPose() {
  const R = Race;
  if (R.mode !== 'training' || !R.ghost || R.state === 'grid' || R.player.finished) return null;
  const t = R.raceT - R.player.lapStart;
  const i = Math.floor(t / R.ghost.dt) * 3;
  if (i + 5 >= R.ghost.pts.length) return null;
  const f = (t / R.ghost.dt) % 1;
  const g = R.ghost.pts;
  return [lerp(g[i], g[i + 3], f), lerp(g[i + 1], g[i + 4], f), g[i + 2] + angWrap(g[i + 5] - g[i + 2]) * f];
}

let _hudTick = 0;
function updateHUDText(force) {
  const R = Race, H = R.hud, p = R.player;
  // every frame: speed, boost, wear
  H.kmh.textContent = Math.round(p.speed * 3.6);
  H.boostBar.style.width = (p.boostT > 0 ? 100 : p.driftCharge * 100) + '%';
  H.boostWrap.classList.toggle('full', p.driftCharge >= 0.98 || p.boostT > 0);
  H.wearBar.style.width = Math.round((1 - p.wear) * 100) + '%';
  H.wearBar.style.background = p.wear > 0.75 ? 'var(--orange)' : p.wear > 0.5 ? 'var(--yellow-deep)' : 'var(--grass)';

  if (!force && ++_hudTick % 8) return;

  // tyre letter/color can change after pit
  H.tyre.textContent = p.compound.letter;
  H.tyre.style.setProperty('--c', p.compound.hex);

  // laps + times
  const training = R.mode === 'training';
  const lapNow = Math.min(p.lap, R.cfg.laps);
  H.laps.innerHTML = '';
  const cur = R.state === 'grid' ? 0 : R.raceT - p.lapStart;
  H.laps.append(
    el('div.lap', {}, 'LAP ' + lapNow, training ? '' : el('small', {}, ' / ' + R.cfg.laps)),
    el('div.times', {},
      el('div', {}, el('span.lbl', {}, 'CURRENT'), el('span', {}, fmtTime((p.finished ? p.lastLap : cur) * 1000))),
      el('div', {}, el('span.lbl', {}, 'LAST'), el('span', { className: p.lastLap && p.bestLap === p.lastLap ? 't-good' : '' }, fmtTime(p.lastLap == null ? null : p.lastLap * 1000))),
      el('div', {}, el('span.lbl', {}, 'BEST'), el('span.t-good', {}, fmtTime(p.bestLap == null ? null : p.bestLap * 1000))),
    ),
  );

  // tower
  const ranked = [...R.karts].sort((a, b) => a.pos - b.pos);
  H.tower.innerHTML = '';
  let prev = null;
  for (const k of ranked) {
    let gap = '';
    if (prev) {
      if (k.finished && prev.finished) gap = '+' + ((k.finishT - prev.finishT)).toFixed(1);
      else gap = '+' + Math.max(0, (prev.progress - k.progress) / Math.max(9, k.speed)).toFixed(1);
    }
    H.tower.append(el('div.trow' + (k.isPlayer ? '.me' : ''), {},
      el('span.p', {}, 'P' + k.pos),
      el('span.dot', { style: { background: k.color } }),
      el('span.n', {}, (k.clanTag ? '[' + k.clanTag + '] ' : '') + k.name + (k.pitState ? ' 🔧' : '') + (k.gone ? ' ⛔' : '')),
      el('span.gap', {}, k.finished && k.pos === 1 ? '🏁' : gap),
    ));
    prev = k;
  }

  // pit hint
  const showPit = !p.finished && R.mode !== 'training' && (p.wear > 0.55 || p.pitState) && R.cfg.laps >= 5;
  H.pit.hidden = !showPit;
  if (showPit) {
    H.pit.innerHTML = p.pitState
      ? 'PIT CREW READY — NEXT: <b>' + COMPOUNDS[p.pitNextCompound].name + '</b>'
      : 'TYRES AT ' + Math.round((1 - p.wear) * 100) + '% — PIT LANE BEFORE START/FINISH · NEXT SET: <b>' + COMPOUNDS[p.pitNextCompound].name + '</b> <span style="opacity:.7">[1] SOFT [2] MED [3] HARD</span>';
  }

  // minimap
  const mc = H.mapCv.getContext('2d');
  mc.clearRect(0, 0, 168, 128);
  mc.drawImage(H.mapBase, 0, 0);
  const { X, Y } = H.mapFit;
  for (const k of [...R.karts].reverse()) {
    mc.fillStyle = k.isPlayer ? '#FF4D2E' : k.color;
    mc.strokeStyle = INK; mc.lineWidth = 1.4;
    mc.beginPath();
    mc.arc(X(k.x), Y(k.y), k.isPlayer ? 5 : 3.4, 0, TAU);
    mc.fill(); mc.stroke();
  }
}

/* ---------------- pause / quit / end ---------------- */
function togglePause(force) {
  if (!Race.active || Race.player.finished) return;
  Race.paused = force != null ? force : !Race.paused;
  SFX.pauseEngine(Race.paused);
  let ov = document.getElementById('pause-overlay');
  if (!Race.paused) { ov && ov.remove(); Race.lastTs = 0; return; }
  if (ov) return;
  const p = Race.player;
  const assistToggle = (key, label, desc) => {
    const t = el('button.toggle' + (p.assists[key] ? '.on' : ''), {
      onclick: () => { p.assists[key] = !p.assists[key]; DB.settings.assists[key] = p.assists[key]; saveDB(); t.classList.toggle('on'); },
      'aria-label': label,
    }, el('i'));
    return el('div.assist-row', {}, el('div.grow', {}, el('div.aname', {}, label), el('div.adesc', {}, desc)), t);
  };
  const online = Race.mode === 'online';
  ov = el('div', { id: 'pause-overlay' },
    el('div.modal', {},
      el('h2', {}, online ? 'RACE MENU' : 'PAUSED'),
      online ? el('p', { style: { margin: '0 0 4px', fontSize: '12.5px', color: 'var(--ink-3)' } }, 'Online race — the clock keeps running!') : null,
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' } },
        assistToggle('line', 'Racing line', 'Colour-coded ideal line'),
        assistToggle('markers', 'Brake markers', 'Boards before big stops'),
        assistToggle('traction', 'Traction control', 'Cuts power when sliding'),
        assistToggle('autobrake', 'Auto-brake', 'Brakes for the corner — training wheels'),
      ),
      el('div.btnrow', {},
        el('button.btn.primary', { onclick: () => togglePause(false) }, online ? 'BACK TO RACE' : 'RESUME'),
        online ? null : el('button.btn', { onclick: () => { quitRace(); startRace(Race.cfg); } }, 'RESTART'),
        Race.mode === 'training'
          ? el('button.btn.grass', { onclick: () => { Race.paused = false; endRace(); } }, 'END SESSION')
          : online
            ? el('button.btn.ghosted', { onclick: () => { quitRace(); showScreen('room'); } }, 'LEAVE RACE')
            : el('button.btn.ghosted', { onclick: () => { quitRace(); showScreen('home'); } }, 'QUIT'),
      ),
    ));
  document.getElementById('hud').append(ov);
  ov.style.pointerEvents = 'auto';
}

function quitRace() {
  Race.active = false;
  cancelAnimationFrame(Race.rafId);
  clearInterval(Race.bgTick);
  SFX.stopEngine();
  const ov = document.getElementById('pause-overlay');
  ov && ov.remove();
  document.getElementById('race-layer').hidden = true;
  saveDB();
}

function endRace() {
  const R = Race, p = R.player;
  const ranked = [...R.karts].sort((a, b) => a.pos - b.pos);
  const order = ranked.map(k => ({ id: k.id, pos: k.pos, kart: k }));

  const summary = {
    mode: R.mode, trackId: R.cfg.trackId, laps: R.cfg.laps,
    pos: p.pos, n: R.karts.length,
    bestLap: p.bestLap, lapTimes: p.lapTimes,
    order, pts: 0, eloBefore: DB.profile.elo, eloAfter: DB.profile.elo,
    xp: 0, levelUps: 0, fastest: null,
  };

  // fastest lap of the race
  let fBest = Infinity, fWho = null;
  for (const k of R.karts) if (k.bestLap != null && k.bestLap < fBest) { fBest = k.bestLap; fWho = k; }
  summary.fastest = fWho ? { name: fWho.name, t: fBest, me: fWho.isPlayer } : null;

  if (R.mode !== 'training') {
    const pr = DB.profile;
    let pts = 0, dElo = 0;

    if (R.mode === 'online') {
      // friendly room: bragging rights, no ELO or season points
      NET.raceOver();
    } else {
      const aiField = ranked.filter(k => !k.isPlayer).map(k => ({ elo: k.elo, pos: k.pos }));
      dElo = eloDelta(pr.elo, aiField, p.pos);
      pr.elo = Math.max(600, pr.elo + dElo);
      summary.eloAfter = pr.elo;

      pts = RACE_PTS[p.pos - 1] || 0;
      summary.pts = pts;
      pr.seasonPts += pts;

      settleLadder(ranked.filter(k => !k.isPlayer).map(k => k.id), order);
    }

    pr.stats.races++;
    if (p.pos === 1) pr.stats.wins++;
    if (p.pos <= 3) pr.stats.podiums++;
    pr.stats.laps += p.lapTimes.length;

    const xp = 22 + pts + (p.pos === 1 ? 14 : 0) + (summary.fastest && summary.fastest.me ? 6 : 0);
    summary.xp = xp;
    summary.levelUps = grantXP(xp);

    DB.history.unshift({
      t: Date.now(), trackId: R.cfg.trackId, pos: p.pos, pts, dElo, laps: R.cfg.laps,
      bestLap: p.bestLap, mode: R.mode,
    });
    DB.history.length = Math.min(DB.history.length, 12);

    if (R.mode === 'weekly') {
      const wk = weekKey();
      const prevW = DB.weekly[wk];
      if (!prevW || p.pos < prevW.pos) DB.weekly[wk] = { done: true, pos: p.pos, pts, bestLap: p.bestLap };
      else prevW.done = true;
    }
  }

  // track PBs (any mode)
  if (p.bestLap != null) {
    const prev = DB.profile.bestLaps[R.cfg.trackId];
    if (!prev || p.bestLap * 1000 < prev) {
      DB.profile.bestLaps[R.cfg.trackId] = Math.round(p.bestLap * 1000);
      summary.trackPB = true;
    }
  }

  saveDB();
  Race.summary = summary;
  quitRace();
  showScreen(R.mode === 'training' ? 'trainingDone' : 'results');
}
