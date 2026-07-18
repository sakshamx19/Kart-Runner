'use strict';
/* ============================================================
   85-touch.js — on-screen race controls for touch devices
   Writes into the shared Input object; keyboard stays untouched.
   ============================================================ */

let touchApplyInput = null;   // set while touch controls are live; used to re-sync Input after pause/blur
let _tcCleanup = null;

function buildTouchControls() {
  if (!IS_TOUCH) return;
  if (_tcCleanup) { _tcCleanup(); _tcCleanup = null; }
  const old = document.getElementById('touch-controls');
  if (old) old.remove();

  const autogas = DB.settings.autogas !== false;
  const layer = document.getElementById('race-layer');
  const tc = el('div', { id: 'touch-controls' });

  // hold buttons — pressed state is recomputed from live pointer positions,
  // so a thumb can slide between buttons without lifting
  const hold = {};
  const mk = (name, spec, label) => { const b = el(spec, {}, label); hold[name] = b; return b; };
  mk('left', 'button.tc-btn.tc-sl', '◀');
  mk('right', 'button.tc-btn.tc-sr', '▶');
  mk('brake', 'button.tc-btn.tc-brake', 'BRAKE');
  if (!autogas) mk('gas', 'button.tc-btn.tc-gas', 'GAS');
  mk('drift', 'button.tc-btn.tc-drift' + (autogas ? '.big' : ''), 'DRIFT');
  tc.append(...Object.values(hold));

  // tap buttons (rescue + pause) — plain clicks, top centre
  tc.append(el('div.tc-topbar', {},
    el('button.tc-top', {
      onclick: () => {
        if (Race.active && !Race.paused && Race.state !== 'grid') { Race.player.rescue(); SFX.blip(0); }
      },
      'aria-label': 'Rescue',
    }, '⟲'),
    el('button.tc-top', {
      onclick: () => { SFX.click(); togglePause(); },
      'aria-label': 'Pause',
    }, '❚❚'),
  ));
  layer.append(tc);

  const pressed = {};
  const pointers = new Map();

  const apply = () => {
    if (!Race.active) return;
    Input.left = pressed.left ? 1 : 0;
    Input.right = pressed.right ? 1 : 0;
    Input.brake = pressed.brake ? 1 : 0;
    Input.drift = !!pressed.drift;
    Input.throttle = (autogas ? !pressed.brake : !!pressed.gas) ? 1 : 0;
  };
  touchApplyInput = apply;

  const PAD = 12; // forgiving hit box beyond the painted button
  const recompute = () => {
    const now = {};
    for (const pt of pointers.values()) {
      for (const n in hold) {
        const r = hold[n].getBoundingClientRect();
        if (pt.x >= r.left - PAD && pt.x <= r.right + PAD && pt.y >= r.top - PAD && pt.y <= r.bottom + PAD) now[n] = true;
      }
    }
    for (const n in hold) {
      pressed[n] = !!now[n];
      hold[n].classList.toggle('press', pressed[n]);
    }
    apply();
  };

  const down = e => {
    if (e.target.closest('.tc-topbar')) return;
    e.preventDefault();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    recompute();
  };
  const move = e => {
    const pt = pointers.get(e.pointerId);
    if (!pt) return;
    pt.x = e.clientX; pt.y = e.clientY;
    recompute();
  };
  const up = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    recompute();
  };
  const noCtx = e => e.preventDefault();

  tc.addEventListener('pointerdown', down);
  tc.addEventListener('pointermove', move);
  tc.addEventListener('pointerup', up);
  tc.addEventListener('pointercancel', up);
  tc.addEventListener('contextmenu', noCtx);

  // browser lost focus / tab hidden — drop all touches
  const flush = () => { pointers.clear(); recompute(); };
  addEventListener('blur', flush);
  document.addEventListener('visibilitychange', flush);

  _tcCleanup = () => {
    removeEventListener('blur', flush);
    document.removeEventListener('visibilitychange', flush);
    touchApplyInput = null;
    tc.remove();
  };

  apply(); // with auto-gas the kart is on throttle from the start, like holding ↑
}

// portrait mid-race: the rotate overlay covers the screen — pause under it
if (IS_TOUCH) {
  const mq = matchMedia('(orientation: portrait)');
  const onFlip = () => {
    if (mq.matches && Race.active && !Race.paused && Race.state !== 'grid' && !Race.player.finished) togglePause(true);
  };
  if (mq.addEventListener) mq.addEventListener('change', onFlip);
  else mq.addListener(onFlip);
}
