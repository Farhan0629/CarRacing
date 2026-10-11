/* APEX//RUN vehicles — one "rig" interface for every car in the game.
 *
 *   concept  detailed textured GLB (CC BY 4.0, Eric Chadwick / Darmstadt Graphics Group)
 *   aerion / velar / nexo   procedural cars from Velocity Atelier (V2)
 *   traffic  procedural coupes used by the endless Rush mode
 *
 * Every rig exposes: group, setPaint(hex), spin(distanceMetres), steer(-1..1), brake(bool), dispose()
 * Nose points to +Z for every car. Wheels use physically-correct spin direction.
 */
window.APEX = window.APEX || {};
APEX.vehicles = (() => {
  'use strict';
  const T = THREE;
  const material = (color, metalness = 0, roughness = .7) => new T.MeshStandardMaterial({ color, metalness, roughness });
  function box(w, h, d, mat, x = 0, y = 0, z = 0) { const o = new T.Mesh(new T.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; }

  /** Rounded box (replacement for three/examples RoundedBoxGeometry, which the classic build does not ship). */
  function roundedBox(width, height, depth, segments = 2, radius = .1) {
    segments = segments * 2 + 1; radius = Math.min(width / 2, height / 2, depth / 2, radius);
    const g = new T.BoxGeometry(1, 1, 1, segments, segments, segments).toNonIndexed();
    const pos = g.attributes.position, nor = g.attributes.normal;
    const half = new T.Vector3(width, height, depth).multiplyScalar(.5).subScalar(radius), p = new T.Vector3(), n = new T.Vector3(), step = .5 / segments;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i); n.copy(p);
      n.x -= Math.sign(n.x) * step; n.y -= Math.sign(n.y) * step; n.z -= Math.sign(n.z) * step; n.normalize();
      pos.setXYZ(i, half.x * Math.sign(p.x) + n.x * radius, half.y * Math.sign(p.y) + n.y * radius, half.z * Math.sign(p.z) + n.z * radius);
      nor.setXYZ(i, n.x, n.y, n.z);
    }
    return g;
  }

  /* Soft blob shadow shared by every car (drawn flat under the body). */
  function blobShadow(w = 3.6, d = 6.1, strength = .52) {
    const m = new T.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { k: { value: strength } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec2 vUv;uniform float k;void main(){vec2 p=(vUv-.5)*2.;float a=(1.-smoothstep(.25,1.,length(p)))*k;gl_FragColor=vec4(0.,0.,0.,a);}'
    });
    const s = new T.Mesh(new T.PlaneGeometry(w, d), m); s.rotation.x = -Math.PI / 2; s.position.y = .03; s.renderOrder = 1; return s;
  }

  class Rig {
    constructor(group, parts) {
      this.group = group; this.wheels = parts.wheels || []; this.paintMats = parts.paint || []; this.tailMats = parts.tail || []; this.headMats = parts.head || [];
      this.radius = parts.radius || .4; this.owned = parts.owned || []; this.sharedGeometry = !!parts.sharedGeometry; this.steerAngle = parts.steerAngle || .3;
      this.tailBase = parts.tailBase || 2; this.tailBrake = parts.tailBrake || 6; this.tailOn = false; this.length = parts.length || 4.4;
    }
    setPaint(hex) { for (const m of this.paintMats) m.color.set(hex); }
    spinAngle(rad) { for (const w of this.wheels) w.spin.rotation.x += rad; }
    spin(distance) { this.spinAngle(distance / this.radius); }
    steer(s) { const a = -s * this.steerAngle; for (const w of this.wheels) if (w.front) w.pivot.rotation[w.axis] = a; }
    brake(on) {
      if (on === this.tailOn) return; this.tailOn = on;
      for (const m of this.tailMats) m.emissiveIntensity = on ? this.tailBrake : this.tailBase;
    }
    dispose() {
      this.group.removeFromParent();
      const geoms = new Set();
      if (!this.sharedGeometry) this.group.traverse(o => { if (o.isMesh) geoms.add(o.geometry); });
      geoms.forEach(g => g.dispose()); this.owned.forEach(m => m.dispose());
    }
  }

  /* ------------------------------------------------------ Concept GT (GLB) */
  const GLB = { source: null, size: new T.Vector3(2.2, 1.2, 4.3) };
  const PAINT_RE = /Paint/;

  function prepareSource(scene) {
    const cache = new Map();
    const convert = m => {
      if (cache.has(m)) return cache.get(m);
      let out;
      if (m.transmission > 0 || /glass/i.test(m.name || '')) {
        // Tinted see-through glass instead of the expensive transmission pass.
        out = new T.MeshPhysicalMaterial({ name: m.name, color: '#0c1a23', metalness: .25, roughness: .05, transparent: true, opacity: .42, envMapIntensity: .9, depthWrite: false, side: T.FrontSide });
      } else {
        out = new T.MeshStandardMaterial({
          name: m.name || '', map: m.map || null, normalMap: m.normalMap || null, metalnessMap: m.metalnessMap || null, roughnessMap: m.roughnessMap || null,
          color: m.color?.clone() || new T.Color(1, 1, 1), metalness: m.metalness ?? .25, roughness: m.roughness ?? .42,
          emissive: m.emissive?.clone() || new T.Color(0, 0, 0), emissiveMap: m.emissiveMap || null, emissiveIntensity: m.emissiveIntensity ?? 1,
          envMapIntensity: .32, side: m.side === T.DoubleSide ? T.DoubleSide : T.FrontSide, transparent: !!m.transparent, opacity: m.opacity ?? 1, alphaTest: m.alphaTest || 0
        });
      }
      cache.set(m, out); return out;
    };
    scene.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = false; o.receiveShadow = false;
      o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material);
    });
    scene.updateMatrixWorld(true);
    const bb = new T.Box3().setFromObject(scene); bb.getSize(GLB.size);
    return scene;
  }

  function loadConcept() {
    return new Promise((resolve, reject) => {
      if (GLB.source) return resolve();
      const b64 = window.APEX_CAR_GLB_B64;
      if (!b64) return reject(Error('The Concept GT model data (assets/car-data.js) is missing.'));
      try {
        const bin = atob(b64), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        new T.GLTFLoader().parse(bytes.buffer, '', gltf => { GLB.source = prepareSource(gltf.scene); resolve(); }, reject);
      } catch (e) { reject(e); }
    });
  }

  function conceptRig(color, ghost) {
    const root = new T.Group(), body = GLB.source.clone(true); root.add(body);
    const owned = [], paintMat = new T.MeshPhysicalMaterial({ color, metalness: .76, roughness: .17, clearcoat: 1, clearcoatRoughness: .07, envMapIntensity: .42 });
    owned.push(paintMat);
    const swap = new Map(), tail = [], head = [];
    const own = m => {
      if (swap.has(m)) return swap.get(m);
      let out = m;
      if (PAINT_RE.test(m.name || '')) out = paintMat;
      else if (/Brakelight/i.test(m.name)) { out = m.clone(); tail.push(out); owned.push(out); }
      else if (/Headlight/i.test(m.name)) { out = m.clone(); head.push(out); owned.push(out); }
      else if (ghost) { out = m.clone(); owned.push(out); }
      swap.set(m, out); return out;
    };
    body.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material); });
    tail.forEach(m => { m.emissiveIntensity = 2; });
    // Wheels: add a pivot above each wheel node so steering (about the vertical axis) and spin (about the axle) stay independent.
    const nodes = []; body.traverse(o => { if (/^Wheel(Front|Rear)[LR]$/.test(o.name || '')) nodes.push(o); });
    const wheels = nodes.map(n => {
      const pivot = new T.Group(); pivot.position.copy(n.position); n.position.set(0, 0, 0); n.parent.add(pivot); pivot.add(n);
      return { spin: n, pivot, axis: 'z', front: /Front/.test(n.name) };   // GLB root frame is Z-up
    });
    const shadow = blobShadow(); root.add(shadow);
    if (ghost) ghostify(root, owned);
    return new Rig(root, { wheels, paint: [paintMat], tail, head, owned, radius: .37, sharedGeometry: true, steerAngle: .32, tailBase: 2, tailBrake: 6, length: GLB.size.z });
  }

  function ghostify(root, owned) {
    root.traverse(o => {
      if (!o.isMesh || o.material?.isShaderMaterial) return;
      const mats = (Array.isArray(o.material) ? o.material : [o.material]).map(m => { if (!owned.includes(m)) { m = m.clone(); owned.push(m); } m.transparent = true; m.opacity = .24; m.depthWrite = false; return m; });
      o.material = Array.isArray(o.material) ? mats : mats[0]; o.castShadow = false;
    });
  }

  /* --------------------------------------------- procedural cars (from V2) */
  function loft(sections, mat) {
    const vertices = [], idx = [];
    // Subdivide the longitudinal profile and soften cross-section corners.
    // This keeps each fictional vehicle's silhouette without the coarse slabs.
    const profile = new T.CatmullRomCurve3(sections.map(s => new T.Vector3(s[1], s[2], s[3])), false, 'catmullrom', .18);
    const steps = (sections.length - 1) * 4, n = 27;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, at = t * (sections.length - 1), lo = Math.min(sections.length - 2, Math.floor(at));
      const z = APEX.core.lerp(sections[lo][0], sections[lo + 1][0], at - lo), p = profile.getPoint(t);
      const width = p.x, bottom = p.y, top = Math.max(bottom + .02, p.z);
      const cross = [[-.75, bottom], [.75, bottom], [1, bottom + .1], [1, top - .08], [.74, top], [0, top + .025], [-.74, top], [-1, top - .08], [-1, bottom + .1]];
      const ring = new T.CatmullRomCurve3(cross.map(([x, y]) => new T.Vector3(x * width, y, z)), true, 'catmullrom', .12);
      for (let k = 0; k < n; k++) { const q = ring.getPoint(k / n); vertices.push(q.x, q.y, q.z); }
    }
    for (let j = 0; j < steps; j++) for (let k = 0; k < n; k++) { const a = j * n + k, b = j * n + (k + 1) % n, c = (j + 1) * n + k, d = (j + 1) * n + (k + 1) % n; idx.push(a, b, c, b, d, c); }
    for (let k = 1; k < n - 1; k++) { idx.push(0, k + 1, k); const o = steps * n; idx.push(o, o + k, o + k + 1); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); g.setIndex(idx); g.computeVertexNormals();
    const mesh = new T.Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
  }

  function proceduralRig(id, color, ghost) {
    const g = new T.Group(), kind = { aerion: 0, velar: 1, nexo: 2 }[id] ?? 0, owned = [];
    const track = m => { owned.push(m); return m; };
    const paint = track(new T.MeshPhysicalMaterial({ color, metalness: .5, roughness: .24, clearcoat: 1, clearcoatRoughness: .1 }));
    const black = track(material('#101417', .2, .35)), glass = track(new T.MeshPhysicalMaterial({ color: '#162b35', metalness: .65, roughness: .09, clearcoat: 1 }));
    const silver = track(material('#8c979c', .9, .23)), rubber = track(material('#111417', .05, .91)), accent = track(material('#f06332', .2, .4));
    const light = track(new T.MeshStandardMaterial({ color: '#e5faff', emissive: '#bbf0ff', emissiveIntensity: 2.8 }));
    const tail = track(new T.MeshStandardMaterial({ color: '#ff2c20', emissive: '#ff1808', emissiveIntensity: 2 }));
    const length = kind === 1 ? 1.045 : kind === 2 ? 1.07 : 1;
    g.add(loft([[-2.2, .80, .37, .75], [-1.8, .98, .31, .98], [-1.25, 1.00, .30, 1.02], [-.5, .92, .3, .93], [.4, .88, .31, .91], [1.25, .99, .34, .85], [1.9, .90, .36, .64], [2.25, .82, .41, .58]], paint));
    g.add(loft([[-1.3, .68, .87, .94], [-.63, .72, .86, 1.45], [.25, .67, .86, 1.47], [1.04, .70, .82, .91]], glass));
    g.add(loft([[-.67, .57, 1.43, 1.48], [.21, .54, 1.44, 1.5]], paint));
    g.add(box(1.89, .09, 3.4, black, 0, .32, 0));
    g.add(box(1.73, .09, .4, black, 0, .38, 2.1), box(1.88, .13, .37, black, 0, .35, -2.1));
    for (const sign of [-1, 1]) {
      g.add(box(.45, .04, .08, light, sign * .55, .56, 2.16));
      g.add(box(.47, .025, .065, light, sign * .59, .49, 2.17));
      g.add(box(.26, .14, .44, black, sign * .83, .55, 1.9));
      g.add(box(.36, .05, .24, black, sign * 1.08, 1.02, .35));
      g.add(box(.07, .03, .16, paint, sign * .97, 1, .38));
      g.add(box(.045, .025, 1.8, paint, sign * .72, 1.06, -.15));
      g.add(box(.055, .35, .76, black, sign * .927, .63, -.38));
      const blade = box(.045, .38, .06, paint, sign * .71, 1.22, .61); blade.rotation.x = -.72; g.add(blade);
    }
    g.add(box(1.62, .05, .055, tail, 0, .73, -2.19));
    for (let i = -3; i <= 3; i++) g.add(box(.04, .20, .5, black, i * .21, .37, -2.1));
    for (let i = -3; i <= 3; i++) g.add(box(1.05, .025, .048, black, 0, .976, -1.1 - i * .095));
    if (kind !== 2) {
      for (const s of [-1, 1]) {
        const pipe = new T.Mesh(new T.CylinderGeometry(.105, .105, .18, 16), silver); pipe.rotation.x = Math.PI / 2; pipe.position.set(s * .64, .47, -2.22); g.add(pipe);
        g.add(box(.07, .26, .13, black, s * .61, 1.02, -1.85));
      }
      g.add(box(1.95, .055, .35, black, 0, 1.16, -1.89));
    }
    const wheels = [];
    for (const x of [-.98, .98]) for (const z of [-1.38, 1.38]) {
      const wheel = new T.Group(); wheel.position.set(x, .44, z); wheel.rotation.order = 'YXZ';
      const tire = new T.Mesh(new T.TorusGeometry(.325, .12, 10, 32), rubber); tire.rotation.y = Math.PI / 2; wheel.add(tire);
      const hub = new T.Mesh(new T.CylinderGeometry(.282, .282, .255, 32), black); hub.rotation.z = Math.PI / 2; wheel.add(hub);
      const disc = new T.Mesh(new T.CylinderGeometry(.225, .225, .27, 24), silver); disc.rotation.z = Math.PI / 2; wheel.add(disc);
      for (let j = 0; j < 7; j++) { const spoke = box(.045, .49, .032, silver, Math.sign(x) * .145, 0, 0); spoke.rotation.x = j / 7 * Math.PI * 2; wheel.add(spoke); }
      const nut = new T.Mesh(new T.CylinderGeometry(.067, .067, .295, 12), silver); nut.rotation.z = Math.PI / 2; wheel.add(nut);
      wheels.push({ spin: wheel, pivot: wheel, axis: 'y', front: z > 0 }); g.add(wheel);
      // Sculpted upper wheel-arch lips join the tires to the painted body.
      const lip = new T.Mesh(new T.TorusGeometry(.49, .035, 8, 40, Math.PI), paint);
      lip.rotation.y = Math.PI / 2; lip.position.set(x, .44, z); lip.castShadow = true; g.add(lip);
      g.add(box(.10, .23, .12, accent, x, .46, z + .19));
    }
    for (const s of [-1, 1]) g.add(box(.5, .45, .46, black, s * .33, .96, -.25));
    g.add(box(1.2, .16, .27, black, 0, 1.04, .73));
    g.add(blobShadow());
    g.scale.z = length;
    if (ghost) ghostify(g, owned);
    return new Rig(g, { wheels, paint: [paint], tail: [tail], head: [light], owned, radius: .44, steerAngle: .18, tailBase: 2, tailBrake: 6, length: 4.45 * length });
  }

  /* ------------------------------------------------ oncoming Rush traffic */
  const TRAFFIC_COLORS = [0xd9e1e4, 0x154f83, 0x8d2025, 0xa76524, 0x293a54, 0x19664f, 0x7c378e, 0x3f4347];
  const traffic = {
    glass: new T.MeshPhysicalMaterial({ color: 0x0d2639, metalness: .12, roughness: .08, clearcoat: 1, clearcoatRoughness: .06, envMapIntensity: .55 }),
    tyre: new T.MeshStandardMaterial({ color: 0x0b0d12, roughness: .92 }), rim: new T.MeshStandardMaterial({ color: 0xb5c2cb, metalness: .96, roughness: .16 }),
    head: new T.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffd684, emissiveIntensity: 1.7 }),
    tail: new T.MeshStandardMaterial({ color: 0xff251d, emissive: 0x9d0804, emissiveIntensity: 1.25 }),
    trim: new T.MeshStandardMaterial({ color: 0x10161c, metalness: .65, roughness: .27 }),
    geo: {
      body: roundedBox(1.46, .38, 3.18, 5, .12), nose: roundedBox(1.38, .17, 1.08, 4, .09), tail: roundedBox(1.34, .18, .74, 4, .08),
      cabin: roundedBox(1.13, .49, 1.28, 5, .14), glass: roundedBox(1.16, .3, 1.3, 4, .12), bumper: roundedBox(1.47, .19, .22, 3, .06),
      tyre: new T.CylinderGeometry(.34, .34, .22, 16), rim: new T.CylinderGeometry(.2, .2, .228, 12), grille: roundedBox(.68, .11, .035, 3, .025),
      lamp: roundedBox(.3, .07, .045, 2, .015), tailLamp: roundedBox(.32, .055, .045, 2, .012), skirt: roundedBox(.07, .08, 1.08, 2, .02), diffuser: new T.BoxGeometry(1.1, .055, .36)
    }
  };
  const trafficPaint = new Map();
  function trafficRig(index) {
    const colorHex = TRAFFIC_COLORS[index % TRAFFIC_COLORS.length];
    if (!trafficPaint.has(colorHex)) trafficPaint.set(colorHex, new T.MeshPhysicalMaterial({ color: colorHex, metalness: .78, roughness: .2, clearcoat: 1, clearcoatRoughness: .08, envMapIntensity: .45 }));
    const paint = trafficPaint.get(colorHex), G = traffic.geo, e = new T.Group();
    const part = (geo, mat, x, y, z, rot) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); if (rot) m.rotation.set(...rot); e.add(m); return m; };
    part(G.body, paint, 0, .48, 0); part(G.nose, paint, 0, .74, .84, [-.055, 0, 0]); part(G.tail, paint, 0, .74, -1.15, [.035, 0, 0]);
    part(G.cabin, paint, 0, 1.02, -.18); part(G.glass, traffic.glass, 0, 1.14, -.18, [-.04, 0, 0]);
    part(G.bumper, traffic.trim, 0, .43, 1.57); part(G.grille, traffic.trim, 0, .53, 1.686); part(G.bumper, traffic.trim, 0, .43, -1.57);
    for (const n of [-1, 1]) { part(G.lamp, traffic.head, n * .43, .76, 1.665); part(G.tailLamp, traffic.tail, n * .43, .78, -1.665); part(G.skirt, traffic.trim, n * .75, .43, 0); }
    part(G.diffuser, traffic.trim, 0, .29, -1.52);
    const wheels = [];
    for (const n of [-1, 1]) for (const z of [-1.1, 1.1]) {
      const w = new T.Group(); part2(w, G.tyre, traffic.tyre); part2(w, G.rim, traffic.rim); w.position.set(n * .78, .34, z); e.add(w); wheels.push({ spin: w, pivot: w, axis: 'y', front: false });
    }
    function part2(parent, geo, mat) { const m = new T.Mesh(geo, mat); m.rotation.z = Math.PI / 2; parent.add(m); }
    e.rotation.x = .012;
    return new Rig(e, { wheels, paint: [], tail: [traffic.tail], head: [traffic.head], radius: .34, sharedGeometry: true, length: 3.4 });
  }

  /* ------------------------------------------------------------- factory */
  function create(id, color, opts = {}) {
    const car = APEX.core.carById(id);
    if (car.kind === 'glb') { if (!GLB.source) throw Error('Concept GT model not loaded yet.'); return conceptRig(color, !!opts.ghost); }
    return proceduralRig(car.id, color, !!opts.ghost);
  }
  /** Add a pair of headlight beams to a rig (off by default). */
  function addHeadlights(rig) {
    const beams = [];
    for (const s of [-.55, .55]) {
      const spot = new T.SpotLight(0xfff0d0, 0, 90, .5, .75, 1.2); spot.position.set(s, .75, 2.1); spot.target.position.set(s * .6, 0, 34);
      rig.group.add(spot, spot.target); spot.visible = false; beams.push(spot);
    }
    rig.beams = beams; return beams;
  }
  return { create, loadConcept, trafficRig, addHeadlights, roundedBox, blobShadow, traffic, GLB, isReady: () => !!GLB.source };
})();
