'use strict';
/* ============================================================
   40-render.js — Three.js renderer: low-poly cartoon world,
   chase camera, toon karts, decor instancing, skids, particles.
   Same API as the old 2D renderer, so the race controller is
   unchanged: physics lives in the XZ plane (sim y → world z).
   ============================================================ */

const INK = '#0F0E17';

const SKY_THEMES = {
  meadow: { top: 0x2f9de8, horizon: 0xbfe9ff, fogNear: 90, fogFar: 260 },
  street: { top: 0x5a79e8, horizon: 0xffd9b8, fogNear: 80, fogFar: 240 },
  forest: { top: 0x2b8fd0, horizon: 0xcdeed2, fogNear: 85, fogFar: 250 },
  coast:  { top: 0x2fa6e8, horizon: 0xffedbe, fogNear: 90, fogFar: 260 },
  snow:   { top: 0x4b3fd0, horizon: 0x9c8bf0, fogNear: 70, fogFar: 230 },
  desert: { top: 0x7b5fe0, horizon: 0xffb37a, fogNear: 90, fogFar: 260, sun: 0xffa04d },
  volcano:{ top: 0x241f30, horizon: 0xff7a5a, fogNear: 60, fogFar: 210, sun: 0xff6b35, cloud: 0x554e66, hemi: 0.75, dir: 1.2, dirColor: 0xffb59a },
  night:  { top: 0x11102b, horizon: 0x4a3f8f, fogNear: 65, fogFar: 210, sun: 0xf4f1e0, cloud: 0x8a84b8, hemi: 0.65, dir: 1.0, dirColor: 0xbfd0ff },
};

/* ---------- texture helpers (all generated, nothing external) ---------- */
function canvasTex(w, h, draw, repeat) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roadTexture(color) {
  return canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = color; c.fillRect(0, 0, w, h);
    // subtle asphalt noise
    for (let i = 0; i < 260; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
      c.fillRect(Math.random() * w, Math.random() * h, 2.2, 2.2);
    }
    // edge lines
    c.fillStyle = 'rgba(255,253,247,0.85)';
    c.fillRect(3, 0, 4, h); c.fillRect(w - 7, 0, 4, h);
    // centre dash
    c.fillRect(w / 2 - 2, 8, 4, 46);
  });
}

function groundTexture(theme, c1, c2) {
  return canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = c1; c.fillRect(0, 0, w, h);
    c.fillStyle = c2;
    if (theme === 'snow') {
      for (let i = 0; i < 120; i++) { c.globalAlpha = 0.5; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 1.6, 0, 7); c.fill(); }
      c.globalAlpha = 1;
    } else if (theme === 'coast' || theme === 'desert') {
      for (let i = 0; i < 200; i++) { c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    } else if (theme === 'volcano') {
      // cooled-lava cracks
      c.strokeStyle = c2; c.lineWidth = 2;
      for (let i = 0; i < 26; i++) {
        c.beginPath();
        let x = Math.random() * w, y = Math.random() * h;
        c.moveTo(x, y);
        for (let s2 = 0; s2 < 4; s2++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; c.lineTo(x, y); }
        c.stroke();
      }
    } else if (theme === 'night') {
      c.globalAlpha = 0.6;
      for (let i = 0; i < 6; i++) { c.fillRect(0, i * 42, w, 2); c.fillRect(i * 42, 0, 2, h); }
      c.globalAlpha = 1;
    } else {
      c.fillRect(0, 0, w / 2, h); // mown stripes
    }
  }, [24, 24]);
}

function checkerTexture() {
  return canvasTex(64, 32, (c) => {
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
      c.fillStyle = (i + j) % 2 ? '#0F0E17' : '#FFFDF7';
      c.fillRect(i * 8, j * 8, 8, 8);
    }
  });
}

function textTexture(text, bg, fg, w = 512, h = 128, font = '68px "Bowlby One", sans-serif') {
  return canvasTex(w, h, (c) => {
    if (bg) { c.fillStyle = bg; c.fillRect(0, 0, w, h); }
    c.fillStyle = fg;
    c.font = font;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 4);
  });
}

function nameTagSprite(label) {
  const pad = 18;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  ctx.font = '700 34px "Space Grotesk", sans-serif';
  const tw = Math.ceil(ctx.measureText(label).width);
  cv.width = tw + pad * 2 + 8; cv.height = 62;
  const c2 = cv.getContext('2d');
  c2.font = '700 34px "Space Grotesk", sans-serif';
  c2.fillStyle = 'rgba(255,253,247,0.92)';
  c2.strokeStyle = INK; c2.lineWidth = 5;
  c2.beginPath(); c2.roundRect(3, 3, cv.width - 6, cv.height - 6, 28); c2.fill(); c2.stroke();
  c2.fillStyle = INK; c2.textAlign = 'center'; c2.textBaseline = 'middle';
  c2.fillText(label, cv.width / 2, cv.height / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  // fixed screen size: don't balloon when the kart is near the camera
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false }));
  const hgt = 0.045;
  spr.scale.set(hgt * (cv.width / cv.height), hgt, 1);
  spr.renderOrder = 50;
  return spr;
}

/* ---------- kart mesh ---------- */
function buildKartMesh(color, isGhost) {
  const g = new THREE.Group();
  const mat = (hex, opts = {}) => {
    const m = new THREE.MeshToonMaterial({ color: hex, ...opts });
    if (isGhost) { m.transparent = true; m.opacity = 0.35; m.depthWrite = false; }
    return m;
  };
  const body = new THREE.Group();
  g.add(body);
  g.userData.body = body;

  // chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.34, 1.06), mat(color));
  chassis.position.y = 0.34;
  chassis.castShadow = !isGhost;
  body.add(chassis);
  // side pods
  const pod = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.26, 1.5), mat(color));
  pod.position.set(-0.1, 0.3, 0);
  pod.castShadow = !isGhost;
  body.add(pod);
  // nose
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.62), mat('#FFFDF7'));
  nose.position.set(0.86, 0.36, 0);
  body.add(nose);
  // spoiler
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 1.2), mat('#0F0E17'));
  spoiler.position.set(-1.02, 0.62, 0);
  body.add(spoiler);
  const spoilerPost = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), mat('#2A2738'));
  spoilerPost.position.set(-1.0, 0.45, 0);
  body.add(spoilerPost);
  // steering column + wheel
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5), mat('#2A2738'));
  col.rotation.z = 0.8; col.position.set(0.42, 0.62, 0);
  body.add(col);
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 6, 14), mat('#2A2738'));
  sw.rotation.y = Math.PI / 2; sw.rotation.z = 0.8; sw.position.set(0.52, 0.72, 0);
  body.add(sw);

  // driver: torso + big cartoon head
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.46, 0.6), mat(color));
  torso.position.set(-0.28, 0.62, 0);
  torso.castShadow = !isGhost;
  body.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 18, 14), mat('#FFFDF7'));
  head.position.set(-0.26, 1.16, 0);
  head.castShadow = !isGhost;
  body.add(head);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), mat('#4ABEFF'));
  visor.position.set(-0.06, 1.18, 0);   // pokes out of the front of the helmet
  visor.scale.set(0.55, 0.62, 1.05);
  body.add(visor);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.02, 0.2), mat('#FFD23F'));
  stripe.position.set(-0.26, 1.5, 0);
  body.add(stripe);

  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.3, 14);
  wheelGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.32, 10);
  hubGeo.rotateX(Math.PI / 2);
  const wheels = { front: [], rear: [] };
  for (const [fx, fz, front] of [[0.68, -0.66, true], [0.68, 0.66, true], [-0.68, -0.68, false], [-0.68, 0.68, false]]) {
    const wg = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeo, mat('#191623'));
    tyre.castShadow = !isGhost;
    const hub = new THREE.Mesh(hubGeo, mat('#B7BCC7'));
    wg.add(tyre, hub);
    wg.position.set(fx, 0.32, fz);
    body.add(wg);
    (front ? wheels.front : wheels.rear).push(wg);
  }
  g.userData.wheels = wheels;

  // boost flame
  const flame = new THREE.Group();
  const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.0, 8), mat('#FF4D2E', { transparent: true, opacity: 0.95 }));
  f1.rotation.z = Math.PI / 2;
  const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.62, 8), mat('#FFD23F', { transparent: true, opacity: 0.95 }));
  f2.rotation.z = Math.PI / 2;
  f2.position.x = -0.12;
  flame.add(f1, f2);
  flame.position.set(-1.55, 0.4, 0);
  flame.visible = false;
  body.add(flame);
  g.userData.flame = flame;

  // drift charge ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.05, 6, 28), new THREE.MeshBasicMaterial({ color: 0x4abeff, transparent: true, opacity: 0.8 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.15;
  ring.visible = false;
  g.add(ring);
  g.userData.ring = ring;

  return g;
}

/* ============================================================ */
class Renderer {
  constructor(canvas, track) {
    if (Renderer._active) Renderer._active.dispose();
    Renderer._active = this;

    this.cv = canvas;
    this.track = track;
    this.cam = { x: 0, y: 0, rot: 0, zoom: 13, shake: 0 };
    this.time = 0;
    this.disposables = [];

    this.three = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.three.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.three.shadowMap.enabled = true;
    this.three.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
    this.resize();

    this.buildSky();
    this.buildLights();
    this.buildWorld();
    this.buildSkidBuffer();
    this.buildParticlePool();
    this.kartMeshes = new Map();
    this.tagSprites = new Map();
    this.ghostMesh = null;
    this.skidPrev = new Map();
  }

  D(obj) { this.disposables.push(obj); return obj; }

  dispose() {
    this.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
    });
    this.three.dispose();
    Renderer._active = null;
  }

  resize() {
    const w = this.cv.clientWidth || innerWidth, h = this.cv.clientHeight || innerHeight;
    this.three.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* ---------------- static world ---------------- */
  buildSky() {
    const sk = SKY_THEMES[this.track.theme] || SKY_THEMES.meadow;
    const geo = new THREE.SphereGeometry(600, 24, 12);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(sk.top) },
        bottom: { value: new THREE.Color(sk.horizon) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float t = clamp(vP.y/380.0, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(sk.horizon, sk.fogNear, sk.fogFar);

    // cartoon sun (or moon, or volcano glow) + a few puffy clouds
    const sun = new THREE.Mesh(new THREE.SphereGeometry(26, 16, 12), new THREE.MeshBasicMaterial({ color: sk.sun || 0xffd23f, fog: false }));
    sun.position.set(220, 240, -260);
    this.scene.add(sun);
    if (this.track.theme === 'night') {
      const starPos = new Float32Array(300 * 3);
      for (let i = 0; i < 300; i++) {
        const a = Math.random() * TAU, e = 0.15 + Math.random() * 1.2;
        starPos[i * 3] = Math.cos(a) * Math.cos(e) * 560;
        starPos[i * 3 + 1] = Math.sin(e) * 560;
        starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 560;
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xfff6d8, size: 2.2, fog: false, sizeAttenuation: false }));
      this.scene.add(this.stars);
    }
    const cloudMat = new THREE.MeshBasicMaterial({ color: sk.cloud || 0xffffff, fog: false, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 7; i++) {
      const cl = new THREE.Group();
      for (let b = 0; b < 3; b++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(12 + Math.random() * 9, 10, 8), cloudMat);
        s.position.set(b * 15 - 15, Math.random() * 4, Math.random() * 6);
        s.scale.y = 0.6;
        cl.add(s);
      }
      const a = i / 7 * Math.PI * 2;
      cl.position.set(Math.cos(a) * 380, 150 + Math.random() * 80, Math.sin(a) * 380);
      this.scene.add(cl);
    }
  }

  buildLights() {
    const sk = SKY_THEMES[this.track.theme] || SKY_THEMES.meadow;
    const hemi = new THREE.HemisphereLight(0xffffff, 0x99b077, sk.hemi != null ? sk.hemi : 0.95);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(sk.dirColor || 0xfff2d8, sk.dir != null ? sk.dir : 1.6);
    sun.position.set(60, 90, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const S = 70;
    sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
    sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
    sun.shadow.camera.far = 400;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun, sun.target);
    this.sun = sun;
  }

  buildWorld() {
    const tr = this.track, S = tr.samples, n = tr.n, C = tr.colors;

    // ground
    const gtex = groundTexture(tr.theme, C.ground, C.ground2);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(700, 40),
      new THREE.MeshLambertMaterial({ map: gtex })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // --- road ribbon ---
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const sm = S[i % n];
      pos.push(sm.x + sm.nx * sm.w, 0.02, sm.y + sm.ny * sm.w);
      pos.push(sm.x - sm.nx * sm.w, 0.02, sm.y - sm.ny * sm.w);
      uv.push(0, sm.s / 9, 1, sm.s / 9);
      if (i < n) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    roadGeo.setIndex(idx);
    roadGeo.computeVertexNormals();
    const road = new THREE.Mesh(roadGeo, new THREE.MeshLambertMaterial({ map: roadTexture(C.road), side: THREE.DoubleSide }));
    road.receiveShadow = true;
    this.scene.add(road);

    // --- kerbs (vertex-colored quads on corner outsides) ---
    const kpos = [], kcol = [], kidx = [];
    let kv = 0;
    for (let i = 0; i < n; i++) {
      const sm = S[i];
      if (!sm.kerb || Math.abs(sm.k) < 0.004) continue;
      const side = -Math.sign(sm.k);
      const nx2 = S[(i + 1) % n];
      const col = new THREE.Color((i >> 1) % 2 ? '#FFFDF7' : C.kerb1);
      const w1 = sm.w - 0.05, w2 = sm.w + 1.5;
      kpos.push(
        sm.x + sm.nx * side * w1, 0.06, sm.y + sm.ny * side * w1,
        sm.x + sm.nx * side * w2, 0.03, sm.y + sm.ny * side * w2,
        nx2.x + nx2.nx * side * w2, 0.03, nx2.y + nx2.ny * side * w2,
        nx2.x + nx2.nx * side * w1, 0.06, nx2.y + nx2.ny * side * w1);
      for (let c = 0; c < 4; c++) kcol.push(col.r, col.g, col.b);
      kidx.push(kv, kv + 1, kv + 2, kv, kv + 2, kv + 3);
      kv += 4;
    }
    const kerbGeo = new THREE.BufferGeometry();
    kerbGeo.setAttribute('position', new THREE.Float32BufferAttribute(kpos, 3));
    kerbGeo.setAttribute('color', new THREE.Float32BufferAttribute(kcol, 3));
    kerbGeo.setIndex(kidx);
    kerbGeo.computeVertexNormals();
    this.scene.add(new THREE.Mesh(kerbGeo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));

    // --- start/finish checker strip ---
    const s0 = S[0], s2 = S[3];
    const chk = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.hypot(s2.x - s0.x, s2.y - s0.y), s0.w * 2),
      new THREE.MeshLambertMaterial({ map: checkerTexture() }));
    chk.rotation.x = -Math.PI / 2;
    chk.rotation.z = -Math.atan2(s0.ty, s0.tx);
    chk.position.set((s0.x + s2.x) / 2, 0.045, (s0.y + s2.y) / 2);
    this.scene.add(chk);

    // --- gantry ---
    const gant = new THREE.Group();
    const postMat = new THREE.MeshToonMaterial({ color: 0x0f0e17 });
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.2, 0.5), postMat);
      p.position.set(0, 3.1, side * (s0.w + 1.2));
      p.castShadow = true;
      gant.add(p);
    }
    const bannerCore = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.7, s0.w * 2 + 3.4), postMat);
    bannerCore.position.y = 5.6;
    gant.add(bannerCore);
    const bannerTex = textTexture('KART RUNNER', '#FF4D2E', '#FFFDF7', 1024, 128, '92px "Bowlby One", sans-serif');
    for (const side of [-1, 1]) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(s0.w * 2 + 3.4, 1.7),
        new THREE.MeshBasicMaterial({ map: bannerTex }));
      face.rotation.y = side * Math.PI / 2;
      face.position.set(side * 0.2, 5.6, 0);
      gant.add(face);
    }
    gant.position.set(s0.x, 0, s0.y);
    gant.rotation.y = -Math.atan2(s0.ty, s0.tx);
    this.scene.add(gant);

    // --- pit lane ---
    const ppos = [], pidx = [];
    let pv = 0, prev = null;
    for (let i = tr.pit.a; ; i = (i + 1) % n) {
      const po = tr.pitOffsetAt(i);
      if (po !== null && Math.abs(po) > 0.5) {
        const sm = S[i];
        ppos.push(sm.x + sm.nx * (po - Math.sign(po) * 2.7), 0.035, sm.y + sm.ny * (po - Math.sign(po) * 2.7));
        ppos.push(sm.x + sm.nx * (po + Math.sign(po) * 2.7), 0.035, sm.y + sm.ny * (po + Math.sign(po) * 2.7));
        if (prev !== null) pidx.push(pv - 2, pv - 1, pv, pv - 1, pv + 1, pv);
        prev = i; pv += 2;
      }
      if (i === tr.pit.b) break;
    }
    if (pv > 4) {
      const pitGeo = new THREE.BufferGeometry();
      pitGeo.setAttribute('position', new THREE.Float32BufferAttribute(ppos, 3));
      pitGeo.setIndex(pidx);
      pitGeo.computeVertexNormals();
      const pit = new THREE.Mesh(pitGeo, new THREE.MeshLambertMaterial({ color: C.road, side: THREE.DoubleSide }));
      pit.material.color.offsetHSL(0, 0, 0.06);
      this.scene.add(pit);
      // pit box
      const bx = S[tr.pit.boxIdx], bo = tr.pitOffsetAt(tr.pit.boxIdx) || 0;
      const box = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3.8),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.4 }));
      box.rotation.x = -Math.PI / 2;
      box.rotation.z = -Math.atan2(bx.ty, bx.tx);
      box.position.set(bx.x + bx.nx * bo, 0.05, bx.y + bx.ny * bo);
      this.scene.add(box);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.1),
        new THREE.MeshBasicMaterial({ map: textTexture('PIT', '#0F0E17', '#FFD23F', 256, 72, '52px "Bowlby One", sans-serif'), side: THREE.DoubleSide }));
      sign.position.set(bx.x + bx.nx * bo * 1.45, 2.2, bx.y + bx.ny * bo * 1.45);
      sign.rotation.y = -Math.atan2(bx.ty, bx.tx);
      this.scene.add(sign);
    }

    // --- racing line ribbon (toggleable) ---
    const lpos = [], lcol = [], lidx = [];
    for (let i = 0; i <= n; i++) {
      const L = tr.line[i % n];
      const nx2 = tr.line[(i + 1) % n];
      let dx = nx2.x - L.x, dy = nx2.y - L.y;
      const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const col = new THREE.Color(L.v > 30 ? '#5DD17B' : L.v > 20 ? '#FFD23F' : '#FF4D2E');
      lpos.push(L.x - dy * 0.34, 0.07, L.y + dx * 0.34, L.x + dy * 0.34, 0.07, L.y - dx * 0.34);
      lcol.push(col.r, col.g, col.b, col.r, col.g, col.b);
      if (i < n) { const a = i * 2; lidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lpos, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lcol, 3));
    lineGeo.setIndex(lidx);
    this.lineMesh = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72, side: THREE.DoubleSide }));
    this.scene.add(this.lineMesh);

    // --- brake marker boards ---
    this.markerGroup = new THREE.Group();
    const dsAvg = tr.len / n;
    for (const cn of trackCorners(tr)) {
      const side = Math.sign(tr.line[cn.idx].k || 1);
      for (let m = 0; m < 3; m++) {
        const back = (60 - m * 20) / dsAvg;
        const i = ((cn.idx - Math.round(back)) % n + n) % n;
        const sm = S[i];
        const stripes = 3 - m;
        const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.9),
          new THREE.MeshBasicMaterial({
            map: canvasTex(96, 128, (c, w, h) => {
              c.fillStyle = '#FFFDF7'; c.fillRect(0, 0, w, h);
              c.strokeStyle = INK; c.lineWidth = 8; c.strokeRect(0, 0, w, h);
              c.fillStyle = '#FF4D2E';
              for (let sIdx = 0; sIdx < stripes; sIdx++) c.fillRect(14 + sIdx * 26, 16, 16, 96);
            }), side: THREE.DoubleSide,
          }));
        board.position.set(sm.x - sm.nx * side * (sm.w + 2.0), 1.2, sm.y - sm.ny * side * (sm.w + 2.0));
        board.rotation.y = -Math.atan2(sm.ty, sm.tx) + Math.PI / 2;
        this.markerGroup.add(board);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2), postMat);
        post.position.set(board.position.x, 0.6, board.position.z);
        this.markerGroup.add(post);
      }
    }
    this.scene.add(this.markerGroup);

    // --- fences at the wall boundary ---
    const fencePost = new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6);
    const fenceMat = new THREE.MeshToonMaterial({ color: tr.theme === 'street' ? 0xff4d2e : 0xfffdf7 });
    const posts = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < n; i += 3) {
        const sm = S[i];
        const d = side * (sm.w + tr.runoff + 0.4);
        posts.push([sm.x + sm.nx * d, sm.y + sm.ny * d]);
      }
    }
    const fence = new THREE.InstancedMesh(fencePost, fenceMat, posts.length);
    const M = new THREE.Matrix4();
    posts.forEach((p, i) => { M.makeTranslation(p[0], 0.55, p[1]); fence.setMatrixAt(i, M); });
    this.scene.add(fence);
    // rail — one closed loop per side
    const railMat = new THREE.LineBasicMaterial({ color: tr.theme === 'street' ? 0xff4d2e : 0x0f0e17 });
    for (const side of [-1, 1]) {
      const rpos = [];
      for (let i = 0; i <= n; i += 3) {
        const sm = S[i % n];
        const d = side * (sm.w + tr.runoff + 0.4);
        rpos.push(sm.x + sm.nx * d, 0.95, sm.y + sm.ny * d);
      }
      const railGeo = new THREE.BufferGeometry();
      railGeo.setAttribute('position', new THREE.Float32BufferAttribute(rpos, 3));
      this.scene.add(new THREE.LineLoop(railGeo, railMat));
    }

    this.buildDecorMeshes();
    if (tr.theme === 'snow') this.buildSnow();
    if (tr.theme === 'volcano') this.buildSnow(0x9a92a8, 0.26, 0.018);   // drifting ash
  }

  buildDecorMeshes() {
    const tr = this.track;
    const byType = {};
    for (const d of tr.decor) (byType[d.t] = byType[d.t] || []).push(d);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SS = new THREE.Vector3();
    const setM = (mesh, i, x, y, z, ry, sx, sy, sz) => {
      Q.setFromAxisAngle(V.set(0, 1, 0), ry || 0);
      M.compose(new THREE.Vector3(x, y, z), Q, SS.set(sx || 1, sy || 1, sz || 1));
      mesh.setMatrixAt(i, M);
    };

    // trees: trunk + crown (sphere for meadow/street/coast, cone for forest/snow)
    const trees = byType.tree || [];
    if (trees.length) {
      const conif = tr.theme === 'forest' || tr.theme === 'snow';
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.4, 1.6, 7), new THREE.MeshToonMaterial({ color: 0x8a5a3b }), trees.length);
      const crown = new THREE.InstancedMesh(
        conif ? new THREE.ConeGeometry(1, 2.6, 8) : new THREE.SphereGeometry(1, 10, 8),
        new THREE.MeshToonMaterial({ color: 0xffffff }), trees.length);
      crown.castShadow = true;
      trees.forEach((d, i) => {
        const s = d.r;
        setM(trunk, i, d.x, 0.8, d.y, 0, 1, 1, 1);
        setM(crown, i, d.x, conif ? 1.2 + s * 1.05 : 1.4 + s * 0.75, d.y, 0, s, s, s);
        crown.setColorAt(i, new THREE.Color(tr.theme === 'snow' ? '#2F9A4E' : d.c));
      });
      this.scene.add(trunk, crown);
      if (tr.theme === 'snow') {
        const cap = new THREE.InstancedMesh(new THREE.ConeGeometry(0.72, 1.2, 8), new THREE.MeshToonMaterial({ color: 0xffffff }), trees.length);
        trees.forEach((d, i) => setM(cap, i, d.x, 1.2 + d.r * 1.9, d.y, 0.4, d.r, d.r, d.r));
        this.scene.add(cap);
      }
    }
    // palms
    const palms = byType.palm || [];
    if (palms.length) {
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 3.4, 7), new THREE.MeshToonMaterial({ color: 0xc97b4a }), palms.length);
      const frond = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 0.7, 7), new THREE.MeshToonMaterial({ color: 0x36a857 }), palms.length);
      palms.forEach((d, i) => {
        setM(trunk, i, d.x, 1.7, d.y, 0, 1, 1, 1);
        setM(frond, i, d.x, 3.5, d.y, d.x % 3, d.r * 0.55, 1, d.r * 0.55);
      });
      trunk.castShadow = true;
      this.scene.add(trunk, frond);
    }
    // flowers
    const flowers = byType.flower || [];
    if (flowers.length) {
      const bloom = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 8, 6), new THREE.MeshToonMaterial({ color: 0xffffff }), flowers.length);
      flowers.forEach((d, i) => { setM(bloom, i, d.x, 0.28, d.y); bloom.setColorAt(i, new THREE.Color(d.c)); });
      this.scene.add(bloom);
    }
    // rocks / snow drifts / sandstone / cooled lava boulders
    const rocks = byType.rock || [];
    if (rocks.length) {
      const rockColor = { snow: 0xffffff, desert: 0xd9a066, volcano: 0x38314a }[tr.theme] || 0xb7bcc7;
      const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1), new THREE.MeshToonMaterial({ color: rockColor }), rocks.length);
      rocks.forEach((d, i) => setM(rock, i, d.x, d.r * 0.5, d.y, d.x, d.r, d.r * 0.7, d.r));
      rock.castShadow = true;
      this.scene.add(rock);
    }
    // cacti — saguaro silhouettes: tall trunk + two side arms
    const cacti = byType.cactus || [];
    if (cacti.length) {
      const cMat = new THREE.MeshToonMaterial({ color: 0x2f9a4e });
      const trunk = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.42, 2.4, 4, 8), cMat, cacti.length);
      const arm = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.26, 1.0, 4, 8), cMat, cacti.length * 2);
      cacti.forEach((d, i) => {
        const s = d.r / 1.6;
        setM(trunk, i, d.x, 1.7 * s, d.y, 0, s, s, s);
        setM(arm, i * 2, d.x + 0.72 * s, 1.5 * s, d.y, 0, s, s, s);
        setM(arm, i * 2 + 1, d.x - 0.72 * s, 1.1 * s, d.y + 0.1, 0, s, s, s);
      });
      trunk.castShadow = true;
      this.scene.add(trunk, arm);
    }
    // umbrellas
    const umb = byType.umbrella || [];
    if (umb.length) {
      const canopy = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 0.7, 8), new THREE.MeshToonMaterial({ color: 0xffffff }), umb.length);
      const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 5), new THREE.MeshToonMaterial({ color: 0xfffdf7 }), umb.length);
      umb.forEach((d, i) => {
        setM(canopy, i, d.x, 1.9, d.y);
        canopy.setColorAt(i, new THREE.Color(d.c));
        setM(pole, i, d.x, 0.9, d.y);
      });
      this.scene.add(canopy, pole);
    }
    // buildings
    const builds = byType.building || [];
    if (builds.length) {
      const winTex = canvasTex(64, 64, (c, w, h) => {
        c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(255,253,247,0.9)';
        c.fillStyle = '#0F0E17'; c.globalAlpha = 0.12; c.fillRect(0, 0, w, h); c.globalAlpha = 1;
        c.fillStyle = '#FFFDF7';
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c.fillRect(8 + i * 18, 8 + j * 18, 10, 12);
      });
      const bldMat = new THREE.MeshLambertMaterial({ map: winTex });
      if (tr.theme === 'night') {
        // windows glow warm against the dark facades
        bldMat.emissive = new THREE.Color(0xffe9a8);
        bldMat.emissiveIntensity = 0.85;
        bldMat.emissiveMap = canvasTex(64, 64, (c, w, h) => {
          c.fillStyle = '#000000'; c.fillRect(0, 0, w, h);
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
            if (Math.random() < 0.75) { c.fillStyle = '#ffffff'; c.fillRect(8 + i * 18, 8 + j * 18, 10, 12); }
          }
        });
      }
      const bld = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bldMat, builds.length);
      builds.forEach((d, i) => {
        const hgt = 6 + (d.w + d.h) * 0.45;
        setM(bld, i, d.x, hgt / 2, d.y, -d.rot, d.w, hgt, d.h);
        bld.setColorAt(i, new THREE.Color(d.c));
      });
      bld.castShadow = true;
      this.scene.add(bld);
    }
    // grandstand
    for (const d of byType.stand || []) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(d.w, 3.4, d.h), new THREE.MeshToonMaterial({ color: 0xfffdf7 }));
      base.position.y = 1.7;
      base.castShadow = true;
      g.add(base);
      const crowd = new THREE.Mesh(new THREE.PlaneGeometry(d.w - 1, 2.6),
        new THREE.MeshBasicMaterial({
          map: canvasTex(512, 64, (c, w, h) => {
            c.fillStyle = '#2A2738'; c.fillRect(0, 0, w, h);
            for (let i = 0; i < 130; i++) {
              c.fillStyle = KART_COLORS[i % KART_COLORS.length];
              c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 5, 0, 7); c.fill();
            }
          }),
        }));
      crowd.position.set(0, 2.0, d.h / 2 + 0.06);
      g.add(crowd);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(d.w + 1, 0.3, d.h + 1), new THREE.MeshToonMaterial({ color: 0xff4d2e }));
      roof.position.y = 3.55;
      g.add(roof);
      g.position.set(d.x, 0, d.y);
      g.rotation.y = -d.rot;
      this.scene.add(g);
    }
    // billboards
    for (const d of byType.billboard || []) {
      const g = new THREE.Group();
      const face = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.8),
        new THREE.MeshBasicMaterial({ map: textTexture(d.text, d.c, '#0F0E17', 640, 200, '84px "Bowlby One", sans-serif'), side: THREE.DoubleSide }));
      face.position.y = 3;
      g.add(face);
      for (const px of [-3.4, 3.4]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.7, 6), new THREE.MeshToonMaterial({ color: 0x0f0e17 }));
        post.position.set(px, 0.85, 0);
        g.add(post);
      }
      g.position.set(d.x, 0, d.y);
      g.rotation.y = -d.rot;
      this.scene.add(g);
    }
    // water — or lava, on the volcano
    this.waterMeshes = [];
    const lava = this.track.theme === 'volcano';
    for (const d of (byType.water || [])) {
      const discColor = lava ? 0xff5a2e : this.track.theme === 'snow' ? 0xbfe4ff : 0x4abeff;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(d.r, 26),
        lava
          ? new THREE.MeshBasicMaterial({ color: discColor })     // lava glows, ignores lighting
          : new THREE.MeshLambertMaterial({ color: discColor, transparent: true, opacity: 0.92 }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(d.x, 0.005, d.y);
      this.scene.add(disc);
      const ring = new THREE.Mesh(new THREE.RingGeometry(d.r * 0.5, d.r * 0.53, 30),
        new THREE.MeshBasicMaterial({ color: lava ? 0xffd23f : 0xeaf7ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(d.x, 0.02, d.y);
      this.scene.add(ring);
      this.waterMeshes.push(ring);
    }
  }

  buildSnow(color = 0xffffff, size = 0.35, fall = 0.045) {
    const N = 600;
    const posArr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      posArr[i * 3] = (Math.random() - 0.5) * 120;
      posArr[i * 3 + 1] = Math.random() * 40;
      posArr[i * 3 + 2] = (Math.random() - 0.5) * 120;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    this.snowFall = fall;
    this.snowPts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.9 }));
    this.scene.add(this.snowPts);
  }

  /* ---------------- skid marks ---------------- */
  buildSkidBuffer() {
    this.SKID_MAX = 1400;
    const geo = new THREE.BufferGeometry();
    this.skidPos = new Float32Array(this.SKID_MAX * 12);
    geo.setAttribute('position', new THREE.BufferAttribute(this.skidPos, 3));
    const idx = new Uint32Array(this.SKID_MAX * 6);
    for (let q = 0; q < this.SKID_MAX; q++) {
      const a = q * 4;
      idx.set([a, a + 1, a + 2, a, a + 2, a + 3], q * 6);
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.skidMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x191623, transparent: true, opacity: 0.32, depthWrite: false }));
    this.skidMesh.renderOrder = 2;
    this.skidMesh.frustumCulled = false;
    this.scene.add(this.skidMesh);
    this.skidHead = 0;
  }

  skidMark(kart) {
    const prev = this.skidPrev.get(kart.id);
    const cos = Math.cos(kart.heading), sin = Math.sin(kart.heading);
    const pts = [];
    for (const side of [-0.55, 0.55]) {
      pts.push([kart.x - cos * 0.7 - sin * side, kart.y - sin * 0.7 + cos * side]);
    }
    if (prev) {
      for (let i = 0; i < 2; i++) {
        const [ax, ay] = prev[i], [bx, by] = pts[i];
        let dx = bx - ax, dy = by - ay;
        const dl = Math.hypot(dx, dy);
        if (dl < 0.05 || dl > 3) continue;
        dx /= dl; dy /= dl;
        const wHalf = 0.14;
        const o = (this.skidHead % this.SKID_MAX) * 12;
        const y = 0.045;
        this.skidPos.set([
          ax - dy * wHalf, y, ay + dx * wHalf,
          ax + dy * wHalf, y, ay - dx * wHalf,
          bx + dy * wHalf, y, by - dx * wHalf,
          bx - dy * wHalf, y, by + dx * wHalf,
        ], o);
        this.skidHead++;
      }
      this.skidMesh.geometry.attributes.position.needsUpdate = true;
    }
    this.skidPrev.set(kart.id, pts);
  }
  skidBreak(kart) { this.skidPrev.delete(kart.id); }
  clearSkids() { this.skidPos.fill(0); this.skidHead = 0; this.skidMesh.geometry.attributes.position.needsUpdate = true; this.skidPrev.clear(); }

  /* ---------------- particles ---------------- */
  buildParticlePool() {
    this.pool = [];
    this.matCache = new Map();
    const smokeTex = canvasTex(64, 64, (c, w, h) => {
      const g = c.createRadialGradient(32, 32, 4, 32, 32, 30);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
    this.smokeTex = smokeTex;
    for (let i = 0; i < 150; i++) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true }));
      spr.visible = false;
      this.scene.add(spr);
      this.pool.push(spr);
    }
  }

  /* ---------------- kart syncing ---------------- */
  syncKart(k) {
    let m = this.kartMeshes.get(k.id);
    if (!m) {
      m = buildKartMesh(k.color, false);
      this.scene.add(m);
      this.kartMeshes.set(k.id, m);
      if (!k.isPlayer) {
        const tag = nameTagSprite((k.clanTag ? '[' + k.clanTag + '] ' : '') + k.name);
        tag.position.y = 2.2;
        m.add(tag);
        this.tagSprites.set(k.id, tag);
      }
    }
    m.position.set(k.x, 0, k.y);
    m.rotation.y = -k.heading;
    const tag = this.tagSprites.get(k.id);
    if (tag) {
      const dc = Math.hypot(k.x - this.cam.x, k.y - this.cam.y);
      tag.visible = dc < 55;
    }
    const body = m.userData.body;
    // lean into corners + kerb hop
    body.rotation.x = lerp(body.rotation.x, -k.steerVis * Math.min(k.speed / 30, 1) * 0.14, 0.2);
    body.position.y = (k.airKick || 0) * 0.06;
    for (const w of m.userData.wheels.front) w.rotation.y = k.steerVis * 0.5;
    const flame = m.userData.flame;
    flame.visible = k.boostT > 0;
    if (flame.visible) flame.scale.setScalar(0.8 + Math.random() * 0.5);
    const ring = m.userData.ring;
    ring.visible = k.driftCharge > 0.3;
    if (ring.visible) {
      ring.material.color.set(k.driftCharge >= 1 ? 0xff4d2e : 0x4abeff);
      ring.material.opacity = 0.45 + Math.sin(this.time * 18) * 0.25;
    }
    return m;
  }

  /* ---------------- main render ---------------- */
  render(world) {
    this.time = world.raceT;
    const cam = this.cam;

    // karts
    const seen = new Set();
    for (const k of world.karts) { this.syncKart(k); seen.add(k.id); }
    for (const [id, m] of this.kartMeshes) if (!seen.has(id)) { this.scene.remove(m); this.kartMeshes.delete(id); }

    // ghost
    if (world.ghostPose) {
      if (!this.ghostMesh) {
        this.ghostMesh = buildKartMesh('#B7BCC7', true);
        this.scene.add(this.ghostMesh);
      }
      this.ghostMesh.visible = true;
      this.ghostMesh.position.set(world.ghostPose[0], 0, world.ghostPose[1]);
      this.ghostMesh.rotation.y = -world.ghostPose[2];
    } else if (this.ghostMesh) this.ghostMesh.visible = false;

    // assists
    this.lineMesh.visible = !!world.showLine;
    this.markerGroup.visible = !!world.showMarkers;

    // particles
    let pi = 0;
    for (const p of world.particles) {
      if (pi >= this.pool.length) break;
      const spr = this.pool[pi++];
      spr.visible = true;
      const lf = clamp(p.life / p.life0, 0, 1);
      let h, scale, opacity = lf * (p.a || 1);
      if (p.kind === 'smoke') { h = 0.45 + (1 - lf) * 1.3; scale = p.size * (2.6 - lf * 1.4); }
      else if (p.kind === 'spark') { h = 0.4; scale = p.size ? p.size * 2 : 0.35; }
      else { h = 0.4 + lf * 2.6; scale = p.size * 1.6; } // confetti falls
      spr.position.set(p.x, h, p.y);
      spr.scale.set(scale, scale, 1);
      spr.material.opacity = opacity;
      spr.material.color.set(p.c && p.c.startsWith && p.c.startsWith('#') ? p.c : '#FFFFFF');
      if (p.c && p.c.startsWith && p.c.startsWith('rgba')) spr.material.color.set('#F0EEF5');
    }
    for (; pi < this.pool.length; pi++) this.pool[pi].visible = false;

    // water shimmer
    if (this.waterMeshes) for (const w of this.waterMeshes) {
      w.material.opacity = 0.45 + Math.sin(this.time * 1.4 + w.position.x) * 0.25;
    }
    // snow fall
    if (this.snowPts) {
      const a = this.snowPts.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) - (this.snowFall || 0.045);
        if (y < 0) y = 38;
        a.setY(i, y);
      }
      a.needsUpdate = true;
      this.snowPts.position.set(cam.x, 0, cam.y);
    }

    // chase camera
    const dist = clamp(96 / cam.zoom, 5.6, 10.5);
    const h = 2.6 + dist * 0.32;
    const cx = Math.cos(cam.rot), sy = Math.sin(cam.rot);
    const shx = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake * 1.6 : 0;
    const shy = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake * 1.2 : 0;
    this.camera.position.set(cam.x - cx * dist + shx, h + shy, cam.y - sy * dist);
    this.camera.lookAt(cam.x + cx * 7, 0.9, cam.y + sy * 7);
    if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - 0.04);

    // sun + sky follow so shadows stay crisp near the player
    this.sun.position.set(cam.x + 60, 90, cam.y + 30);
    this.sun.target.position.set(cam.x, 0, cam.y);
    this.sky.position.set(cam.x, 0, cam.y);
    if (this.stars) this.stars.position.set(cam.x, 0, cam.y);

    this.three.render(this.scene, this.camera);
  }
}
Renderer._active = null;

/* small top-down full-track painter — track cards, minimap base (2D canvas) */
function paintTrackMap(canvas, track, opts = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const bb = track.bbox;
  const pad = 8;
  const sc = Math.min((W - pad * 2) / (bb.maxx - bb.minx), (H - pad * 2) / (bb.maxy - bb.miny));
  const ox = (W - (bb.maxx - bb.minx) * sc) / 2 - bb.minx * sc;
  const oy = (H - (bb.maxy - bb.miny) * sc) / 2 - bb.miny * sc;
  ctx.clearRect(0, 0, W, H);
  if (opts.bg !== false) {
    ctx.fillStyle = opts.bg || track.colors.ground;
    ctx.fillRect(0, 0, W, H);
  }
  const X = x => x * sc + ox, Y = y => y * sc + oy;
  ctx.beginPath();
  track.samples.forEach((sm, i) => i === 0 ? ctx.moveTo(X(sm.x), Y(sm.y)) : ctx.lineTo(X(sm.x), Y(sm.y)));
  ctx.closePath();
  ctx.strokeStyle = opts.roadOutline || INK;
  ctx.lineWidth = Math.max(4, track.def.width * 2 * sc) + 3;
  ctx.lineJoin = 'round'; ctx.stroke();
  ctx.strokeStyle = opts.road || track.colors.road;
  ctx.lineWidth = Math.max(2.6, track.def.width * 2 * sc);
  ctx.stroke();
  const s0 = track.samples[0];
  ctx.strokeStyle = '#FFFDF7';
  ctx.lineWidth = Math.max(2, 3 * sc);
  ctx.beginPath();
  ctx.moveTo(X(s0.x - s0.nx * s0.w), Y(s0.y - s0.ny * s0.w));
  ctx.lineTo(X(s0.x + s0.nx * s0.w), Y(s0.y + s0.ny * s0.w));
  ctx.stroke();
  return { X, Y, sc };
}
