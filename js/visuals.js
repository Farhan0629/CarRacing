/* Shared, offline-ready environment art. Seeded surface maps, cutout foliage,
 * atmospheric clouds/sun and shaded water require no new downloaded assets. */
window.APEX = window.APEX || {};
APEX.visuals = (() => {
  'use strict';
  const T = THREE, cache = new Map();
  const random = seed => () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const canvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function texture(c, color = true) {
    const t = new T.CanvasTexture(c); t.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping; return t;
  }
  function surface(kind, aniso = 4) {
    if (!cache.has(kind)) {
      const c = canvas(512), b = canvas(512), ctx = c.getContext('2d'), bump = b.getContext('2d'), rng = random(1924 + kind.length);
      const base = { asphalt: [61, 65, 66], stone: [133, 126, 108], grass: [88, 103, 62], pavement: [154, 155, 146] }[kind];
      const image = ctx.createImageData(512, 512), height = bump.createImageData(512, 512);
      for (let i = 0; i < image.data.length; i += 4) {
        const n = rng(), grit = (n - .5) * (kind === 'grass' ? 35 : 27);
        for (let k = 0; k < 3; k++) { image.data[i + k] = base[k] + grit; height.data[i + k] = 105 + n * 65; }
        image.data[i + 3] = height.data[i + 3] = 255;
      }
      ctx.putImageData(image, 0, 0); bump.putImageData(height, 0, 0);
      if (kind === 'asphalt') {
        // Uneven repairs, fine aggregate and faint rubber tracks, not a flat grey slab.
        for (let i = 0; i < 12; i++) {
          ctx.strokeStyle = 'rgba(20,24,25,.10)'; ctx.lineWidth = 3 + rng() * 12;
          const x = rng() * 512; ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 8, 150, x - 8, 370, x, 512); ctx.stroke();
        }
        for (let i = 0; i < 9; i++) {
          let x = 40 + rng() * 400, y = 40 + rng() * 400; ctx.beginPath(); ctx.moveTo(x, y);
          for (let j = 0; j < 5; j++) { x += rng() * 30 - 15; y += rng() * 17; ctx.lineTo(x, y); }
          ctx.lineWidth = .7; ctx.strokeStyle = 'rgba(15,18,20,.32)'; ctx.stroke();
        }
      } else if (kind === 'pavement') {
        ctx.strokeStyle = 'rgba(60,66,64,.38)'; ctx.lineWidth = 2;
        for (let i = 0; i <= 512; i += 128) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke(); }
      } else {
        for (let i = 0; i < 180; i++) {
          const x = rng() * 512, y = rng() * 512;
          ctx.fillStyle = kind === 'grass' ? 'rgba(174,158,90,.14)' : 'rgba(58,54,48,.16)';
          ctx.beginPath(); ctx.ellipse(x, y, 2 + rng() * 15, 1 + rng() * 5, rng() * Math.PI, 0, Math.PI * 2); ctx.fill();
        }
      }
      cache.set(kind, { map: texture(c), bumpMap: texture(b, false) });
    }
    const maps = cache.get(kind); for (const t of Object.values(maps)) t.anisotropy = Math.min(8, aniso);
    return maps;
  }
  function surfaceMaterial(kind, aniso, repeat = 1) {
    const maps = surface(kind, aniso), own = {};
    for (const [name, map] of Object.entries(maps)) { own[name] = map.clone(); own[name].repeat.set(repeat, repeat); own[name].needsUpdate = true; }
    const mat = new T.MeshStandardMaterial({ ...own, roughness: .91, metalness: 0, bumpScale: kind === 'asphalt' ? .028 : .07 });
    if (kind === 'grass' || kind === 'stone') {
      // Broad, world-space variation hides tiled ground patterns.
      mat.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGroundPosition;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            vec4 groundPosition=vec4(transformed,1.);
            #ifdef USE_INSTANCING
              groundPosition=instanceMatrix*groundPosition;
            #endif
            vGroundPosition=(modelMatrix*groundPosition).xyz;`);
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGroundPosition;\n' + noiseGLSL)
          .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb*=mix(.74,1.15,fbm(vGroundPosition.xz*.045));');
      };
      mat.customProgramCacheKey = () => 'apex-ground-v1:' + kind;
    }
    return mat;
  }
  function roadPlane(width, length, mat) {
    const geometry = new T.PlaneGeometry(width, length); geometry.rotateX(-Math.PI / 2);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width / 8, uv.getY(i) * length / 8);
    const mesh = new T.Mesh(geometry, mat); mesh.receiveShadow = true; return mesh;
  }

  function foliageTexture() {
    if (cache.has('foliage')) return cache.get('foliage');
    const c = canvas(256), ctx = c.getContext('2d'), rng = random(620);
    // Individual leaves with gaps let sky and light through the crown.
    for (let i = 0; i < 5500; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()), x = 128 + Math.cos(a) * r * (88 + 18 * Math.sin(a * 5)), y = 134 + Math.sin(a) * r * (102 + 10 * Math.cos(a * 3));
      ctx.fillStyle = `rgb(${66 + rng() * 54},${102 + rng() * 66},${36 + rng() * 46})`;
      ctx.beginPath(); ctx.ellipse(x, y, 1.6 + rng() * 3.4, .9 + rng() * 2, rng() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
    const tex = texture(c); tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping; cache.set('foliage', tex); return tex;
  }
  function tree(seed = 1, narrow = false) {
    const key = 'tree:' + seed + ':' + narrow;
    if (!cache.has(key)) {
      const rng = random(seed * 89), vertices = [], normals = [], uv = [], indices = [], card = new T.PlaneGeometry(1, 1), matrix = new T.Matrix4();
      const clusters = [{ x: 0, y: 4.3, z: 0, w: 3, h: 3.5 }];
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; clusters.push({ x: Math.cos(a) * 1.05, y: 3.25 + rng() * 1.1, z: Math.sin(a) * 1.05, w: 2.1 + rng() * .5, h: 2.4 }); }
      for (const p of clusters) for (let side = 0; side < 3; side++) {
        matrix.compose(new T.Vector3(p.x * (narrow ? .55 : 1), p.y, p.z * (narrow ? .55 : 1)), new T.Quaternion().setFromEuler(new T.Euler(.08, side * Math.PI / 3 + rng() * .15, 0)), new T.Vector3(p.w * (narrow ? .55 : 1), p.h, 1));
        const geo = card.clone().applyMatrix4(matrix), offset = vertices.length / 3;
        vertices.push(...geo.attributes.position.array); normals.push(...geo.attributes.normal.array); uv.push(...geo.attributes.uv.array);
        for (const index of geo.index.array) indices.push(index + offset); geo.dispose();
      }
      card.dispose();
      const crown = new T.BufferGeometry(); crown.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); crown.setAttribute('normal', new T.Float32BufferAttribute(normals, 3)); crown.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); crown.setIndex(indices); crown.computeBoundingSphere();
      const leaves = new T.MeshStandardMaterial({ map: foliageTexture(), alphaTest: .48, side: T.DoubleSide, roughness: 1, color: narrow ? '#9eae86' : '#b6ba96' });
      const bark = surfaceMaterial('stone', 4); bark.color.set('#655440');
      cache.set(key, { crown, leaves, bark, branch: new T.CylinderGeometry(.07, .12, 1, 7) });
    }
    const source = cache.get(key), group = new T.Group(), crown = new T.Mesh(source.crown, source.leaves), branches = new T.InstancedMesh(source.branch, source.bark, 7), d = new T.Object3D();
    crown.castShadow = true; crown.receiveShadow = true; branches.castShadow = true;
    d.position.set(0, 1.7, 0); d.scale.set(1.5, 3.4, 1.5); d.updateMatrix(); branches.setMatrixAt(0, d.matrix);
    for (let i = 1; i < 7; i++) { const a = (i - 1) / 6 * Math.PI * 2; d.position.set(Math.cos(a) * .35, 2.8 + (i % 2) * .25, Math.sin(a) * .35); d.rotation.set(Math.cos(a) * .6, 0, -Math.sin(a) * .6); d.scale.set(.75, 1.8, .75); d.updateMatrix(); branches.setMatrixAt(i, d.matrix); }
    group.add(branches, crown); return group;
  }

  const noiseGLSL = `
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
    float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=mat2(1.6,-1.2,1.2,1.6)*p;a*=.5;}return v;}
  `;
  class Atmosphere {
    constructor(scene, radius) {
      this.uniforms = {
        top: { value: new T.Color() }, horizon: { value: new T.Color() }, cloudColor: { value: new T.Color() },
        sunColor: { value: new T.Color() }, sunDirection: { value: new T.Vector3() },
        cloudCover: { value: .45 }, sunStrength: { value: 1 }, stars: { value: 0 }, clock: { value: 0 }
      };
      this.mesh = new T.Mesh(new T.SphereGeometry(radius, 32, 16), new T.ShaderMaterial({
        uniforms: this.uniforms, side: T.BackSide, depthWrite: false, fog: false,
        vertexShader: 'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: `varying vec3 vDirection;uniform vec3 top,horizon,cloudColor,sunColor,sunDirection;uniform float cloudCover,sunStrength,stars,clock;${noiseGLSL}
          void main(){vec3 d=normalize(vDirection);float elevation=max(0.,d.y);vec3 col=mix(horizon,top,smoothstep(0.,.4,elevation));
            vec2 cloudUV=d.xz/max(.15,d.y)*1.1+vec2(clock*.003,clock*.001);float density=fbm(cloudUV);
            float cloud=smoothstep(.68-cloudCover*.32,.86-cloudCover*.32,density)*smoothstep(.02,.14,d.y);
            float shade=fbm(cloudUV+vec2(1.1,.3));col=mix(col,cloudColor*(.72+shade*.45),cloud*.87);
            float facing=max(0.,dot(d,normalize(sunDirection)));col+=sunColor*(pow(facing,600.)*2.4+pow(facing,28.)*.18)*sunStrength*(1.-cloud*.8);
            vec2 starCell=floor(d.xz/max(.12,d.y)*240.);float star=step(.9985,hash(starCell))*pow(max(0.,1.-length(fract(d.xz/max(.12,d.y)*240.)-.5)*2.),5.);
            col+=vec3(star*stars*smoothstep(.1,.4,d.y)*(1.-cloud));gl_FragColor=vec4(col,1.);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`
      }));
      this.mesh.renderOrder = -10; this.mesh.frustumCulled = false; scene.add(this.mesh); this.setConditions('clear', 'day');
    }
    setConditions(weather, time, forward = 1) {
      const u = this.uniforms, rain = weather === 'rain', night = time === 'night', sunset = time === 'sunset';
      u.top.value.set(night ? '#050c1c' : rain ? '#3c5266' : sunset ? '#326585' : '#1c6fba');
      u.horizon.value.set(night ? '#263e59' : rain ? '#adb6b8' : sunset ? '#f4c19b' : '#d0e4ed');
      u.cloudColor.value.set(night ? '#344b67' : rain ? '#9aa3ad' : sunset ? '#edc4b2' : '#e6eef3');
      u.cloudCover.value = rain ? .95 : .5; u.stars.value = night && !rain ? 1.4 : 0;
      u.sunStrength.value = rain ? .08 : night ? .15 : 1;
      u.sunColor.value.set(night ? '#b1c5eb' : sunset ? '#ffba73' : '#fff6df');
      u.sunDirection.value.set(sunset ? .65 : -.4, sunset ? .13 : .65, forward * .65).normalize();
    }
    update(camera, dt) { this.mesh.position.copy(camera.position); this.uniforms.clock.value += dt; }
  }

  function ocean(scene, atmosphere) {
    const uniforms = { clock: { value: 0 }, deep: { value: new T.Color('#123d4c') }, light: { value: new T.Color('#b9d5d5') }, sunDirection: atmosphere.uniforms.sunDirection, sunColor: atmosphere.uniforms.sunColor, sunStrength: atmosphere.uniforms.sunStrength };
    const mesh = new T.Mesh(new T.PlaneGeometry(6000, 6000), new T.ShaderMaterial({
      uniforms, vertexShader: 'varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec3 vWorld;uniform float clock,sunStrength;uniform vec3 deep,light,sunDirection,sunColor;${noiseGLSL}
        void main(){vec2 p=vWorld.xz;float t=clock;vec2 waveUV=p*.035+vec2(t*.012,-t*.009);
          float swell=fbm(waveUV),dx=fbm(waveUV+vec2(.15,0.))-swell,dz=fbm(waveUV+vec2(0.,.15))-swell;
          float distant=1./(1.+length(cameraPosition-vWorld)*.002);
          vec3 normal=normalize(vec3(-dx*1.6*distant,1.,-dz*1.6*distant));
          vec3 eye=normalize(cameraPosition-vWorld);float fresnel=pow(1.-max(0.,dot(eye,normal)),4.);
          // Fade sub-pixel wave detail with distance instead of aliasing it
          // into horizontal bands along the horizon.
          vec3 color=mix(deep*(.87+swell*.2),light*.63,fresnel*.8);
          float spec=pow(max(0.,dot(normal,normalize(eye+normalize(sunDirection)))),150.);color+=sunColor*spec*sunStrength*1.8;
          float shore=abs(length(p/vec2(455.,595.))-1.);float foam=(1.-smoothstep(.006,.025,shore))*(.35+.65*noise(p*.35+vec2(t*.35,0.)));
          color=mix(color,vec3(.68,.79,.75),foam*.45);gl_FragColor=vec4(color,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    })); mesh.rotation.x = -Math.PI / 2; mesh.position.y = -4; mesh.receiveShadow = false; scene.add(mesh); return { mesh, uniforms };
  }
  return { random, texture, surfaceMaterial, roadPlane, tree, Atmosphere, ocean };
})();
