'use strict';
/* ============================================================
   35-ai.js — AI drivers
   AI karts run the exact same physics as the player; this file
   only decides their inputs: follow the racing line, brake to
   its speed profile, dodge traffic, occasionally get it wrong.
   ============================================================ */

class AIDriver {
  constructor(kart, rival, raceLaps) {
    this.kart = kart;
    // skill 0..1 mapped from ladder ELO (900..2600)
    this.skill = clamp((rival.elo - 900) / 1700, 0, 1);
    this.speedFactor = 0.855 + this.skill * 0.155;   // fraction of ideal corner speed
    this.aggression = 0.3 + Math.random() * 0.7;
    this.lineBias = (Math.random() - 0.5) * 2.2;     // personal line offset, m
    this.mistakeT = 4 + Math.random() * 8;
    this.mistakeLeft = 0;
    this.noise = 0;
    this.raceLaps = raceLaps;
    this.rubber = 0;
    // pit strategy: soft starters plan a stop in longer races
    this.plansPit = raceLaps >= 7 || (raceLaps >= 5 && kart.compound.id === 'soft');
  }

  update(dt, karts, player, raceT) {
    const k = this.kart, tr = k.track;
    if (k.finished) { k.inThrottle = 0.25; k.inBrake = 0; this.followLine(0.7); return; }

    // ---- mistakes: brief windows of bad inputs ----
    this.mistakeT -= dt;
    if (this.mistakeT <= 0) {
      this.mistakeT = 5 + Math.random() * 9 + this.skill * 8;
      if (Math.random() > this.skill * 0.75) {
        this.mistakeLeft = 0.5 + Math.random() * 0.7;
        this.noise = (Math.random() - 0.5) * 0.8;
      }
    }
    if (this.mistakeLeft > 0) this.mistakeLeft -= dt;

    // ---- rubber band (subtle, keeps the pack alive) ----
    if (player && !player.finished) {
      const gap = player.progress - k.progress;   // + means player ahead
      this.rubber = clamp(gap / 900, -0.045, 0.055);
    }

    // ---- pit decision ----
    const lapsLeft = this.raceLaps - k.lap + 1;
    if (!k.pitState && !k.wantPit && lapsLeft >= 2 && k.wear > 0.74) {
      k.wantPit = true;
      k.pitNextCompound = lapsLeft > 4 ? 'medium' : 'soft';
    }

    this.followLine(1, karts);
  }

  followLine(calm, karts) {
    const k = this.kart, tr = k.track;
    const speed = k.speed;

    // ---- steering target: point on line ahead ----
    const lookM = clamp(4.5 + speed * 0.52, 6, 27);
    const dsAvg = tr.len / tr.n;
    let ti = (k.idx + Math.round(lookM / dsAvg)) % tr.n;

    let tx, ty;
    const pitO = k.pitState || k.wantPit ? tr.pitOffsetAt(ti) : null;
    if ((k.pitState || (k.wantPit && this.nearPitEntry())) && pitO !== null) {
      // aim down the pit lane
      const sm = tr.samples[ti];
      tx = sm.x + sm.nx * pitO; ty = sm.y + sm.ny * pitO;
    } else {
      const L = tr.line[ti];
      const sm = tr.samples[ti];
      let avoid = this.avoidOffset(karts, speed);
      const maxO = sm.w - 1.6;
      const o = clamp(L.o + this.lineBias * 0.4 + avoid, -maxO, maxO);
      tx = sm.x + sm.nx * o; ty = sm.y + sm.ny * o;
    }

    const want = Math.atan2(ty - k.y, tx - k.x);
    let err = angWrap(want - k.heading);
    if (this.mistakeLeft > 0) err += this.noise * 0.5;
    k.inSteer = clamp(err * 2.4, -1, 1);

    // ---- speed target from line profile ----
    const brakeLook = clamp(speed * 0.55, 4, 24);
    const bi = (k.idx + Math.round(brakeLook / dsAvg)) % tr.n;
    let vT = tr.line[bi].v * this.speedFactor * calm * (1 + this.rubber);
    if (this.mistakeLeft > 0) vT *= 1.06;              // missed braking point
    if (k.pitState || (k.wantPit && this.nearPitEntry())) vT = Math.min(vT, PHYS.PIT_SPEED + 1);

    // traffic braking
    if (karts) {
      const cos = Math.cos(k.heading), sin = Math.sin(k.heading);
      for (const o of karts) {
        if (o === k) continue;
        const dx = o.x - k.x, dy = o.y - k.y;
        const ahead = dx * cos + dy * sin, side = Math.abs(-dx * sin + dy * cos);
        if (ahead > 0 && ahead < 6.5 && side < 1.8 && o.speed < speed - 1) {
          vT = Math.min(vT, o.speed + (this.aggression - 0.6) * 2);
        }
      }
    }

    if (speed < vT - 0.4) { k.inThrottle = 1; k.inBrake = 0; }
    else if (speed > vT + 1.1) { k.inThrottle = 0; k.inBrake = clamp((speed - vT) / 6, 0.3, 1); }
    else { k.inThrottle = 0.55; k.inBrake = 0; }
    k.inDrift = false;

    // auto-rescue if beached
    if (k.stuckT > 2.2) k.rescue();
  }

  avoidOffset(karts, speed) {
    if (!karts) return 0;
    const k = this.kart;
    const cos = Math.cos(k.heading), sin = Math.sin(k.heading);
    let shift = 0;
    for (const o of karts) {
      if (o === k) continue;
      const dx = o.x - k.x, dy = o.y - k.y;
      const ahead = dx * cos + dy * sin;
      const side = -dx * sin + dy * cos;   // + = target is to my left
      if (ahead > 1 && ahead < 13 && Math.abs(side) < 2.6) {
        const strength = (1 - ahead / 13) * 2.6 * (0.6 + this.aggression * 0.6);
        shift += side > 0 ? -strength : strength;   // steer around
      }
    }
    return clamp(shift, -3, 3);
  }

  nearPitEntry() {
    const k = this.kart, tr = k.track;
    const rel = (k.idx - (tr.pit.a - Math.round(26 / (tr.len / tr.n))) + tr.n) % tr.n;
    return rel < Math.round(100 / (tr.len / tr.n));
  }
}

/* pit-lane servicing shared by AI and player — called from race loop */
function updatePitState(k, world) {
  const tr = k.track;
  const po = tr.pitOffsetAt(k.idx);
  const inLane = po !== null && Math.abs(po) > 1.5 && Math.abs(k.latD - po) < 3.0;
  // entry only registers where the lane has fully separated from the track,
  // so grid slots near the start line can never count as "in the pits"
  const fullLane = po !== null && Math.abs(po) > tr.samples[k.idx].w + 1;

  // anyone who drives into the lane is pitting (AI only steers there on purpose)
  if (!k.pitState && inLane && fullLane) {
    k.pitState = 'in';
    if (k.isPlayer && !k.wantPit) k.wantPit = true;
    world && world.onPitEnter && world.onPitEnter(k);
  }
  if (k.pitState === 'in') {
    const boxRel = (k.idx - tr.pit.boxIdx + tr.n) % tr.n;
    const nearBox = boxRel < 4 || boxRel > tr.n - 4;
    if (nearBox && k.speed < 4) {
      k.pitState = 'box'; k.pitTimer = 2.4;
    } else if (nearBox) {
      // force stop at the box
      k.vx *= 0.86; k.vy *= 0.86;
      if (k.speed < 4.5) { k.pitState = 'box'; k.pitTimer = 2.4; }
    }
    if (!inLane && po === null) k.pitState = null;  // drove past the lane
  }
  if (k.pitState === 'box') {
    k.pitTimer -= DT;
    k.vx = 0; k.vy = 0; k.inThrottle = 0;
    if (k.pitTimer <= 0) {
      k.swapTyres(k.pitNextCompound);
      k.pitState = 'out'; k.wantPit = false;
      world && world.onPitDone && world.onPitDone(k);
    }
  }
  if (k.pitState === 'out') {
    if (po === null || !inLane) k.pitState = null;
  }
}
