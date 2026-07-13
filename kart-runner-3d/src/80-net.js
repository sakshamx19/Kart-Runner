'use strict';
/* ============================================================
   80-net.js — Friends Room multiplayer
   WebRTC data channels via PeerJS. The room creator's browser
   is the race host: it owns the roster + settings and relays
   pose/lap/finish traffic (star topology, up to 8 players).
   Nothing runs on a server — hosting is static.
   ============================================================ */

/* ------------------------------------------------------------------
   ICE / relay configuration — what lets rooms connect across networks.

   • STUN finds a DIRECT browser-to-browser path. Works on home Wi-Fi,
     mobile data, most cafés. Free, no relay cost.
   • TURN *relays* the traffic through a public server when a firewall
     blocks the direct path. This is the ONLY thing that gets rooms
     working on strict office / corporate networks (like polestarllp).

   The free OpenRelay entries below get you connected out-of-the-box on
   most networks. For GUARANTEED corporate-firewall traversal, grab a
   free TURN plan (metered.ca — free tier, no card) and paste the three
   credentials it gives you into MY_TURN below. Nothing else to change.
   ------------------------------------------------------------------ */

//  ↓↓↓  PASTE YOUR OWN TURN CREDENTIALS HERE for rock-solid office hosting  ↓↓↓
//  (uncomment the three lines and fill in username/credential from your provider)
const MY_TURN = [
  // { urls: 'turn:global.relay.metered.ca:80',                username: 'YOUR_USERNAME', credential: 'YOUR_PASSWORD' },
  // { urls: 'turn:global.relay.metered.ca:443',               username: 'YOUR_USERNAME', credential: 'YOUR_PASSWORD' },
  // { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: 'YOUR_USERNAME', credential: 'YOUR_PASSWORD' },
];

const ICE_SERVERS = [
  // STUN — direct path (free, tried first)
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  // Free public TURN fallback — test-grade: reliable on home/café, may be
  // flaky on locked-down networks. Real creds in MY_TURN override this.
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ...MY_TURN,
];

const NET = {
  peer: null,
  isHost: false,
  roomCode: null,
  conns: new Map(),        // peerId -> DataConnection (host: every guest; guest: just the host)
  players: new Map(),      // peerId -> profile {id, name, color, number, flag, clanTag, elo, ready}
  cfg: { trackId: 'sunrise', laps: 3, compound: 'medium' },
  status: 'idle',          // idle | connecting | lobby | racing
  handlers: {},            // onRoster, onCfg, onStart, onPose, onLap, onFinish, onError, onClosed, onInfo
  rtt: 0,

  get myId() { return this.peer ? this.peer.id : 'me'; },
  get playerList() { return [...this.players.values()]; },

  _emit(name, ...args) { const h = this.handlers[name]; if (h) try { h(...args); } catch (e) { console.error(e); } },

  myProfile() {
    const p = DB.profile;
    return {
      id: this.myId, name: p.name || 'RACER', color: p.color, number: p.number,
      flag: p.flag, clanTag: clanTagOf(p), elo: p.elo, ready: this.isHost,
    };
  },

  /* ---------------- room lifecycle ---------------- */
  _newPeer(id) {
    // default PeerJS cloud broker for signaling; ICE_SERVERS (STUN + TURN
    // relay) for NAT traversal so rooms connect across strict networks too
    return new Peer(id, { debug: 1, config: { iceServers: ICE_SERVERS } });
  },

  createRoom(done) {
    this.leave();
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += alphabet[(Math.random() * alphabet.length) | 0];
    this.status = 'connecting';
    this.isHost = true;
    this.roomCode = code;
    const peer = this.peer = this._newPeer('kart-runner-3d-' + code);
    peer.on('open', () => {
      this.status = 'lobby';
      this.players.set(this.myId, this.myProfile());
      done && done(null, code);
      this._emit('onRoster');
    });
    peer.on('connection', conn => this._hostAccept(conn));
    peer.on('error', err => this._fail(err, done));
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
  },

  joinRoom(code, done) {
    this.leave();
    code = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    this.status = 'connecting';
    this.isHost = false;
    this.roomCode = code;
    const peer = this.peer = this._newPeer(undefined);
    peer.on('open', () => {
      const conn = peer.connect('kart-runner-3d-' + code, { reliable: true });
      let opened = false;
      const timeout = setTimeout(() => {
        if (!opened) this._fail({ type: 'room-not-found', message: 'No room answered on ' + code }, done);
      }, 9000);
      conn.on('open', () => {
        opened = true; clearTimeout(timeout);
        this.conns.set('host', conn);
        conn.send({ t: 'hello', p: this.myProfile(), ts: performance.now() });
        conn.on('data', msg => this._onData(conn, msg));
        conn.on('close', () => { this._emit('onClosed', 'Host left — room closed.'); this.leave(); });
        this.status = 'lobby';
        done && done(null, code);
      });
      conn.on('error', err => { if (!opened) { clearTimeout(timeout); this._fail(err, done); } });
    });
    peer.on('error', err => this._fail(err, done));
  },

  _fail(err, done) {
    const friendly =
      err && err.type === 'unavailable-id' ? 'That room code is already hosting — try creating again.'
        : err && (err.type === 'peer-unavailable' || err.type === 'room-not-found') ? 'Room not found. Check the code with the host.'
          : 'Could not reach the matchmaking relay. Check your internet connection (corporate networks sometimes block WebRTC).';
    this.leave();
    if (done) done(friendly);
    else this._emit('onError', friendly);
  },

  _hostAccept(conn) {
    conn.on('open', () => {
      if (this.players.size >= 8 || this.status === 'racing') {
        conn.send({ t: 'full', reason: this.status === 'racing' ? 'Race already running' : 'Room is full (8)' });
        setTimeout(() => conn.close(), 300);
        return;
      }
      this.conns.set(conn.peer, conn);
      conn.on('data', msg => this._onData(conn, msg));
      conn.on('close', () => {
        this.conns.delete(conn.peer);
        if (this.players.delete(conn.peer)) {
          this._broadcast({ t: 'roster', players: this.playerList });
          this._emit('onRoster');
          this._emit('onPeerGone', conn.peer);
        }
      });
    });
  },

  leave() {
    if (this.peer) { try { this.peer.destroy(); } catch (e) {} }
    this.peer = null;
    this.conns.clear();
    this.players.clear();
    this.isHost = false;
    this.roomCode = null;
    this.status = 'idle';
  },

  /* ---------------- messaging ---------------- */
  _broadcast(msg, exceptId) {
    for (const [id, conn] of this.conns) {
      if (id === exceptId || conn.peer === exceptId) continue;
      try { conn.send(msg); } catch (e) {}
    }
  },

  _sendToHost(msg) {
    const conn = this.conns.get('host');
    if (conn) try { conn.send(msg); } catch (e) {}
  },

  send(msg) { this.isHost ? this._broadcast(msg) : this._sendToHost(msg); },

  setCfg(patch) {
    if (!this.isHost) return;
    Object.assign(this.cfg, patch);
    this._broadcast({ t: 'cfg', cfg: this.cfg });
    this._emit('onCfg');
  },

  setReady(ready) {
    const me = this.players.get(this.myId);
    if (me) me.ready = ready;
    if (this.isHost) { this._broadcast({ t: 'roster', players: this.playerList }); this._emit('onRoster'); }
    else this._sendToHost({ t: 'ready', ready });
  },

  startRaceAll() {
    if (!this.isHost) return;
    const grid = this.playerList.map(p => p.id);
    for (let i = grid.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[grid[i], grid[j]] = [grid[j], grid[i]]; }
    const msg = { t: 'start', cfg: this.cfg, grid };
    this.status = 'racing';
    this._broadcast(msg);
    this._emit('onStart', msg);
  },

  sendPose(d) {
    const msg = { t: 'pose', id: this.myId, d };
    if (this.isHost) this._broadcast(msg);
    else this._sendToHost(msg);
  },
  sendLap(ms, bestMs) { this.send({ t: 'lap', id: this.myId, ms, bestMs }); },
  sendFinish(ms) { this.send({ t: 'finish', id: this.myId, ms }); },
  raceOver() {
    this.status = 'lobby';
    if (this.isHost) {
      for (const p of this.players.values()) if (p.id !== this.myId) p.ready = false;
      this._broadcast({ t: 'raceover' });
      this._broadcast({ t: 'roster', players: this.playerList });
      this._emit('onRoster');
    }
  },

  _onData(conn, msg) {
    if (!msg || !msg.t) return;
    switch (msg.t) {
      case 'hello': {               // host only
        if (!this.isHost) break;
        msg.p.id = conn.peer;
        msg.p.ready = false;
        this.players.set(conn.peer, msg.p);
        conn.send({ t: 'welcome', players: this.playerList, cfg: this.cfg, hostId: this.myId, ts: msg.ts });
        this._broadcast({ t: 'roster', players: this.playerList }, conn.peer);
        this._emit('onRoster');
        break;
      }
      case 'welcome': {             // guest only
        this.rtt = Math.round(performance.now() - msg.ts);
        this.players.clear();
        for (const p of msg.players) this.players.set(p.id, p);
        Object.assign(this.cfg, msg.cfg);
        this._emit('onRoster'); this._emit('onCfg');
        break;
      }
      case 'roster': {
        this.players.clear();
        for (const p of msg.players) this.players.set(p.id, p);
        this._emit('onRoster');
        break;
      }
      case 'ready': {               // host only
        const p = this.players.get(conn.peer);
        if (p) { p.ready = !!msg.ready; this._broadcast({ t: 'roster', players: this.playerList }); this._emit('onRoster'); }
        break;
      }
      case 'cfg': {
        Object.assign(this.cfg, msg.cfg);
        this._emit('onCfg');
        break;
      }
      case 'start': {
        this.status = 'racing';
        Object.assign(this.cfg, msg.cfg);
        this._emit('onStart', msg);
        break;
      }
      case 'pose': {
        if (this.isHost) this._broadcast(msg, conn.peer);   // relay to the other guests
        this._emit('onPose', msg.id, msg.d);
        break;
      }
      case 'lap': {
        if (this.isHost) this._broadcast(msg, conn.peer);
        this._emit('onLap', msg.id, msg.ms, msg.bestMs);
        break;
      }
      case 'finish': {
        if (this.isHost) this._broadcast(msg, conn.peer);
        this._emit('onFinish', msg.id, msg.ms);
        break;
      }
      case 'raceover': { this.status = 'lobby'; break; }
      case 'full': { this._emit('onClosed', msg.reason || 'Room is full.'); this.leave(); break; }
    }
  },
};

/* ============================================================
   RemoteKart — a rival driven by network poses, not physics.
   Exposes the same fields the renderer and HUD read from Kart.
   ============================================================ */
class RemoteKart {
  constructor(profile, track) {
    this.isPlayer = false;
    this.isRemote = true;
    this.id = profile.id;
    this.name = profile.name;
    this.color = profile.color;
    this.number = profile.number;
    this.flag = profile.flag;
    this.elo = profile.elo;
    this.clanTag = profile.clanTag;
    this.track = track;
    this.compound = COMPOUNDS.medium;

    const slot = track.gridSlots[0];
    this.x = slot.x; this.y = slot.y; this.heading = slot.heading;
    this.speed = 0; this.steerVis = 0;
    this.boostT = 0; this.driftCharge = 0; this.sliding = 0;
    this.airKick = 0; this.crashFlash = 0; this.slip = 0;
    this.surf = 'road'; this.wear = 0; this.pitState = null;
    this.lap = 1; this.progress = 0; this.pos = 1;
    this.lapTimes = []; this.bestLap = null; this.lastLap = null;
    this.finished = false; this.finishT = null;
    this.gone = false;              // connection lost mid-race
    this.buf = [];                  // pose buffer [{t, x, y, h, ...}]
  }

  placeAt(slot) { this.x = slot.x; this.y = slot.y; this.heading = slot.heading; }

  get fwdSpeed() { return this.speed; }
  get vx() { return Math.cos(this.heading) * this.speed; }
  get vy() { return Math.sin(this.heading) * this.speed; }

  pushPose(d) {
    // d: [x, y, heading, steer, speed, lap, progress, flags, wear]
    this.buf.push({
      t: performance.now(),
      x: d[0], y: d[1], h: d[2], steer: d[3], speed: d[4],
      lap: d[5], progress: d[6], flags: d[7], wear: d[8],
    });
    if (this.buf.length > 12) this.buf.shift();
  }

  update() {
    const now = performance.now() - 140;   // render slightly in the past → smooth interpolation
    const buf = this.buf;
    if (!buf.length) return;
    let a = buf[0], b = buf[buf.length - 1];
    for (let i = buf.length - 1; i > 0; i--) {
      if (buf[i - 1].t <= now) { a = buf[i - 1]; b = buf[i]; break; }
    }
    const span = Math.max(1, b.t - a.t);
    const f = clamp((now - a.t) / span, 0, 1.35);   // small extrapolation if packets are late
    this.x = lerp(a.x, b.x, f);
    this.y = lerp(a.y, b.y, f);
    this.heading = a.h + angWrap(b.h - a.h) * f;
    this.steerVis = lerp(a.steer, b.steer, f);
    this.speed = lerp(a.speed, b.speed, f);
    const src = f < 1 ? a : b;
    this.lap = src.lap;
    this.progress = lerp(a.progress, b.progress, f);
    this.wear = src.wear / 100;
    const flags = src.flags;
    this.boostT = flags & 1 ? 0.2 : 0;
    this.sliding = flags & 2 ? 0.8 : 0;
    this.driftCharge = flags & 2 ? 0.6 : 0;
    this.pitState = flags & 4 ? 'in' : null;
    this.surf = flags & 8 ? 'grass' : 'road';
  }
}

/* pack the local kart's pose for the wire */
function packPose(k) {
  let flags = 0;
  if (k.boostT > 0) flags |= 1;
  if (k.driftActive || k.sliding > 0.4) flags |= 2;
  if (k.pitState) flags |= 4;
  if (k.surf === 'grass') flags |= 8;
  return [
    Math.round(k.x * 100) / 100, Math.round(k.y * 100) / 100,
    Math.round(k.heading * 1000) / 1000, Math.round(k.steerVis * 100) / 100,
    Math.round(k.speed * 10) / 10, k.lap,
    Math.round(k.progress * 10) / 10, flags, Math.round(k.wear * 100),
  ];
}
