'use strict';
/* ============================================================
   70-ui.js — sidebar, screens, modals
   ============================================================ */

const NAV = [
  { section: 'Race' },
  { id: 'home', label: 'Home' },
  { id: 'lobby', label: 'Quick Match' },
  { id: 'online', label: 'Friends Room' },
  { id: 'tracks', label: 'Tracks' },
  { id: 'setup', label: 'Setup' },
  { section: 'Career' },
  { id: 'garage', label: 'Garage' },
  { id: 'training', label: 'Training' },
  { section: 'Social' },
  { id: 'clan', label: 'Club' },
  { id: 'leaderboards', label: 'Leaderboards' },
];

function navIcon(id) {
  const svg = (d, extra = '') => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${extra}<path d="${d}"/></svg>`;
  switch (id) {
    case 'home': return svg('M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z');
    case 'lobby': return svg('M13 2L4 14h7l-1 8 9-12h-7z');
    case 'online': return svg('M2 12h20M12 2c3 3 4.5 6.5 4.5 10S15 19 12 22M12 2c-3 3-4.5 6.5-4.5 10S9 19 12 22', '<circle cx="12" cy="12" r="10"/>');
    case 'tracks': return svg('M5 4h3v16H5zM10 4h2v16h-2zM14 4h6v20h-6z');
    case 'setup': return svg('M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z', '<circle cx="12" cy="12" r="3"/>');
    case 'garage': return svg('M3 21V9l9-6 9 6v12M3 13h18M9 21v-6h6v6');
    case 'training': return svg('', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>');
    case 'clan': return svg('M3 20a6 6 0 0 1 12 0M14 20a4 4 0 0 1 7-3', '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/>');
    case 'leaderboards': return svg('M3 21h18M6 21V10M12 21V4M18 21v-7');
    default: return '';
  }
}

let currentScreen = 'home';
let screenCleanup = null;

function renderSidebar() {
  const p = DB.profile;
  const tier = tierOf(p.elo);
  const sb = document.getElementById('sidebar');
  sb.innerHTML = '';
  sb.append(el('div.nav-logo', { html: 'KART<br><em>RUNNER</em>' }, el('small', {}, 'SEASON 04 · APEX')));
  for (const n of NAV) {
    if (n.section) { sb.append(el('div.nav-section', {}, n.section)); continue; }
    sb.append(el('button.nav-item' + (currentScreen === n.id ? '.active' : ''), {
      onclick: () => { SFX.click(); showScreen(n.id); },
    }, el('span.ico', { html: navIcon(n.id) }), el('span.txt', {}, n.label)));
  }
  sb.append(el('div.nav-spacer'));
  const muteBtn = el('button.nav-item', { onclick: () => { SFX.setMuted(!SFX.muted); muteBtn.querySelector('.txt').textContent = SFX.muted ? 'Sound: off' : 'Sound: on'; } },
    el('span.ico', {}, SFX.muted ? '🔇' : '🔊'), el('span.txt', {}, SFX.muted ? 'Sound: off' : 'Sound: on'));
  sb.append(muteBtn);
  sb.append(el('div.nav-user', {},
    el('span.av', { style: { width: '40px', height: '40px', background: p.color, fontSize: '16px' } }, (p.name || 'R')[0].toUpperCase()),
    el('div.meta', {},
      el('div.name', {}, (clanTagOf(p) ? '[' + clanTagOf(p) + '] ' : '') + (p.name || 'RACER')),
      el('div.elo', {}, p.elo + ' ELO · ' + tier.label)),
  ));
}

function showScreen(id, arg) {
  if (screenCleanup) { screenCleanup(id); screenCleanup = null; }
  currentScreen = id;
  renderSidebar();
  const main = document.getElementById('main');
  main.innerHTML = '';
  main.scrollTop = 0;
  const S = SCREENS[id] || SCREENS.home;
  main.append(S(arg));
}

/* ---------- shared bits ---------- */
function tierChip(elo) {
  const t = tierOf(elo);
  return el('span.chip', { style: { background: t.c, color: ['silver', 'gold', 'plat'].includes(t.id) ? 'var(--ink)' : '#fff' } }, t.label);
}
function tyreDot(cid, size = 30) {
  const c = COMPOUNDS[cid];
  return el('span.tyre', { style: { '--c': c.hex, width: size + 'px', height: size + 'px' } }, c.letter);
}
function trackStats(tr) {
  return (tr.len / 1000).toFixed(2) + ' km · ' + trackCorners(tr).length + ' corners';
}
function pageHead(title, sub, accent) {
  return el('div', {},
    el('h1.h-page', { html: accent ? title.replace(accent, `<span class="accent">${accent}</span>`) : title }),
    sub ? el('p.h-sub', {}, sub) : null);
}
function statTile(v, l) { return el('div.stat', {}, el('div.v', {}, v), el('div.l', {}, l)); }

function kartSVG(color, scale = 1) {
  const w = 84 * scale, h = 46 * scale;
  return el('span', {
    html: `<svg width="${w}" height="${h}" viewBox="0 0 84 46">
      <ellipse cx="44" cy="40" rx="34" ry="5" fill="rgba(15,14,23,.18)"/>
      <rect x="6" y="6" width="10" height="12" rx="4" fill="#0F0E17"/>
      <rect x="6" y="28" width="10" height="12" rx="4" fill="#0F0E17"/>
      <rect x="64" y="7" width="9" height="11" rx="4" fill="#0F0E17"/>
      <rect x="64" y="28" width="9" height="11" rx="4" fill="#0F0E17"/>
      <rect x="10" y="10" width="62" height="26" rx="12" fill="${color}" stroke="#0F0E17" stroke-width="3"/>
      <rect x="56" y="15" width="13" height="16" rx="6" fill="#FFFDF7" stroke="#0F0E17" stroke-width="2.4"/>
      <circle cx="34" cy="23" r="8" fill="#FFFDF7" stroke="#0F0E17" stroke-width="2.4"/>
      <circle cx="37" cy="23" r="4" fill="#4ABEFF"/>
      <rect x="4" y="8" width="5" height="30" rx="2" fill="#0F0E17"/>
    </svg>` });
}

/* ============================ HOME ============================ */
const SCREENS = {};

SCREENS.home = () => {
  const p = DB.profile;
  const wc = weeklyChallenge();
  const wTrack = TRACKS[wc.trackId];
  const selTrack = TRACKS[DB.settings.trackId];

  const hero = el('div.hero', {},
    el('div.sun-disc'),
    el('div', { style: { position: 'relative', zIndex: 1 } },
      el('div.eyebrow', { style: { color: '#EAF7FF' } }, 'RANKED · GLOBAL MATCHMAKING'),
      el('h1', {}, 'RACE THE WORLD.'),
      el('p', {}, 'Eight karts, one racing line, zero mercy. Win to climb the ladder — tyres decide everything.'),
      el('button.btn.big.primary', { onclick: () => { SFX.click(); showScreen('lobby'); } }, '⚡ QUICK MATCH'),
      el('span', { style: { display: 'inline-block', width: '10px' } }),
      el('button.btn.big.sky', { onclick: () => { SFX.click(); showScreen('online'); } }, '👥 FRIENDS ROOM'),
      el('span', { style: { display: 'inline-block', width: '10px' } }),
      el('button.btn.big.sun', { onclick: () => { SFX.click(); showScreen('training'); } }, 'PRACTICE')),
    el('div.hero-kart', {}, kartSVG(p.color, 1.15)),
    el('div.road', {}, el('i')));

  const stats = el('div.grid-3', { style: { gridTemplateColumns: 'repeat(4,1fr)' } },
    statTile(p.elo, 'ELO RATING'),
    statTile(tierOf(p.elo).label, 'LEAGUE'),
    statTile(p.stats.wins + ' / ' + p.stats.races, 'WINS / RACES'),
    statTile(p.seasonPts, 'SEASON POINTS'));

  const wCard = el('div.card', {},
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
      el('div', {},
        el('div.eyebrow', {}, 'WEEKLY CHALLENGE · ' + wc.key),
        el('h2.h-section', { style: { margin: '4px 0' } }, wTrack.name + ' · ' + wc.laps + ' laps'),
        el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px' } },
          tyreDot(wc.compound, 26),
          el('span.chip.dim', {}, 'FIXED COMPOUND'),
          wc.done ? el('span.chip.grass', {}, 'DONE · P' + wc.result.pos + ' · +' + wc.result.pts + ' pts') : el('span.chip.sun', {}, 'DOUBLE XP'))),
      el('button.btn.sky', {
        onclick: () => { SFX.click(); showScreen('lobby', { weekly: true }); },
      }, wc.done ? 'IMPROVE RESULT' : 'RUN CHALLENGE')));

  const histRows = DB.history.slice(0, 5).map(h =>
    el('div.lrow', {},
      el('span.av', { style: { background: h.pos === 1 ? 'var(--yellow)' : 'var(--cream-2)' } }, 'P' + h.pos),
      el('div.grow', {},
        el('div.name', {}, TRACKS[h.trackId].name + (h.mode === 'weekly' ? ' · WEEKLY' : '')),
        el('div.sub', {}, h.laps + ' laps · best ' + fmtTime(h.bestLap ? h.bestLap * 1000 : null))),
      el('span.chip' + (h.dElo >= 0 ? '.grass' : '.orange'), {}, (h.dElo >= 0 ? '+' : '') + h.dElo + ' ELO')));

  const next = el('div.card', {},
    el('div.eyebrow', {}, 'NEXT RACE SETUP'),
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '14px', marginTop: '10px', flexWrap: 'wrap' } },
      kartSVG(p.color, 0.9),
      el('div', { style: { flex: 1, minWidth: '150px' } },
        el('div', { style: { fontWeight: 700 } }, selTrack.name),
        el('div.sub', { style: { fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink-3)' } }, trackStats(selTrack) + ' · ' + DB.settings.laps + ' laps')),
      tyreDot(DB.settings.compound, 34),
      el('button.btn', { onclick: () => { SFX.click(); showScreen('setup'); } }, 'CHANGE')));

  return el('div.screen', {}, hero, stats, wCard,
    el('div.grid-2', {}, next,
      el('div.card', {},
        el('div.eyebrow', {}, 'HOW TO DRIVE'),
        el('div', { style: { marginTop: '10px', fontSize: '13.5px', lineHeight: 1.75 },
          html: '<b>W / ↑</b> throttle &nbsp; <b>S / ↓</b> brake &amp; reverse<br><b>A D / ← →</b> steer &nbsp; <b>SPACE</b> hold to drift → boost<br><b>1 / 2 / 3</b> pick pit tyres &nbsp; <b>R</b> rescue &nbsp; <b>ESC</b> pause' }))),
    DB.history.length ? el('div.card', {}, el('div.eyebrow', { style: { marginBottom: '10px' } }, 'RECENT RACES'),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, histRows)) : null);
};

/* ============================ LOBBY ============================ */
SCREENS.lobby = (arg) => {
  const weekly = arg && arg.weekly;
  const wc = weekly ? weeklyChallenge() : null;
  const trackId = weekly ? wc.trackId : DB.settings.trackId;
  const laps = weekly ? wc.laps : DB.settings.laps;
  const compound = weekly ? wc.compound : DB.settings.compound;
  const tr = TRACKS[trackId];
  const p = DB.profile;

  const lobby = [];
  const pool = pickLobby();
  let secs = 0, joined = 0, countdown = null;

  const slotsWrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
  const status = el('span.chip.sun', {}, 'SEARCHING');
  const timer = el('span.num', { style: { fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--ink-3)' } }, '0:00');
  const startBtn = el('button.btn.big.primary', { disabled: true, onclick: launch }, 'RACE START');

  function renderSlots() {
    slotsWrap.innerHTML = '';
    slotsWrap.append(el('div.lobby-slot', { style: { background: 'var(--yellow)' } },
      el('span.av', { style: { background: p.color } }, (p.name || 'R')[0].toUpperCase()),
      el('div.grow', {}, el('div.name', {}, (clanTagOf(p) ? '[' + clanTagOf(p) + '] ' : '') + p.name + ' (you)'), el('div.sub', {}, p.elo + ' ELO')),
      tierChip(p.elo), el('span.chip.dim', {}, p.flag)));
    for (let i = 0; i < 7; i++) {
      if (i < lobby.length) {
        const rv = lobby[i];
        slotsWrap.append(el('div.lobby-slot', {},
          el('span.av', { style: { background: rv.color } }, rv.name[0]),
          el('div.grow', {}, el('div.name', {}, (clanTagOf(rv) ? '[' + clanTagOf(rv) + '] ' : '') + rv.name), el('div.sub', {}, rv.elo + ' ELO · ping ' + (18 + (hashStr(rv.name) % 80)) + 'ms')),
          tierChip(rv.elo), el('span.chip.dim', {}, rv.flag)));
      } else {
        slotsWrap.append(el('div.lobby-slot.empty', {}, el('span.searching-dots', {}, 'SEARCHING DRIVERS NEAR ' + p.elo + ' ELO')));
      }
    }
  }
  renderSlots();

  function launch() {
    cleanup();
    startRace({ trackId, laps, compound, mode: weekly ? 'weekly' : 'race', lobby: [...lobby] });
  }

  const iv = setInterval(() => {
    secs++;
    timer.textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
    if (joined < 7 && Math.random() < 0.75) {
      lobby.push(pool[joined]); joined++;
      SFX.blip(1);
      renderSlots();
      if (joined === 7) {
        status.textContent = 'LOBBY FULL — GRID IN 3';
        status.className = 'chip grass';
        startBtn.disabled = false;
        countdown = 3;
      }
    } else if (countdown != null) {
      countdown--;
      status.textContent = countdown > 0 ? 'LOBBY FULL — GRID IN ' + countdown : 'LIGHTS ON…';
      if (countdown <= 0) launch();
    }
  }, 800);
  function cleanup() { clearInterval(iv); }
  screenCleanup = cleanup;

  const mapCv = el('canvas', { width: 300, height: 190, style: { width: '100%', borderRadius: '14px', border: '2.5px solid var(--ink)' } });
  setTimeout(() => paintTrackMap(mapCv, tr), 0);

  return el('div.screen', {},
    pageHead(weekly ? 'WEEKLY CHALLENGE' : 'QUICK MATCH', weekly ? 'Fixed setup for everyone. One shot at glory (well, retries allowed).' : 'Ranked · matched by ELO', weekly ? 'CHALLENGE' : 'MATCH'),
    el('div.row', {},
      el('div.card', { style: { flex: '1.4' } },
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
          el('h2.h-section', {}, 'DRIVERS 8/8'), el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, status, timer)),
        slotsWrap),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
        el('div.card', {},
          el('div.eyebrow', {}, 'CIRCUIT'),
          el('h2.h-section', { style: { margin: '6px 0' } }, tr.name),
          el('div', { style: { fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink-3)', marginBottom: '10px' } }, trackStats(tr) + ' · ' + laps + ' laps'),
          mapCv,
          el('div', { style: { display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center', flexWrap: 'wrap' } },
            tyreDot(compound, 28),
            el('span.chip.dim', {}, COMPOUNDS[compound].name + (weekly ? ' · FIXED' : '')),
            laps >= 5 ? el('span.chip.sky', {}, 'PIT STOPS LIVE') : null),
          weekly ? null : el('button.btn.ghosted', { style: { marginTop: '12px', width: '100%' }, onclick: () => { cleanup(); showScreen('setup'); } }, 'EDIT SETUP')),
        startBtn)));
};

/* ============================ FRIENDS ROOM ============================ */
SCREENS.online = () => {
  const status = el('div');
  const codeIn = el('input', {
    type: 'text', maxLength: 4, placeholder: 'CODE',
    style: { textTransform: 'uppercase', fontFamily: 'var(--mono)', fontSize: '22px', letterSpacing: '6px', textAlign: 'center' },
  });
  const busy = msg => { status.innerHTML = ''; status.append(el('span.chip.sun', {}, msg)); };
  const oops = msg => { status.innerHTML = ''; status.append(el('span.chip.orange', {}, msg)); };

  const createBtn = el('button.btn.big.primary', {
    onclick: () => {
      SFX.click(); busy('OPENING ROOM…'); createBtn.disabled = true;
      NET.createRoom(err => { createBtn.disabled = false; err ? oops(err) : showScreen('room'); });
    },
  }, '🏁 CREATE ROOM');

  const joinBtn = el('button.btn.big.sky', {
    onclick: () => {
      if (codeIn.value.trim().length < 4) { oops('Enter the 4-letter room code'); return; }
      SFX.click(); busy('JOINING ' + codeIn.value.toUpperCase() + '…'); joinBtn.disabled = true;
      NET.joinRoom(codeIn.value, err => { joinBtn.disabled = false; err ? oops(err) : showScreen('room'); });
    },
  }, 'JOIN ROOM');
  codeIn.addEventListener('keydown', e => { if (e.key === 'Enter') joinBtn.click(); });

  return el('div.screen', {},
    pageHead('FRIENDS ROOM', 'Real multiplayer: your browsers connect directly to each other. Share a 4-letter code, race for the best lap.', 'FRIENDS'),
    el('div.grid-2', {},
      el('div.card', {},
        el('h2.h-section', {}, 'Host a race'),
        el('p', { style: { fontSize: '13.5px', color: 'var(--ink-3)', margin: '8px 0 16px' } },
          'You get a room code to share. You pick the track and laps; up to 8 racers. Your browser runs the room — keep this tab open.'),
        createBtn),
      el('div.card', {},
        el('h2.h-section', {}, 'Join a race'),
        el('p', { style: { fontSize: '13.5px', color: 'var(--ink-3)', margin: '8px 0 16px' } },
          'Type the code your friend shared. You race with your own kart, colours and assists.'),
        el('div', { style: { display: 'flex', gap: '10px' } }, codeIn, joinBtn))),
    status,
    el('div.card.tight', {},
      el('div', { style: { fontSize: '12.5px', color: 'var(--ink-3)', lineHeight: 1.7 } },
        '• Friendly rooms don’t change ELO — history and track PBs still count. ',
        '• Results and best laps are saved in each player’s own browser. ',
        '• If a room won’t connect, a firewall may be blocking WebRTC (rare on home networks).')));
};

SCREENS.room = () => {
  if (NET.status === 'idle') return SCREENS.online();
  const meIsHost = NET.isHost;

  // live re-render on room events
  NET.handlers.onRoster = () => { if (currentScreen === 'room') showScreen('room'); };
  NET.handlers.onCfg = () => { if (currentScreen === 'room') showScreen('room'); };
  NET.handlers.onError = msg => { alert(msg); showScreen('online'); };
  NET.handlers.onClosed = msg => { if (currentScreen === 'room') { alert(msg); showScreen('online'); } };
  NET.handlers.onStart = msg => {
    startRace({
      mode: 'online', trackId: msg.cfg.trackId, laps: msg.cfg.laps,
      compound: msg.cfg.compound, grid: msg.grid, roster: NET.playerList,
    });
  };
  screenCleanup = nextId => {
    NET.handlers.onRoster = NET.handlers.onCfg = NET.handlers.onError = NET.handlers.onClosed = NET.handlers.onStart = null;
    if (nextId !== 'room' && !Race.active && NET.status !== 'racing') NET.leave();
  };

  const players = NET.playerList;
  const me = NET.players.get(NET.myId) || {};
  const tr = TRACKS[NET.cfg.trackId];

  const codeCard = el('div.card', { style: { background: 'var(--yellow)' } },
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' } },
      el('div', {},
        el('div.eyebrow', {}, meIsHost ? 'YOU ARE HOSTING · SHARE THIS CODE' : 'ROOM CODE'),
        el('div', { style: { fontFamily: 'var(--display)', fontSize: '52px', letterSpacing: '10px' } }, NET.roomCode)),
      el('button.btn', {
        onclick: e => {
          const btn = e.currentTarget;
          try { navigator.clipboard.writeText(NET.roomCode); btn.textContent = 'COPIED ✓'; setTimeout(() => btn.textContent = 'COPY CODE', 1500); } catch (err) {}
        },
      }, 'COPY CODE'),
      el('div', { style: { flex: 1 } }),
      el('button.btn.ghosted', { onclick: () => { NET.leave(); showScreen('online'); } }, 'LEAVE ROOM')));

  const slots = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
  for (let i = 0; i < 8; i++) {
    const pl = players[i];
    if (pl) {
      slots.append(el('div.lobby-slot', { style: pl.id === NET.myId ? { background: 'var(--cream-2)' } : {} },
        el('span.av', { style: { background: pl.color } }, pl.name[0].toUpperCase()),
        el('div.grow', {},
          el('div.name', {}, (pl.clanTag ? '[' + pl.clanTag + '] ' : '') + pl.name + (pl.id === NET.myId ? ' (you)' : '')),
          el('div.sub', {}, pl.elo + ' ELO' + (i === 0 ? ' · HOST' : ''))),
        tierChip(pl.elo),
        i === 0 ? el('span.chip.orange', {}, 'HOST') : (pl.ready ? el('span.chip.grass', {}, 'READY') : el('span.chip.dim', {}, 'NOT READY'))));
    } else {
      slots.append(el('div.lobby-slot.empty', {}, 'WAITING FOR RACERS — CODE: ' + NET.roomCode));
    }
  }

  // settings — host edits, guests watch
  const trackChips = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
    ...Object.keys(TRACKS).map(id => el('button.btn' + (NET.cfg.trackId === id ? '.sun' : '.ghosted'), {
      disabled: !meIsHost,
      onclick: () => { SFX.click(); NET.setCfg({ trackId: id }); showScreen('room'); },
    }, TRACKS[id].def.flag + ' ' + TRACKS[id].name)));
  const lapSeg = el('div.seg', {}, ...[3, 5, 8].map(n =>
    el('button' + (NET.cfg.laps === n ? '.on' : ''), {
      disabled: !meIsHost,
      onclick: () => { SFX.click(); NET.setCfg({ laps: n }); showScreen('room'); },
    }, n + ' LAPS')));
  const compSeg = el('div.seg', {}, ...['soft', 'medium', 'hard'].map(c =>
    el('button' + (NET.cfg.compound === c ? '.on' : ''), {
      disabled: !meIsHost,
      onclick: () => { SFX.click(); NET.setCfg({ compound: c }); showScreen('room'); },
    }, COMPOUNDS[c].name)));

  const guests = players.slice(1);
  const allReady = guests.length > 0 && guests.every(g => g.ready);
  let action;
  if (meIsHost) {
    action = el('button.btn.big.primary', {
      disabled: !allReady,
      onclick: () => { SFX.click(); NET.startRaceAll(); },
    }, players.length < 2 ? 'WAITING FOR RACERS…' : (allReady ? '🏁 START RACE' : 'WAITING FOR READY…'));
  } else {
    action = el('button.btn.big' + (me.ready ? '.grass' : '.sun'), {
      onclick: e => { SFX.click(); NET.setReady(!me.ready); e.currentTarget.textContent = !me.ready ? '✓ READY — WAITING FOR HOST' : 'TAP WHEN READY'; showScreen('room'); },
    }, me.ready ? '✓ READY — WAITING FOR HOST' : 'TAP WHEN READY');
  }

  const pbs = DB.profile.bestLaps[NET.cfg.trackId];
  return el('div.screen', {},
    codeCard,
    el('div.row', {},
      el('div.card', { style: { flex: 1.3 } },
        el('h2.h-section', { style: { marginBottom: '12px' } }, 'Racers ' + players.length + '/8'),
        slots),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
        el('div.card', {},
          el('div.eyebrow', { style: { marginBottom: '10px' } }, 'RACE SETTINGS' + (meIsHost ? '' : ' · HOST DECIDES')),
          el('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
            trackChips,
            el('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' } }, lapSeg, compSeg, tyreDot(NET.cfg.compound, 28)),
            el('div', { style: { fontFamily: 'var(--mono)', fontSize: '10.5px', color: 'var(--ink-3)' } },
              trackStats(tr) + (pbs ? ' · your PB ' + fmtTime(pbs) : ' · no PB here yet')))),
        action)));
};

/* ============================ TRACKS ============================ */
SCREENS.tracks = () => {
  const grid = el('div.grid-2');
  for (const id of Object.keys(TRACKS)) {
    const tr = TRACKS[id];
    const cv = el('canvas', { width: 460, height: 240 });
    setTimeout(() => paintTrackMap(cv, tr), 0);
    const pb = DB.profile.bestLaps[id];
    const sel = DB.settings.trackId === id;
    grid.append(el('button.track-card' + (sel ? '.sel' : ''), {
      onclick: () => { DB.settings.trackId = id; saveDB(); SFX.click(); showScreen('tracks'); },
    },
      el('div.art', {}, cv, sel ? el('span.sel-badge', {}, 'SELECTED') : null),
      el('div.body', {},
        el('div.tname', {}, tr.def.flag + ' ' + tr.name),
        el('div.tmeta', {},
          el('span.chip.dim', {}, tr.def.type),
          el('span.chip.dim', {}, trackStats(tr)),
          el('span.chip' + (pb ? '.sun' : '.dim'), {}, pb ? 'PB ' + fmtTime(pb) : 'NO PB YET')),
        el('div', { style: { fontSize: '12.5px', color: 'var(--ink-3)' } }, tr.def.desc))));
  }
  return el('div.screen', {},
    pageHead('PICK YOUR CIRCUIT', 'Ten circuits, ten rhythms — meadow to volcano to midnight city. The racing line is always watching.', 'CIRCUIT'),
    grid,
    el('div', {},
      el('button.btn.big.primary', { onclick: () => { SFX.click(); showScreen('lobby'); } }, '⚡ RACE ' + TRACKS[DB.settings.trackId].name.toUpperCase())));
};

/* ============================ SETUP ============================ */
SCREENS.setup = () => {
  const s = DB.settings, p = DB.profile;

  const compounds = el('div.grid-3', {},
    ...Object.values(COMPOUNDS).map(c =>
      el('button.compound-card' + (s.compound === c.id ? '.sel' : ''), {
        onclick: () => { s.compound = c.id; saveDB(); SFX.click(); showScreen('setup'); },
      },
        el('div.cname', {}, tyreDot(c.id, 30), c.name),
        el('div', { style: { fontSize: '12.5px', color: 'var(--ink-3)' } }, c.desc),
        el('div', { style: { display: 'flex', gap: '10px', fontFamily: 'var(--mono)', fontSize: '10.5px' } },
          el('span', {}, 'GRIP ' + '▮'.repeat(Math.round((c.grip - 0.9) * 40)) ),
          el('span', {}, 'LIFE ' + '▮'.repeat(Math.round(5 / c.wearRate) - 1))))));

  const lapSeg = el('div.seg', {}, ...[3, 5, 8].map(n =>
    el('button' + (s.laps === n ? '.on' : ''), { onclick: () => { s.laps = n; saveDB(); SFX.click(); showScreen('setup'); } }, n + ' LAPS')));

  const assists = [
    ['line', 'Racing line', 'Colour-coded ideal line painted on the road'],
    ['markers', 'Brake markers', '3-2-1 boards before the big stops'],
    ['traction', 'Traction control', 'Cuts wheelspin when the rear steps out'],
    ['autobrake', 'Auto-brake', 'Brakes to corner speed for you. Great first laps'],
  ].map(([key, label, desc]) => {
    const t = el('button.toggle' + (s.assists[key] ? '.on' : ''), {
      onclick: () => { s.assists[key] = !s.assists[key]; saveDB(); t.classList.toggle('on'); },
      'aria-label': label,
    }, el('i'));
    return el('div.assist-row', {}, el('div.grow', {}, el('div.aname', {}, label), el('div.adesc', {}, desc)), t);
  });

  const swatches = el('div.swatches', {}, ...KART_COLORS.map(c =>
    el('button.swatch' + (p.color === c ? '.sel' : ''), { style: { background: c }, 'aria-label': 'kart colour ' + c, onclick: () => { p.color = c; saveDB(); SFX.click(); showScreen('setup'); } })));

  const numSeg = el('div.seg', {}, ...[7, 11, 23, 42, 88, 99].map(nn =>
    el('button' + (p.number === nn ? '.on' : ''), { onclick: () => { p.number = nn; saveDB(); SFX.click(); showScreen('setup'); } }, '#' + nn)));

  return el('div.screen', {},
    pageHead('KART & TYRE SETUP', 'Decisions here follow you into the lobby.', 'SETUP'),
    el('div.card', {},
      el('h2.h-section', { style: { marginBottom: '10px' } }, 'Livery'),
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' } },
        kartSVG(p.color, 1.3),
        el('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, swatches, numSeg))),
    el('div.card', {},
      el('h2.h-section', { style: { marginBottom: '4px' } }, 'Tyre compound'),
      el('p', { style: { margin: '0 0 12px', fontSize: '13px', color: 'var(--ink-3)' } }, 'Wear changes grip lap by lap. Races of 5+ laps open the pit lane — press 1/2/3 mid-race to pick the next set.'),
      compounds),
    el('div.grid-2', {},
      el('div.card', {},
        el('h2.h-section', { style: { marginBottom: '10px' } }, 'Race length'), lapSeg,
        el('p', { style: { fontSize: '12.5px', color: 'var(--ink-3)', marginBottom: 0 } }, '8-lap races make tyre strategy real: soft-pit-soft vs hard no-stop.')),
      el('div.card', {},
        el('h2.h-section', { style: { marginBottom: '10px' } }, 'Driving assists'),
        el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, assists))),
    el('div', { style: { display: 'flex', gap: '10px' } },
      el('button.btn.big.primary', { onclick: () => { SFX.click(); showScreen('lobby'); } }, '⚡ QUICK MATCH'),
      el('button.btn.ghosted', {
        onclick: () => {
          if (confirm('Reset profile, ELO, skills and all progress?')) { localStorage.removeItem(SAVE_KEY); location.reload(); }
        },
        style: { alignSelf: 'center' },
      }, 'Reset profile')));
};

/* ============================ GARAGE ============================ */
SCREENS.garage = () => {
  const p = DB.profile;
  const mods = skillMods(p.skills);

  const branches = el('div.grid-3', {}, ...SKILL_TREE.map(br => {
    const nodes = br.nodes.map((nd, i) => {
      const owned = p.skills.includes(nd.id);
      const prevOwned = i === 0 || p.skills.includes(br.nodes[i - 1].id);
      const afford = p.sp >= nd.cost;
      const state = owned ? 'owned' : (prevOwned && afford ? 'avail' : 'locked');
      return el('button.skill-node.' + state, {
        onclick: () => {
          if (state !== 'avail') return;
          p.sp -= nd.cost; p.skills.push(nd.id); saveDB(); SFX.pit();
          showScreen('garage');
        },
      },
        el('span.ic', {}, owned ? '✓' : (state === 'avail' ? '+' : '🔒')),
        el('div', { style: { flex: 1 } }, el('div.sname', {}, nd.name), el('div.sdesc', {}, nd.desc)),
        el('span.cost', {}, owned ? '' : nd.cost + ' SP'));
    });
    return el('div.skill-branch', {},
      el('div.eyebrow', { style: { padding: '0 4px' } }, br.branch.toUpperCase()),
      ...nodes);
  }));

  const statBar = (label, v, hint) => el('div', { style: { marginBottom: '10px' } },
    el('div', { style: { display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: '10.5px', letterSpacing: '1px', marginBottom: '4px' } },
      el('span', {}, label), el('span', {}, hint)),
    el('div.bar', {}, el('i', { style: { width: clamp(v, 4, 100) + '%' } })));

  return el('div.screen', {},
    pageHead('GARAGE', 'Skill points come from levelling up. Spend them; feel the kart change.', 'GARAGE'),
    el('div.row', {},
      el('div.card', { style: { flex: '0 0 280px' } },
        el('div.eyebrow', {}, 'DRIVER LEVEL'),
        el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px', margin: '6px 0' } },
          el('span', { style: { fontFamily: 'var(--display)', fontSize: '38px' } }, p.level),
          el('span.chip.sun', {}, p.sp + ' SKILL POINTS')),
        el('div.bar', { style: { marginBottom: '6px' } }, el('i', { style: { width: Math.round(p.xp / xpForLevel(p.level) * 100) + '%' } })),
        el('div', { style: { fontFamily: 'var(--mono)', fontSize: '10.5px', color: 'var(--ink-3)' } }, p.xp + ' / ' + xpForLevel(p.level) + ' XP'),
        el('hr', { style: { border: 'none', borderTop: '2.5px dashed rgba(15,14,23,.2)', margin: '16px 0' } }),
        el('div.eyebrow', { style: { marginBottom: '10px' } }, 'KART DNA'),
        statBar('CORNER GRIP', (mods.grip - 0.9) * 500, 'x' + mods.grip.toFixed(2)),
        statBar('ACCELERATION', (mods.accel - 0.9) * 500, 'x' + mods.accel.toFixed(2)),
        statBar('TOP SPEED', (mods.top - 0.9) * 500, 'x' + mods.top.toFixed(2)),
        statBar('TYRE LIFE', (2 - mods.wear) * 55, 'x' + mods.wear.toFixed(2)),
        statBar('DRIFT BOOST', mods.boost * 50, 'x' + mods.boost.toFixed(2))),
      el('div', { style: { flex: 1 } }, branches)));
};

/* ============================ TRAINING ============================ */
SCREENS.training = () => {
  const tr = TRACKS[DB.settings.trackId];
  const ghost = DB.ghosts[DB.settings.trackId];
  const pb = DB.profile.bestLaps[DB.settings.trackId];

  const trackSel = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
    ...Object.keys(TRACKS).map(id => el('button.btn' + (DB.settings.trackId === id ? '.sun' : '.ghosted'), {
      onclick: () => { DB.settings.trackId = id; saveDB(); SFX.click(); showScreen('training'); },
    }, TRACKS[id].def.flag + ' ' + TRACKS[id].name)));

  const mapCv = el('canvas', { width: 560, height: 300, style: { width: '100%', borderRadius: '14px', border: '2.5px solid var(--ink)' } });
  setTimeout(() => paintTrackMap(mapCv, tr), 0);

  return el('div.screen', {},
    pageHead('TRAINING', 'Empty track, live ghost, no ELO at stake. This is where pace is built.', 'TRAINING'),
    el('div.card', {}, el('div.eyebrow', { style: { marginBottom: '10px' } }, 'CIRCUIT'), trackSel),
    el('div.row', {},
      el('div.card', { style: { flex: '1.5' } }, mapCv),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
        el('div.card', {},
          el('div.eyebrow', {}, 'YOUR BENCHMARKS'),
          el('div', { style: { marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' } },
            el('div.lrow', {}, el('span.av', { style: { background: 'var(--yellow)' } }, '⏱'),
              el('div.grow', {}, el('div.name', {}, 'Personal best'), el('div.sub', {}, tr.name)),
              el('span.num', { style: { fontFamily: 'var(--mono)', fontWeight: 700 } }, fmtTime(pb))),
            el('div.lrow', {}, el('span.av', { style: { background: 'var(--cream-2)' } }, '👻'),
              el('div.grow', {}, el('div.name', {}, 'Ghost lap'), el('div.sub', {}, ghost ? 'Chasing ' + fmtTime(ghost.lapMs * 1000) : 'Set a clean lap to record one')),
              ghost ? el('span.chip.sky', {}, 'ACTIVE') : el('span.chip.dim', {}, 'EMPTY')))),
        el('div.card', {},
          el('div.eyebrow', {}, 'DRILL NOTES'),
          el('ul', { style: { margin: '10px 0 0', paddingLeft: '18px', fontSize: '13px', lineHeight: 1.7, color: 'var(--ink-2)' } },
            el('li', {}, 'Follow the coloured line: red = hard brake zone.'),
            el('li', {}, 'Hold SPACE through hairpins, release for the boost.'),
            el('li', {}, 'Kerbs are grippy-ish. Grass is not.'),
            el('li', {}, 'ESC → end session to save your ghost.'))),
        el('button.btn.big.grass', {
          onclick: () => { SFX.click(); startRace({ trackId: DB.settings.trackId, laps: 999, compound: DB.settings.compound, mode: 'training' }); },
        }, '▶ START SESSION'))));
};

SCREENS.trainingDone = () => {
  const s = Race.summary;
  const tr = TRACKS[s.trackId];
  return el('div.screen', {},
    pageHead('SESSION COMPLETE', tr.name, 'SESSION'),
    el('div.grid-3', {},
      statTile(s.lapTimes.length, 'LAPS DRIVEN'),
      statTile(fmtTime(s.bestLap ? s.bestLap * 1000 : null), 'BEST LAP'),
      statTile(s.trackPB ? 'NEW PB!' : '—', 'RECORD')),
    el('div', { style: { display: 'flex', gap: '10px' } },
      el('button.btn.big.grass', { onclick: () => { SFX.click(); showScreen('training'); } }, 'AGAIN'),
      el('button.btn.big', { onclick: () => { SFX.click(); showScreen('home'); } }, 'HOME')));
};

/* ============================ RESULTS ============================ */
SCREENS.results = () => {
  const s = Race.summary;
  if (!s) return SCREENS.home();
  const tr = TRACKS[s.trackId];
  const podiumOrder = [s.order[1], s.order[0], s.order[2]].filter(Boolean);
  const podium = el('div.podium', {}, ...podiumOrder.map(o => {
    const cls = 'step p' + o.pos;
    return el('div', { className: 'step p' + o.pos },
      el('div', { style: { marginBottom: '6px' } }, kartSVG(o.kart.color, 0.62)),
      el('div.box', {}, o.pos),
      el('div.pname', {}, (o.kart.clanTag ? '[' + o.kart.clanTag + '] ' : '') + o.kart.name));
  }));

  const online = s.mode === 'online';
  // still in the room: keep listening so the host's next race reaches us here
  if (online && NET.status !== 'idle') {
    NET.handlers.onStart = msg => startRace({
      mode: 'online', trackId: msg.cfg.trackId, laps: msg.cfg.laps,
      compound: msg.cfg.compound, grid: msg.grid, roster: NET.playerList,
    });
    NET.handlers.onClosed = m => { if (currentScreen === 'results') showScreen('online'); };
    screenCleanup = nextId => {
      NET.handlers.onStart = NET.handlers.onClosed = null;
      if (nextId !== 'room' && nextId !== 'results' && !Race.active && NET.status !== 'racing') NET.leave();
    };
  }
  const dElo = s.eloAfter - s.eloBefore;
  const eloEl = el('span.elo-delta' + (dElo >= 0 ? '.up' : '.down'), {}, (dElo >= 0 ? '+' : '') + dElo);
  const winner = s.order[0];

  const rows = s.order.map(o => {
    let last;
    if (online) {
      const gone = o.kart.gone;
      last = !o.kart.finishT ? (gone ? 'LEFT' : 'DNF')
        : o.pos === 1 ? fmtTime(o.kart.finishT * 1000)
          : '+' + (o.kart.finishT - winner.kart.finishT).toFixed(2);
    } else {
      last = '+' + (RACE_PTS[o.pos - 1] || 0);
    }
    return el('tr' + (o.kart.isPlayer ? '.me' : ''), {},
      el('td', { style: { fontFamily: 'var(--display)', width: '40px' } }, 'P' + o.pos),
      el('td', {},
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          el('span.dot', { style: { width: '10px', height: '10px', borderRadius: '50%', border: '2px solid var(--ink)', background: o.kart.color, display: 'inline-block' } }),
          el('b', {}, (o.kart.clanTag ? '[' + o.kart.clanTag + '] ' : '') + o.kart.name),
          o.kart.isPlayer ? el('span.chip.sun', {}, 'YOU') : null)),
      el('td.num', {}, o.kart.elo + ''),
      el('td.num', {}, fmtTime(o.kart.bestLap ? o.kart.bestLap * 1000 : null)),
      el('td.num', { style: { fontWeight: 700 } }, last));
  });

  const p = DB.profile;
  return el('div.screen.race-fade', {},
    pageHead(s.pos === 1 ? 'VICTORY!' : 'P' + s.pos + ' — ' + tr.name.toUpperCase(),
      (online ? 'Friends room · ' : s.mode === 'weekly' ? 'Weekly challenge · ' : 'Ranked · ') + s.laps + ' laps',
      s.pos === 1 ? 'VICTORY!' : null),
    el('div.card', {}, podium),
    el('div.grid-3', {},
      online
        ? el('div.stat', {}, el('div.v', {}, fmtTime(s.bestLap ? s.bestLap * 1000 : null)), el('div.l', {}, 'YOUR BEST LAP' + (s.trackPB ? ' · NEW PB!' : '')))
        : el('div.stat', {}, el('div.v', {}, eloEl, ' ', el('span', { style: { fontSize: '18px' } }, '→ ' + s.eloAfter)), el('div.l', {}, 'ELO · ' + tierOf(s.eloAfter).label)),
      online
        ? el('div.stat', {}, el('div.v', {}, s.n + ''), el('div.l', {}, 'RACERS IN ROOM'))
        : el('div.stat', {}, el('div.v', {}, '+' + s.pts), el('div.l', {}, 'SEASON POINTS')),
      el('div.stat', {}, el('div.v', {}, '+' + s.xp + ' XP' + (s.levelUps ? ' ★' : '')), el('div.l', {}, s.levelUps ? 'LEVEL UP! +1 SKILL POINT' : p.xp + '/' + xpForLevel(p.level) + ' TO LVL ' + (p.level + 1)))),
    s.fastest ? el('div.card.tight', {},
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
        el('span.chip.purple', { style: { background: 'var(--purple)', color: '#fff' } }, '⏱ FASTEST LAP'),
        el('b', {}, s.fastest.name), el('span.num', { style: { fontFamily: 'var(--mono)' } }, fmtTime(s.fastest.t * 1000)),
        s.fastest.me ? el('span.chip.sun', {}, '+6 XP') : null,
        s.trackPB ? el('span.chip.grass', {}, 'NEW TRACK PB') : null)) : null,
    el('div.card', {},
      el('table.tt', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Pos'), el('th', {}, 'Driver'), el('th', {}, 'ELO'), el('th', {}, 'Best lap'), el('th', {}, online ? 'Time' : 'Pts'))),
        el('tbody', {}, rows))),
    el('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
      online && NET.status !== 'idle'
        ? el('button.btn.big.primary', { onclick: () => { SFX.click(); showScreen('room'); } }, '🏁 BACK TO ROOM')
        : el('button.btn.big.primary', { onclick: () => { SFX.click(); showScreen('lobby', s.mode === 'weekly' ? { weekly: true } : undefined); } }, '⚡ RACE AGAIN'),
      el('button.btn.big', { onclick: () => { SFX.click(); showScreen('leaderboards'); } }, 'STANDINGS'),
      el('button.btn.big.ghosted', { onclick: () => { SFX.click(); showScreen('home'); } }, 'HOME')));
};

/* ============================ CLUB (clan) ============================ */
function clanMembers(clan) {
  // deterministic roster from the rivals pool
  return DB.rivals.filter(r => r.clanId === clan.id).slice(0, 8);
}
function clanWeeklyPts(clan) {
  const seed = hashStr(clan.id + weekKey());
  const r = rng(seed);
  let pts = Math.round(r() * 400 + clanMembers(clan).length * 30);
  if (DB.profile.clanId === clan.id) pts += DB.profile.seasonPts;
  return pts;
}

SCREENS.clan = () => {
  const p = DB.profile;
  const myClan = clanById(p.clanId);
  const allClans = [...PRESET_CLANS, ...(DB.customClan ? [DB.customClan] : [])];
  const ranked = allClans.map(c => ({ c, pts: clanWeeklyPts(c) })).sort((a, b) => b.pts - a.pts);

  if (!myClan) {
    // join / create
    const nameIn = el('input', { type: 'text', maxLength: 22, placeholder: 'Night Owls Racing' });
    const tagIn = el('input', { type: 'text', maxLength: 3, placeholder: 'OWL', style: { textTransform: 'uppercase' } });
    let pick = '#FF4D2E';
    const picks = el('div.swatches', {}, ...KART_COLORS.slice(0, 8).map(c => {
      const b = el('button.swatch' + (pick === c ? '.sel' : ''), { style: { background: c }, 'aria-label': c, onclick: () => { pick = c;[...picks.children].forEach(x => x.classList.remove('sel')); b.classList.add('sel'); } });
      return b;
    }));
    return el('div.screen', {},
      pageHead('JOIN A CLUB', 'Race for something bigger than yourself. Club points reset weekly.', 'CLUB'),
      el('div.row', {},
        el('div.card', { style: { flex: 1.3 } },
          el('h2.h-section', { style: { marginBottom: '12px' } }, 'Open clubs'),
          el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
            ...ranked.map(({ c, pts }, i) => el('div.lrow', {},
              el('span.av', { style: { background: c.color, color: '#fff' } }, c.tag[0]),
              el('div.grow', {}, el('div.name', {}, c.name), el('div.sub', {}, '[' + c.tag + '] · ' + clanMembers(c).length + ' racers · #' + (i + 1) + ' this week')),
              el('span.chip.dim', {}, pts + ' pts'),
              el('button.btn', { style: { padding: '7px 14px' }, onclick: () => { p.clanId = c.id; saveDB(); SFX.pit(); showScreen('clan'); } }, 'JOIN')))))
        ,
        el('div.card', {},
          el('h2.h-section', {}, 'Found your own'),
          el('div.field', {}, el('label', {}, 'Club name'), nameIn),
          el('div.field', {}, el('label', {}, 'Tag (3 letters)'), tagIn),
          el('div.field', {}, el('label', {}, 'Colours'), picks),
          el('button.btn.primary', {
            style: { marginTop: '16px', width: '100%' },
            onclick: () => {
              const nm = nameIn.value.trim(), tg = tagIn.value.trim().toUpperCase();
              if (nm.length < 3 || tg.length < 2) { alert('Give the club a name (3+) and a 2-3 letter tag.'); return; }
              DB.customClan = { id: 'custom', tag: tg, name: nm, color: pick };
              p.clanId = 'custom'; saveDB(); SFX.pit(); showScreen('clan');
            },
          }, 'CREATE CLUB'))));
  }

  const members = clanMembers(myClan);
  const roster = [
    { name: p.name + ' (you)', elo: p.elo, me: true, color: p.color, pts: p.seasonPts },
    ...members.map(m => ({ name: m.name, elo: m.elo, color: m.color, pts: m.pts })),
  ].sort((a, b) => b.elo - a.elo);

  return el('div.screen', {},
    el('div.card', { style: { background: myClan.color, color: '#fff', boxShadow: 'var(--shadow-card-lg)' } },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' } },
        el('span.av', { style: { width: '54px', height: '54px', background: '#FFFDF7', color: 'var(--ink)', fontSize: '20px' } }, myClan.tag[0]),
        el('div', { style: { flex: 1 } },
          el('div', { style: { fontFamily: 'var(--display)', fontSize: '28px', textShadow: '0 2px 0 var(--ink)' } }, myClan.name),
          el('div', { style: { fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '1.4px' } }, '[' + myClan.tag + '] · ' + (roster.length) + ' RACERS · WEEK ' + weekKey())),
        el('div', { style: { textAlign: 'right' } },
          el('div', { style: { fontFamily: 'var(--display)', fontSize: '30px', textShadow: '0 2px 0 var(--ink)' } }, clanWeeklyPts(myClan)),
          el('div', { style: { fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1.4px' } }, 'CLUB POINTS THIS WEEK')))),
    el('div.row', {},
      el('div.card', { style: { flex: 1.4 } },
        el('h2.h-section', { style: { marginBottom: '12px' } }, 'Roster'),
        el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          ...roster.map(m => el('div.lrow' + (m.me ? '.me' : ''), {},
            el('span.av', { style: { background: m.color } }, m.name[0].toUpperCase()),
            el('div.grow', {}, el('div.name', {}, m.name), el('div.sub', {}, m.elo + ' ELO')),
            tierChip(m.elo),
            el('span.chip.dim', {}, (m.pts || 0) + ' pts'))))),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
        el('div.card', {},
          el('h2.h-section', { style: { marginBottom: '12px' } }, 'Club ladder · this week'),
          el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
            ...ranked.slice(0, 8).map(({ c, pts }, i) => el('div.lrow' + (c.id === myClan.id ? '.me' : ''), {},
              el('span', { style: { fontFamily: 'var(--display)', width: '26px' } }, '#' + (i + 1)),
              el('span.av', { style: { background: c.color, color: '#fff', width: '26px', height: '26px', fontSize: '11px' } }, c.tag[0]),
              el('div.grow', {}, el('div.name', {}, c.name)),
              el('span.chip.dim', {}, pts + ' pts'))))),
        el('div.card', {},
          el('div.eyebrow', {}, 'CONTRIBUTE'),
          el('p', { style: { fontSize: '13px', color: 'var(--ink-3)', margin: '8px 0 12px' } }, 'Every ranked point you score counts for the club. Weekly challenge pays double.'),
          el('button.btn.primary', { style: { width: '100%' }, onclick: () => { SFX.click(); showScreen('lobby'); } }, '⚡ RACE FOR ' + myClan.tag)),
        el('button.btn.ghosted', {
          onclick: () => { if (confirm('Leave ' + myClan.name + '?')) { p.clanId = null; saveDB(); showScreen('clan'); } },
        }, 'Leave club'))));
};

/* ============================ LEADERBOARDS ============================ */
SCREENS.leaderboards = (arg) => {
  const p = DB.profile;
  const tab = (arg && arg.tab) || 'Global';
  const tabs = el('div.tabs', {}, ...['Global', 'Season', 'Clubs'].map(t =>
    el('button' + (t === tab ? '.on' : ''), { onclick: () => { SFX.click(); showScreen('leaderboards', { tab: t }); } }, t)));

  let body;
  if (tab === 'Clubs') {
    const allClans = [...PRESET_CLANS, ...(DB.customClan ? [DB.customClan] : [])];
    const ranked = allClans.map(c => ({ c, pts: clanWeeklyPts(c) })).sort((a, b) => b.pts - a.pts);
    body = el('table.tt', {},
      el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Club'), el('th', {}, 'Racers'), el('th', {}, 'Points'))),
      el('tbody', {}, ...ranked.map(({ c, pts }, i) => el('tr' + (p.clanId === c.id ? '.me' : ''), {},
        el('td', { style: { fontFamily: 'var(--display)' } }, '#' + (i + 1)),
        el('td', {}, el('b', {}, '[' + c.tag + '] ' + c.name)),
        el('td.num', {}, clanMembers(c).length + (p.clanId === c.id ? 1 : 0) + ''),
        el('td.num', { style: { fontWeight: 700 } }, pts + '')))));
  } else {
    const key = tab === 'Global' ? 'elo' : 'pts';
    const meRow = { name: p.name + '', elo: p.elo, pts: p.seasonPts, me: true, flag: p.flag, clanId: p.clanId };
    const rows = [...DB.rivals.map(r => ({ name: r.name, elo: r.elo, pts: r.pts, flag: r.flag, clanId: r.clanId })), meRow]
      .sort((a, b) => b[key] - a[key]).slice(0, 40);
    const myRank = rows.findIndex(r => r.me) + 1;
    body = el('div', {},
      el('div', { style: { display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' } },
        el('span.chip.sun', {}, myRank ? 'YOUR RANK: #' + myRank : 'OUTSIDE TOP 40'),
        el('span.chip.dim', {}, tab === 'Global' ? 'RATING LADDER' : 'SEASON 04 POINTS · ' + weekKey())),
      el('table.tt', {},
        el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Driver'), el('th', {}, 'League'), el('th', {}, tab === 'Global' ? 'ELO' : 'Points'))),
        el('tbody', {}, ...rows.map((rr, i) => el('tr' + (rr.me ? '.me' : ''), {},
          el('td', { style: { fontFamily: 'var(--display)' } }, '#' + (i + 1)),
          el('td', {}, el('b', {}, (clanTagOf(rr) ? '[' + clanTagOf(rr) + '] ' : '') + rr.name + (rr.me ? ' (you)' : '')), ' ', el('span', { style: { opacity: 0.8 } }, rr.flag || '')),
          el('td', {}, tierChip(rr.elo)),
          el('td.num', { style: { fontWeight: 700 } }, String(tab === 'Global' ? rr.elo : rr.pts)))))));
  }

  return el('div.screen', {},
    pageHead('LEADERBOARDS', 'The ladder never sleeps — rivals race even when you don’t.', 'LEADERBOARDS'),
    tabs,
    el('div.card', {}, body));
};

/* ============================ onboarding ============================ */
function showOnboarding() {
  const root = document.getElementById('modal-root');
  const nameIn = el('input', { type: 'text', maxLength: 14, placeholder: 'AceRacer', value: '' });
  let color = DB.profile.color, flag = DB.profile.flag;
  const swat = el('div.swatches', {}, ...KART_COLORS.map(c => {
    const b = el('button.swatch' + (color === c ? '.sel' : ''), { style: { background: c }, 'aria-label': c, onclick: () => { color = c;[...swat.children].forEach(x => x.classList.remove('sel')); b.classList.add('sel'); } });
    return b;
  }));
  const flags = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, ...FLAGS.slice(0, 12).map(f => {
    const b = el('button.chip' + (flag === f ? '.sun' : ''), { onclick: () => { flag = f;[...flags.children].forEach(x => x.classList.remove('sun')); b.classList.add('sun'); } }, f);
    return b;
  }));
  const go = () => {
    const nm = nameIn.value.trim() || 'Racer' + ((Math.random() * 900 + 100) | 0);
    DB.profile.name = nm.replace(/\s+/g, '_');
    DB.profile.color = color; DB.profile.flag = flag;
    saveDB(); root.innerHTML = ''; renderSidebar(); showScreen('home');
  };
  root.append(el('div.modal-scrim', {},
    el('div.modal', {},
      el('div.eyebrow', {}, 'WELCOME TO SEASON 04 · APEX'),
      el('h2', {}, 'BUILD YOUR RACER'),
      el('p', { style: { margin: '4px 0 0', fontSize: '13.5px', color: 'var(--ink-3)' } }, 'Pick a name and colours. You start at 1000 ELO in Bronze — everything else is earned on track.'),
      el('div.field', {}, el('label', {}, 'Driver name'), nameIn),
      el('div.field', {}, el('label', {}, 'Kart colour'), swat),
      el('div.field', {}, el('label', {}, 'Flag'), flags),
      el('button.btn.big.primary', { style: { marginTop: '20px', width: '100%' }, onclick: go }, 'START ENGINES'))));
  nameIn.focus();
  nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}
