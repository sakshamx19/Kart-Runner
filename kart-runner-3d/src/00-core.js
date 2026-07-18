'use strict';
/* ============================================================
   00-core.js — utilities, persistence, profile, ELO, season
   ============================================================ */

// touch-first device? (primary pointer is coarse — phones & tablets)
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
document.documentElement.classList.toggle('touch', IS_TOUCH);

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const angWrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

// Tiny DOM builder — el('div.card', {onclick}, child, 'text', ...)
function el(spec, props, ...kids) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  if (props) for (const [k, v] of Object.entries(props)) {
    if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'html') node.innerHTML = v;
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const kid of kids.flat(9)) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return node;
}

// Deterministic RNG (mulberry32) — used for weekly seeds & AI flavour
function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// time formatting — ms -> "1:23.456"
function fmtTime(ms) {
  if (ms == null || !isFinite(ms)) return '—:——.———';
  const neg = ms < 0; ms = Math.abs(ms);
  const m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000), t = Math.floor(ms % 1000);
  return (neg ? '-' : '') + m + ':' + String(s).padStart(2, '0') + '.' + String(t).padStart(3, '0');
}
function fmtDelta(ms) {
  if (ms == null || !isFinite(ms)) return '';
  return (ms >= 0 ? '+' : '−') + (Math.abs(ms) / 1000).toFixed(3);
}

// ISO week number (for weekly challenge / clan sim)
function isoWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return { year: date.getUTCFullYear(), week: Math.ceil(((date - y0) / 86400000 + 1) / 7) };
}
const weekKey = () => { const w = isoWeek(); return w.year + '-W' + String(w.week).padStart(2, '0'); };

/* ---------------- persistence ---------------- */
const SAVE_KEY = 'kartrunner-save-v1';

const TIERS = [
  { id: 'bronze', name: 'BRONZE', min: 0,    c: 'var(--tier-bronze)' },
  { id: 'silver', name: 'SILVER', min: 1200, c: 'var(--tier-silver)' },
  { id: 'gold',   name: 'GOLD',   min: 1500, c: 'var(--tier-gold)' },
  { id: 'plat',   name: 'PLAT',   min: 1800, c: 'var(--tier-plat)' },
  { id: 'dia',    name: 'DIA',    min: 2100, c: 'var(--tier-diamond)' },
  { id: 'apex',   name: 'APEX',   min: 2400, c: 'var(--tier-apex)' },
];
function tierOf(elo) {
  let t = TIERS[0];
  for (const x of TIERS) if (elo >= x.min) t = x;
  const next = TIERS[TIERS.indexOf(t) + 1];
  const span = (next ? next.min : t.min + 300) - t.min;
  const into = clamp((elo - t.min) / span, 0, 0.999);
  const div = 3 - Math.floor(into * 3); // III, II, I
  return { ...t, div: ['', 'I', 'II', 'III'][div], label: t.name + (t.id === 'apex' ? '' : ' ' + ['', 'I', 'II', 'III'][div]) };
}

const AI_FIRST = ['Turbo', 'Blaze', 'Vroom', 'Apex', 'Nitro', 'Drift', 'Zippy', 'Dash', 'Slick', 'Gears', 'Whirl', 'Bolt', 'Skid', 'Zoom', 'Pogo', 'Choco', 'Mango', 'Pixel', 'Waffle', 'Biscuit'];
const AI_LAST = ['Fox', 'Panda', 'Otter', 'Llama', 'Duck', 'Tiger', 'Yeti', 'Frog', 'Moose', 'Cactus', 'Comet', 'Raccoon', 'Penguin', 'Wizard', 'Goblin', 'Koala', 'Shark', 'Falcon', 'Badger', 'Robot'];
const FLAGS = ['🇮🇳', '🇯🇵', '🇧🇷', '🇬🇧', '🇩🇪', '🇫🇷', '🇮🇹', '🇪🇸', '🇺🇸', '🇦🇺', '🇲🇽', '🇰🇷', '🇨🇦', '🇳🇱', '🇫🇮', '🇿🇦'];
const KART_COLORS = ['#FF4D2E', '#4ABEFF', '#FFD23F', '#5DD17B', '#A07BFF', '#FF7AB6', '#F2B900', '#1E97E0', '#36A857', '#E03A1C'];

const PRESET_CLANS = [
  { id: 'apx', tag: 'APX', name: 'Apex Alpacas', color: '#FF4D2E' },
  { id: 'tdk', tag: 'TDK', name: 'Turbo Ducks', color: '#FFD23F' },
  { id: 'nbl', tag: 'NBL', name: 'Nitro Blizzard', color: '#4ABEFF' },
  { id: 'grt', tag: 'GRT', name: 'Green Torque', color: '#5DD17B' },
  { id: 'vlt', tag: 'VLT', name: 'Volt Foxes', color: '#A07BFF' },
  { id: 'pnk', tag: 'PNK', name: 'Pink Slipstream', color: '#FF7AB6' },
  { id: 'mid', tag: 'MID', name: 'Midnight Gears', color: '#2A2738' },
  { id: 'sun', tag: 'SUN', name: 'Sunset Skids', color: '#F2B900' },
];

function makeRivals() {
  const r = rng(20260709);
  const used = new Set();
  const rivals = [];
  for (let i = 0; i < 40; i++) {
    let name;
    do { name = AI_FIRST[(r() * AI_FIRST.length) | 0] + AI_LAST[(r() * AI_LAST.length) | 0]; } while (used.has(name));
    used.add(name);
    rivals.push({
      id: 'r' + i,
      name,
      flag: FLAGS[(r() * FLAGS.length) | 0],
      color: KART_COLORS[(r() * KART_COLORS.length) | 0],
      elo: Math.round(900 + r() * 1700),
      clanId: r() < 0.7 ? PRESET_CLANS[(r() * PRESET_CLANS.length) | 0].id : null,
      pts: Math.round(r() * 120),
    });
  }
  return rivals;
}

function defaultSave() {
  return {
    v: 1,
    profile: {
      name: null, flag: '🇮🇳', color: '#FF4D2E', number: 7,
      elo: 1000, xp: 0, level: 1, sp: 2,
      skills: [],           // owned skill ids
      clanId: null,
      stats: { races: 0, wins: 0, podiums: 0, laps: 0, cleanLaps: 0 },
      bestLaps: {},          // trackId -> ms
      seasonPts: 0,
    },
    settings: {
      compound: 'medium',
      laps: 3,
      assists: { line: true, traction: true, autobrake: false, markers: true },
      muted: false,
      trackId: 'sunrise',
    },
    weekly: {},              // weekKey -> { done, pos, pts }
    ghosts: {},              // trackId -> { dt, pts: [x,y,h,...], lapMs }
    history: [],             // recent race results (max 12)
    rivals: makeRivals(),
    customClan: null,
  };
}

let DB = null;
function loadDB() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.v === 1) { DB = Object.assign(defaultSave(), d); return DB; }
    }
  } catch (e) { /* corrupted or blocked storage — start fresh */ }
  DB = defaultSave();
  return DB;
}
function saveDB() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(DB)); } catch (e) { /* private mode */ }
}

/* ---------------- skills ---------------- */
const SKILL_TREE = [
  { branch: 'Handling', color: 'var(--sky)', nodes: [
    { id: 'h1', name: 'Sticky Rubber', desc: '+6% cornering grip', cost: 1 },
    { id: 'h2', name: 'Quick Hands', desc: '+10% steering response', cost: 2 },
    { id: 'h3', name: 'Kerb Rider', desc: '+8% grip on kerbs & +4% overall', cost: 3 },
  ]},
  { branch: 'Engine', color: 'var(--orange)', nodes: [
    { id: 'e1', name: 'Hot Spark', desc: '+6% acceleration', cost: 1 },
    { id: 'e2', name: 'Slip Tuner', desc: '+40% slipstream power', cost: 2 },
    { id: 'e3', name: 'Big Carburettor', desc: '+4% top speed', cost: 3 },
  ]},
  { branch: 'Tyrecraft', color: 'var(--grass)', nodes: [
    { id: 't1', name: 'Gentle Feet', desc: '−15% tyre wear', cost: 1 },
    { id: 't2', name: 'Drift Doctor', desc: '+35% drift boost charge', cost: 2 },
    { id: 't3', name: 'Compound Whisperer', desc: '−15% wear & softer wear cliff', cost: 3 },
  ]},
];

// Physics modifiers derived from owned skills
function skillMods(skills) {
  const has = id => skills.includes(id);
  return {
    grip: (has('h1') ? 1.06 : 1) * (has('h3') ? 1.04 : 1),
    kerbGrip: has('h3') ? 1.08 : 1,
    steer: has('h2') ? 1.10 : 1,
    accel: has('e1') ? 1.06 : 1,
    top: has('e3') ? 1.04 : 1,
    slip: has('e2') ? 1.4 : 1,
    wear: (has('t1') ? 0.85 : 1) * (has('t3') ? 0.85 : 1),
    wearCliff: has('t3') ? 0.6 : 1,
    boost: has('t2') ? 1.35 : 1,
  };
}

/* ---------------- tyres ---------------- */
const COMPOUNDS = {
  soft:   { id: 'soft',   name: 'SOFT',   letter: 'S', c: 'var(--tyre-soft)',  hex: '#E03A1C', grip: 1.055, wearRate: 1.75, desc: 'Maximum grip, melts fast. Sprint weapon.' },
  medium: { id: 'medium', name: 'MEDIUM', letter: 'M', c: 'var(--tyre-medium)',hex: '#F2B900', grip: 1.0,   wearRate: 1.0,  desc: 'The all-rounder. Predictable through a full stint.' },
  hard:   { id: 'hard',   name: 'HARD',   letter: 'H', c: 'var(--tyre-hard)',  hex: '#ECECEC', grip: 0.955, wearRate: 0.55, desc: 'Slow but nearly immortal. Long-race insurance.' },
};

/* ---------------- ELO ---------------- */
// pairwise Elo vs the 7 AI drivers; returns integer delta for the player
function eloDelta(playerElo, field, playerPos) {
  // field: array of {elo, pos} for opponents
  const K = 24 / Math.max(1, field.length);
  let d = 0;
  for (const o of field) {
    const exp = 1 / (1 + Math.pow(10, (o.elo - playerElo) / 400));
    const act = playerPos < o.pos ? 1 : 0.0;
    d += K * (act - exp);
  }
  return Math.round(d * 2.2); // scaled so a full-lobby win ≈ +18..30
}

// race points, 8 karts, F1-flavoured
const RACE_PTS = [25, 18, 15, 12, 10, 8, 6, 4];

// XP: level curve
const xpForLevel = lv => 90 + (lv - 1) * 60;
function grantXP(amount) {
  const p = DB.profile;
  p.xp += amount;
  let ups = 0;
  while (p.xp >= xpForLevel(p.level)) { p.xp -= xpForLevel(p.level); p.level++; p.sp++; ups++; }
  return ups;
}

/* ---------------- rivals / matchmaking ---------------- */
function pickLobby() {
  const p = DB.profile;
  const pool = [...DB.rivals].sort((a, b) => Math.abs(a.elo - p.elo) - Math.abs(b.elo - p.elo));
  // 7 nearest by ELO with a little shuffle so lobbies vary
  const near = pool.slice(0, 14);
  for (let i = near.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[near[i], near[j]] = [near[j], near[i]]; }
  return near.slice(0, 7);
}

// After a race: nudge participating rivals' ELO, and let the rest of the ladder drift
function settleLadder(participants, order) {
  // order: array of {id (rival id or 'me'), pos}
  for (const o of order) {
    if (o.id === 'me') continue;
    const rv = DB.rivals.find(r => r.id === o.id);
    if (!rv) continue;
    const others = order.filter(x => x !== o);
    let d = 0;
    for (const x of others) {
      const xe = x.id === 'me' ? DB.profile.elo : (DB.rivals.find(r => r.id === x.id) || { elo: 1400 }).elo;
      const exp = 1 / (1 + Math.pow(10, (xe - rv.elo) / 400));
      d += (24 / others.length) * ((o.pos < x.pos ? 1 : 0) - exp);
    }
    rv.elo = Math.max(700, Math.round(rv.elo + d * 2.2));
    rv.pts += RACE_PTS[o.pos - 1] || 0;
  }
  // background ladder noise
  for (const rv of DB.rivals) if (!participants.includes(rv.id) && Math.random() < 0.35) {
    rv.elo = Math.max(700, rv.elo + Math.round((Math.random() - 0.48) * 14));
    if (Math.random() < 0.4) rv.pts += [25, 18, 15, 12, 10, 8, 6, 4][(Math.random() * 8) | 0];
  }
}

function clanById(id) {
  if (!id) return null;
  if (DB.customClan && DB.customClan.id === id) return DB.customClan;
  return PRESET_CLANS.find(c => c.id === id) || null;
}
function clanTagOf(entity) {
  const c = clanById(entity.clanId);
  return c ? c.tag : null;
}

/* ---------------- weekly challenge ---------------- */
function weeklyChallenge() {
  const wk = weekKey();
  const r = rng(hashStr('weekly-' + wk));
  const trackIds = Object.keys(TRACK_DEFS);
  const compounds = ['soft', 'medium', 'hard'];
  return {
    key: wk,
    trackId: trackIds[(r() * trackIds.length) | 0],
    laps: 3 + ((r() * 3) | 0) * 2,            // 3, 5 or 7
    compound: compounds[(r() * compounds.length) | 0],
    done: !!(DB.weekly[wk] && DB.weekly[wk].done),
    result: DB.weekly[wk] || null,
  };
}
