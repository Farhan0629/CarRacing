/* Deterministic full-lap regression, not an FPS or human handling benchmark.
 * A digital +/-1/0 steering controller samples the road at 8 Hz; physics runs
 * at the same 120 Hz as the game. Covers all four cars in dry and wet conditions. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const context = { window: {}, console }; context.APEX = context.window.APEX = {}; vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/core.js'), 'utf8'), context);
const C = context.APEX.core, dt = 1 / 120;
for (const id of ['concept', 'aerion', 'velar', 'nexo']) for (const weather of ['clear', 'rain']) {
  const profile = C.fresh(); profile.selected = id;
  const race = new C.Race(profile, { mode: 'trial', weather, time: 'day' });
  race.countdown = 0; race.status = 'racing';
  Object.assign(race.player, race.track.at(0, 0), { progress: 0, lane: 0 });
  let clock = 1, input = {}, maxLane = 0;
  while (race.status === 'racing' && race.elapsed < 180) {
    const p = race.player; clock += dt;
    if (clock >= .125) {
      clock = 0;
      const aim = race.track.at(p.progress + 10 + p.v * .45);
      const error = C.wrap(Math.atan2(aim.x - p.x, aim.z - p.z) - p.heading);
      const curve = Math.max(race.track.curvature(p.progress + p.v * .8), race.track.curvature(p.progress + p.v * 2.4));
      const target = Math.min(48, Math.sqrt(9.81 * race.spec.grip * (weather === 'rain' ? .72 : 1) / Math.max(.001, curve)) * .92);
      input = { steer: Math.abs(error) > .04 ? -Math.sign(error) : 0, throttle: p.v < target - .5 ? 1 : 0, brake: p.v > target + 1 ? Math.min(1, (p.v - target) * .2) : 0, assist: true };
    }
    race.step(dt, input); maxLane = Math.max(maxLane, Math.abs(race.player.lane));
  }
  assert.equal(race.status, 'finished', `${id}/${weather}: did not complete a full lap`);
  assert.equal(race.player.collisions, 0, `${id}/${weather}: barrier contact`);
  assert.ok(maxLane < 3.5, `${id}/${weather}: excessive weaving`);
  assert.ok(race.result.average > 120, `${id}/${weather}: forced crawl`);
  console.log(`${id}/${weather}: ${race.elapsed.toFixed(2)}s, ${race.result.average.toFixed(1)} km/h average, 0 contacts, ${maxLane.toFixed(2)}m max lane offset`);
}
console.log('Full-lap handling checks: 8/8 passed.');
