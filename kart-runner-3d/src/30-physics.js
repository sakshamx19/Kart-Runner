'use strict';
/* ============================================================
   30-physics.js — the kart model
   Fixed timestep 120 Hz. Velocity is a world-space vector; grip
   is a lateral-acceleration budget. Steering rotates the chassis,
   friction pulls velocity toward the chassis axis — exceed the
   budget and the kart slides (which is also how drifting works).
   ============================================================ */

const DT = 1 / 120;
const KART_R = 1.15;           // collision radius, m

const PHYS = {
  ACCEL: 13.0,                 // m/s² baseline
  TOP: 36.5,                   // m/s (~131 km/h)
  BRAKE: 23,
  REV_ACCEL: 7, REV_TOP: 9,
  ROLL: 0.5,                   // rolling resistance m/s²
  GRIP: 21.5,                  // lateral budget m/s² on fresh mediums
  STEER_K: 0.30,               // yaw rad per meter travelled at full lock (low speed)
  YAW_MAX: 3.0,                // rad/s cap
  BOOST_ACC: 10, BOOST_TOP: 6.5,
  PIT_SPEED: 11,
};

class Kart {
  constructor(opts) {
    this.isPlayer = !!opts.isPlayer;
    this.id = opts.id;
    this.name = opts.name;
    this.color = opts.color;
    this.number = opts.number ?? ((Math.random() * 98) | 0) + 1;
    this.flag = opts.flag || '🏁';
    this.elo = opts.elo || 1200;
    this.clanTag = opts.clanTag || null;
    this.mods = opts.mods || skillMods([]);
    this.track = opts.track;
    this.compound = COMPOUNDS[opts.compound || 'medium'];
    this.assists = opts.assists || { line: false, traction: false, autobrake: false, markers: false };

    // dynamic state
    this.x = 0; this.y = 0; this.heading = 0;
    this.vx = 0; this.vy = 0;
    this.steer = 0; this.steerVis = 0;
    this.inThrottle = 0; this.inBrake = 0; this.inSteer = 0; this.inDrift = false;
    this.sliding = 0;            // 0..1 slide intensity this frame
    this.surf = 'road';
    this.wear = 0;
    this.driftCharge = 0; this.driftActive = false;
    this.boostT = 0;
    this.slip = 0;               // slipstream factor 0..1 (set by controller)
    this.idx = 0;                // nearest sample hint
    this.latD = 0;               // signed lateral offset from centerline
    this.progress = 0;           // monotonic-ish meters along race
    this.lastS = 0;
    this.lap = 1;
    this.cp = [false, false, false];
    this.lapStart = 0;
    this.lapTimes = [];
    this.bestLap = null;
    this.lastLap = null;
    this.finished = false; this.finishT = null;
    this.pos = 1;
    this.pitState = null;        // null | 'in' | 'box' | 'out'
    this.pitTimer = 0;
    this.pitNextCompound = 'medium';
    this.wantPit = false;
    this.stuckT = 0;
    this.airKick = 0;            // kerb bounce animation
    this.crashFlash = 0;
  }

  get speed() { return Math.hypot(this.vx, this.vy); }
  get fwdSpeed() { return this.vx * Math.cos(this.heading) + this.vy * Math.sin(this.heading); }
  get wearGrip() {
    const cliff = 0.16 * this.mods.wearCliff + 0.06;
    return 1 - cliff * Math.pow(this.wear, 1.6);
  }

  placeAt(slot) {
    this.x = slot.x; this.y = slot.y; this.heading = slot.heading;
    this.vx = this.vy = 0; this.steer = 0;
    this.idx = this.track.nearest(this.x, this.y, null);
    this.lastS = this.track.samples[this.idx].s;
    this.progress = 0;
  }

  swapTyres(compoundId) {
    this.compound = COMPOUNDS[compoundId];
    this.wear = 0;
  }

  step(raceT, world) {
    const tr = this.track;
    const cos = Math.cos(this.heading), sin = Math.sin(this.heading);
    let vF = this.vx * cos + this.vy * sin;          // forward
    let vL = -this.vx * sin + this.vy * cos;         // lateral (left +)

    // surface
    const q = surfaceAt(tr, this.x, this.y, this.idx);
    this.idx = q.idx; this.surf = q.surf; this.latD = q.d;

    // ---- steering ----
    const steerRate = 7.5 * this.mods.steer;
    this.steer += clamp(this.inSteer - this.steer, -steerRate * DT, steerRate * DT);
    this.steerVis = this.steer;

    const speed = Math.hypot(this.vx, this.vy);
    const driftMode = this.inDrift && vF > 10;
    let yaw = this.steer * Math.min(Math.abs(vF) * PHYS.STEER_K, PHYS.YAW_MAX) * Math.sign(vF || 1);
    if (driftMode) yaw *= 1.5;
    this.heading = angWrap(this.heading + yaw * DT);

    // ---- longitudinal ----
    let gripBudget = PHYS.GRIP * this.compound.grip * this.wearGrip * q.gripMul * this.mods.grip;
    if (q.surf === 'kerb') gripBudget *= this.mods.kerbGrip;

    const boosting = this.boostT > 0;
    const topSpeed = (PHYS.TOP + (boosting ? PHYS.BOOST_TOP : 0)) * this.mods.top * (1 + 0.06 * this.slip * this.mods.slip);
    let aF = 0;
    let throttle = this.inThrottle;
    // traction control: cut power while sliding
    if (this.assists.traction && this.sliding > 0.35 && throttle > 0) throttle *= 0.45;
    if (this.pitState) throttle = Math.min(throttle, vF > PHYS.PIT_SPEED ? 0 : 0.6);

    if (throttle > 0 && vF >= -0.5) {
      const cap = clamp(1 - Math.pow(Math.max(0, vF) / topSpeed, 3), 0, 1);
      aF += (PHYS.ACCEL * this.mods.accel + (boosting ? PHYS.BOOST_ACC : 0) + this.slip * 1.4 * this.mods.slip) * cap * throttle;
    }
    if (this.inBrake > 0) {
      if (vF > 0.6) aF -= PHYS.BRAKE * this.inBrake;
      else if (vF > -PHYS.REV_TOP) aF -= PHYS.REV_ACCEL * this.inBrake; // reverse
    }
    // drag + rolling + surface
    const dragC = PHYS.ACCEL / (PHYS.TOP * PHYS.TOP);
    const slipDrag = 1 - 0.42 * this.slip * Math.min(this.mods.slip, 1.6);
    aF -= dragC * vF * Math.abs(vF) * slipDrag;
    aF -= PHYS.ROLL * Math.sign(vF) * (Math.abs(vF) > 0.3 ? 1 : 0) * q.dragMul;
    if (q.dragMul > 1.2) aF -= 0.075 * vF * Math.abs(vF) * (q.dragMul - 1); // grass ploughing
    if (this.pitState && vF > PHYS.PIT_SPEED) aF -= 12; // pit limiter

    // ---- lateral grip ----
    let latBudget = gripBudget;
    if (driftMode) latBudget *= 0.52;
    const needAL = -vL / DT;
    const aL = clamp(needAL, -latBudget, latBudget);
    const overload = Math.abs(needAL) / Math.max(1, latBudget);
    this.sliding = clamp((overload - 1) * 0.8 + (driftMode ? 0.5 : 0), 0, 1) * clamp(speed / 8, 0, 1);

    // drift charge
    if (driftMode && this.sliding > 0.15) {
      this.driftActive = true;
      this.driftCharge = clamp(this.driftCharge + DT * 0.55 * this.mods.boost * (0.5 + this.sliding), 0, 1);
    } else if (this.driftActive && !this.inDrift) {
      if (this.driftCharge > 0.3) this.boostT = 0.45 + this.driftCharge * 1.0;
      this.driftActive = false; this.driftCharge = 0;
    } else if (!driftMode) {
      this.driftActive = false;
      this.driftCharge = Math.max(0, this.driftCharge - DT * 1.5);
    }
    if (this.boostT > 0) this.boostT -= DT;

    // ---- integrate ----
    vF += aF * DT;
    vL += aL * DT;
    this.vx = vF * cos - vL * sin;
    this.vy = vF * sin + vL * cos;
    this.x += this.vx * DT;
    this.y += this.vy * DT;

    // ---- walls ----
    const q2 = surfaceAt(tr, this.x, this.y, this.idx);
    if (q2.surf === 'wall') {
      const sm = q2.sm;
      const wallD = sm.w + tr.runoff;
      const side = Math.sign(q2.d);
      this.x = sm.x + sm.nx * side * (wallD - 0.15);
      this.y = sm.y + sm.ny * side * (wallD - 0.15);
      const vn = this.vx * sm.nx + this.vy * sm.ny;
      if (vn * side > 0) {
        this.vx -= vn * sm.nx * 1.3; // reflect a bit
        this.vy -= vn * sm.ny * 1.3;
        this.vx *= 0.82; this.vy *= 0.82;
        if (Math.abs(vn) > 6) this.crashFlash = 1;
        world && world.onWallHit && world.onWallHit(this, Math.abs(vn));
      }
      this.idx = q2.idx;
    }

    // kerb rumble kick
    this.airKick = q.surf === 'kerb' && speed > 14 ? (Math.sin(raceT * 55) > 0 ? 1 : 0) : 0;

    // ---- tyre wear ----
    const cornerLoad = Math.abs(aL) / Math.max(1, PHYS.GRIP);
    this.wear = clamp(this.wear + DT * this.compound.wearRate * this.mods.wear *
      (0.011 * cornerLoad * cornerLoad + 0.012 * this.sliding + 0.0008 * throttle) * (speed > 4 ? 1 : 0), 0, 1);

    // ---- progress / laps / checkpoints ----
    const s = tr.samples[this.idx].s;
    let ds = s - this.lastS;
    if (ds > tr.len / 2) ds -= tr.len;
    if (ds < -tr.len / 2) ds += tr.len;
    if (Math.abs(ds) < 28) this.progress += ds;
    this.lastS = s;
    const cpz = tr.checkpoints;
    for (let c = 0; c < 3; c++) {
      if (!this.cp[c] && Math.abs(this.idx - cpz[c]) < 14) this.cp[c] = true;
    }
    // start/finish crossing
    if (!this.finished && this.cp[0] && this.cp[1] && this.cp[2] && this.idx < 12 && this.progressSinceLap() > tr.len * 0.7) {
      const lt = raceT - this.lapStart;
      this.lapTimes.push(lt);
      this.lastLap = lt;
      if (this.bestLap == null || lt < this.bestLap) this.bestLap = lt;
      this.lapStart = raceT;
      this.cp = [false, false, false];
      this.lap++;
      this._lapAnchor = this.progress;
      world && world.onLap && world.onLap(this, lt);
    }

    // stuck detection (auto-rescue for AI, hint for player)
    if (speed < 1.2 && !this.pitState) this.stuckT += DT; else this.stuckT = 0;
    if (this.crashFlash > 0) this.crashFlash -= DT * 2;
  }

  progressSinceLap() { return this.progress - (this._lapAnchor || 0); }

  rescue() {
    const tr = this.track;
    const i = this.idx;
    const l = tr.line[i];
    this.x = l.x; this.y = l.y;
    const sm = tr.samples[i];
    this.heading = Math.atan2(sm.ty, sm.tx);
    this.vx = this.vy = 0; this.steer = 0; this.stuckT = 0;
  }
}

/* kart-vs-kart collisions: equal-mass circles, gentle restitution */
function collideKarts(karts, world) {
  for (let i = 0; i < karts.length; i++) for (let j = i + 1; j < karts.length; j++) {
    const a = karts[i], b = karts[j];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d2 = dx * dx + dy * dy, min = KART_R * 2;
    if (d2 > min * min || d2 === 0) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    const pen = (min - d) / 2;
    a.x -= nx * pen; a.y -= ny * pen;
    b.x += nx * pen; b.y += ny * pen;
    const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const imp = -vn * 0.62;
      a.vx -= nx * imp; a.vy -= ny * imp;
      b.vx += nx * imp; b.vy += ny * imp;
      if ((a.isPlayer || b.isPlayer) && Math.abs(vn) > 3.5) world && world.onBump && world.onBump(Math.abs(vn));
    }
  }
}

/* slipstream: set kart.slip based on karts directly ahead */
function updateSlipstream(karts) {
  for (const k of karts) {
    k.slip = 0;
    if (k.speed < 14) continue;
    const cos = Math.cos(k.heading), sin = Math.sin(k.heading);
    for (const o of karts) {
      if (o === k) continue;
      const dx = o.x - k.x, dy = o.y - k.y;
      const ahead = dx * cos + dy * sin;
      const side = Math.abs(-dx * sin + dy * cos);
      if (ahead > 2 && ahead < 16 && side < 2.6) {
        const f = (1 - (ahead - 2) / 14) * (1 - side / 2.6);
        k.slip = Math.max(k.slip, clamp(f * 1.2, 0, 1));
      }
    }
  }
}

/* corners: local minima of racing-line speed — used for brake markers & callouts */
function trackCorners(track) {
  if (track._corners) return track._corners;
  const L = track.line, n = track.n;
  const corners = [];
  for (let i = 0; i < n; i++) {
    const v = L[i].v;
    if (v > 31) continue;
    let isMin = true;
    for (let d = -8; d <= 8; d++) if (L[(i + d + n) % n].v < v) { isMin = false; break; }
    if (isMin && (corners.length === 0 || (i - corners[corners.length - 1].idx + n) % n > 24)) {
      corners.push({ idx: i, v, num: corners.length + 1 });
    }
  }
  track._corners = corners;
  return corners;
}
