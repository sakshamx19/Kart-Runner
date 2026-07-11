# KART RUNNER 3D

A competitive cartoon kart racer — Smash-Karts-style 3D chase camera, F1-inspired
racing systems (tyre compounds, wear, pit stops, racing line), ELO matchmaking
ladder, clubs, training ghosts, a skill tree, and **real online multiplayer
(Friends Rooms)** over WebRTC. No game server needed: hosting is static.

## Play

- Double-click **`../KART RUNNER 3D - Playable.html`** (single file, everything inlined), or
- open **`index.html`** in this folder (loads `src/` + `lib/` directly — also works from `file://`).

Progress (ELO, skills, ghosts, clubs, PBs) persists in the browser's localStorage.

## Deploy to Vercel (recommended for multiplayer)

```bash
cd kart-runner-3d
npx vercel --prod     # first run: log in + accept defaults ("no framework")
```

That's it — this folder is a plain static site. Share the URL; friends open it,
hit **Friends Room**, and join with your 4-letter code. (Everyone should use the
same URL so profiles/PBs live on one origin.)

## How multiplayer works

- **Friends Room** = real players over WebRTC data channels ([PeerJS](https://peerjs.com),
  vendored in `lib/`). The room creator's browser is the race host: it owns the
  roster and settings and relays pose/lap/finish messages (star topology, max 8).
- Signaling goes through the free public PeerJS cloud only while connecting;
  the race itself is browser-to-browser. No server of yours runs anything.
- Each player simulates their own kart with the shared physics and streams
  ~15 poses/sec; remote karts are interpolated ~140 ms behind for smoothness.
- Friendly rooms don't change ELO. Race history, XP and **track best-lap times**
  are recorded in each player's own browser (the room screen shows your PB for
  the selected track).
- Quick Match remains the offline ranked mode against AI drivers.

Caveats: needs a keyboard (desktop); rare strict corporate firewalls can block
WebRTC (no TURN relay is configured); if the host closes the tab, the room ends.

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
| `src/10-track.js` | 10 circuits as control points → Catmull-Rom spline sampling, racing-line optimisation (taut-string), corner speed profile, decor generation, surface queries |
| `src/30-physics.js` | the kart model: grip-budget tyre physics, drift/boost, wear, walls, laps/checkpoints; kart-kart collisions; slipstream |
| `src/35-ai.js` | AI drivers (same physics as the player): line following, braking profile, traffic avoidance, mistakes, pit strategy; shared pit-stop state machine |
| `src/40-render.js` | Three.js renderer: track mesh, kerbs, gantry, instanced decor, toon karts, chase camera, skid marks, particles, snow, name sprites; plus the 2D minimap painter |
| `src/50-race.js` | race controller: fixed-timestep loop, countdown, positions, HUD, pause, results → ELO/points/XP |
| `src/60-audio.js` | WebAudio synth: engine, screech, beeps, fanfares |
| `src/70-ui.js` | menu screens: home, lobby (simulated matchmaking), Friends Room (create/join/room), tracks, setup, garage skill tree, training, club, leaderboards, results |
| `src/80-net.js` | multiplayer: PeerJS rooms, roster/config sync, pose relay, `RemoteKart` interpolation |
| `src/90-main.js` | boot + keyboard input |
| `lib/three.iife.js` | three.js r160, bundled locally (exposes `window.THREE`) |
| `lib/peerjs.iife.js` | PeerJS 1.5, bundled locally (exposes `window.Peer`) |

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

## Upgrade path

If rooms ever outgrow the public PeerJS broker, run your own peer server
(`npx peerjs --port 9000`) anywhere that supports WebSockets and point
`NET._newPeer` at it — one line in `src/80-net.js`. Adding a TURN server there
too would cover strict-firewall players.
