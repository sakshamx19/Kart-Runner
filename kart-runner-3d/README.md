# KART RUNNER 3D

A competitive cartoon kart racer — Smash-Karts-style 3D chase camera, F1-inspired
racing systems (tyre compounds, wear, pit stops, racing line), ELO matchmaking
ladder, clubs, training ghosts, and a skill tree. Everything is self-contained:
no server, no CDN, no build step required to play.

## Play

- Double-click **`../KART RUNNER 3D - Playable.html`** (single file, everything inlined), or
- open **`index.html`** in this folder (loads `src/` + `lib/` directly — also works from `file://`).

Progress (ELO, skills, ghosts, clubs) persists in the browser's localStorage.

## Controls

| Key | Action |
|---|---|
| W / ↑ | throttle |
| S / ↓ | brake / reverse |
| A D / ← → | steer |
| SPACE (hold) | drift → release for boost |
| 1 / 2 / 3 | choose next pit compound (soft/med/hard) |
| R | rescue (back onto the track) |
| M | mute |
| ESC | pause (assists can be toggled live) |

## Code map

| File | What it does |
|---|---|
| `src/00-core.js` | utilities, save/load, profile, ELO math, tiers, rivals ladder, weekly challenge |
| `src/10-track.js` | 5 circuits as control points → Catmull-Rom spline sampling, racing-line optimisation (taut-string), corner speed profile, decor generation, surface queries |
| `src/30-physics.js` | the kart model: grip-budget tyre physics, drift/boost, wear, walls, laps/checkpoints; kart-kart collisions; slipstream |
| `src/35-ai.js` | AI drivers (same physics as the player): line following, braking profile, traffic avoidance, mistakes, pit strategy; shared pit-stop state machine |
| `src/40-render.js` | Three.js renderer: track mesh, kerbs, gantry, instanced decor, toon karts, chase camera, skid marks, particles, snow, name sprites; plus the 2D minimap painter |
| `src/50-race.js` | race controller: fixed-timestep loop, countdown, positions, HUD, pause, results → ELO/points/XP |
| `src/60-audio.js` | WebAudio synth: engine, screech, beeps, fanfares |
| `src/70-ui.js` | menu screens: home, lobby (simulated matchmaking), tracks, setup, garage skill tree, training, club, leaderboards, results |
| `src/90-main.js` | boot + keyboard input |
| `lib/three.iife.js` | three.js r160, bundled locally (exposes `window.THREE`) |

## Tuning knobs

- Kart feel: `PHYS` in `src/30-physics.js` (accel, top speed, grip, steer).
- Track layouts: `TRACK_DEFS` in `src/10-track.js` — edit the `pts` control points;
  everything else (racing line, kerbs, AI speeds, minimap) recomputes automatically.
- Compounds: `COMPOUNDS` in `src/00-core.js`.
- AI difficulty: `speedFactor` in `src/35-ai.js`.

## Rebuild the single-file version

After editing `src/`, run:

```
python3 build.py
```

which regenerates `../KART RUNNER 3D - Playable.html`.

## Multiplayer note

Lobbies, opponents and ladders are simulated locally (no network in a standalone
file). The structure maps directly onto a real backend: replace `pickLobby()` and
the AI input step with WebSocket state sync, and keep everything else.
