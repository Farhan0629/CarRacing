/* APEX//RUN Rush stage — the endless city boulevard from the original game, plus weather and time of day.
 * The road scrolls toward a fixed player car; traffic drives toward the camera.
 */
window.APEX = window.APEX || {};
APEX.RushStage = (() => {
  'use strict';
  const T = THREE, { clamp } = APEX.core, V = APEX.vehicles, E = APEX.engine, R = APEX.core.RUSH;
  const CH = R.chunkLength, COUNT = R.chunkCount, WRAP = 47;

  const hash = i => { const e = Math.sin(i * 129.877 + 43.327) * 43758.5453; return e - Math.floor(e); };
  const FACADES = ['#b8b4a9', '#7d8790', '#7d8e96', '#b2a99c', '#587387', '#939ba0'];

  function facadeMaterial(seed, base, maxAniso) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 1024;
    const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 512, 1024);
    const cols = 4, rows = 11;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const x = col * 128 + 18, y = row * 93 + 13, lit = hash(seed * 199 + row * 17 + col * 23) > .87;
      g.fillStyle = '#394b5b'; g.fillRect(x - 4, y - 4, 98, 72);
      const grad = g.createLinearGradient(x, y, x + 88, y + 64);
      grad.addColorStop(0, lit ? '#d4d1a6' : '#638a9a'); grad.addColorStop(.48, lit ? '#b7ad81' : '#355b72'); grad.addColorStop(1, lit ? '#766c5a' : '#173447');
      g.fillStyle = grad; g.fillRect(x, y, 90, 64);
      g.fillStyle = 'rgba(220,234,238,.36)'; g.fillRect(x + 4, y + 3, 2, 56); g.fillRect(x + 43, y, 3, 64);
      g.fillStyle = 'rgba(16,28,40,.5)'; g.fillRect(x, y + 31, 90, 3);
      g.fillStyle = 'rgba(255,255,255,.11)'; g.fillRect(x + 50, y + 5, 23, 3);
    }
    for (let row = 0; row < rows; row++) { g.fillStyle = 'rgba(235,238,234,.35)'; g.fillRect(0, row * 93 + 80, 512, 5); }
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = Math.min(8, maxAniso);
    return new T.MeshStandardMaterial({ map: tex, roughness: .46, metalness: .12, color: 0xffffff, emissive: 0xffe6b8, emissiveMap: tex, emissiveIntensity: 0 });
  }

  /* Atmosphere presets. Rain overrides colour/density/intensity per time of day. */
  const LOOKS = {
    day:    { bg: 0xa9d6ec, fog: 0xbadce8, density: .0044, sky: 0xd4edff, ground: 0x707977, hemi: 1.7,  sun: 0xfff3d8, sunI: 1.35, exposure: .88, lamp: .45, windows: 0,   beams: 0,   tail: 1.25, head: 1.7 },
    sunset: { bg: 0xe8b88f, fog: 0xdfb590, density: .0050, sky: 0xffd8b0, ground: 0x6a5a55, hemi: 1.35, sun: 0xffa968, sunI: 1.2,  exposure: .92, lamp: 1.1, windows: .18, beams: 0,   tail: 1.8,  head: 2.2 },
    night:  { bg: 0x0a1322, fog: 0x0e1a2b, density: .0062, sky: 0x5d7cc0, ground: 0x1a2230, hemi: .62,  sun: 0x86a9e0, sunI: .36,  exposure: 1.12, lamp: 5,  windows: .42, beams: 5,   tail: 3.2,  head: 4.2 }
  };
  const RAIN = {
    day:    { bg: 0x8797a2, fog: 0x93a2ab, density: .0085, hemi: 1.35, sunI: .6,  beams: 0 },
    sunset: { bg: 0x8a7f82, fog: 0x938a8c, density: .0085, hemi: 1.05, sunI: .5,  beams: 2.5 },
    night:  { bg: 0x0c141d, fog: 0x111b26, density: .0085, hemi: .5,   sunI: .25, beams: 5.5 }
  };

  class RushStage {
    constructor(engine) {
      this.engine = engine; this.scene = new T.Scene(); this.camera = new T.PerspectiveCamera(60, 1, .1, 520); this.exposure = .88;
      const s = this.scene; s.background = new T.Color(LOOKS.day.bg); s.fog = new T.FogExp2(LOOKS.day.fog, LOOKS.day.density); s.environment = engine.env;
      this.hemi = new T.HemisphereLight(LOOKS.day.sky, LOOKS.day.ground, LOOKS.day.hemi); s.add(this.hemi);
      const sun = this.sun = new T.DirectionalLight(LOOKS.day.sun, LOOKS.day.sunI); sun.position.set(-35, 65, -45);
      sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -33, right: 33, top: 38, bottom: -38, near: 1, far: 180 }); sun.shadow.bias = -.00018;
      s.add(sun, sun.target);
      this.maxAniso = engine.renderer.capabilities.getMaxAnisotropy();
      this.buildMaterials(); this.chunks = []; for (let i = 0; i < COUNT; i++) this.chunks.push(this.buildChunk(i));
      this.rain = E.makeRain(); s.add(this.rain);
      this.traffic = Array.from({ length: R.count }, (_, i) => { const rig = V.trafficRig(i); s.add(rig.group); return { rig, roll: 0 }; });
      this.rig = null; this.carId = null; this.look = new T.Vector3(0, .95, -19); this.snap = true; this.lastCam = 0; this.photoSnap = true;
      this.camera.position.set(0, 4.3, 12); this.camera.lookAt(0, 1, -18);
      this.weather = 'clear'; this.time = 'day'; this.clock = 0;
    }
    buildMaterials() {
      this.mat = {
        road: new T.MeshStandardMaterial({ color: 0x49515a, roughness: .98 }), walk: new T.MeshStandardMaterial({ color: 0xc7cbd0, roughness: .86 }),
        ground: new T.MeshStandardMaterial({ color: 0x979fa0, roughness: 1 }), lane: new T.MeshStandardMaterial({ color: 0xf2f0dc, roughness: .9 }),
        curb: new T.MeshStandardMaterial({ color: 0xe6e5da, roughness: .83 }), metal: new T.MeshStandardMaterial({ color: 0x464f57, metalness: .52, roughness: .32 }),
        trunk: new T.MeshStandardMaterial({ color: 0x715740, roughness: 1 }), leaves: new T.MeshStandardMaterial({ color: 0x397f54, roughness: .86 }),
        lamp: new T.MeshStandardMaterial({ color: 0xfff2c1, emissive: 0xffe8ab, emissiveIntensity: .45 }),
        shop: new T.MeshStandardMaterial({ color: 0x5c6a71, metalness: .28, roughness: .48 })
      };
      this.facades = FACADES.map((c, i) => facadeMaterial(i + 1, c, this.maxAniso));
      this.roofs = [0x39434c, 0x646b6e, 0x515865, 0x9a9d9b].map(c => new T.MeshStandardMaterial({ color: c, roughness: .83 }));
      this.cube = new T.BoxGeometry(1, 1, 1); this.crown = new T.IcosahedronGeometry(1, 2);
    }
    buildChunk(i) {
      const g = new T.Group(), m = this.mat; g.position.z = -i * CH;
      const add = (mat, x, y, z, sx, sy, sz, cast = false) => {
        const o = new T.Mesh(this.cube, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = cast; o.receiveShadow = true; g.add(o); return o;
      };
      add(m.ground, 0, -.34, 0, 130, .24, CH); add(m.road, 0, -.16, 0, 13, .16, CH + .06);
      for (const n of [-1, 1]) {
        add(m.walk, n * 8.5, -.035, 0, 2.02, .28, CH); add(m.curb, n * 6.53, .082, 0, .09, .09, CH);
        for (let a = 0; a < 2; a++) {
          const r = i * 37 + a * 131 + (n + 2) * 89, h = (a ? 28 : 14) + hash(r) * (a ? 41 : 15), w = a ? 6.8 : 5.2, d = a ? 9 : 8;
          const x = n * (a ? 22 + hash(r + 3) * 3 : 12.5), z = (a ? 8 : -5) + hash(r + 4) * 4;
          add(this.facades[r % this.facades.length], x, h / 2 - .14, z, w, h, d, a === 0);
          add(this.roofs[r % 4], x, h + .12, z, w + .35, .28, d + .35);
          if (a) { add(this.roofs[(r + 1) % 4], x + .8, h + .87, z, .9, 1.35, 1.2); if (i % 4 === 0) add(m.metal, x - .8, h + 2, z, .055, 3, .055); }
          else add(m.shop, x, 1, z, Math.min(w - 1, 4), 1.8, d + .08);
        }
        for (let a = 0; a < 2; a++) {
          const x = n * 8, z = -10 + a * 15;
          add(m.trunk, x, 1.3, z, .23, 2.6, .23);
          const leaf = new T.Mesh(this.crown, m.leaves); leaf.position.set(x, 3.4, z); leaf.scale.set(.95, 1.55, .95); leaf.castShadow = true; g.add(leaf);
        }
        const px = n * 7.06;
        add(m.metal, px, 3, 13, .065, 6, .065); add(m.metal, px - n * .48, 5.98, 13, .95, .055, .055); add(m.lamp, px - n * .93, 5.88, 13, .18, .07, .18);
      }
      for (const x of [-2.17, 2.17]) for (const z of [-10, 2]) add(m.lane, x, -.069, z, .08, .008, 5.4);
      if (i % 3 === 0) for (let n = -5; n <= 5; n++) add(m.lane, n * 1.05, -.063, -15, .62, .012, 1.75);
      this.scene.add(g); return g;
    }
    setQuality(q) { this.sun.castShadow = q === 'high'; this.sun.shadow.needsUpdate = true; }

    /** Build the player's car for this stage (disposes the previous one). */
    setCar(id, color) {
      this.rig?.dispose(); this.rig = V.create(id, color); this.carId = id; this.scene.add(this.rig.group);
      this.rig.group.position.set(0, 0, R.playerZ); this.rig.group.rotation.y = Math.PI;
      V.addHeadlights(this.rig); this.applyLook();
    }
    paint(hex) { this.rig?.setPaint(hex); }

    setConditions(weather, time) { this.weather = weather; this.time = time; this.applyLook(); }
    applyLook() {
      const L = { ...(LOOKS[this.time] || LOOKS.day) }, rain = this.weather === 'rain'; if (rain) Object.assign(L, RAIN[this.time] || RAIN.day);
      const s = this.scene; s.background.set(L.bg); s.fog.color.set(L.fog); s.fog.density = L.density;
      this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemi;
      this.sun.color.set(L.sun); this.sun.intensity = L.sunI; this.exposure = L.exposure;
      this.mat.lamp.emissiveIntensity = L.lamp; for (const f of this.facades) f.emissiveIntensity = L.windows;
      this.mat.road.roughness = rain ? .34 : .98; this.mat.road.metalness = rain ? .22 : 0; this.mat.walk.roughness = rain ? .55 : .86;
      const tr = V.traffic; tr.tail.emissiveIntensity = L.tail; tr.head.emissiveIntensity = L.head;
      this.rain.visible = rain; s.environment = this.time === 'night' ? this.engine.envNight : this.engine.env;
      if (this.rig?.beams) for (const b of this.rig.beams) { b.visible = L.beams > 0; b.intensity = L.beams; }
    }

    enter() { this.snap = true; this.clock = 0; this.applyLook(); this.setQuality(this.engine.quality); }

    /** Place the world, player and traffic from a visual state (live or replay). */
    apply(st, dt) {
      const span = COUNT * CH;
      for (let i = 0; i < this.chunks.length; i++) {
        const raw = -i * CH + st.scroll; this.chunks[i].position.z = WRAP - (((WRAP - raw) % span) + span) % span;
      }
      const rig = this.rig; if (!rig) return;
      rig.group.position.x = st.x; rig.group.rotation.y = Math.PI - st.steer * .07;
      rig.spinAngle(st.speed * dt * .105); rig.steer(st.steer); rig.brake(!!st.braking);
      this.traffic.forEach((t, i) => {
        const c = st.traffic[i]; if (!c) return;
        t.rig.group.position.set(c[0], 0, c[1]); t.rig.group.scale.setScalar(1);
        const d = c[2] - t.roll; if (d > 0 && d < 5) t.rig.spinAngle(d); t.roll = c[2];
      });
    }

    render(dt, frame, engine) {
      const st = frame?.state; if (!st) { engine.renderer.render(this.scene, this.camera); return; }
      this.clock += dt; this.apply(st, dt);
      const cam = this.camera, x = st.x;
      this.sun.position.x = -35 + x * .3; this.sun.target.position.set(x, 0, -17); this.sun.target.updateMatrixWorld();
      if (this.rain.visible) { this.rain.position.set(x, 0, 4); this.rain.userData.fall(dt); }
      if (engine.photo.on) {
        E.photoCamera(engine, cam, new T.Vector3(x, 0, R.playerZ));
      } else {
        this.photoSnap = true;
        const mode = engine.camMode, bob = engine.motion && frame.racing ? Math.sin(this.clock * 8) * .018 : 0;
        let pos, target, fov;
        if (mode === 1) { pos = new T.Vector3(x * .98, 1.12, R.playerZ - .35); target = new T.Vector3(x * .9, 1.0, -32); fov = 66 + Math.min(st.speed / 215, 1) * 8; }
        else if (mode === 2) { pos = new T.Vector3(x * .3, 7.8, 15); target = new T.Vector3(x * .2, .6, -14); fov = 58 + Math.min(st.speed / 215, 1) * 7; }
        else { pos = new T.Vector3(x * .42, 4 + bob, 11.2); target = new T.Vector3(x * .28, 1.05, -17); fov = 57 + Math.min(st.speed / 215, 1) * 9; }
        const k = this.snap ? 1 : Math.min(1, dt * 6);
        cam.position.lerp(pos, mode === 1 ? 1 : k); this.look.lerp(target, mode === 1 ? 1 : k);
        if (Math.abs(cam.fov - fov) > .05) { cam.fov += (fov - cam.fov) * (this.snap ? 1 : Math.min(1, dt * 4)); cam.updateProjectionMatrix(); }
        cam.lookAt(this.look); this.snap = false;
      }
      if (this.rig) this.rig.group.visible = engine.photo.on || engine.camMode !== 1;   // hood camera sits inside the body
      engine.renderer.render(this.scene, cam);
    }
    resetCamera() { this.snap = true; }
  }
  return RushStage;
})();
