'use strict';
/* ============================================================
   10-track.js — circuits, spline sampling, racing line, decor
   World units: meters. Karts ~1.9m long.
   ============================================================ */

const TRACK_DEFS = {
  sunrise: {
    name: 'Sunrise Speedway', type: 'Meadow GP', flag: '🌻', theme: 'meadow',
    width: 10, runoff: 10,
    desc: 'A long launch straight, one mean hairpin, flowers everywhere.',
    pts: [
      [0, 0], [100, 0], [200, 0], [255, 10], [290, 45], [295, 90], [270, 120],
      [235, 125], [210, 100], [185, 80], [150, 85], [135, 115], [140, 150],
      [115, 172], [75, 165], [50, 138], [15, 150], [-20, 172], [-60, 162],
      [-78, 122], [-70, 75], [-45, 30],
    ],
    pitSide: -1,
  },
  monaco: {
    name: 'Monte Cartoon', type: 'Street', flag: '🎰', theme: 'street',
    width: 9, runoff: 2.4,
    desc: 'Barriers, balconies and zero forgiveness. The crown jewel.',
    pts: [
      [0, 0], [70, 0], [140, 2], [158, 28], [158, 72], [144, 98], [108, 104],
      [94, 130], [102, 158], [132, 172], [168, 182], [182, 206], [166, 228],
      [122, 234], [64, 228], [22, 208], [-28, 214], [-58, 194], [-64, 156],
      [-46, 132], [-52, 98], [-70, 72], [-64, 32], [-38, 8],
    ],
    pitSide: 1,
  },
  spa: {
    name: 'Spa-Verde', type: 'Forest GP', flag: '🌲', theme: 'forest',
    width: 11, runoff: 9,
    desc: 'Flat-out sweepers through the pines — then the bus stop bites.',
    pts: [
      [0, 0], [140, -4], [270, -8], [350, 15], [395, 70], [390, 135], [350, 180],
      [300, 190], [262, 160], [240, 120], [205, 105], [170, 125], [150, 165],
      [115, 195], [70, 205], [30, 180], [10, 140], [-30, 120], [-70, 135],
      [-95, 105], [-90, 60], [-58, 28], [-30, 6],
    ],
    pitSide: -1,
  },
  frost: {
    name: 'Frostcake Falls', type: 'Snow GP', flag: '❄️', theme: 'snow',
    width: 10.5, runoff: 8,
    desc: 'Powder banks, candy pines and a frozen lake you should not trust.',
    pts: [
      [0, 0], [110, 4], [210, -6], [280, 20], [300, 70], [278, 112], [300, 156],
      [278, 202], [220, 224], [162, 204], [120, 226], [58, 236], [0, 214],
      [-46, 230], [-86, 204], [-96, 158], [-74, 120], [-90, 80], [-68, 36], [-28, 8],
    ],
    pitSide: -1,
  },
  crystal: {
    name: 'Crystal Coast', type: 'Street', flag: '🌴', theme: 'coast',
    width: 10, runoff: 6,
    desc: 'Palm shade, sea spray, and one very rude chicane.',
    pts: [
      [0, 0], [95, 6], [175, -8], [238, -2], [276, 32], [282, 82], [250, 112],
      [278, 148], [252, 198], [198, 214], [140, 198], [92, 214], [32, 224],
      [-24, 200], [-44, 150], [-30, 106], [-50, 62], [-30, 16],
    ],
    pitSide: 1,
  },
};

const THEME_COLORS = {
  meadow: { ground: '#8CDC9B', ground2: '#7DD08D', road: '#5A5670', kerb1: '#FF4D2E', kerb2: '#FFFDF7', edge: '#0F0E17', accent: '#FFD23F' },
  street: { ground: '#B9B4C8', ground2: '#ACA6BE', road: '#4B4760', kerb1: '#FF4D2E', kerb2: '#FFFDF7', edge: '#0F0E17', accent: '#FF7AB6' },
  forest: { ground: '#6FBF82', ground2: '#63B476', road: '#565270', kerb1: '#F2B900', kerb2: '#FFFDF7', edge: '#0F0E17', accent: '#5DD17B' },
  coast:  { ground: '#F4DFA5', ground2: '#EED493', road: '#5E5A78', kerb1: '#4ABEFF', kerb2: '#FFFDF7', edge: '#0F0E17', accent: '#4ABEFF' },
  snow:   { ground: '#EFEAF9', ground2: '#E3DBF4', road: '#6B6787', kerb1: '#FF4D2E', kerb2: '#FFFDF7', edge: '#0F0E17', accent: '#4ABEFF' },
};

/* Catmull-Rom on closed loop */
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function buildTrack(id) {
  const def = TRACK_DEFS[id];
  const P = def.pts, N = P.length;
  const SPACING = 2.6;

  // --- sample the closed spline ---
  const raw = [];
  for (let i = 0; i < N; i++) {
    const p0 = P[(i - 1 + N) % N], p1 = P[i], p2 = P[(i + 1) % N], p3 = P[(i + 2) % N];
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(3, Math.round(segLen / SPACING));
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      raw.push([
        catmull(p0[0], p1[0], p2[0], p3[0], t),
        catmull(p0[1], p1[1], p2[1], p3[1], t),
      ]);
    }
  }
  const n = raw.length;

  // tangents, normals, curvature, arc length
  const samples = new Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = raw[(i - 1 + n) % n], b = raw[i], c = raw[(i + 1) % n];
    let tx = c[0] - a[0], ty = c[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    if (i > 0) s += Math.hypot(b[0] - raw[i - 1][0], b[1] - raw[i - 1][1]);
    samples[i] = { x: b[0], y: b[1], tx, ty, nx: -ty, ny: tx, w: def.width, k: 0, kerb: false, s };
  }
  const len = s + Math.hypot(raw[0][0] - raw[n - 1][0], raw[0][1] - raw[n - 1][1]);

  // curvature: signed rate of heading change per meter
  for (let i = 0; i < n; i++) {
    const a = samples[(i - 1 + n) % n], b = samples[i], c = samples[(i + 1) % n];
    const h1 = Math.atan2(a.ty, a.tx), h2 = Math.atan2(c.ty, c.tx);
    const ds = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    b.k = angWrap(h2 - h1) / ds;
  }
  // smooth curvature a touch
  for (let pass = 0; pass < 2; pass++) {
    const kk = samples.map(sm => sm.k);
    for (let i = 0; i < n; i++) samples[i].k = (kk[(i - 1 + n) % n] + kk[i] * 2 + kk[(i + 1) % n]) / 4;
  }
  // kerb zones: sustained curvature, expanded a bit
  const kerbMask = samples.map(sm => Math.abs(sm.k) > 0.016);
  for (let i = 0; i < n; i++) {
    if (kerbMask[i]) for (let d = -4; d <= 4; d++) samples[(i + d + n) % n].kerb = true;
  }

  // --- racing line: taut-string relaxation of lateral offsets ---
  const margin = 2.0;
  const off = new Float32Array(n);
  const lx = new Float32Array(n), ly = new Float32Array(n);
  for (let iter = 0; iter < 500; iter++) {
    for (let i = 0; i < n; i++) {
      const sm = samples[i];
      lx[i] = sm.x + sm.nx * off[i]; ly[i] = sm.y + sm.ny * off[i];
    }
    for (let i = 0; i < n; i++) {
      const sm = samples[i];
      const im = (i - 1 + n) % n, ip = (i + 1) % n;
      const mx = (lx[im] + lx[ip]) / 2, my = (ly[im] + ly[ip]) / 2;
      const want = (mx - sm.x) * sm.nx + (my - sm.y) * sm.ny;
      off[i] = clamp(off[i] + (want - off[i]) * 0.22, -(sm.w - margin), sm.w - margin);
    }
  }
  // final line points + curvature + per-point target speed
  const line = new Array(n);
  for (let i = 0; i < n; i++) {
    const sm = samples[i];
    line[i] = { x: sm.x + sm.nx * off[i], y: sm.y + sm.ny * off[i], o: off[i], k: 0, v: 0 };
  }
  for (let i = 0; i < n; i++) {
    const a = line[(i - 1 + n) % n], b = line[i], c = line[(i + 1) % n];
    const h1 = Math.atan2(b.y - a.y, b.x - a.x), h2 = Math.atan2(c.y - b.y, c.x - b.x);
    const ds = (Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - b.x, c.y - b.y)) / 2 || 1;
    b.k = angWrap(h2 - h1) / ds;
  }
  for (let pass = 0; pass < 3; pass++) {
    const kk = line.map(l => l.k);
    for (let i = 0; i < n; i++) line[i].k = (kk[(i - 1 + n) % n] + kk[i] * 2 + kk[(i + 1) % n]) / 4;
  }
  const V_MAX = 41, A_LAT = 21, A_BRK = 17, A_ACC = 9;
  for (let i = 0; i < n; i++) line[i].v = clamp(Math.sqrt(A_LAT / Math.max(1e-4, Math.abs(line[i].k))), 9.5, V_MAX);
  const dsAvg = len / n;
  for (let lap = 0; lap < 3; lap++) {
    for (let i = n - 1; i >= 0; i--) {
      const nx2 = line[(i + 1) % n];
      line[i].v = Math.min(line[i].v, Math.sqrt(nx2.v * nx2.v + 2 * A_BRK * dsAvg));
    }
  }
  for (let lap = 0; lap < 2; lap++) {
    for (let i = 0; i < n; i++) {
      const pv = line[(i - 1 + n) % n];
      line[i].v = Math.min(line[i].v, Math.sqrt(pv.v * pv.v + 2 * A_ACC * dsAvg));
    }
  }

  // --- spatial grid for nearest-sample lookup ---
  const CELL = 12;
  const grid = new Map();
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (let i = 0; i < n; i++) {
    const sm = samples[i];
    minx = Math.min(minx, sm.x); maxx = Math.max(maxx, sm.x);
    miny = Math.min(miny, sm.y); maxy = Math.max(maxy, sm.y);
    const key = ((sm.x / CELL) | 0) + ',' + ((sm.y / CELL) | 0);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }
  const pad = def.width + def.runoff + 30;
  const bbox = { minx: minx - pad, miny: miny - pad, maxx: maxx + pad, maxy: maxy + pad };

  function nearest(x, y, hint) {
    if (hint != null) {
      let best = hint, bd = 1e18;
      for (let d = -26; d <= 26; d++) {
        const i = (hint + d + n) % n;
        const dd = dist2(x, y, samples[i].x, samples[i].y);
        if (dd < bd) { bd = dd; best = i; }
      }
      if (bd < 45 * 45) return best;
    }
    let best = 0, bd = 1e18;
    const cx = (x / CELL) | 0, cy = (y / CELL) | 0;
    for (let r = 0; r < 9; r++) {
      let found = false;
      for (let gx = cx - r; gx <= cx + r; gx++) for (let gy = cy - r; gy <= cy + r; gy++) {
        if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== r) continue;
        const cell = grid.get(gx + ',' + gy);
        if (!cell) continue;
        found = true;
        for (const i of cell) {
          const dd = dist2(x, y, samples[i].x, samples[i].y);
          if (dd < bd) { bd = dd; best = i; }
        }
      }
      if (found && r > 1) break;
    }
    if (bd > 1e17) { // far off grid: full scan
      for (let i = 0; i < n; i += 3) {
        const dd = dist2(x, y, samples[i].x, samples[i].y);
        if (dd < bd) { bd = dd; best = i; }
      }
    }
    return best;
  }

  function minDistToCenter(x, y) {
    const i = nearest(x, y, null);
    return Math.sqrt(dist2(x, y, samples[i].x, samples[i].y));
  }

  // --- pit lane: straight stretch ending just before start/finish ---
  const pitLen = Math.round(70 / dsAvg);          // ~70 m of pit lane
  const pitB = n - Math.round(6 / dsAvg);          // rejoin just before S/F
  const pitA = (pitB - pitLen + n) % n;
  const pit = { a: pitA, b: pitB, side: def.pitSide, boxIdx: (pitA + Math.round(pitLen * 0.55)) % n, lane: 4.2 };
  function pitOffsetAt(i) {
    // smooth ramp: 0 at entry, full lane offset in the middle, 0 at exit
    const rel = ((i - pitA + n) % n) / pitLen;
    if (rel < 0 || rel > 1) return null;
    const ramp = rel < 0.25 ? rel / 0.25 : rel > 0.8 ? (1 - rel) / 0.2 : 1;
    return def.pitSide * (samples[i].w + pit.lane) * ramp;
  }

  // --- grid slots: 8 staggered, behind the line ---
  const gridSlots = [];
  for (let g = 0; g < 8; g++) {
    const back = 10 + g * 5.4;
    const i = nearestByS(len - back);
    const sm = samples[i];
    const side = (g % 2 === 0 ? -1 : 1) * sm.w * 0.34;
    gridSlots.push({ x: sm.x + sm.nx * side, y: sm.y + sm.ny * side, heading: Math.atan2(sm.ty, sm.tx), idx: i });
  }
  function nearestByS(targetS) {
    targetS = ((targetS % len) + len) % len;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (samples[mid].s < targetS) lo = mid + 1; else hi = mid; }
    return lo;
  }

  // --- decor ---
  const decor = buildDecor(id, def, samples, n, minDistToCenter, bbox);

  return {
    id, def, name: def.name, theme: def.theme, colors: THEME_COLORS[def.theme],
    samples, n, len, line, grid, CELL, bbox, nearest, minDistToCenter, decor,
    pit, pitOffsetAt, gridSlots, nearestByS,
    checkpoints: [Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75)],
    runoff: def.runoff,
  };
}

function buildDecor(id, def, samples, n, minDistToCenter, bbox) {
  const r = rng(hashStr('decor-' + id));
  const decor = [];
  const theme = def.theme;
  const tryPlace = (fn, attempts) => {
    for (let a = 0; a < attempts; a++) {
      const x = bbox.minx + r() * (bbox.maxx - bbox.minx);
      const y = bbox.miny + r() * (bbox.maxy - bbox.miny);
      const d = minDistToCenter(x, y);
      fn(x, y, d);
    }
  };
  const GREENS = ['#36A857', '#2F9A4E', '#43B863', '#5DD17B'];
  const BUILDS = ['#FF7AB6', '#4ABEFF', '#FFD23F', '#A07BFF', '#FF9A62', '#7BE3D2'];

  if (theme === 'snow') {
    tryPlace((x, y, d) => {
      if (d > def.width + def.runoff + 4 && d < def.width + 65) {
        decor.push({ t: 'tree', x, y, r: 2.4 + r() * 2.6, c: GREENS[(r() * GREENS.length) | 0] });
      }
    }, 420);
    tryPlace((x, y, d) => {
      if (d > def.width + def.runoff + 3 && d < def.width + 40 && r() < 0.5) {
        decor.push({ t: 'rock', x, y, r: 1.4 + r() * 2.2 });   // snow drifts
      }
    }, 40);
    // frozen ponds
    decor.push({ t: 'water', x: bbox.minx + (bbox.maxx - bbox.minx) * 0.52, y: bbox.miny + (bbox.maxy - bbox.miny) * 0.5, r: 26 });
    decor.push({ t: 'water', x: bbox.maxx - 55, y: bbox.maxy - 70, r: 34 });
  }
  if (theme === 'meadow' || theme === 'forest') {
    const density = theme === 'forest' ? 520 : 300;
    tryPlace((x, y, d) => {
      if (d > def.width + def.runoff + 4 && d < def.width + 65) {
        decor.push({ t: 'tree', x, y, r: 2.6 + r() * 2.8, c: GREENS[(r() * GREENS.length) | 0] });
      }
    }, density);
    tryPlace((x, y, d) => {
      if (theme === 'meadow' && d > def.width + 3 && d < def.width + 50) {
        decor.push({ t: 'flower', x, y, c: ['#FF7AB6', '#FFD23F', '#FFFDF7', '#FF4D2E'][(r() * 4) | 0] });
      }
    }, theme === 'meadow' ? 220 : 0);
    if (theme === 'forest') tryPlace((x, y, d) => {
      if (d > def.width + def.runoff + 3 && d < def.width + 30 && r() < 0.5) {
        decor.push({ t: 'rock', x, y, r: 1.6 + r() * 2 });
      }
    }, 26);
  }
  if (theme === 'street') {
    // buildings hug the outside of the ribbon
    for (let i = 0; i < n; i += Math.round(16 / (samples[1].s - samples[0].s || 2.6))) {
      const sm = samples[i];
      for (const side of [-1, 1]) {
        if (r() < 0.42) continue;
        const bw = 9 + r() * 8, bh = 8 + r() * 7;
        const halfDiag = Math.hypot(bw, bh) / 2;
        const setback = def.width + def.runoff + halfDiag + 1.5 + r() * 4;
        const bx = sm.x + sm.nx * side * setback, by = sm.y + sm.ny * side * setback;
        if (minDistToCenter(bx, by) < def.width + def.runoff + halfDiag + 1) continue;
        decor.push({
          t: 'building', x: bx, y: by, rot: Math.atan2(sm.ty, sm.tx),
          w: bw, h: bh, c: BUILDS[(r() * BUILDS.length) | 0],
          floors: 2 + (r() * 3 | 0),
        });
      }
    }
    tryPlace((x, y, d) => {
      if (d > def.width + def.runoff + 2.5 && d < def.width + 26 && r() < 0.35) {
        decor.push({ t: 'tree', x, y, r: 2 + r() * 1.6, c: GREENS[(r() * GREENS.length) | 0] });
      }
    }, 40);
  }
  if (theme === 'coast') {
    tryPlace((x, y, d) => {
      if (d > def.width + def.runoff + 3 && d < def.width + 55) {
        if (r() < 0.55) decor.push({ t: 'palm', x, y, r: 3 + r() * 2 });
        else decor.push({ t: 'umbrella', x, y, c: ['#FF4D2E', '#4ABEFF', '#FFD23F', '#FF7AB6'][(r() * 4) | 0] });
      }
    }, 260);
    // water pools in the far corners
    decor.push({ t: 'water', x: bbox.maxx - 30, y: bbox.miny + 40, r: 90 });
    decor.push({ t: 'water', x: bbox.maxx - 10, y: bbox.maxy - 60, r: 110 });
  }
  // grandstand + billboards near start on every track
  const s0 = samples[0];
  decor.push({ t: 'stand', x: s0.x - s0.nx * (def.width + def.runoff + 9), y: s0.y - s0.ny * (def.width + def.runoff + 9), rot: Math.atan2(s0.ty, s0.tx), w: 34, h: 10 });
  const bbTexts = ['KART RUNNER', 'SOFT! GRIP! GO!', 'DRIFT JUICE', 'APEX CLUB', 'TYRES & CHILL'];
  for (let b = 0; b < 4; b++) {
    const i = Math.floor(n * (0.18 + 0.2 * b) + r() * 20) % n;
    const sm = samples[i];
    const side = r() < 0.5 ? 1 : -1;
    const bx = sm.x + sm.nx * side * (def.width + def.runoff + 6), by = sm.y + sm.ny * side * (def.width + def.runoff + 6);
    if (minDistToCenter(bx, by) < def.width + def.runoff + 4.5) continue;
    decor.push({ t: 'billboard', x: bx, y: by, rot: Math.atan2(sm.ty, sm.tx), text: bbTexts[(r() * bbTexts.length) | 0], c: ['#FFD23F', '#4ABEFF', '#FF7AB6'][(r() * 3) | 0] });
  }
  return decor;
}

/* build all tracks once at boot */
const TRACKS = {};
function initTracks() {
  for (const id of Object.keys(TRACK_DEFS)) TRACKS[id] = buildTrack(id);
}

/* Surface query — the physics contract.
   Returns { surf: 'road'|'kerb'|'grass'|'wall', gripMul, dragMul, d, idx, inPit } */
function surfaceAt(track, x, y, hint) {
  const idx = track.nearest(x, y, hint);
  const sm = track.samples[idx];
  const d = (x - sm.x) * sm.nx + (y - sm.y) * sm.ny;
  const ad = Math.abs(d);
  // pit lane overrides
  const po = track.pitOffsetAt(idx);
  let inPit = false;
  if (po !== null && po !== 0) {
    const laneHalf = 3.0;
    if (Math.abs(d - po) < laneHalf && Math.abs(po) > 1.5) inPit = true;
  }
  let surf, gripMul = 1, dragMul = 1;
  if (ad <= sm.w) { surf = 'road'; }
  else if (sm.kerb && ad <= sm.w + 1.6) { surf = 'kerb'; gripMul = 0.92; dragMul = 1.05; }
  else if (inPit) { surf = 'road'; }
  else if (ad <= sm.w + track.runoff) { surf = 'grass'; gripMul = 0.52; dragMul = 3.2; }
  else { surf = 'wall'; gripMul = 0.4; dragMul = 4; }
  return { surf, gripMul, dragMul, d, idx, inPit, sm };
}
