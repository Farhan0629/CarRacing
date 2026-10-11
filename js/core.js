/* APEX//RUN core — pure game logic (no DOM, no WebGL).
 *
 *  - Vehicle roster, paint palette, upgrades
 *  - Profile / save validation (also accepts Velocity Atelier "V2" save files)
 *  - Riviera circuit track + circuit race / time trial / free drive simulation (from V2)
 *  - RushRun: the original endless traffic-dodge, rebuilt as a testable simulation
 */
window.APEX = window.APEX || {};
APEX.core = (() => {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  // One source of truth for circuit visuals, traffic and collision clearance.
  // Rush is a separate boulevard and intentionally keeps its existing width.
  const CIRCUIT = Object.freeze({
    roadHalfWidth: 13, shoulderEdge: 15.5, railLane: 15.6,
    barrier: 14.3, offRoadLane: 12.5, bankOuterLane: 37,
    gridLane: 4.2, passingLane: 5.2, wheelbase: 2.75,
    carHalfWidth: 1.1, carHalfLength: 2.4, railHalfThickness: .08, wallMargin: .12
  });
  const circuitGroundY = (roadY, lane) => Math.abs(lane) > CIRCUIT.bankOuterLane ? -1.2 :
    lerp(roadY - .06, -2.2, clamp((Math.abs(lane) - CIRCUIT.shoulderEdge) / (CIRCUIT.bankOuterLane - CIRCUIT.shoulderEdge), 0, 1));
  function circuitSteeringAngle(speed, assist = true) {
    const v = Math.abs(speed), direct = .42 / (1 + v * .065);
    if (!assist) return direct;
    // Keep parking-speed maneuverability, but don't turn a held digital key
    // into full steering lock once moving. Higher-speed turns remain tire-limited.
    const precise = .105 / (1 + (v / 42) ** 2);
    return lerp(direct, precise, clamp((v - 2) / 6, 0, 1));
  }
  function circuitBarrierLimit(headingDelta) {
    const extent = CIRCUIT.carHalfWidth * Math.abs(Math.cos(headingDelta)) +
      CIRCUIT.carHalfLength * Math.abs(Math.sin(headingDelta));
    return Math.min(CIRCUIT.barrier, CIRCUIT.railLane - CIRCUIT.railHalfThickness - CIRCUIT.wallMargin - extent);
  }

  /* ------------------------------------------------------------------ roster */
  // kind 'glb' = the detailed Concept GT model, 'proc' = procedural cars from V2.
  const cars = [
    { id: 'concept', kind: 'glb',  brand: 'APEX',    name: 'CONCEPT GT', subtitle: 'The original', class: 'S', power: 640,  mass: 1480, torque: 720,  drive: 'AWD', engine: 'Twin-turbo V10',            top: 318, accel: 11.2, grip: 1.06, price: 0,     sound: 10 },
    { id: 'aerion',  kind: 'proc', brand: 'AERION',  name: 'GT / 01',    subtitle: 'The art of balance', class: 'A', power: 540,  mass: 1420, torque: 610,  drive: 'RWD', engine: 'Twin-turbo V8',             top: 304, accel: 10.6, grip: 1.03, price: 0,     sound: 8 },
    { id: 'velar',   kind: 'proc', brand: 'VELARIS', name: 'R / 8',      subtitle: 'Nothing held back', class: 'S', power: 780,  mass: 1370, torque: 820,  drive: 'AWD', engine: 'Naturally aspirated V10',   top: 342, accel: 12.8, grip: 1.13, price: 9000,  sound: 10 },
    { id: 'nexo',    kind: 'proc', brand: 'NEXO',    name: 'E / X',      subtitle: 'Silence. Then everything.', class: 'S', power: 1020, mass: 1910, torque: 1340, drive: 'AWD', engine: 'Dual electric motors', top: 328, accel: 14.5, grip: 1.08, price: 16000, sound: 0 }
  ];
  const PROC = cars.filter(c => c.kind === 'proc');
  const paints = [
    { hex: '#146ec7', name: 'Azure' }, { hex: '#f06a25', name: 'Ember' }, { hex: '#d4d2c7', name: 'Pearl' }, { hex: '#9daf9c', name: 'Sage' },
    { hex: '#253a4c', name: 'Midnight' }, { hex: '#dcc171', name: 'Champagne' }, { hex: '#702d38', name: 'Garnet' }, { hex: '#14171c', name: 'Onyx' }
  ];
  const colors = paints.map(p => p.hex);
  const defaultPaint = { concept: '#146ec7', aerion: '#f06a25', velar: '#d4d2c7', nexo: '#253a4c' };
  const REF = cars[0]; // Rush physics were tuned around the Concept GT; other cars scale relative to it.
  const UPGRADE_COST = 1200, UPGRADE_MAX = 3;
  const carById = id => cars.find(c => c.id === id) || cars[0];

  /* ---------------------------------------------------------------- profile */
  const fresh = () => ({
    game: 'apex-run', version: 2, credits: 2500, xp: 0, wins: 0, races: 0,
    rushRuns: 0, rushBest: 0, rushFar: 0,
    selected: 'concept', owned: ['concept', 'aerion'], paint: { ...defaultPaint },
    upgrades: {}, best: {}, ghost: null
  });
  function validateProfile(p) {
    if (!p || typeof p !== 'object' || (p.version !== 1 && p.version !== 2) || !Array.isArray(p.owned))
      throw Error('This is not an APEX//RUN or Velocity Atelier save file.');
    const n = (v, max) => Number.isFinite(v) ? clamp(Math.floor(v), 0, max) : 0;
    const r = fresh();
    r.credits = n(p.credits, 10000000); r.xp = n(p.xp, 10000000); r.wins = n(p.wins, 100000); r.races = n(p.races, 100000);
    r.rushRuns = n(p.rushRuns, 1000000); r.rushBest = n(p.rushBest, 1e9); r.rushFar = n(p.rushFar, 1e9);
    r.owned = [...new Set(['concept', 'aerion', ...p.owned.filter(id => cars.some(c => c.id === id))])];
    r.selected = r.owned.includes(p.selected) ? p.selected : 'concept';
    if (typeof p.paint === 'string') { if (colors.includes(p.paint)) r.paint[r.selected] = p.paint; }   // V2 save: one global paint
    else if (p.paint && typeof p.paint === 'object') for (const c of cars) if (colors.includes(p.paint[c.id])) r.paint[c.id] = p.paint[c.id];
    for (const c of cars) { const u = p.upgrades?.[c.id] || {}; r.upgrades[c.id] = { engine: n(u.engine, UPGRADE_MAX), tires: n(u.tires, UPGRADE_MAX), brakes: n(u.brakes, UPGRADE_MAX) }; }
    if (p.best && typeof p.best === 'object') for (const [k, v] of Object.entries(p.best)) { if (k.length < 100 && Number.isFinite(v) && v > 10 && v < 36000) r.best[k] = v; }
    if (p.ghost && typeof p.ghost.key === 'string' && Array.isArray(p.ghost.frames) && p.ghost.frames.length <= 6000) {
      const frames = p.ghost.frames.filter(f => Array.isArray(f) && f.length === 5 && f.every(Number.isFinite) && Math.abs(f[1]) < 2000 && Math.abs(f[2]) < 2000);
      if (frames.length > 1 && frames.length === p.ghost.frames.length && frames.every((f, i) => i === 0 || f[0] > frames[i - 1][0])) r.ghost = { key: p.ghost.key, frames };
    }
    // Old saves used the same key for circuit and trial. Preserve those records
    // as circuit times; only a saved ghost is evidence of a previous trial.
    for (const [key, value] of Object.entries(r.best)) {
      if (!/^(circuit|trial|free):/.test(key)) r.best['circuit:' + key] ??= value;
    }
    if (r.ghost && !/^(circuit|trial|free):/.test(r.ghost.key)) {
      r.ghost.key = 'trial:' + r.ghost.key;
      const recordedTime = r.ghost.frames[r.ghost.frames.length - 1][0];
      if (recordedTime > 10 && recordedTime < 36000) r.best[r.ghost.key] ??= recordedTime;
    }
    return r;
  }
  const raceKey = (profile, options) => [
    options.mode, options.weather, options.time, profile.selected,
    options.mode === 'trial' ? 1 : options.laps
  ].join(':');
  function spec(profile, id) {
    const c = carById(id || profile.selected), u = profile.upgrades[c.id] || {};
    return { ...c, accel: c.accel * (1 + (u.engine || 0) * .055), top: c.top * (1 + (u.engine || 0) * .025), grip: c.grip * (1 + (u.tires || 0) * .055), brake: 17 * (1 + (u.brakes || 0) * .09) };
  }
  const level = xp => 1 + Math.floor(xp / 1500);
  const RANKS = ['ROOKIE', 'STREET RACER', 'PROFESSIONAL', 'ELITE', 'HYPERCAR CHAMPION', 'LEGEND'];
  const rank = xp => `${RANKS[Math.min(5, Math.floor((level(xp) - 1) / 2))]} / LEVEL ${String(level(xp)).padStart(2, '0')}`;

  /* ------------------------------------------------------------ circuit track */
  class Track {
    constructor() {
      this.points = []; this.length = 0; this.count = 900;
      for (let i = 0; i <= this.count; i++) {
        const a = i / this.count * Math.PI * 2;
        this.points.push({ x: 360 * Math.cos(a) + 60 * Math.cos(3 * a), z: 470 * Math.sin(a) + 45 * Math.sin(2 * a), y: 3 + 2 * Math.sin(2 * a), s: 0 });
      }
      for (let i = 1; i < this.points.length; i++) { const p = this.points[i], q = this.points[i - 1]; this.length += Math.hypot(p.x - q.x, p.z - q.z); p.s = this.length; }
      for (let i = 0; i < this.count; i++) { const p = this.points[i], q = this.points[i + 1]; p.heading = Math.atan2(q.x - p.x, q.z - p.z); }
      this.points[this.count].heading = this.points[0].heading;
    }
    at(s, lane = 0) {
      s = ((s % this.length) + this.length) % this.length;
      let lo = 0, hi = this.count;
      while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (this.points[m].s <= s) lo = m; else hi = m; }
      const p = this.points[lo], q = this.points[lo + 1], f = (s - p.s) / (q.s - p.s), h = p.heading;
      return { x: lerp(p.x, q.x, f) + Math.cos(h) * lane, z: lerp(p.z, q.z, f) - Math.sin(h) * lane, y: lerp(p.y, q.y, f), heading: h, index: lo, s };
    }
    nearest(x, z, previous) {
      let best = null;
      const count = previous === undefined ? this.count : 23;
      for (let j = 0; j < count; j++) {
        const i = previous === undefined ? j : (previous + j - 11 + this.count) % this.count;
        const a = this.points[i], b = this.points[i + 1], dx = b.x - a.x, dz = b.z - a.z;
        const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
        const cx = a.x + dx * t, cz = a.z + dz * t, d = (x - cx) ** 2 + (z - cz) ** 2;
        if (!best || d < best.d) { const h = a.heading; best = { d, index: i, x: cx, z: cz, y: lerp(a.y, b.y, t), heading: h, s: lerp(a.s, b.s, t), lane: (x - cx) * Math.cos(h) - (z - cz) * Math.sin(h) }; }
      }
      return best;
    }
    curvature(s) { return Math.abs(wrap(this.at(s + 14).heading - this.at(s - 14).heading)) / 28; }
  }

  /* --------------------------------------------------- circuit / trial / free */
  class Race {
    constructor(profile, options) {
      this.profile = profile; this.options = { mode: 'circuit', weather: 'clear', time: 'sunset', difficulty: 'sport', laps: 1, ...options };
      if (this.options.mode === 'trial') this.options.laps = 1;
      this.spec = spec(profile); this.track = new Track(); this.elapsed = 0; this.countdown = 3; this.status = 'countdown';
      const p = this.track.at(0, -CIRCUIT.gridLane);
      this.player = { ...p, v: 0, heading: p.heading, steer: 0, slip: 0, progress: 0, lane: -CIRCUIT.gridLane, boost: 100, gear: 1, rpm: 1000, collisions: 0, collisionCooldown: 0, drift: 0, yawRate: 0, steeringLimit: circuitSteeringAngle(0) };
      this.nextGate = 1; this.gatesPassed = 0; this.lapTimes = []; this.lapStart = 0; this.bestLap = null; this.peak = 0; this.distance = 0;
      this.record = []; this.recordClock = 0; this.result = null; this.warning = ''; this.flash = 0; this.rewarded = false;
      const number = this.options.mode === 'trial' ? 0 : this.options.mode === 'free' ? 7 : 5;
      this.ai = Array.from({ length: number }, (_, i) => ({
        id: i, name: ['L. Moreau', 'A. Sato', 'M. Rivera', 'E. Laurent', 'K. Weiss', 'N. Park', 'T. Costa'][i],
        s: 12 + i * 10, v: 0, lane: i % 2 ? CIRCUIT.gridLane : -CIRCUIT.gridLane, targetLane: i % 2 ? CIRCUIT.gridLane : -CIRCUIT.gridLane, pace: .92 + i * .018, finished: null,
        color: colors[(i + 1) % colors.length], car: PROC[i % PROC.length]
      }));
      this.key = raceKey(profile, this.options);
      this.ghost = profile.ghost?.key === this.key && this.options.mode === 'trial' ? profile.ghost.frames : null;
    }
    reset() {
      const s = Math.max(0, (this.nextGate - 1) * this.track.length / 8 - 3);
      const p = this.track.at(s, 0); Object.assign(this.player, p, { v: 0, slip: 0, steer: 0, yawRate: 0, progress: s, lane: 0 });
      this.warning = 'CAR RECOVERED'; this.flash = 1.5;
    }
    position() { const s = this.player.progress; return 1 + this.ai.filter(a => a.finished !== null || a.s > s).length; }
    step(dt, input) {
      if (this.status === 'finished') return;
      if (this.countdown > 0) { this.countdown = Math.max(0, this.countdown - dt); if (this.countdown === 0) this.status = 'racing'; return; }
      this.elapsed += dt;
      const p = this.player, c = this.spec, wet = this.options.weather === 'rain' ? .72 : 1;
      p.collisionCooldown = Math.max(0, p.collisionCooldown - dt); this.flash = Math.max(0, this.flash - dt);
      const steering = clamp(input.steer || 0, -1, 1), throttle = clamp(input.throttle || 0, 0, 1), brake = clamp(input.brake || 0, 0, 1);
      const assisted = input.assist !== false;
      const steerResponse = Math.abs(steering) < .05 || steering * p.steer < 0 ? 18 : assisted ? 5.5 : 10;
      p.steer = lerp(p.steer, steering, 1 - Math.exp(-dt * steerResponse));
      const boost = input.boost && throttle > 0 && p.boost > 0 && p.v > 5;
      p.boost = clamp(p.boost + (boost ? -28 : 9) * dt, 0, 100);
      const aero = c.accel * (p.v / (c.top / 3.6)) ** 2, off = Math.abs(p.lane) > CIRCUIT.offRoadLane;
      let power = c.accel * throttle * (boost ? 1.34 : 1) * (c.sound === 0 ? 1 : clamp(.65 + p.v / 18, .65, 1));
      power *= wet;
      p.v += (power - aero - .35 - brake * c.brake * wet - (off ? 4 : 0)) * dt;
      p.v = clamp(p.v, 0, c.top / 3.6 * 1.14);
      if (input.reverse && p.v < 1) p.v = -5;
      // +Z-forward chase view: driver's right is local -X. Input stays A=-1 / D=+1; yaw and front wheels use the opposite sign.
      // Grip-limited turns understeer; ordinary steering never creates a sideways offset.
      const maxSteer = circuitSteeringAngle(p.v, assisted);
      p.steeringLimit = maxSteer;
      const grip = c.grip * wet * (input.handbrake ? .76 : 1);
      const requestedYaw = -p.v / CIRCUIT.wheelbase * Math.tan(p.steer * maxSteer);
      const maxYaw = (9.81 * grip + Math.abs(p.v) * .033) / Math.max(5, Math.abs(p.v));
      let desired = clamp(requestedYaw, -maxYaw, maxYaw);
      const near = this.track.at(p.progress);
      if (assisted && Math.abs(steering) < .05 && p.v > 3 && Math.abs(wrap(p.heading - near.heading)) < .65) {
        // A small lane-relative preview steadies steering release. It does not
        // snap position, center the car, or supply enough yaw to auto-drive bends.
        const preview = this.track.at(p.progress + clamp(p.v * .45, 6, 18), p.lane);
        const heading = Math.atan2(preview.x - p.x, preview.z - p.z);
        desired = clamp(desired + clamp(wrap(heading - p.heading) * .55, -.06, .06), -maxYaw, maxYaw);
      }
      p.yawRate = clamp(lerp(p.yawRate || 0, desired, 1 - Math.exp(-dt * (input.handbrake ? 6 : 12))), -maxYaw, maxYaw);
      if (Math.abs(steering) < .05 && !input.handbrake) p.yawRate = lerp(p.yawRate, desired, 1 - Math.exp(-dt * 14));
      p.heading += p.yawRate * dt;
      // Normal driving is heading-aligned. Deliberate handbraking is the only drift source.
      const driftTarget = input.handbrake && p.v > 12 ? clamp(-p.steer * (.10 + p.v * .0009), -.18, .18) : 0;
      p.slip = lerp(p.slip, driftTarget, 1 - Math.exp(-dt * (input.handbrake ? 4 : 15)));
      const travelHeading = p.heading - p.slip;
      p.x += Math.sin(travelHeading) * p.v * dt; p.z += Math.cos(travelHeading) * p.v * dt;
      p.throttle = throttle; p.brakeInput = brake; p.handbraking = !!input.handbrake; p.wet = wet < 1;
      const n = this.track.nearest(p.x, p.z, p.index);
      let ds = n.s - p.s;
      if (ds > this.track.length / 2) ds -= this.track.length;
      if (ds < -this.track.length / 2) ds += this.track.length;
      p.progress += ds; p.s = n.s; p.index = n.index; p.lane = n.lane; p.y = n.y;
      const barrier = circuitBarrierLimit(wrap(p.heading - n.heading));
      if (Math.abs(n.lane) > barrier) {
        const sign = Math.sign(n.lane), q = this.track.at(n.s, sign * (barrier - .15)); p.x = q.x; p.z = q.z; p.lane = sign * (barrier - .15);
        if (p.collisionCooldown === 0 && p.v > 6) { p.collisions++; p.collisionCooldown = 1; this.flash = .45; this.warning = 'BARRIER CONTACT'; p.v *= .65; }
        p.v = Math.max(0, p.v - 12 * dt);   // wall-riding keeps costing speed between contact effects
        p.heading += wrap(n.heading - p.heading) * Math.min(1, dt * 5);
      }
      p.gear = c.sound === 0 ? 1 : clamp(1 + Math.floor(Math.max(0, p.v - 4) / 14), 1, 7);
      p.rpm = c.sound === 0 ? 1200 + p.v * 65 : clamp(1100 + (p.v - (p.gear - 1) * 14) * 350 + throttle * 750, 900, 8200);
      p.boosting = boost; p.braking = brake > 0;
      if (Math.abs(p.slip) > .045 && p.v > 12) p.drift += Math.abs(p.slip) * p.v * dt * 10;
      this.peak = Math.max(this.peak, p.v * 3.6); this.distance += Math.abs(p.v) * dt;
      if (this.flash <= 0) this.warning = Math.cos(p.heading - n.heading) < -.2 && p.v > 2 ? 'WRONG WAY' : off ? 'SHOULDER · LOW GRIP' : '';
      this.advanceCheckpoints(p.progress);
      const difficulty = { touring: .70, sport: .84, expert: .97 }[this.options.difficulty] || .84;
      for (const a of this.ai) {
        const curv = Math.max(this.track.curvature(a.s + 25), this.track.curvature(a.s + 65));
        let target = clamp(Math.sqrt(9.81 * a.car.grip * wet / Math.max(.001, curv)), 25, a.car.top / 3.6 * .94) * difficulty * a.pace;
        if (this.options.mode === 'free') target = Math.min(target, 22 + a.id * 1.2);
        let ahead = this.ai.find(b => b !== a && b.s > a.s && b.s - a.s < 24 && Math.abs(b.lane - a.lane) < 2.5);
        if (p.progress > a.s && p.progress - a.s < 22 && Math.abs(p.lane - a.lane) < 2.5) ahead = { v: p.v };
        if (ahead) { a.targetLane = a.lane >= 0 ? -CIRCUIT.passingLane : CIRCUIT.passingLane; target = Math.min(target, ahead.v + 3); }
        a.lane = lerp(a.lane, a.targetLane, dt * 1.5);
        a.v += clamp(target - a.v, -13 * wet * dt, a.car.accel * wet * dt);
        a.s += a.v * dt;
        const delta = ((a.s - p.progress + this.track.length * 1.5) % this.track.length) - this.track.length * .5;
        if (Math.abs(delta) < 4.6 && Math.abs(a.lane - p.lane) < 1.85 && p.collisionCooldown === 0) {
          p.v = Math.min(p.v, a.v) * .70; a.v *= .8; p.collisions++; p.collisionCooldown = 1;
          p.lane += p.lane >= a.lane ? .5 : -.5; const q = this.track.at(p.s, p.lane); p.x = q.x; p.z = q.z;
          this.flash = .4; this.warning = 'CONTACT · KEEP IT CLEAN';
        }
        if (a.finished === null && a.s >= this.options.laps * this.track.length) a.finished = this.elapsed;
      }
      this.recordClock += dt;
      if (this.recordClock >= .1 - 1e-9 && this.record.length < 6000) {
        this.recordClock = Math.max(0, this.recordClock - .1);
        this.record.push({ t: this.elapsed, p: [p.x, p.z, p.heading, p.y], ai: this.ai.map(a => [a.s, a.lane]), v: p.v, steer: p.steer, steeringLimit: p.steeringLimit });
      }
    }
    advanceCheckpoints(progress) {
      if (this.options.mode === 'free') return;
      const gate = this.track.length / 8;
      while (progress >= this.nextGate * gate) {
        this.gatesPassed++; this.nextGate++;
        if (this.gatesPassed % 8 === 0) {
          const lap = this.elapsed - this.lapStart; this.lapTimes.push(lap); this.lapStart = this.elapsed;
          this.bestLap = Math.min(...this.lapTimes);
          if (this.lapTimes.length >= this.options.laps) { this.finish(); break; }
        }
      }
    }
    finish() {
      if (this.rewarded) return;
      this.status = 'finished'; this.rewarded = true;
      const position = this.position(), clean = this.player.collisions === 0;
      const reward = (this.options.mode === 'trial' ? 1200 : [4500, 3000, 2200, 1500, 1200, 1000][position - 1] || 1000) + (clean ? 600 : 0);
      const xp = 400 + (position === 1 ? 400 : 0) + (clean ? 100 : 0);
      const old = this.profile.best[this.key];
      this.profile.credits += reward; this.profile.xp += xp; this.profile.races++; if (position === 1 && this.options.mode === 'circuit') this.profile.wins++;
      if (!old || this.elapsed < old) {
        this.profile.best[this.key] = this.elapsed;
        if (this.options.mode === 'trial') this.profile.ghost = { key: this.key, frames: this.record.map(f => [f.t, ...f.p]) };
      }
      this.result = { position, total: this.elapsed, bestLap: this.bestLap, reward, xp, clean, newBest: !old || this.elapsed < old, peak: this.peak, average: this.distance / Math.max(1, this.elapsed) * 3.6 };
    }
  }

  /* ------------------------------------------------------- endless Rush mode */
  // Same feel and constants as the original APEX//RUN loop, now with car stats, upgrades and weather feeding in.
  const RUSH = {
    lanes: [-4.2, 0, 4.2], count: 8, limit: 4.55, grace: 2, playerZ: 4,
    basePace: 90, maxPace: 190, nitroBoost: 42, chunkLength: 32, chunkCount: 13, recycleZ: 24
  };
  class RushRun {
    constructor(profile, options = {}, rng = Math.random) {
      this.profile = profile; this.rng = rng;
      this.options = { weather: 'clear', time: 'day', sensitivity: 1, ...options };
      this.spec = spec(profile);
      const ref = { accel: REF.accel, top: REF.top, grip: REF.grip, brake: 17 };
      this.k = { accel: this.spec.accel / ref.accel, top: this.spec.top / ref.top, grip: this.spec.grip / ref.grip, brake: this.spec.brake / ref.brake };
      this.wet = this.options.weather === 'rain' ? .84 : 1;
      this.status = 'countdown'; this.countdown = 3; this.elapsed = 0;
      this.speed = 0; this.score = 0; this.distance = 0; this.nitro = 100; this.combo = 1; this.maxCombo = 1; this.nearMisses = 0; this.topSpeed = 0;
      this.x = 0; this.steer = 0; this.scroll = 0; this.pace = RUSH.basePace * this.k.top; this.nitroOn = false; this.braking = false; this.throttle = 0;
      this.events = []; this.result = null; this.rewarded = false; this.record = []; this.recordClock = 0;
      this.traffic = Array.from({ length: RUSH.count }, (_, i) => ({
        id: i, lane: i % 3, x: RUSH.lanes[i % 3], z: -42 - i * 28 - rng() * 10, speed: 22 + i * 2.2, near: false, roll: 0, scale: .98 + rng() * .1
      }));
    }
    best() { return Math.max(this.profile.rushBest, Math.floor(this.score)); }
    step(dt, input) {
      if (this.status === 'over') return;
      if (this.countdown > 0) { this.countdown = Math.max(0, this.countdown - dt); if (this.countdown === 0) this.status = 'running'; return; }
      const k = this.k, wet = this.wet;
      this.elapsed += dt;
      this.pace = Math.min(RUSH.maxPace * k.top, RUSH.basePace * k.top + this.score / 95);
      const nitroOn = !!input.nitro && this.nitro > 0 && this.speed > 55;
      const target = this.pace + (nitroOn ? RUSH.nitroBoost : 0);
      this.braking = !!input.brake; this.throttle = input.throttle ? 1 : 0; this.nitroOn = nitroOn;
      if (input.brake) this.speed -= 110 * dt * k.brake * (wet < 1 ? .8 : 1);
      else this.speed += (input.throttle ? 64 : 32) * dt * k.accel;
      if (nitroOn) { this.speed += 85 * dt * k.accel; this.nitro = Math.max(0, this.nitro - 22 * dt); }
      else this.nitro = Math.min(100, this.nitro + 10 * dt);
      this.speed = Math.max(0, this.speed > target ? Math.max(target, this.speed - 38 * dt) : Math.min(target, this.speed));
      this.topSpeed = Math.max(this.topSpeed, this.speed);
      const steerIn = clamp(input.steer || 0, -1, 1), response = 5 * (wet < 1 ? .86 : 1);
      this.steer += (steerIn - this.steer) * Math.min(1, dt * response);
      this.x = clamp(this.x + this.steer * (3.2 + this.speed / 190) * dt * (this.options.sensitivity || 1) * k.grip * (wet < 1 ? .93 : 1), -RUSH.limit, RUSH.limit);
      const mps = this.speed / 3.6;
      this.scroll += mps * .3 * dt; this.distance += mps * dt;
      this.score += this.speed * dt * (.75 + this.combo * .2);
      for (const t of this.traffic) {
        const previousZ = t.z;
        const rel = Math.max(2, mps * .34 - t.speed / 3.6 * .1);
        t.z += rel * dt; t.roll += rel * dt * .34;
        if (t.z > RUSH.recycleZ) this.respawn(t);
        const dz = Math.abs(t.z - RUSH.playerZ), dx = Math.abs(t.x - this.x);
        // Judge the lateral clearance at the instant the car passes, never
        // after it has already gone behind the player.
        if (!t.near && previousZ <= RUSH.playerZ && t.z > RUSH.playerZ) {
          t.near = true;
          if (dx >= 1.55 && dx < 2.65) {
            this.combo = Math.min(8, this.combo + 1); this.maxCombo = Math.max(this.maxCombo, this.combo); this.nearMisses++;
            const bonus = this.combo * 500; this.score += bonus; this.events.push({ type: 'near', value: bonus });
          }
        }
        if (dz < 2.5 && dx < 1.55 && this.elapsed > RUSH.grace) { this.crash(); return; }
      }
      this.recordClock += dt;
      if (this.recordClock >= .05 - 1e-9 && this.record.length < 6000) {
        this.recordClock = Math.max(0, this.recordClock - .05);
        this.record.push({ t: this.elapsed, sc: this.scroll, x: this.x, st: this.steer, v: this.speed, n: nitroOn ? 1 : 0, b: this.braking ? 1 : 0, tr: this.traffic.map(t => [t.x, t.z, t.roll]) });
      }
    }
    respawn(t) {
      // Pick a lane that is not already occupied close to the spawn point so traffic never stacks.
      let lane = Math.floor(this.rng() * 3), z = -225 - this.rng() * 110;
      for (let attempt = 0; attempt < 6; attempt++) {
        if (!this.traffic.some(o => o !== t && o.lane === lane && Math.abs(o.z - z) < 30)) break;
        lane = (lane + 1) % 3; if (attempt % 2) z -= 22;
      }
      t.z = z; t.lane = lane; t.x = RUSH.lanes[lane]; t.near = false;
    }
    crash() {
      this.status = 'over'; this.events.push({ type: 'crash' }); this.finalize();
    }
    finalize() {
      if (this.rewarded) return; this.rewarded = true;
      const score = Math.floor(this.score), p = this.profile, newBest = score > p.rushBest;
      const reward = Math.floor(score / 30), xp = 100 + Math.floor(this.distance / 10) + this.nearMisses * 15;
      p.credits += reward; p.xp += xp; p.rushRuns++; p.rushBest = Math.max(p.rushBest, score); p.rushFar = Math.max(p.rushFar, Math.floor(this.distance));
      this.result = { score, distance: Math.floor(this.distance), best: p.rushBest, newBest, reward, xp, nearMisses: this.nearMisses, maxCombo: this.maxCombo, topSpeed: this.topSpeed };
    }
    visual() {
      return { scroll: this.scroll, x: this.x, steer: this.steer, speed: this.speed, nitro: this.nitroOn, braking: this.braking, traffic: this.traffic.map(t => [t.x, t.z, t.roll]) };
    }
    audioState() {
      const v = this.speed / 3.6, electric = this.spec.sound === 0;
      const gear = electric ? 1 : clamp(1 + Math.floor(Math.max(0, v - 4) / 14), 1, 7), load = this.nitroOn ? 1 : this.throttle ? .9 : this.braking ? 0 : .55;
      const rpm = electric ? 1200 + v * 65 : clamp(1100 + (v - (gear - 1) * 14) * 350 + load * 750, 900, 8200);
      return { v, rpm, gear, throttle: load, collisions: this.status === 'over' ? 1 : 0, wet: this.wet < 1, handbraking: false, slip: 0 };
    }
    /** Interpolated replay frame in the same shape as visual(). */
    static frameAt(record, t) {
      if (!record.length) return null;
      let lo = 0, hi = record.length - 1;
      while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (record[m].t <= t) lo = m; else hi = m; }
      const a = record[lo], b = record[hi], f = a === b ? 0 : clamp((t - a.t) / Math.max(.001, b.t - a.t), 0, 1);
      return {
        scroll: lerp(a.sc, b.sc, f), x: lerp(a.x, b.x, f), steer: lerp(a.st, b.st, f), speed: lerp(a.v, b.v, f), nitro: !!a.n, braking: !!a.b,
        traffic: a.tr.map((c, i) => [lerp(c[0], b.tr[i][0], f), lerp(c[1], b.tr[i][1], f), lerp(c[2], b.tr[i][2], f)])
      };
    }
  }

  const formatTime = s => !Number.isFinite(s) ? '—' : `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
  return { cars, PROC, paints, colors, defaultPaint, carById, fresh, validateProfile, spec, level, rank, Track, Race, RushRun, RUSH, UPGRADE_COST, UPGRADE_MAX, clamp, lerp, wrap, formatTime, raceKey, CIRCUIT, circuitGroundY, circuitSteeringAngle, circuitBarrierLimit };
})();
