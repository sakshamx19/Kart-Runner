'use strict';
/* ============================================================
   90-main.js — boot & input
   ============================================================ */

(function boot() {
  loadDB();
  initTracks();

  // keyboard
  const keymap = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'drift',
  };
  const state = { up: false, down: false, left: false, right: false, drift: false };
  function applyInput() {
    Input.throttle = state.up ? 1 : 0;
    Input.brake = state.down ? 1 : 0;
    Input.left = state.left ? 1 : 0;
    Input.right = state.right ? 1 : 0;
    Input.drift = state.drift;
  }
  addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = keymap[e.code];
    if (k) { state[k] = true; applyInput(); if (Race.active) e.preventDefault(); }
    if (!Race.active) return;
    if (e.code === 'Escape') togglePause();
    if (e.code === 'KeyR' && !Race.paused && Race.state !== 'grid') { Race.player.rescue(); SFX.blip(0); }
    if (e.code === 'KeyM') SFX.setMuted(!SFX.muted);
    if (e.code === 'Digit1') { Race.player.pitNextCompound = 'soft'; SFX.click(); }
    if (e.code === 'Digit2') { Race.player.pitNextCompound = 'medium'; SFX.click(); }
    if (e.code === 'Digit3') { Race.player.pitNextCompound = 'hard'; SFX.click(); }
  });
  addEventListener('keyup', e => {
    const k = keymap[e.code];
    if (k) { state[k] = false; applyInput(); }
  });
  addEventListener('blur', () => {
    for (const k in state) state[k] = false;
    applyInput();
    if (Race.active && !Race.paused && Race.state !== 'grid' && !Race.player.finished) togglePause(true);
  });
  addEventListener('resize', () => { if (Race.renderer) Race.renderer.resize(); });

  renderSidebar();
  if (!DB.profile.name) { showScreen('home'); showOnboarding(); }
  else showScreen('home');
})();
