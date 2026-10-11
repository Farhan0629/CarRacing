/* Optional browser QA: install Playwright, serve the repo, then run this file.
 * GAME_URL defaults to http://127.0.0.1:8080. SCREENSHOT_DIR enables captures.
 * CHROMIUM_PATH / SOFTWARE_RENDERING are optional local-test overrides. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:8080';
const output = process.env.SCREENSHOT_DIR;
if (output) fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
    args: process.env.SOFTWARE_RENDERING ? ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []
  });
  const errors = [];
  async function open(options) {
    const page = await browser.newPage(options);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /shader|WebGL|THREE/.test(message.text())) errors.push(message.text()); });
    await page.goto(url); await page.waitForFunction(() => window.APEX?.debug, null, { timeout: 60000 });
    assert.match(await page.locator('#test-summary').textContent(), /42 \/ 42 passed/);
    await page.locator('#settings-open').click(); await page.locator('#settings-guide').click();
    await page.locator('#guide-close').click(); await page.locator('#settings-close').click();
    // Software-rendered CI cannot measure handling or FPS. Keep the real rAF,
    // input and HUD loop running, but draw only the frames being inspected.
    await page.evaluate(() => { const e = APEX.debug.engine; e.qaRender = e.render.bind(e); e.render = () => {}; });
    return page;
  }
  async function shot(page, name) {
    if (!output) return;
    await page.evaluate(() => {
      const d = APEX.debug, sim = d.sim;
      const frame = sim ? sim instanceof d.core.RushRun ? { state: sim.visual(), racing: true } : { race: sim, replay: null } : null;
      d.engine.qaRender(0, frame);
    });
    await page.screenshot({ path: path.join(output, name + '.png') });
  }
  async function drive(page, cfg, location = 0) {
    await page.evaluate(async ({ cfg, location }) => {
      await APEX.debug.start(cfg); const d = APEX.debug, sim = d.sim;
      sim.countdown = 0; sim.status = cfg.mode === 'rush' ? 'running' : 'racing';
      for (let i = 0; i < 240; i++) sim.step(1 / 120, { throttle: 1, assist: false });
      if (location && sim.player) {
        Object.assign(sim.player, sim.track.at(location, -2.7), { progress: location, lane: -2.7 });
        sim.ai.forEach((a, i) => { a.s = location + 28 + i * 12; });
      }
      d.engine.stage.snap = true;
    }, { cfg, location });
    await page.waitForFunction(() => document.getElementById('countdown').classList.contains('hidden'), null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => APEX.debug.view), 'hud');
    assert.equal(await page.locator('#countdown').isVisible(), false);
  }
  async function noHudOverlap(page) {
    const result = await page.evaluate(() => {
      const intersect = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const buttons = [...document.querySelectorAll('#touch button')].filter(b => getComputedStyle(b).display !== 'none');
      const telemetry = ['.map-box', '.speedometer'].map(s => document.querySelector(s).getBoundingClientRect());
      return { touch: document.querySelector('#touch').classList.contains('on'), overlap: telemetry.some(r => buttons.some(b => intersect(r, b.getBoundingClientRect()))), overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.equal(result.touch, true); assert.equal(result.overlap, false); assert.equal(result.overflow, false);
  }
  try {
    const desktop = await open({ viewport: { width: 1280, height: 800 } });
    await shot(desktop, 'home');
    await desktop.evaluate(() => APEX.debug.start({ mode: 'rush' }));
    await desktop.keyboard.press('Escape'); await desktop.locator('#quit').click();
    assert.equal(await desktop.evaluate(() => APEX.debug.view), 'home');
    assert.equal(await desktop.locator('#countdown').isVisible(), false);
    await drive(desktop, { mode: 'rush', time: 'day', weather: 'clear' }); await shot(desktop, 'rush-day');
    await drive(desktop, { mode: 'rush', time: 'night', weather: 'rain' }); await shot(desktop, 'rush-night-rain');
    await drive(desktop, { mode: 'circuit', time: 'sunset', weather: 'clear' }, 180); await shot(desktop, 'circuit-sunset');
    await drive(desktop, { mode: 'trial', time: 'day', weather: 'clear' }, 500); await shot(desktop, 'trial-day');
    await drive(desktop, { mode: 'free', time: 'night', weather: 'rain' }, 300); await shot(desktop, 'free-night-rain');
    await desktop.keyboard.press('Escape'); await desktop.locator('#photo').click();
    assert.equal(await desktop.evaluate(() => APEX.debug.engine.photo.on), true); await shot(desktop, 'photo');
    await desktop.locator('#photo-exit').click(); await desktop.locator('#quit').click();
    for (const [name, viewport] of [['portrait', { width: 390, height: 844 }], ['compact', { width: 320, height: 568 }], ['landscape', { width: 844, height: 390 }]]) {
      const mobile = await open({ viewport, isMobile: true, hasTouch: true });
      await drive(mobile, { mode: 'circuit', time: 'day' }, 180); await noHudOverlap(mobile); await shot(mobile, name + '-circuit');
      await drive(mobile, { mode: 'rush', time: 'day' });
      const overlap = await mobile.evaluate(() => {
        const a = document.querySelector('.nitro-wrap').getBoundingClientRect(), b = document.querySelector('#touch').getBoundingClientRect();
        const panel = document.querySelector('.rpanel').getBoundingClientRect(), actions = document.querySelector('.rright').getBoundingClientRect();
        return a.bottom > b.top || panel.right + 8 > actions.left || actions.right > innerWidth - 10;
      });
      assert.equal(overlap, false); await shot(mobile, name + '-rush'); await mobile.close();
    }
    assert.deepEqual(errors, []); console.log('Browser smoke checks passed: four modes, weather/time, photo, countdown cleanup, and touch HUD at three sizes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
