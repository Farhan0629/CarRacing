/* APEX//RUN engine — one WebGL renderer shared by three stages:
 *   garage   (showroom, used by the main menu and the garage)
 *   rush     (endless city boulevard)
 *   circuit  (Riviera coastal circuit)
 */
window.APEX = window.APEX || {};
APEX.engine = (() => {
  'use strict';
  const T = THREE, { clamp } = APEX.core, V = APEX.vehicles;
  const material = (color, metalness = 0, roughness = .7) => new T.MeshStandardMaterial({ color, metalness, roughness });
  function box(w, h, d, mat, x = 0, y = 0, z = 0) { const o = new T.Mesh(new T.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; }

  class Engine {
    constructor(canvas) {
      this.canvas = canvas;
      this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      const r = this.renderer;
      r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap; r.toneMapping = T.ACESFilmicToneMapping; r.outputColorSpace = T.SRGBColorSpace;
      this.quality = 'balanced'; this.exposureScale = 1; this.camMode = 0; this.motion = true;
      this.photo = { on: false, orbit: .7, zoom: 8, height: 3 };
      this.stages = {}; this.stage = null; this.name = ''; this.time = 0; this.lastFrame = null;
      this.makeEnvironment(); this.applyPixelRatio();
    }
    makeEnvironment() {
      // Two studio-style reflection environments: bright for day, dim for night (so night scenes are not lit like daytime).
      const build = (bg, panel) => {
        const env = new T.Scene(); env.background = new T.Color(bg); const white = new T.MeshBasicMaterial({ color: panel });
        for (let i = 0; i < 6; i++) { const p = box(6, 9, .05, white, Math.sin(i) * 8, 5, Math.cos(i) * 8); p.lookAt(0, 1, 0); env.add(p); }
        const pm = new T.PMREMGenerator(this.renderer), target = pm.fromScene(env, .035);
        env.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); white.dispose(); pm.dispose(); return target;
      };
      this.envTarget = build('#6c7d88', '#ffffff'); this.env = this.envTarget.texture;
      this.envNightTarget = build('#070b12', '#34486b'); this.envNight = this.envNightTarget.texture;
    }
    register(name, stage) { this.stages[name] = stage; stage.name = name; return stage; }
    use(name, ...args) {
      this.stage = this.stages[name]; this.name = name; this.camMode = 0; this.photo.on = false; this.exposureScale = 1;
      this.stage.enter?.(...args); this.lastWidth = 0; this.resize();
    }
    applyPixelRatio() { const q = this.quality; this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'low' ? 1 : q === 'high' ? 2 : 1.5)); }
    setQuality(q) {
      this.quality = q; this.applyPixelRatio(); this.lastWidth = 0;
      for (const s of Object.values(this.stages)) s.setQuality?.(q);
      this.resize();
    }
    resize() {
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight; if (!w || !h) return;
      if (this.lastWidth === w && this.lastHeight === h) return;
      this.lastWidth = w; this.lastHeight = h; this.renderer.setSize(w, h, false);
      for (const s of Object.values(this.stages)) { s.camera.aspect = w / h; s.camera.updateProjectionMatrix(); }
    }
    render(dt, frame) {
      if (!this.stage) return;
      this.time += dt; this.resize(); this.lastFrame = frame;
      this.renderer.toneMappingExposure = (this.stage.exposure || 1) * this.exposureScale;
      this.stage.render(dt, frame, this);
    }
    capture() {
      this.render(0, this.lastFrame);
      return new Promise(resolve => this.canvas.toBlob(resolve, 'image/png'));
    }
  }

  /* --------------------------------------------------------------- showroom */
  class GarageStage {
    constructor(engine) {
      this.engine = engine; this.scene = new T.Scene(); this.camera = new T.PerspectiveCamera(40, 1, .1, 200); this.exposure = 1.05;
      this.orbit = .62; this.zoom = 8.6; this.height = 2.9; this.rig = null; this.offset = 0;   // offset: fraction of width the car is shifted left (clears the garage panel)
      const s = this.scene; s.background = new T.Color('#11171c'); s.environment = engine.env; s.fog = new T.Fog('#11171c', 24, 55);
      s.add(new T.HemisphereLight('#e5f1f5', '#363328', 2.6));
      const key = this.key = new T.DirectionalLight('#f8efdb', 4.2); key.position.set(3, 8, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
      Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); key.shadow.bias = -.001; s.add(key);
      const rim = new T.PointLight('#8fb9d0', 45, 20); rim.position.set(-4, 3, -4); s.add(rim);
      s.add(box(80, .1, 80, material('#252b2d', .45, .25), 0, -.14, 0));
      const platform = new T.Mesh(new T.CylinderGeometry(4.1, 4.2, .12, 96), material('#292e2f', .7, .32)); platform.position.y = -.07; platform.receiveShadow = true; s.add(platform);
      const ring = new T.Mesh(new T.TorusGeometry(4.18, .011, 8, 120), new T.MeshBasicMaterial({ color: '#acb8b8' })); ring.rotation.x = Math.PI / 2; ring.position.y = .01; s.add(ring);
      const dark = material('#10191d', .4, .6);
      for (let x = -20; x <= 20; x += 5) s.add(box(.07, 8, .2, dark, x, 4, -9));
      const glow = new T.MeshBasicMaterial({ color: '#d8e5e6' });
      for (let i = -2; i <= 2; i++) s.add(box(.08, .05, 15, glow, i * 4, 6, 0));
      s.add(box(40, 1, .4, dark, 0, .5, -9), box(40, 5, .3, material('#202b32', .35, .4), 0, 3.7, -10));
      this.car = new T.Group(); s.add(this.car);
    }
    setQuality(q) { this.key.castShadow = q !== 'low'; }
    show(id, color) {
      this.rig?.dispose(); this.rig = V.create(id, color); this.car.add(this.rig.group);
    }
    paint(hex) { this.rig?.setPaint(hex); }
    render(dt) {
      this.car.rotation.y += dt * .075;
      const c = this.camera; c.fov = 40; c.updateProjectionMatrix();
      c.position.set(Math.sin(this.orbit) * this.zoom, this.height, Math.cos(this.orbit) * this.zoom); c.lookAt(0, .75, 0);
      const w = this.engine.lastWidth, h = this.engine.lastHeight;
      if (this.offset && w) c.setViewOffset(w, h, w * this.offset, 0, w, h); else c.clearViewOffset();
      this.engine.renderer.render(this.scene, c);
    }
  }

  /* Shared overhead camera used by photo mode in every stage. */
  function photoCamera(engine, camera, focus) {
    const p = engine.photo;
    const desired = new T.Vector3(focus.x + Math.sin(p.orbit) * p.zoom, focus.y + p.height, focus.z + Math.cos(p.orbit) * p.zoom);
    camera.position.copy(desired);
    camera.lookAt(focus.x, focus.y + .7, focus.z); camera.fov = 43; camera.updateProjectionMatrix();
  }

  /* Rain streaks that follow the camera/car; shared by Rush and Circuit. */
  function makeRain() {
    const geo = new T.BufferGeometry(), positions = new Float32Array(1800 * 6);
    for (let i = 0; i < positions.length; i += 6) { const x = Math.random() * 80 - 40, y = Math.random() * 40, z = Math.random() * 80 - 40; positions.set([x, y, z, x - .14, y - 1.2, z], i); }
    geo.setAttribute('position', new T.BufferAttribute(positions, 3));
    const lines = new T.LineSegments(geo, new T.LineBasicMaterial({ color: '#bdced6', transparent: true, opacity: .38 }));
    lines.visible = false; lines.frustumCulled = false; lines.userData.data = positions;
    lines.userData.fall = dt => {
      const d = lines.userData.data;
      for (let i = 0; i < d.length; i += 6) { d[i + 1] -= dt * 28; d[i + 4] -= dt * 28; if (d[i + 1] < 0) { d[i + 1] += 40; d[i + 4] += 40; } }
      geo.attributes.position.needsUpdate = true;
    };
    return lines;
  }

  return { Engine, GarageStage, photoCamera, makeRain, material, box };
})();
