/* APEX//RUN circuit stage — the Riviera coastal circuit from Velocity Atelier (V2):
 * sculpted terrain, ocean, sky, road, barriers, imported Poly Haven village and pines, rain, headlights.
 */
window.APEX = window.APEX || {};
APEX.CircuitStage = (() => {
  'use strict';
  const T = THREE, { clamp, lerp, wrap } = APEX.core, V = APEX.vehicles, E = APEX.engine, Art = APEX.visuals, { material, box } = E;

  function strip(track, a, b, y, mat) {
    const vertices = [], uv = [], idx = [];
    for (let i = 0; i <= track.count; i++) {
      const p = track.points[i], h = p.heading;
      for (const side of [a, b]) { vertices.push(p.x + Math.cos(h) * side, p.y + y, p.z - Math.sin(h) * side); uv.push(side / 18, p.s / 12); }
      if (i < track.count) { const j = i * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new T.Mesh(geo, mat); m.receiveShadow = true; return m;
  }
  function instanceBoxes(items, mat, scene) {
    const m = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), mat, items.length), d = new T.Object3D();
    items.forEach((p, i) => { d.position.set(p.x, p.y, p.z); d.rotation.set(0, p.h || 0, 0); d.scale.set(p.w, p.height, p.d); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
    m.castShadow = true; m.receiveShadow = true; scene.add(m); return m;
  }
  function label(text, w, h, fg, bg) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); ctx.fillStyle = fg; ctx.font = '500 ' + Math.floor(h * .49) + 'px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2);
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; return tex;
  }

  class CircuitStage {
    constructor(engine) {
      this.engine = engine; this.scene = new T.Scene(); this.camera = new T.PerspectiveCamera(58, 1, .1, 2200); this.track = new APEX.core.Track();
      this.exposure = 1.05; this.snap = true; this.photoSnap = true; this.clock = 0; this.rig = null; this.ghostRig = null; this.scenery = null;
      this.weather = 'clear'; this.time = 'sunset'; this.build();
    }
    build() {
      const s = this.scene, track = this.track; s.environment = this.engine.env;
      this.hemi = new T.HemisphereLight('#accee5', '#8b7553', 2); s.add(this.hemi);
      this.sun = new T.DirectionalLight('#ffe1b0', 3.5); this.sun.position.set(200, 250, 120); this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
      const sh = this.sun.shadow; Object.assign(sh.camera, { left: -65, right: 65, top: 65, bottom: -65, far: 600 }); sh.bias = -.0007; sh.normalBias = .03;
      s.add(this.sun, this.sun.target);
      this.atmosphere = new Art.Atmosphere(s, 1800);
      this.water = Art.ocean(s, this.atmosphere);
      const aniso = this.engine.renderer.capabilities.getMaxAnisotropy();
      const landGeo = new T.CircleGeometry(1, 100); landGeo.rotateX(-Math.PI / 2);
      const land = new T.Mesh(landGeo, Art.surfaceMaterial('grass', aniso, 65)); land.scale.set(448, 1, 590); land.position.y = -1.2; land.receiveShadow = true; s.add(land);
      this.roadMat = Art.surfaceMaterial('asphalt', aniso);
      s.add(strip(track, -9, 9, 0, this.roadMat));
      s.add(strip(track, -11.5, -9, -.04, Art.surfaceMaterial('stone', aniso)), strip(track, 9, 11.5, -.04, Art.surfaceMaterial('stone', aniso)));
      for (const side of [-1, 1]) {   // road foundations blend elevated asphalt into the island
        const vertices = [], indices = [], uv = [], lanes = side < 0 ? [-31, -11.5] : [11.5, 31];
        for (let i = 0; i <= track.count; i++) {
          const p = track.points[i];
          for (const lane of lanes) { const y = Math.abs(lane) > 12 ? -2.2 : p.y - .06; vertices.push(p.x + Math.cos(p.heading) * lane, y, p.z - Math.sin(p.heading) * lane); uv.push(lane / 8, p.s / 8); }
          if (i < track.count) { const j = i * 2; indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
        }
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setIndex(indices); geo.computeVertexNormals();
        const bankMat = Art.surfaceMaterial(side > 0 ? 'stone' : 'grass', aniso);
        const bank = new T.Mesh(geo, bankMat); bank.receiveShadow = true; s.add(bank);
      }
      const paint = material('#e4e0c9', .01, .75);
      s.add(strip(track, -8.5, -8.37, .022, paint), strip(track, 8.37, 8.5, .022, paint));
      const markings = [], rails = [], posts = [], red = [], white = [];
      for (let d = 0; d < track.length; d += 12) { const p = track.at(d); markings.push({ x: p.x, y: p.y + .024, z: p.z, h: p.heading, w: .16, height: .01, d: 4 }); }
      for (let d = 0; d < track.length; d += 7) for (const lane of [-11.4, 11.4]) {
        const p = track.at(d, lane);
        rails.push({ x: p.x, y: p.y + .78, z: p.z, h: p.heading, w: .16, height: .30, d: 7.1 }); posts.push({ x: p.x, y: p.y + .47, z: p.z, h: p.heading, w: .12, height: .85, d: .13 });
      }
      for (let d = 0; d < track.length; d += 4) for (const lane of [-8.9, 8.9]) { const p = track.at(d, lane); (Math.floor(d / 4) % 2 ? red : white).push({ x: p.x, y: p.y + .03, z: p.z, h: p.heading, w: .66, height: .045, d: 4.1 }); }
      instanceBoxes(markings, paint, s); instanceBoxes(rails, material('#aeb5b0', .65, .48), s); instanceBoxes(posts, material('#525d5e', .6, .65), s);
      instanceBoxes(red, material('#a34833'), s); instanceBoxes(white, material('#d6d0be'), s);
      this.makeScenery();
      const start = track.at(0), arch = new T.Group(); arch.position.set(start.x, start.y, start.z); arch.rotation.y = start.heading;
      const steel = material('#172b30', .45, .42);
      arch.add(box(.35, 6, .5, steel, -10, 3, 0), box(.35, 6, .5, steel, 10, 3, 0), box(20.5, .9, .6, steel, 0, 6, 0));
      const signMat = new T.MeshBasicMaterial({ map: label('APEX  //  RIVIERA', 1024, 96, '#e6e6da', '#172b30') });
      for (const side of [-1, 1]) {
        const sign = new T.Mesh(new T.PlaneGeometry(16, .75), signMat);
        sign.position.set(0, 6, side * .32); sign.rotation.y = side < 0 ? Math.PI : 0; arch.add(sign);
      }
      s.add(arch);
      for (let x = -9; x < 9; x += 1) for (let z = -1; z < 1; z += .5) arch.add(box(1, .025, .5, (Math.floor(x) + Math.floor(z * 2)) % 2 ? paint : steel, x + .5, .035, z + .25));
      this.checkpoint = new T.Group(); const glow = new T.MeshBasicMaterial({ color: '#bdf1c4', transparent: true, opacity: .65 });
      this.checkpoint.add(box(.09, 4, .1, glow, -9, 2, 0), box(.09, 4, .1, glow, 9, 2, 0)); s.add(this.checkpoint);
      this.aiRigs = Array.from({ length: 7 }, (_, i) => { const rig = V.create(APEX.core.PROC[i % APEX.core.PROC.length].id, APEX.core.colors[(i + 1) % APEX.core.colors.length]); rig.group.visible = false; s.add(rig.group); return rig; });
      this.rain = E.makeRain(); s.add(this.rain);
    }
    makeScenery() {
      const s = this.scene, track = this.track;
      let seed = 73; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const terrainGeo = new T.PlaneGeometry(570, 800, 95, 130); terrainGeo.rotateX(-Math.PI / 2);
      const pos = terrainGeo.attributes.position, cols = [];
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i), r = Math.sqrt((x / 245) ** 2 + (z / 345) ** 2), falloff = Math.max(0, 1 - r * r);
        const ridges = 62 + 25 * Math.sin(x * .026 + Math.sin(z * .018)) + 16 * Math.cos(z * .035 - x * .008), detail = 4 * Math.sin(x * .13 + z * .03) * Math.cos(z * .09);
        const h = -1.15 + falloff * falloff * (ridges + detail); pos.setY(i, h);
        const mix = clamp((h - 12) / 65, 0, 1), col = new T.Color('#667456').lerp(new T.Color('#a39b87'), mix); col.multiplyScalar(.91 + .09 * Math.sin(x * .14) * Math.cos(z * .11)); cols.push(col.r, col.g, col.b);
      }
      terrainGeo.setAttribute('color', new T.Float32BufferAttribute(cols, 3)); terrainGeo.computeVertexNormals();
      const terrain = new T.Mesh(terrainGeo, Object.assign(Art.surfaceMaterial('stone', this.engine.renderer.capabilities.getMaxAnisotropy(), 38), { vertexColors: true })); terrain.receiveShadow = true; s.add(terrain);
      this.lampMat = new T.MeshStandardMaterial({ color: '#fbe4b4', emissive: '#ffe2a6', emissiveIntensity: .5 });
      for (let d = 35; d < track.length; d += 75) {
        const p = track.at(d, -12.5), pole = new T.Group(); pole.position.set(p.x, p.y, p.z); pole.rotation.y = p.heading;
        const metal = material('#364950', .6, .55);
        pole.add(box(.1, 7, .1, metal, 0, 3.5, 0), box(2.1, .12, .12, metal, 1, 7, 0), box(.75, .075, .3, this.lampMat, 1.7, 6.9, 0)); s.add(pole);
      }
      // Irregular shoreline rocks and lower roadside vegetation add depth
      // without putting decorative objects inside the drivable barriers.
      const rockGeo = new T.DodecahedronGeometry(1, 1), rockPositions = rockGeo.attributes.position;
      for (let i = 0; i < rockPositions.count; i++) {
        const x = rockPositions.getX(i), y = rockPositions.getY(i), z = rockPositions.getZ(i);
        const rough = .86 + .16 * Math.sin(x * 19 + y * 7 + z * 13);
        rockPositions.setXYZ(i, x * rough, y * rough, z * rough);
      }
      rockGeo.computeVertexNormals();
      const rocks = new T.InstancedMesh(rockGeo, Art.surfaceMaterial('stone', 4), 100), d = new T.Object3D();
      for (let i = 0; i < 100; i++) {
        const p = track.at(i / 100 * track.length, 33 + rand() * 10);
        d.position.set(p.x, -2.7, p.z); d.rotation.set(rand() * .4, rand() * Math.PI * 2, rand() * .35);
        d.scale.set(2 + rand() * 3.5, 1.1 + rand() * 2.2, 2 + rand() * 4); d.updateMatrix(); rocks.setMatrixAt(i, d.matrix);
        rocks.setColorAt(i, new T.Color('#b4a68f').multiplyScalar(.8 + rand() * .3));
      }
      rocks.castShadow = true; rocks.receiveShadow = true; s.add(rocks);
      this.roadsideTrees = [];
      for (let i = 0; i < 100; i++) {
        const lane = -18 - rand() * 7, p = track.at(i / 100 * track.length + 11, lane);
        const tree = Art.tree(i % 3 + 1, i % 3 === 0), scale = i % 3 === 0 ? 1.2 : .35 + rand() * .28;
        p.y = lerp(p.y - .06, -2.2, (Math.abs(lane) - 11.5) / 19.5);
        tree.position.set(p.x, p.y, p.z); tree.rotation.y = rand() * Math.PI; tree.scale.setScalar(scale); s.add(tree);
        this.roadsideTrees.push(tree);
      }
      // A distant headland gives the ocean horizon an actual landscape silhouette.
      const ridge = new T.PlaneGeometry(1700, 900, 70, 35); ridge.rotateX(-Math.PI / 2);
      const rp = ridge.attributes.position;
      for (let i = 0; i < rp.count; i++) {
        const x = rp.getX(i), z = rp.getZ(i), edge = Math.max(0, 1 - (x / 850) ** 2) * Math.max(0, 1 - (z / 450) ** 2);
        rp.setY(i, -4 + edge * (160 + 65 * Math.sin(x * .008) + 28 * Math.cos(x * .022 + z * .014)));
      }
      ridge.computeVertexNormals();
      const headland = new T.Mesh(ridge, Art.surfaceMaterial('stone', 4, 50)); headland.position.set(-950, 0, 1250); s.add(headland);

    }
    async loadScenery(pack) { this.scenery = new APEX.Scenery.Environment(this, pack); await this.scenery.prepare(); this.scenery.quality = this.engine.quality; }
    setQuality(q) { this.sun.castShadow = q !== 'low'; if (this.scenery) this.scenery.quality = q; }

    setCar(id, color) {
      this.rig?.dispose(); this.ghostRig?.dispose();
      this.rig = V.create(id, color); this.scene.add(this.rig.group); V.addHeadlights(this.rig);
      this.ghostRig = V.create(id, '#b7e3dd', { ghost: true }); this.ghostRig.group.visible = false; this.scene.add(this.ghostRig.group);
      this.applyLook();
    }
    paint(hex) { this.rig?.setPaint(hex); }
    setConditions(weather, time) { this.weather = weather; this.time = time; this.applyLook(); }
    applyLook() {
      const night = this.time === 'night', rain = this.weather === 'rain', time = this.time;
      /* Atmospheric shader supplies soft clouds, sun/moon and horizon haze. */
      this.atmosphere.setConditions(this.weather, this.time);
      this.scene.fog = new T.FogExp2(night ? rain ? '#1c3041' : '#152632' : rain ? '#768990' : '#a9b4b1', rain ? .0025 : night ? .0016 : .0008);
      this.sun.intensity = night ? .4 : rain ? 1.25 : time === 'sunset' ? 2.2 : 3.5;
      this.sun.color.set(night ? '#87bce0' : rain ? '#cedbe3' : time === 'sunset' ? '#ffcd95' : '#ffdfb0');
      this.hemi.intensity = night ? .6 : rain ? 1.2 : 2;
      this.roadMat.roughness = rain ? .23 : .92; this.roadMat.metalness = rain ? .08 : 0;
      this.water.uniforms.deep.value.set(night ? '#061523' : rain ? '#344e55' : '#124e5e');
      this.water.uniforms.light.value.set(night ? '#263e59' : rain ? '#a3b4b9' : time === 'sunset' ? '#e4bca4' : '#b4d6e0');
      this.lampMat.emissiveIntensity = night ? 4 : .7;
      this.rain.visible = rain; this.scene.environment = night ? this.engine.envNight : this.engine.env;
      const beams = night ? 200 : rain ? 80 : 0;
      for (const rigs of [this.rig, this.ghostRig]) if (rigs?.beams) for (const b of rigs.beams) { b.visible = beams > 0; b.intensity = beams; }
    }
    enter() { this.snap = true; this.setQuality(this.engine.quality); }

    placeCar(rig, p, v, dt, steer = 0) {
      const g = rig.group; g.position.set(p.x, p.y + .015, p.z); g.rotation.y = p.heading; g.rotation.z = -steer * Math.min(.035, v * .001);
      rig.spin(v * dt); rig.steer(steer); rig.brake(!!p.braking);
    }
    render(dt, frame, engine) {
      const r = frame?.race; if (!r) { engine.renderer.render(this.scene, this.camera); return; }
      this.clock += dt; const rf = frame.replay, p = r.player; let shown = p;
      if (rf) shown = { x: rf.p[0], z: rf.p[1], heading: rf.p[2], y: rf.p[3], v: rf.v, steer: rf.steer || 0 };
      this.placeCar(this.rig, shown, shown.v, dt, shown.steer || 0);
      this.scenery?.update(shown.x, shown.z);
      this.aiRigs.forEach((m, i) => {
        const a = r.ai[i]; m.group.visible = !!a; if (!a) return;
        const state = rf?.ai?.[i] || [a.s, a.lane], q = this.track.at(state[0], state[1]);
        m.group.visible = Math.hypot(q.x - shown.x, q.z - shown.z) < 260; if (m.group.visible) this.placeCar(m, q, a.v, dt);
      });
      if (r.ghost && !rf) {
        let lo = 0, hi = r.ghost.length - 1;
        while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (r.ghost[m][0] <= r.elapsed) lo = m; else hi = m; }
        const a = r.ghost[lo], b = r.ghost[hi], t = a && b ? clamp((r.elapsed - a[0]) / Math.max(.001, b[0] - a[0]), 0, 1) : 0;
        this.ghostRig.group.visible = !!a && r.elapsed < r.ghost[r.ghost.length - 1][0];
        if (a && b) this.placeCar(this.ghostRig, { x: lerp(a[1], b[1], t), z: lerp(a[2], b[2], t), heading: a[3] + wrap(b[3] - a[3]) * t, y: lerp(a[4], b[4], t) }, p.v, dt);
      } else this.ghostRig.group.visible = false;
      const cp = this.track.at(r.nextGate * this.track.length / 8); this.checkpoint.position.set(cp.x, cp.y, cp.z); this.checkpoint.rotation.y = cp.heading; this.checkpoint.visible = r.options.mode !== 'free';
      const forward = new T.Vector3(Math.sin(shown.heading), 0, Math.cos(shown.heading)), pos = new T.Vector3(shown.x, shown.y, shown.z), cam = this.camera, mode = engine.camMode;
      this.rig.group.visible = engine.photo.on || mode !== 1;
      if (engine.photo.on) { E.photoCamera(engine, cam, pos); }
      else {
        this.photoSnap = true; let desired, target;
        if (mode === 1) { desired = pos.clone().addScaledVector(forward, 1.6).add(new T.Vector3(0, 1.08, 0)); target = pos.clone().addScaledVector(forward, 40).add(new T.Vector3(0, 1.1, 0)); }
        else { desired = pos.clone().addScaledVector(forward, -(mode === 2 ? 12 : 7.9) - shown.v * .012).add(new T.Vector3(0, mode === 2 ? 5.4 : 3.15, 0)); target = pos.clone().addScaledVector(forward, 9 + shown.v * .07).add(new T.Vector3(0, 1.15, 0)); }
        if (this.snap || mode === 1) { cam.position.copy(desired); this.snap = false; } else cam.position.lerp(desired, 1 - Math.exp(-dt * 8));
        cam.lookAt(target); cam.fov = 58 + Math.min(12, shown.v * .10) + (p.boosting ? 3 : 0); cam.updateProjectionMatrix();
      }
      this.sun.position.set(shown.x + 100, shown.y + (this.time === 'sunset' ? 65 : 180), shown.z + 80); this.sun.target.position.set(shown.x, shown.y, shown.z); this.sun.target.updateMatrixWorld();
      this.water.uniforms.clock.value = this.clock;
      this.atmosphere.update(cam, dt);
      for (const tree of this.roadsideTrees) tree.visible = Math.hypot(tree.position.x - shown.x, tree.position.z - shown.z) < 240;
      if (this.rain.visible) { this.rain.position.set(shown.x, shown.y, shown.z); this.rain.userData.fall(dt); }
      engine.renderer.render(this.scene, cam);
    }
  }
  return CircuitStage;
})();
