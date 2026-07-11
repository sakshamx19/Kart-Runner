# KART RUNNER — Project Handoff

Everything you (or the next developer, or a future AI session) need to understand,
run, modify, test and deploy this project.

Last updated: 2026-07-11.

---

## 1. What this is

**KART RUNNER 3D** is a competitive cartoon kart-racing game in the spirit of
Smash Karts, with F1-inspired systems layered on top:

- Real-time 3D chase-camera racing (Three.js, low-poly toon look)
- Grip-based kart physics with drifting and drift-boost
- Tyre compounds (soft/medium/hard), live wear, working pit stops
- 10 hand-built circuits across 8 visual worlds
- AI opponents that run the *same physics* as the player
- Ranked ladder (ELO + leagues), season points, weekly challenge
- **Real online multiplayer** ("Friends Room") over WebRTC — no game server
- Career layer: XP → levels → skill points → skill tree; clubs; training
  mode with a persistent ghost kart
- All progress stored in the player's browser (localStorage). No accounts.

Everything is client-side. Hosting is a static site (Vercel). There is no
backend to run or pay for.

---

## 2. Folder map (repo root)

| Path | What it is |
|---|---|
| `KART RUNNER 3D - Playable.html` | **The game**, built as one self-contained file (~1.07 MB). Three.js, PeerJS, fonts, CSS, all JS inlined. Double-click to play; also the file to deploy. |
| `kart-runner-3d/` | **The source of truth.** Readable source, vendored libs, build script, README. Edit here. |
| `vercel-drop/index.html` | Copy of the playable renamed `index.html`, in a folder by itself — drag this folder into vercel.com/new (or `npx vercel --prod` inside it) to deploy. |
| `KART RUNNER - Playable.html` | Legacy: the earlier **2D top-down** version of the game. Fully working, no longer developed. |
| `KART RUNNER - Standalone.html` | The original menus-only React prototype this project started from (bundled artifact export; not practically editable). Kept for reference. |
| `handoff.md` | This file. |

### Inside `kart-runner-3d/`

| Path | What it is |
|---|---|
| `index.html` | Dev/deploy entry point. Loads `lib/` + `src/` as plain `<script>` tags (works over `file://`, no server or build needed). |
| `build.py` | Regenerates `../KART RUNNER 3D - Playable.html` by inlining everything. Run after any `src/` edit: `python3 build.py`. |
| `vercel.json` | `{ "cleanUrls": true }` — the folder deploys as a plain static site. |
| `src/*.js` | Nine game modules (see §4). Plain scripts sharing one global scope, loaded in filename order — **file numbering is the dependency order**. |
| `src/style.css` | The whole design system + UI styling (see §10). |
| `src/fonts.css` | Bowlby One / Space Grotesk / JetBrains Mono embedded as base64 data-URIs (~100 KB) so the game works offline. |
| `lib/three.iife.js` | three.js r160 bundled to an IIFE exposing `window.THREE`. |
| `lib/peerjs.iife.js` | PeerJS 1.5 bundled to an IIFE exposing `window.Peer`. |
| `README.md` | Shorter quick-reference version of this document. |

There is **no build step for development** — open `index.html`, edit a file in
`src/`, reload. `build.py` is only for producing the single-file distributable.

---

## 3. Architecture in one paragraph

The game is nine plain JavaScript files concatenated into one scope (no
modules, no bundler). `00-core` defines utilities and persistent state;
`10-track` turns hand-authored control points into full circuits (geometry,
racing line, decor); `30-physics` steps karts at a fixed 120 Hz on a flat 2D
plane; `35-ai` generates inputs for AI karts; `40-render` draws that 2D world
as 3D with Three.js (a pure view layer — same API as the old 2D canvas
renderer); `50-race` is the conductor (game loop, HUD, results); `60-audio`
synthesises all sound with WebAudio; `70-ui` renders every menu screen from
state; `80-net` adds WebRTC multiplayer; `90-main` boots and reads the
keyboard. **The simulation is 2D; only the rendering is 3D** — sim `(x, y)`
maps to world `(x, z)`, heading θ maps to `mesh.rotation.y = -θ`.

---

## 4. Module reference

### `src/00-core.js` — utilities & persistent state
- Helpers: `clamp/lerp/angWrap/dist2`, `rng(seed)` (mulberry32, deterministic),
  `hashStr`, `fmtTime(ms)` → `1:23.456`, `el(spec, props, ...kids)` tiny DOM builder
  (`el('div.card', {onclick}, child)`), ISO week helpers (`weekKey()`).
- **Save**: localStorage key **`kartrunner-save-v1`**. Shape (`defaultSave()`):
  ```
  { v: 1,
    profile: { name, flag, color, number, elo, xp, level, sp,
               skills: [ids], clanId,
               stats: {races, wins, podiums, laps},
               bestLaps: {trackId: ms}, seasonPts },
    settings: { compound, laps, assists: {line, traction, autobrake, markers},
                muted, trackId },
    weekly:  { 'YYYY-Www': {done, pos, pts, bestLap} },
    ghosts:  { trackId: {dt, pts: [x,y,heading,...], lapMs} },
    history: [ {t, trackId, pos, pts, dElo, laps, bestLap, mode} ] (max 12),
    rivals:  [ 40 generated AI ladder drivers {id, name, flag, color, elo, clanId, pts} ],
    customClan: {id:'custom', tag, name, color} | null }
  ```
  `loadDB()/saveDB()` guard against corrupt/blocked storage. Delete the key (or
  Setup → "Reset profile") for a fresh start. **Storage is per-origin** — a
  profile on `file://` is separate from one on your Vercel URL.
- **Ladder**: `TIERS` — Bronze 0 / Silver 1200 / Gold 1500 / Plat 1800 /
  Diamond 2100 / APEX 2400, three divisions each. `eloDelta()` = pairwise Elo
  vs the 7 AI opponents, K=24/field, scaled ×2.2 (full-lobby win ≈ +20-30).
  `settleLadder()` nudges rival ELOs after each ranked race and lets the rest
  of the ladder drift so leaderboards feel alive.
- Points `RACE_PTS = [25,18,15,12,10,8,6,4]`. XP curve `90 + (level-1)*60`;
  level-up grants 1 skill point (`grantXP`).
- **Compounds** `COMPOUNDS`: soft grip ×1.055 / wear ×1.75 · medium 1/1 ·
  hard ×0.955 / ×0.55.
- **Skill tree** `SKILL_TREE` (3 branches × 3 nodes) → `skillMods(skills)`
  returns physics multipliers (grip, steer, accel, top, slipstream, wear,
  wear-cliff, drift-boost). This is the only bridge from career → physics.
- `pickLobby()` = 7 rivals nearest to player ELO (matchmaking sim for Quick
  Match). `weeklyChallenge()` = deterministic track/laps/compound from the ISO
  week hash.

### `src/10-track.js` — circuits & the track pipeline
- `TRACK_DEFS`: each track is ~16-24 **control points** (meters) plus
  `{name, type, flag, theme, width (half-width), runoff, desc, pitSide}`.
  Current tracks (id → name · theme):

  | id | name | theme | character |
  |---|---|---|---|
  | sunrise | Sunrise Speedway | meadow | launch straight + hairpin, beginner |
  | monaco | Monte Cartoon | street | tight walls, ultra-low tyre wear |
  | spa | Spa-Verde | forest | fast sweepers + bus stop |
  | frost | Frostcake Falls | snow | medium-fast, snowfall, ice ponds |
  | crystal | Crystal Coast | coast | flowing + one hard chicane |
  | royal | Royal Ring | meadow | speedbowl, slipstream racing |
  | dune | Dune Dash | desert | sweepers; **most abrasive surface** |
  | volcano | Mount Vroom | volcano | twistiest, hairpins, lava & ash |
  | neon | Neon Harbor | night | 9-corner night street circuit |
  | serpent | Serpent Pass | forest | chained esses, rhythm track |

- `buildTrack(id)` pipeline (runs once per track at boot, `initTracks()`):
  1. Closed **Catmull-Rom** spline sampled every ~2.6 m → `samples[]`
     (`{x,y,tx,ty,nx,ny,w,k(curvature),kerb,s(arc length)}`).
  2. Kerb zones auto-marked where |curvature| is sustained.
  3. **Racing line**: taut-string relaxation — 500 iterations pulling each
     lateral offset toward its neighbours' midpoint, clamped to track edges
     minus 2 m. Then per-point corner speed `v = √(A_LAT/|k|)` (A_LAT 21,
     clamped 9.5..41 m/s) with backward braking pass (17 m/s²) and forward
     acceleration pass (9 m/s²). This one `line[]` array drives the AI, the
     coloured line assist, brake markers, and auto-brake.
  4. Spatial hash grid (12 m cells) → `nearest(x, y, hint)` fast lookup.
  5. **Pit lane**: ~70 m offset lane ending 6 m before start/finish on
     `pitSide`; `pitOffsetAt(i)` returns its lateral offset (ramped); box at
     55% of the lane.
  6. Grid slots (8, staggered behind the line), checkpoints at 25/50/75%.
  7. `buildDecor()` — seeded random scenery per theme (trees, pines, cacti,
     rocks, buildings, palms, umbrellas, lava/water pools, flowers) placed with
     clearance checks against the centreline, plus a grandstand and billboards
     on every track.
- `THEME_COLORS` (per theme: ground/road/kerb colours) — paired with
  `SKY_THEMES` in the renderer.
- `surfaceAt(track, x, y, hint)` — **the physics⇄track contract**. Returns
  `{surf: road|kerb|grass|wall, gripMul, dragMul, d (signed lateral), idx, inPit}`.
  Road within `w`; kerb to `w+1.6` (grip ×0.92); grass ("off-road", whatever
  the theme's surface actually is) to `w+runoff` (grip ×0.52, heavy drag);
  wall beyond (position is clamped + bounced by physics).
- **To add a track**: add a `TRACK_DEFS` entry — everything else (line, kerbs,
  AI pace, minimap, menus, weekly rotation) derives automatically. Keep control
  points ≥ ~2.5× width apart to avoid spline cusps, and run the sim test (§8).

### `src/30-physics.js` — the kart model
- Fixed timestep `DT = 1/120 s`. Kart collision radius 1.15 m.
- Core constants in `PHYS`: ACCEL 13 m/s², TOP 36.5 m/s (~131 km/h), BRAKE 23,
  GRIP 21.5 m/s² lateral budget, STEER_K 0.30 rad/m, YAW_MAX 3 rad/s,
  BOOST +10 accel / +6.5 top, PIT_SPEED 11 m/s.
- **Grip-budget model**: velocity is a world vector split into forward/lateral
  components each step. Steering rotates the chassis; lateral friction tries to
  cancel sideways velocity but is capped at the grip budget
  (`GRIP × compound × wear × surface × skills`). Exceeding the budget = sliding
  (skids, smoke, wear). **Drift** (hold SPACE >10 m/s) deliberately cuts rear
  lateral grip ×0.52 and boosts yaw ×1.5; releasing with ≥0.3 charge fires a
  0.45–1.45 s boost.
- **Tyre wear** per step:
  `wearRate × skillMods.wear × (0.011·load² + 0.012·sliding + 0.0008·throttle)`;
  grip fades as `1 − (0.16·cliff + 0.06) · wear^1.6`. Result: softs die in
  ~5 laps on abrasive tracks, hards nearly never; street circuits wear ~10× less
  than the desert (time-at-lateral-load is what wears tyres).
- Walls: position clamped to `w + runoff`, velocity reflected ×(-0.3) and
  damped; big hits spark + shake via `world.onWallHit`.
- Laps: progress accumulates along arc length (jumps >28 m ignored → no cuts);
  a lap counts only after all 3 checkpoints; `world.onLap` fires with lap time.
- `collideKarts` (offline: symmetric impulses), `updateSlipstream` (tow within
  16 m / ±2.6 m → less drag + small accel), `trackCorners` (local minima of the
  line-speed profile — used for brake-marker placement and corner counts).

### `src/35-ai.js` — AI drivers + pit state machine
- `AIDriver` produces *inputs only* — AI karts run the identical `Kart.step`.
- Skill from ladder ELO: `skill = (elo−900)/1700` → corner-speed factor
  0.855–1.01 of the racing line's profile.
- Steering: pure-pursuit to a line point `4.5 + speed·0.52` m ahead (with a
  personal lateral bias). Braking: bang-bang toward the line speed at a
  speed-scaled look-ahead. Traffic: lateral dodge offsets + following-distance
  braking. Deliberate mistakes: short degraded-input windows, rarer with skill.
- Rubber band: ±4.5/5.5% speed based on gap to the player (`gap/900`) — keeps
  packs alive without feeling scripted.
- Pit strategy: plan a stop when `wear > 0.74` with ≥2 laps left (races ≥5
  laps); steer down the pit lane, stop 2.4 s at the box, swap compound.
- `updatePitState(kart)` is shared by AI **and player**: driving into the lane
  (only where it's fully separated from the track — grid slots can't trigger
  it) engages the 11 m/s limiter; the box swap fits the compound chosen with
  keys 1/2/3.

### `src/40-render.js` — Three.js view layer
- `class Renderer` deliberately keeps the old 2D renderer's API so `50-race`
  doesn't know 3D exists: `constructor(canvas, track)`, `resize()`,
  `render(world)`, `cam {x,y,rot,zoom,shake}`, `skidMark/skidBreak/clearSkids`.
  Only one instance lives at a time (`Renderer._active` disposes GL resources).
- **Coordinate mapping**: sim `(x, y)` → world `(x, 0, z=y)`;
  `mesh.rotation.y = −heading`. Chase camera sits `dist = clamp(96/zoom, 5.6,
  10.5)` behind `cam` along `cam.rot`, looks 7 m ahead; `cam.shake` adds jitter.
- Static world (built once per race): gradient-shader sky dome + sun/moon +
  clouds (+ 300 fixed stars at night), fog, big textured ground disc, road
  ribbon mesh with generated asphalt texture (edge lines + centre dash),
  vertex-coloured kerb strips, checker start line, gantry with "KART RUNNER"
  banner, pit-lane ribbon + glowing box + PIT sign, racing-line ribbon
  (vertex-coloured by speed; toggled via `world.showLine`), brake-marker boards
  (`world.showMarkers`), fence posts (instanced) + rail loops at the wall
  boundary.
- Decor is **instanced** per type: trees (sphere or conifer by theme, snow
  caps on frost), palms, cacti (capsule trunk + arm stubs), rocks
  (theme-coloured: snow drifts / sandstone / lava boulders), flowers,
  umbrellas, buildings (window texture; at night an emissive window map makes
  them glow), grandstand with crowd texture, billboards, water/lava discs with
  animated rings. Snow and volcanic ash reuse one falling-points system
  (`buildSnow(color, size, fallSpeed)`).
- Karts: built from primitives (chassis, pods, nose, spoiler, steering wheel,
  big helmet head + visor, 4 wheels — fronts steer), toon materials, real
  shadows, boost flame cones, drift-charge ring, body lean in corners. AI karts
  carry a name-tag sprite (fixed screen size, hidden beyond 55 m). Ghost kart =
  translucent grey clone.
- Skid marks: one pre-allocated 1400-quad ring buffer (positions rewritten,
  never reallocated). Particles: pool of 150 sprites fed from `world.particles`
  (smoke grows, confetti falls, sparks streak).
- `SKY_THEMES` adds per-theme sky/fog/sun/cloud/light settings (night and
  volcano dim the lights and tint the sun).
- `paintTrackMap(canvas, track)` — the little 2D top-down painter used by menu
  cards, the room screen, and the HUD minimap.

### `src/50-race.js` — the conductor
- `Race` singleton holds all live race state. `startRace(cfg)` where
  `cfg = {trackId, laps, compound, mode: 'race'|'weekly'|'training'|'online',
  lobby?, roster?, grid?}`.
- Loop: rAF accumulator stepping `stepSim()` at exactly 120 Hz (≤12 steps per
  frame), then `drawFrame`. **Online races also keep a 250 ms `setInterval`
  watchdog** that steps the sim if rAF stalls (backgrounded tab) so the room
  never sees you freeze.
- Race flow: 5-light countdown (karts frozen; online uses a fixed 4.0 s so all
  browsers launch together) → racing → player finish → confetti + P-banner →
  2.6 s → `endRace()`.
- Per step: AI inputs (60 Hz), player inputs (+ auto-brake assist which brakes
  toward the racing-line speed), physics for every local kart,
  `updatePitState`, collisions (offline symmetric; online only pushes *your*
  kart off remote poses), slipstream, positions (finished by time, others by
  progress), overtake toasts (1.5 s cooldown), ghost record/playback
  (training), particle spawning (drift smoke, world-coloured off-road dust,
  wall sparks), engine audio, camera smoothing.
- `WORLD` hooks connect physics events to juice (shake/sfx/toasts) and to the
  network (`onLap` → `NET.sendLap` when online).
- HUD is DOM (styled in style.css), rebuilt per race: position tower with live
  gaps, lap/time panel, speed cluster (km/h, tyre ring + wear bar, drift-boost
  bar), minimap, centre messages, toasts, pit hint (shows when wear >45% in
  5+-lap races). Text updates throttled to every 8th frame.
- Pause (ESC): offline = real freeze; **online = overlay only, the sim keeps
  running** (fairness). Menu offers assist toggles + Resume/Restart/Quit (or
  End Session in training, Leave Race in online).
- `endRace()` builds `Race.summary`, applies consequences by mode
  (ranked: ELO + points + ladder + weekly; online: none of those but XP,
  history, PBs — and `NET.raceOver()`; training: PBs/ghost only), saves, and
  routes to the results/trainingDone screen.

### `src/60-audio.js` — synthesised sound (`SFX`)
Engine = two detuned oscillators through a lowpass, pitch/gain from
speed+throttle; tyre screech = bandpass noise driven by slide; plus beeps,
lap chime, thuds, pit jingle, finish fanfare, UI clicks. No audio files.
Mute (M key or sidebar) persists in settings. AudioContext resumes lazily on
first interaction (autoplay policy).

### `src/70-ui.js` — screens
- `SCREENS` registry + `showScreen(id, arg)`; screens are functions returning
  DOM trees built with `el()`. `screenCleanup(nextId)` is called before every
  navigation — screens with timers/handlers (lobby, room, results-online) use
  it (the lobby clears its fake-matchmaking interval; the room unbinds NET
  handlers and leaves the room when navigating elsewhere).
- Screens: `home` (hero, stats, weekly card, setup summary, recent races),
  `lobby` (Quick Match — simulated matchmaking that fills 7 AI slots then
  auto-starts), `online` (create/join room), `room` (code card, roster with
  ready states, host-only settings, start/ready button), `tracks` (10 cards
  with live map previews + PBs), `setup` (livery, compound, race length,
  assists, profile reset), `garage` (XP/level + skill tree + kart DNA bars),
  `training` (+ `trainingDone`), `clan` (join/create/roster/club ladder —
  club-mates are AI rivals; weekly club points are seeded sim + your real
  points), `leaderboards` (Global ELO / Season points / Clubs tabs),
  `results` (podium, ELO delta or friendly-room stats, fastest lap,
  classification table).
- `showOnboarding()` — first-run modal (name/colour/flag). The sidebar
  (`renderSidebar`) shows profile + tier and a mute toggle.

### `src/80-net.js` — multiplayer
- `NET` singleton over PeerJS. **Room = the creator's browser**; star topology,
  max 8 players. Room code = 4 chars (no look-alike letters); host's peer id is
  `'kart-runner-3d-' + code`. Signaling uses the free public PeerJS cloud only
  to establish connections; all race traffic is browser↔browser (Google STUN,
  no TURN).
- Message protocol (JSON over one reliable DataChannel):

  | type | direction | purpose |
  |---|---|---|
  | `hello` | guest→host | join with profile |
  | `welcome` | host→guest | roster + cfg + RTT sample |
  | `roster` | host→all | player list (incl. ready flags) |
  | `ready` | guest→host | ready toggle |
  | `cfg` | host→all | track/laps/compound |
  | `start` | host→all | race config + grid order |
  | `pose` | any→relay→others | kart state @ ~15 Hz |
  | `lap` / `finish` | any→relay→others | timing events |
  | `raceover` | host→all | back to lobby, ready flags reset |
  | `full` | host→joiner | room full / race running |

- Pose packet (`packPose`): `[x, y, heading, steer, speed, lap, progress,
  flags, wear%]`, rounded; flags bits: 1=boost, 2=drift/slide, 4=in pit,
  8=off-road. Sent every ≥60 ms while racing (140 ms on the grid), wall-clock
  gated so background catch-up bursts can't flood the wire.
- `RemoteKart` — a kart driven by network data instead of physics. Buffers
  poses and interpolates **140 ms in the past** (tiny extrapolation if
  starved), exposing the same fields the renderer/HUD read. Local kart collides
  against remote poses by pushing only itself (each sim owns its own kart —
  no authority conflicts). Disconnected players freeze with a ⛔ tag.
- Fairness/trust model: each client simulates its own kart and reports its own
  laps. Fine for friendly rooms; a cheater could lie — acceptable scope.
- Failure modes handled: room-not-found timeout (9 s), full room, host leaving
  (room dies, guests get told), guest leaving mid-race, joining mid-race
  (rejected). If the public broker is unreachable (rare; strict firewalls) the
  UI explains it.

### `src/90-main.js` — boot & input
Boot: `loadDB()` → `initTracks()` → sidebar + home (+ onboarding if no name).
Keymap: WASD/arrows drive, SPACE drift, ESC pause, R rescue, M mute,
1/2/3 pit compound. Window `blur` releases all keys and auto-pauses offline
races. `resize` forwards to the renderer.

---

## 5. Game modes & flows

| mode | opponents | consequences |
|---|---|---|
| `race` (Quick Match) | 7 AI matched to your ELO | ELO ±, season points, ladder movement, XP, history, PBs |
| `weekly` | same, fixed track/laps/compound from ISO week | as above + weekly result stored |
| `training` | none (999 laps, end via ESC) | PBs + persistent ghost per track |
| `online` (Friends Room) | 1–7 real humans | XP, history, PBs only — **no ELO** |

Flow: menus run in `#app`; a race hides nothing — `#race-layer` (canvas + HUD)
overlays fullscreen; quitting/finishing hides it and routes to a screen.

---

## 6. Build & deploy

```bash
# dev: just open kart-runner-3d/index.html and edit src/

# distributable: regenerate the single file after edits
cd kart-runner-3d && python3 build.py

# deploy (either):
cd vercel-drop && npx vercel --prod          # after copying the new build in:
#   cp "../KART RUNNER 3D - Playable.html" index.html
# …or deploy the whole kart-runner-3d/ folder (keeps readable source online)
```

- Vercel = pure static hosting: effectively unlimited concurrent players;
  Hobby plan's 100 GB/month ≈ ~90k game loads; multiplayer never touches it.
- A claude.ai artifact copy also exists
  (https://claude.ai/code/artifact/0aaa9003-ad14-4952-a2dc-29edce2e2f7c) —
  single-player works there but **multiplayer cannot** (the artifact sandbox
  CSP blocks the signaling connection). Use the Vercel URL for racing friends.
- Sharing the raw HTML file also works (fully offline single-player;
  multiplayer works from `file://` in practice but the hosted URL is the
  reliable path).

---

## 7. Tuning cookbook

| Want to… | Touch |
|---|---|
| Add a circuit | `TRACK_DEFS` in `10-track.js` (control points ≥ ~2.5× width apart). Everything else derives. Run the sim test. |
| Add a visual theme | `THEME_COLORS` (10-track.js) + `SKY_THEMES` (40-render.js) + a decor branch in `buildDecor` + optionally `groundTexture`/decor meshes. |
| Change kart feel | `PHYS` in `30-physics.js`. `STEER_K` = agility, `GRIP` = corner speed, drift feel = the ×0.52/×1.5 pair in `step()`. |
| Tyre balance | `COMPOUNDS` (00-core) + the wear formula in `30-physics.js`. |
| AI difficulty | `speedFactor` mapping + rubber-band clamp in `35-ai.js`. |
| Points/ELO/XP | `RACE_PTS`, `eloDelta`, `xpForLevel` in `00-core.js`. |
| New skill node | `SKILL_TREE` + wire its effect in `skillMods` → physics reads it. |
| Race lengths | The `[3, 5, 8]` arrays in `70-ui.js` (setup + room screens). |
| Player count / room size | Cap in `NET._hostAccept` + `gridSlots` count (8) in `10-track.js`. |
| Netcode rates | Pose gate ms in `sendPoseThrottled` calls (50-race) + 140 ms interpolation delay in `RemoteKart.update`. |
| Own multiplayer infra | `NET._newPeer` in `80-net.js` — point at your own PeerServer (`npx peerjs --port 9000`); add TURN there for strict firewalls. |

---

## 8. Testing

Automated harnesses were used throughout development (they live outside the
repo in a temp scratchpad; any AI session can recreate them from this spec):

1. **Physics/geometry sim (Node, no browser)** — concatenates
   `00+10+30+35`, stubs `localStorage`, then: per track asserts sample count,
   length 500–2500 m, no NaNs, line speeds within 5–45 m/s, offsets within
   track, no near-self-intersections (far-apart samples closer than combined
   widths), 2–24 detected corners; then races 8 AI karts 5+ laps per track
   asserting everyone laps, best laps are 15–120 s, and no NaN positions.
   Also sanity-checks `eloDelta` and the weekly challenge.
2. **Browser smoke test** (puppeteer-core + installed Chrome, flags
   `--enable-unsafe-swiftshader --use-angle=swiftshader` for headless WebGL) —
   loads the built file, completes onboarding, visits every screen, runs a
   race start-to-results, screenshots everything, fails on any console error.
3. **Click regression** — pause menu via real mouse events: RESUME, assist
   toggles, END SESSION, QUIT. (Guards the `.hud * {pointer-events:none}` /
   `#pause-overlay` override pair — see §9 bug 1.)
4. **Multiplayer E2E** — **two separate Chrome instances** (not tabs: Chrome
   freezes rAF in background tabs), full loop: create → join by code → cfg
   sync → ready → synced start → both drive (real key events) → poses flow
   both ways → forced finishes → both reach results, ELO untouched, history
   `online`, rematch lobby intact, zero page errors.

Manual QA notes: SwiftShader headless runs at ~20 fps — that's the software
renderer, not the game (real GPUs run 60+). First frames after race start are
slow in headless while shaders compile.

---

## 9. Known limitations & history-informed gotchas

1. **HUD click-through design**: `.hud * { pointer-events: none }` keeps the
   HUD from blocking gameplay; `#pause-overlay, #pause-overlay * { auto }`
   re-enables the menu. Any new interactive HUD element needs the same
   override, or it will silently ignore clicks.
2. **Background tabs**: rAF stops. Online races have a watchdog interval;
   offline races just pause (blur handler). Don't "fix" the watchdog away.
3. **Multiplayer trust**: clients self-report; no anti-cheat. Friendly scope.
4. No TURN server → strict corporate NATs may fail to connect (README/Upgrade
   path covers running your own peer+TURN).
5. Host leaving kills the room (no host migration).
6. Desktop keyboard only — no touch controls yet (top candidate feature:
   on-screen joystick + buttons for mobile).
7. Elevation is visual-flat: the sim is 2D; hills would need a physics rework.
8. localStorage = per browser + per origin; clearing site data wipes progress.
   No cloud sync/accounts by design.
9. Spline authoring: control points too close together create curvature cusps
   → absurdly slow corner speeds. The sim test's minV/corner checks catch this.
10. The legacy 2D playable at root shares the same save key — playing it on
    the same origin touches the same profile. Harmless, slightly surprising.

## 10. Design system (style.css)

Cartoon "ink & cream" flat style inherited from the original prototype and
used everywhere (menus, HUD, even the 3D world's palette): cream/paper
grounds `#FFF6E5/#FFFDF7`, ink `#0F0E17` outlines (3 px) with hard offset
shadows (`0 6px 0 ink`), accent orange `#FF4D2E`, yellow `#FFD23F`, sky
`#4ABEFF`, grass `#5DD17B`; tyre colours soft=red / medium=amber / hard=white.
Fonts: Bowlby One (display), Space Grotesk (UI), JetBrains Mono (numbers,
always with `tabular-nums`). All tokens are CSS custom properties at the top
of `src/style.css`. When adding UI, use existing classes (`.card`, `.btn`,
`.chip`, `.lrow`, `.seg`, `.toggle`, `.tt`) — they carry the look for free.

## 11. Project history

1. Started from a menus-only React prototype (`KART RUNNER - Standalone.html`).
2. **v1 (2D)**: full game rebuilt with real physics on a 2D canvas
   (`KART RUNNER - Playable.html`, still at root).
3. **v2 (3D)**: renderer swapped to Three.js behind the same API; snow track
   added; source tree established in `kart-runner-3d/`.
4. **v3 (multiplayer)**: PeerJS Friends Rooms, Vercel deployment story.
5. **v4 (current)**: 10 circuits / 8 themes (desert, volcano, night city new).

Each stage was verified with the harnesses in §8 before shipping.
