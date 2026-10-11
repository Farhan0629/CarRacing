/* APEX//RUN — app orchestration: menus, garage, sessions (Rush / circuit / trial / free), input, HUD,
 * results, replay, photo mode, settings, autosave and save import/export. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), core = APEX.core, { clamp, formatTime, carById } = core;
  const STORE_PROFILE = 'apexrun.profile.v2', STORE_SETTINGS = 'apexrun.settings.v2';

  let profile = core.fresh(), engine = null, audio = new APEX.Audio();
  let view = 'home', kind = null, sim = null, cfgMode = 'rush', preview = 'concept', paused = false, finishedShown = false, overAt = 0;
  let last = 0, accumulator = 0, uiClock = 0, replayTime = 0, replayPlaying = true, countBeep = 4, toastTimer = 0, bannerTimer = 0, beforeSettings = 'home';
  const keys = {}, touch = {}, padEdges = {}, tempPaint = {}, mapAI = [];
  let playerDot = null, gateDot = null, track = null;
  const settings = { assist: true, quality: 'balanced', volume: .25, showTouch: false, sensitivity: 100, motion: true, last: { mode: 'rush', weather: 'clear', time: 'day', difficulty: 'sport', laps: 1 } };

  /* ---------------------------------------------------------------- storage */
  function loadStored() {
    try {
      const raw = localStorage.getItem(STORE_PROFILE); if (raw) profile = core.validateProfile(JSON.parse(raw));
      else { const old = +(localStorage.apexBest || 0); if (old > 0) profile.rushBest = old; }   // migrate the original game's best score
      const s = JSON.parse(localStorage.getItem(STORE_SETTINGS) || 'null'); if (s && typeof s === 'object') applySettings(s);
    } catch (e) { console.warn('Stored progress could not be read; starting fresh.', e); profile = core.fresh(); }
  }
  function saveProfile() { try { localStorage.setItem(STORE_PROFILE, JSON.stringify(profile)); } catch { /* storage unavailable: manual export still works */ } }
  function saveSettings() { try { localStorage.setItem(STORE_SETTINGS, JSON.stringify(settings)); } catch { /* ignore */ } }
  function applySettings(s) {
    const num = (v, a, b, d) => Number.isFinite(v) ? clamp(v, a, b) : d;
    settings.volume = num(s.volume, 0, 1, .25); settings.assist = s.assist !== false; settings.showTouch = s.showTouch === true; settings.motion = s.motion !== false;
    settings.sensitivity = num(s.sensitivity, 65, 135, 100); if (['low', 'balanced', 'high'].includes(s.quality)) settings.quality = s.quality;
    if (s.last && typeof s.last === 'object') {
      const l = s.last; if (['rush', 'circuit', 'trial', 'free'].includes(l.mode)) settings.last.mode = l.mode;
      if (['clear', 'rain'].includes(l.weather)) settings.last.weather = l.weather; if (['day', 'sunset', 'night'].includes(l.time)) settings.last.time = l.time;
      if (['touring', 'sport', 'expert'].includes(l.difficulty)) settings.last.difficulty = l.difficulty; if ([1, 2, 3].includes(+l.laps)) settings.last.laps = +l.laps;
    }
  }
  function syncSettingsUI() {
    $('volume').value = settings.volume * 100; $('quality').value = settings.quality; $('assist').checked = settings.assist; $('motion').checked = settings.motion;
    $('touch-controls').checked = settings.showTouch; $('sensitivity').value = settings.sensitivity; audio.volume = settings.volume;
  }

  /* --------------------------------------------------------------------- UI */
  const paintOf = id => profile.owned.includes(id) ? profile.paint[id] : (tempPaint[id] || core.defaultPaint[id]);
  function toast(text) { $('toast').textContent = text; $('toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 3500); }
  function banner(text) { const b = $('banner'); b.textContent = text; b.classList.add('show'); clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('show'), 850); }
  const hide = (id, yes = true) => $(id).classList.toggle('hidden', yes);
  const ALL = ['home', 'garage', 'config', 'hud-rush', 'hud-race', 'pause-screen', 'results', 'settings', 'guide', 'photo-ui', 'replay-ui'];
  const IN_RACE = ['hud', 'pause-screen', 'results', 'photo-ui', 'replay-ui'];
  function setView(next) {
    view = next;
    const show = next === 'hud' ? (kind === 'rush' ? 'hud-rush' : 'hud-race') : next;
    ALL.forEach(id => hide(id, id !== show));
    if (next !== 'hud') {
      hide('countdown');
      clearTimeout(bannerTimer); $('banner').classList.remove('show');
    }
    const inRace = IN_RACE.includes(next); hide('top', inRace); hide('vignette', inRace || next === 'garage' && false);
    if (!inRace) showroom();
    updateTouch(); $('world').focus({ preventScroll: true });
  }
  function showroom() {
    if (engine.name !== 'garage') engine.use('garage');
    const g = engine.stages.garage; if (g.shownId !== preview || g.shownPaint !== paintOf(preview)) { g.show(preview, paintOf(preview)); g.shownId = preview; g.shownPaint = paintOf(preview); }
  }
  function updateTouch() {
    const t = $('touch'), want = view === 'hud' && (settings.showTouch || matchMedia('(pointer:coarse)').matches);
    t.classList.toggle('on', want); t.classList.toggle('rush', kind === 'rush');
    $('ui').classList.toggle('touch-driving', want);
  }
  function download(data, name, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function exportSave() { download(JSON.stringify({ ...profile, preferences: { ...settings } }, null, 2), 'apex-run-save.json', 'application/json'); toast('Save exported. Import this file in Settings on any device.'); }

  function updateProfile() {
    $('credits').textContent = profile.credits.toLocaleString(); $('career-rank').textContent = core.rank(profile.xp);
    const c = core.spec(profile), u = profile.upgrades[c.id] || {};
    $('home-car-brand').textContent = c.brand + ' / PERFORMANCE DIVISION'; $('home-car-name').textContent = c.name;
    $('home-car-spec').textContent = `${Math.round(c.power * (1 + (u.engine || 0) * .055))} HP · ${c.drive}`; $('home-best').textContent = profile.rushBest.toLocaleString();
    if (view === 'config') updateBest();
  }

  /* ----------------------------------------------------------------- screens */
  function showHome() {
    paused = false; sim = null; kind = null; keysClear(); engine.photo.on = false; engine.exposureScale = 1; preview = profile.selected;
    const g = engine.stages.garage; engine.use('garage'); g.orbit = .62; g.zoom = 8.6; g.height = 2.9; g.offset = 0; g.shownId = null; setView('home'); updateProfile(); audio.update(null, null, false);
  }
  function showGarage() {
    preview = profile.selected; engine.use('garage'); const g = engine.stages.garage; g.shownId = null; g.orbit = -.68; g.zoom = 8.5; g.height = 2.6; g.offset = .2; setView('garage'); renderGarage();
  }
  function renderGarage() {
    const car = carById(preview), owned = profile.owned.includes(preview), u = profile.upgrades[preview] || {}, active = profile.selected === preview;
    $('car-tabs').replaceChildren();
    core.cars.forEach(c => {
      const b = document.createElement('button'); b.textContent = (profile.owned.includes(c.id) ? '' : '🔒 ') + c.name; b.className = c.id === preview ? 'selected' : ''; b.setAttribute('aria-pressed', String(c.id === preview));
      b.onclick = () => { preview = c.id; showroom(); renderGarage(); }; $('car-tabs').append(b);
    });
    $('garage-brand').textContent = `${car.brand} / CLASS ${car.class}`; $('garage-name').textContent = car.name; $('garage-engine').textContent = car.engine + ' · ' + car.drive;
    $('garage-specs').innerHTML = `<div><strong>${Math.round(car.power * (1 + (u.engine || 0) * .055))}</strong><small>HP / POWER</small></div><div><strong>${Math.round(car.top * (1 + (u.engine || 0) * .025))}</strong><small>KM/H / MAX</small></div><div><strong>${car.mass}</strong><small>KG / MASS</small></div>`;
    $('select-car').textContent = !owned ? `ACQUIRE / ${car.price.toLocaleString()} CR` : active ? 'SELECTED FOR YOUR DRIVE ✓' : 'SELECT THIS MACHINE ↗';
    $('select-car').disabled = active || (!owned && profile.credits < car.price);
    $('swatches').replaceChildren();
    core.paints.forEach(p => {
      const b = document.createElement('button'); b.style.background = p.hex; b.title = p.name; b.className = p.hex === paintOf(preview) ? 'selected' : ''; b.setAttribute('aria-label', 'Paint ' + p.name); b.setAttribute('aria-pressed', String(p.hex === paintOf(preview)));
      b.onclick = () => { if (owned) { profile.paint[preview] = p.hex; saveProfile(); } else tempPaint[preview] = p.hex; engine.stages.garage.paint(p.hex); engine.stages.garage.shownPaint = p.hex; renderGarage(); };
      $('swatches').append(b);
    });
    $('upgrades').replaceChildren();
    [['engine', 'Power package', '+5.5% acceleration, +2.5% top speed / stage'], ['tires', 'Grip package', '+5.5% grip and steering / stage'], ['brakes', 'Brake package', '+9% braking / stage']].forEach(([key, title, hint]) => {
      const level = u[key] || 0, cost = core.UPGRADE_COST * (level + 1), row = document.createElement('div'); row.className = 'upgrade-row';
      row.innerHTML = `<div>${title} <span class="tiny">0${level} / 03</span><small>${hint}</small></div>`;
      const b = document.createElement('button'); b.textContent = level >= 3 ? 'MAX' : cost.toLocaleString() + ' CR'; b.disabled = !owned || level >= 3 || profile.credits < cost;
      b.onclick = () => {
        if (profile.credits < cost || level >= 3 || !owned) return; profile.credits -= cost; profile.upgrades[preview] = { ...(profile.upgrades[preview] || {}), [key]: level + 1 };
        saveProfile(); updateProfile(); renderGarage(); toast(`${title} upgraded to stage ${level + 1}.`);
      };
      row.append(b); $('upgrades').append(row);
    });
  }
  $('select-car').onclick = () => {
    const c = carById(preview);
    if (!profile.owned.includes(c.id)) { if (profile.credits < c.price) return; profile.credits -= c.price; profile.owned.push(c.id); profile.paint[c.id] = tempPaint[c.id] || profile.paint[c.id]; }
    profile.selected = c.id; saveProfile(); updateProfile(); renderGarage(); toast(c.brand + ' ' + c.name + ' selected.');
  };

  /* ------------------------------------------------------------------ config */
  function openConfig(mode) {
    preview = profile.selected; const l = settings.last;
    $('mode').value = mode; $('weather').value = l.weather; $('time').value = l.time; $('difficulty').value = l.difficulty; $('laps').value = String(l.laps);
    setView('config'); updateMode();
  }
  function updateMode() {
    const m = $('mode').value; cfgMode = m;
    hide('f-laps', m !== 'circuit'); hide('f-diff', m !== 'circuit');
    $('start-race').innerHTML = (m === 'rush' ? 'START ENGINE' : m === 'free' ? 'EXPLORE THE COAST' : 'START YOUR ENGINE') + ' <span class="arrow">↗</span>';
    const rush = m === 'rush';
    $('config-title').textContent = rush ? 'Into the traffic.' : 'Your next escape.'; $('config-sub').textContent = rush ? 'ONE BOULEVARD. NO FINISH LINE.' : 'ONE CIRCUIT. YOUR CONDITIONS.';
    $('art-eyebrow').textContent = rush ? 'Mode 01' : 'Circuit 01'; $('art-title').textContent = rush ? 'Highway Rush' : 'Riviera';
    $('art-copy').innerHTML = rush ? 'Three lanes of oncoming traffic.<br>Near misses, combos and nitro.' : 'Coastal switchbacks, cliffside villas,<br>and an uninterrupted horizon.';
    $('track-preview').innerHTML = rush ? rushArt() : circuitArt();
    $('track-detail').textContent = rush ? `ENDLESS / PACE RISES WITH SCORE / BEST ${profile.rushBest.toLocaleString()}` : (track.length / 1000).toFixed(2) + ' KM / 8 CHECKPOINTS / ORIGINAL LOCATION';
    updateBest();
  }
  function rushArt() {
    let s = '<path d="M62 190 L92 20 L108 20 L138 190 Z" fill="#ffffff14" stroke="#ffffff30"/>';
    for (let i = 0; i < 6; i++) { const y = 30 + i * 28, w = 1 + i * .6; s += `<rect x="${100 - w / 2}" y="${y}" width="${w}" height="${9 + i * 2}" fill="#ffffff55"/>`; }
    s += '<rect x="84" y="62" width="9" height="15" rx="2" fill="#59e3ff"/><rect x="108" y="96" width="12" height="20" rx="2" fill="#ff7a3d88"/><rect x="76" y="140" width="17" height="28" rx="3" fill="#ffffff55"/><rect x="104" y="160" width="22" height="30" rx="3" fill="#ff7a3d"/>';
    return s;
  }
  function pathData() { return track.points.filter((p, i) => i % 6 === 0).map((p, i) => { const q = mapPoint(p); return `${i ? 'L' : 'M'}${q.x.toFixed(2)},${q.y.toFixed(2)}`; }).join(' ') + ' Z'; }
  function circuitArt() { const d = pathData(); return `<path d="${d}" fill="none" stroke="#ffffff15" stroke-width="11"/><path d="${d}" fill="none" stroke="#ff7a3d" stroke-width="2.5" stroke-linecap="round"/><circle cx="165" cy="100" r="4" fill="#ff7a3d"/>`; }
  const mapPoint = p => ({ x: 100 + p.x * .155, y: 100 - p.z * .155 });
  function readConfig() { return { mode: $('mode').value, weather: $('weather').value, time: $('time').value, difficulty: $('difficulty').value, laps: Number($('laps').value) }; }
  function updateBest() {
    const c = readConfig();
    if (c.mode === 'rush') { $('config-best').textContent = `Best score / ${profile.rushBest.toLocaleString()} · ${profile.rushRuns} runs · furthest ${profile.rushFar.toLocaleString()} m`; return; }
    const key = core.raceKey(profile, c);
    $('config-best').textContent = profile.best[key] ? `Personal best / ${formatTime(profile.best[key])}` : 'Automatic transmission · steering assist available';
  }
  function initMaps() {
    track = new core.Track(); const d = pathData();
    $('minimap').innerHTML = `<path d="${d}" fill="none" stroke="#08121a" stroke-width="9"/><path d="${d}" fill="none" stroke="#e2e5dc88" stroke-width="3"/>`;
    const dot = (fill, size) => { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('r', String(size)); c.setAttribute('fill', fill); $('minimap').append(c); return c; };
    gateDot = dot('#abe0c0', 4); for (let i = 0; i < 7; i++) mapAI.push(dot('#bec8cd', 2.4)); playerDot = dot('#ff7a3d', 4.5);
  }

  /* ---------------------------------------------------------------- sessions */
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(Error('Could not load ' + src)); document.head.append(s); }); }
  function setLoading(text) { if (text) { $('loading-text').textContent = text; hide('loading', false); } else hide('loading'); }
  async function ensureCircuit() {
    if (engine.stages.circuit) return;
    setLoading('DECODING REAL 3D SCENERY...');
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));
    if (!window.APEX_SCENERY_DATA) await loadScript('assets/scenery-data.js');
    const st = new APEX.CircuitStage(engine); engine.register('circuit', st); engine.lastWidth = 0; engine.resize();
    await st.loadScenery(window.APEX_SCENERY_DATA); delete window.APEX_SCENERY_DATA; st.setQuality(engine.quality); setLoading('');
  }
  async function startSession() {
    keysClear(); const cfg = readConfig(); settings.last = { mode: cfg.mode, weather: cfg.weather, time: cfg.time, difficulty: cfg.difficulty, laps: cfg.laps }; saveSettings();
    try { await audio.start(); } catch { toast('Audio unavailable in this browser.'); }
    try {
      if (cfg.mode === 'rush') {
        kind = 'rush'; sim = new core.RushRun(profile, { weather: cfg.weather, time: cfg.time, sensitivity: settings.sensitivity / 100 });
        engine.use('rush'); const st = engine.stages.rush; st.setCar(profile.selected, paintOf(profile.selected)); st.setConditions(cfg.weather, cfg.time);
        $('r-title').textContent = 'HIGHWAY RUSH'; $('r-sub').textContent = `${{ day: 'DAYLIGHT', sunset: 'GOLDEN HOUR', night: 'MIDNIGHT' }[cfg.time]} BOULEVARD${cfg.weather === 'rain' ? ' · RAIN' : ''}`;
      } else {
        await ensureCircuit(); kind = 'race'; sim = new core.Race(profile, cfg);
        engine.use('circuit'); const st = engine.stages.circuit; st.setCar(profile.selected, paintOf(profile.selected)); st.setConditions(cfg.weather, cfg.time);
        $('position-title').textContent = cfg.mode === 'circuit' ? 'POSITION' : cfg.mode === 'trial' ? 'TIME TRIAL' : 'FREE DRIVE'; $('position-total').textContent = cfg.mode === 'circuit' ? '/ 6' : '';
        $('best').textContent = formatTime(profile.best[sim.key]);
      }
    } catch (e) { console.error(e); setLoading(''); toast('Could not start: ' + e.message); showHome(); return; }
    engine.motion = settings.motion; paused = false; finishedShown = false; accumulator = 0; countBeep = 4; overAt = 0; last = performance.now();
    setView('hud'); hide('countdown', false); $('countdown').innerHTML = '3<small>GET READY</small>'; hide('recover', kind === 'rush');
  }
  function keysClear() { for (const k in keys) delete keys[k]; for (const k in touch) delete touch[k]; document.querySelectorAll('[data-touch]').forEach(b => b.classList.remove('active')); }
  function pause() { if (!sim || view !== 'hud') return; paused = true; keysClear(); setView('pause-screen'); }
  function resume() { if (!sim) return; paused = false; keysClear(); setView('hud'); accumulator = 0; last = performance.now(); }
  function changeCamera() { if (!sim) return; engine.camMode = (engine.camMode + 1) % 3; engine.stage.snap = true; toast(['CHASE CAMERA', 'HOOD CAMERA', 'WIDE CHASE'][engine.camMode]); }

  function getInput() {
    const rush = kind === 'rush';
    let steer = (keys.ArrowRight || keys.KeyD || touch.right ? 1 : 0) - (keys.ArrowLeft || keys.KeyA || touch.left ? 1 : 0);
    let throttle = keys.ArrowUp || keys.KeyW || touch.throttle ? 1 : 0, brake = keys.ArrowDown || keys.KeyS || touch.brake ? 1 : 0;
    let boost = !!(keys.ShiftLeft || keys.ShiftRight || touch.boost), handbrake = !!keys.Space;
    let pad = null; try { pad = [...(navigator.getGamepads?.() || [])].find(Boolean); } catch { /* no gamepad API */ }
    if (pad) {
      const axis = Math.abs(pad.axes[0] || 0) > .12 ? pad.axes[0] : 0; if (axis) steer = axis;
      throttle = Math.max(throttle, pad.buttons[7]?.value || 0); brake = Math.max(brake, pad.buttons[6]?.value || 0); boost = boost || !!pad.buttons[0]?.pressed; handbrake = handbrake || !!pad.buttons[2]?.pressed;
      for (const [i, fn] of [[3, changeCamera], [9, () => view === 'hud' ? pause() : view === 'pause-screen' ? resume() : null]]) { const down = !!pad.buttons[i]?.pressed; if (down && !padEdges[i]) fn(); padEdges[i] = down; }
    }
    if (rush) return { steer, throttle, brake, nitro: boost || !!keys.Space };
    return { steer, throttle, brake, boost, handbrake, assist: settings.assist };
  }

  /* --------------------------------------------------------------------- HUD */
  function updateHUD() {
    if (!sim) return;
    const n = Math.ceil(sim.countdown);
    if (sim.countdown > 0) { hide('countdown', false); $('countdown').innerHTML = n + '<small>GET READY</small>'; if (n !== countBeep) { audio.beep(500, .08); countBeep = n; } }
    else if (sim.elapsed < .9) { hide('countdown', false); $('countdown').innerHTML = 'GO<small>MAKE IT YOURS</small>'; if (countBeep !== 0) { audio.beep(1000, .2); countBeep = 0; } }
    else hide('countdown');
    if (kind === 'rush') {
      $('r-speed').textContent = Math.round(sim.speed); $('r-score').textContent = Math.floor(sim.score).toString().padStart(6, '0'); $('r-best').textContent = sim.best().toString().padStart(6, '0');
      $('r-pace').textContent = Math.round(sim.pace); $('r-combo').textContent = 'COMBO ×' + sim.combo; $('r-nitro').style.transform = `scaleX(${sim.nitro / 100})`; return;
    }
    const p = sim.player, r = sim;
    $('speed').textContent = String(Math.round(Math.abs(p.v) * 3.6)).padStart(3, '0'); $('gear').textContent = r.spec.sound === 0 ? 'D' : p.gear;
    $('position').textContent = r.options.mode === 'circuit' ? String(r.position()) : r.options.mode === 'trial' ? 'TT' : '∞';
    $('lap').textContent = r.options.mode === 'free' ? '∞' : `${Math.min(r.options.laps, r.lapTimes.length + 1)} / ${r.options.laps}`;
    $('race-time').textContent = formatTime(r.elapsed); $('boost').style.width = p.boost + '%';
    [...$('rpm').children].forEach((e, i) => e.classList.toggle('on', i < p.rpm / 8200 * 20));
    hide('warning', !r.warning); $('warning').textContent = r.warning;
    const q = mapPoint(p); playerDot.setAttribute('cx', String(q.x)); playerDot.setAttribute('cy', String(q.y));
    mapAI.forEach((d, i) => { const a = r.ai[i]; d.style.display = a ? '' : 'none'; if (a) { const t = mapPoint(r.track.at(a.s)); d.setAttribute('cx', String(t.x)); d.setAttribute('cy', String(t.y)); } });
    const g = mapPoint(r.track.at(r.nextGate * r.track.length / 8)); gateDot.setAttribute('cx', String(g.x)); gateDot.setAttribute('cy', String(g.y)); gateDot.style.display = r.options.mode === 'free' ? 'none' : '';
  }
  function showResults() {
    paused = true; finishedShown = true; keysClear(); setView('results'); const res = sim.result; if (!res) return;
    saveProfile(); updateProfile();
    if (kind === 'rush') {
      $('result-title').textContent = res.newBest ? 'A NEW PERSONAL BEST' : 'IMPACT DETECTED'; $('result-place').textContent = res.score.toLocaleString(); $('result-caption').textContent = '/ SCORE';
      $('result-message').textContent = res.newBest ? 'Nobody has threaded the traffic like that.' : res.nearMisses >= 8 ? 'Close calls all the way.' : 'Shake it off and go again.';
      $('result-stats').innerHTML = `<div><span>DISTANCE</span><b>${res.distance.toLocaleString()} <small>M</small></b></div><div><span>NEAR MISSES</span><b>${res.nearMisses}</b></div><div><span>TOP SPEED</span><b>${Math.round(res.topSpeed)} <small>KM/H</small></b></div>`;
      $('result-reward').textContent = '+' + res.reward.toLocaleString() + ' CR'; $('result-xp').textContent = '+' + res.xp + ' XP'; $('result-clean').textContent = `Best combo ×${res.maxCombo} · record ${res.best.toLocaleString()}`;
    } else {
      const trial = sim.options.mode === 'trial';
      $('result-title').textContent = res.newBest ? 'A NEW PERSONAL BEST' : 'FINISH LINE CROSSED'; $('result-place').textContent = trial ? 'TT' : String(res.position).padStart(2, '0'); $('result-caption').textContent = trial ? '/ TIME TRIAL' : '/ 06 FINISHERS';
      $('result-message').textContent = trial ? 'You versus the clock.' : res.position === 1 ? 'The coast is yours.' : res.position <= 3 ? 'A podium-worthy drive.' : 'Every corner is a lesson.';
      $('result-stats').innerHTML = `<div><span>TOTAL TIME</span><b>${formatTime(res.total)}</b></div><div><span>BEST LAP</span><b>${formatTime(res.bestLap)}</b></div><div><span>TOP SPEED</span><b>${Math.round(res.peak)} <small>KM/H</small></b></div>`;
      $('result-reward').textContent = '+' + res.reward.toLocaleString() + ' CR'; $('result-xp').textContent = '+' + res.xp + ' XP'; $('result-clean').textContent = res.clean ? 'Clean race bonus included' : 'Contacts: ' + sim.player.collisions;
    }
    $('replay').disabled = sim.record.length < 2;
  }

  /* -------------------------------------------------------- photo and replay */
  function photo() {
    if (!sim) return; setView('photo-ui'); engine.photo.on = true; engine.camMode = 0; $('photo-exposure').value = '1'; engine.exposureScale = 1;
    const p = engine.photo; p.orbit = kind === 'rush' ? Math.PI + .7 : sim.player.heading + .7; p.zoom = 8; p.height = 3;
  }
  function exitPhoto() { engine.photo.on = false; engine.exposureScale = 1; engine.stage.snap = true; setView('pause-screen'); }
  function replayStart() { replayTime = 0; replayPlaying = true; $('replay-toggle').textContent = 'Ⅱ'; engine.camMode = 2; engine.stage.snap = true; setView('replay-ui'); }
  function replayEnd() { return sim.record.length ? sim.record[sim.record.length - 1].t : 0; }
  function replayFrame() {
    if (kind === 'rush') { const st = core.RushRun.frameAt(sim.record, replayTime); return st && { state: st, racing: false }; }
    const f = sim.record; if (!f.length) return null;
    let lo = 0, hi = f.length - 1; while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (f[m].t <= replayTime) lo = m; else hi = m; }
    const a = f[lo], b = f[hi], t = clamp((replayTime - a.t) / Math.max(.001, b.t - a.t), 0, 1), L = core.lerp;
    return { race: sim, replay: { v: L(a.v, b.v, t), steer: L(a.steer || 0, b.steer || 0, t), p: [L(a.p[0], b.p[0], t), L(a.p[1], b.p[1], t), a.p[2] + core.wrap(b.p[2] - a.p[2]) * t, L(a.p[3], b.p[3], t)], ai: a.ai.map((v, i) => [L(v[0], b.ai[i][0], t), L(v[1], b.ai[i][1], t)]) } };
  }

  /* -------------------------------------------------------------- main loop */
  function frame(now) {
    requestAnimationFrame(frame);
    // A queued rAF timestamp can predate a session/resume's performance.now().
    // Never let that stale callback put the physics accumulator below zero.
    const dt = last ? clamp((now - last) / 1000, 0, .075) : 0; last = now; if (!engine) return;
    let f = null;
    if (sim && view === 'hud' && !paused) {
      const input = getInput(); accumulator = Math.min(accumulator + dt, .15);
      while (accumulator >= 1 / 120 && view === 'hud' && !paused) { sim.step(1 / 120, input); accumulator -= 1 / 120; if (kind === 'rush' && sim.status === 'over') break; }
      if (kind === 'rush') {
        for (const ev of sim.events.splice(0)) { if (ev.type === 'near') { banner('NEAR MISS +' + ev.value); audio.beep(1300, .05); } }
        if (sim.status === 'over') { if (!overAt) overAt = now; else if (now - overAt > 750 && !finishedShown) showResults(); }
      } else if (sim.status === 'finished' && !finishedShown) showResults();
      audio.update(kind === 'rush' ? sim.audioState() : sim.player, sim.spec, !paused);
      uiClock += dt; if (uiClock > .055) { updateHUD(); uiClock = 0; }
    } else { audio.update(null, null, false); if (view === 'pause-screen') getInput(); }
    if (sim && IN_RACE.includes(view)) {
      if (view === 'replay-ui') {
        const end = replayEnd(); if (replayPlaying) replayTime += dt * Number($('replay-speed').value);
        if (replayTime > end) { replayTime = end; replayPlaying = false; $('replay-toggle').textContent = '▶'; }
        $('replay-scrub').value = String(end ? replayTime / end * 100 : 0); f = replayFrame();
      } else f = kind === 'rush' ? { state: sim.visual(), racing: view === 'hud' && sim.status === 'running' } : { race: sim, replay: null };
    }
    engine.render(paused && view !== 'replay-ui' ? 0 : dt, f);
  }

  /* ------------------------------------------------------------------ events */
  $('rush-open').onclick = () => openConfig('rush'); $('race-open').onclick = () => openConfig('circuit'); $('free-open').onclick = () => openConfig('free'); $('trial-open').onclick = () => openConfig('trial');
  $('garage-open').onclick = showGarage; $('how-open').onclick = () => hide('guide', false);
  document.querySelectorAll('[data-home]').forEach(b => b.onclick = showHome);
  $('mode').onchange = updateMode; ['weather', 'time', 'laps'].forEach(id => $(id).onchange = updateBest);
  $('start-race').onclick = startSession; $('pause').onclick = pause; $('r-pause').onclick = pause; $('resume').onclick = resume;
  $('camera').onclick = changeCamera; $('r-cam').onclick = changeCamera; $('recover').onclick = () => { if (kind === 'race') { sim.reset(); resume(); } };
  $('photo').onclick = photo; $('photo-exit').onclick = exitPhoto; $('restart').onclick = startSession; $('quit').onclick = showHome;
  $('results-garage').onclick = () => { sim = null; showGarage(); }; $('results-menu').onclick = showHome; $('race-again').onclick = startSession; $('replay').onclick = replayStart; $('replay-exit').onclick = () => { setView('results'); };
  $('replay-camera').onclick = changeCamera;
  $('replay-toggle').onclick = () => { replayPlaying = !replayPlaying; $('replay-toggle').textContent = replayPlaying ? 'Ⅱ' : '▶'; };
  $('replay-scrub').oninput = () => { replayTime = Number($('replay-scrub').value) / 100 * replayEnd(); };
  $('photo-exposure').oninput = () => { engine.exposureScale = Number($('photo-exposure').value); };
  $('capture').onclick = async () => { try { const blob = await engine.capture(); if (!blob) throw Error('no image'); download(blob, 'apex-run-photo.png', 'image/png'); toast('Photograph downloaded.'); } catch { toast('Capture unavailable in this browser.'); } };
  $('r-sound').onclick = () => { audio.muted = !audio.muted; $('r-sound').textContent = audio.muted ? '×' : '♪'; };
  $('settings-open').onclick = () => { beforeSettings = view; hide('settings', false); }; $('settings-close').onclick = () => hide('settings');
  $('settings-guide').onclick = () => hide('guide', false); $('guide-close').onclick = () => hide('guide');
  $('volume').oninput = () => { settings.volume = Number($('volume').value) / 100; audio.volume = settings.volume; saveSettings(); };
  $('quality').onchange = () => { settings.quality = $('quality').value; engine.setQuality(settings.quality); saveSettings(); };
  $('assist').onchange = () => { settings.assist = $('assist').checked; saveSettings(); };
  $('motion').onchange = () => { settings.motion = $('motion').checked; engine.motion = settings.motion; saveSettings(); };
  $('sensitivity').oninput = () => { settings.sensitivity = Number($('sensitivity').value); saveSettings(); };
  $('touch-controls').onchange = () => { settings.showTouch = $('touch-controls').checked; updateTouch(); saveSettings(); };
  $('export-save').onclick = exportSave; $('result-save').onclick = exportSave;
  $('reset-save').onclick = () => { if (!confirm('Reset all credits, cars, upgrades and records? This cannot be undone.')) return; profile = core.fresh(); saveProfile(); hide('settings'); if (view === 'garage') showGarage(); else showHome(); toast('Progress reset.'); };
  $('import-save').onchange = async e => {
    try {
      const file = e.target.files[0]; if (!file) return; if (file.size > 2500000) throw Error('Save file is too large.');
      const raw = JSON.parse(await file.text()), next = core.validateProfile(raw); profile = next;
      if (raw.preferences) { applySettings(raw.preferences); syncSettingsUI(); engine.setQuality(settings.quality); }
      saveProfile(); saveSettings(); preview = profile.selected; updateProfile(); if (view === 'garage') { showGarage(); } else showroom(); toast('Progress restored. Welcome back.');
    } catch (err) { toast(err.message || 'Could not read this save. Your current progress is unchanged.'); }
    e.target.value = '';
  };
  document.querySelectorAll('[data-touch]').forEach(b => {
    const key = b.dataset.touch;
    b.onpointerdown = e => { e.preventDefault(); touch[key] = true; b.classList.add('active'); b.setPointerCapture(e.pointerId); };
    b.onpointerup = b.onpointercancel = b.onlostpointercapture = () => { delete touch[key]; b.classList.remove('active'); };
  });
  window.addEventListener('keydown', e => {
    if (e.target.matches('input,select')) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return; keys[e.code] = true;
    if (e.code === 'Escape' || e.code === 'KeyP') { if (view === 'hud') pause(); else if (view === 'pause-screen') resume(); else if (view === 'photo-ui') exitPhoto(); }
    if (view === 'hud') { if (e.code === 'KeyC') changeCamera(); if (e.code === 'KeyR' && kind === 'race') sim.reset(); }
  });
  window.addEventListener('keyup', e => { delete keys[e.code]; });
  window.addEventListener('blur', () => { keysClear(); pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { keysClear(); pause(); } });
  let drag = null; const world = $('world');
  world.addEventListener('pointerdown', e => { if (['home', 'garage', 'photo-ui', 'config'].includes(view)) { drag = { x: e.clientX, y: e.clientY }; world.setPointerCapture(e.pointerId); } });
  world.addEventListener('pointermove', e => {
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (view === 'photo-ui') { engine.photo.orbit -= dx * .006; engine.photo.height = clamp(engine.photo.height + dy * .018, .6, 9); }
    else { const g = engine.stages.garage; g.orbit -= dx * .006; g.height = clamp(g.height + dy * .018, 1, 8); }
    drag = { x: e.clientX, y: e.clientY };
  });
  const endDrag = () => { drag = null; }; world.addEventListener('pointerup', endDrag); world.addEventListener('pointercancel', endDrag);
  world.addEventListener('wheel', e => {
    if (view === 'photo-ui') { e.preventDefault(); engine.photo.zoom = clamp(engine.photo.zoom + e.deltaY * .008, 3, 18); }
    else if (['garage', 'home', 'config'].includes(view)) { e.preventDefault(); const g = engine.stages.garage; g.zoom = clamp(g.zoom + e.deltaY * .008, 4, 17); }
  }, { passive: false });
  world.addEventListener('webglcontextlost', e => { e.preventDefault(); pause(); toast('Graphics context lost. Reload the page; progress is saved automatically.'); });

  /* -------------------------------------------------------------------- boot */
  async function initialize() {
    try {
      if (!window.THREE) throw Error('The 3D renderer could not initialize.');
      const checks = APEX.tests(), failures = checks.filter(t => !t.passed); if (failures.length) console.warn('Core self-checks failed:', failures);
      $('test-summary').textContent = `Core self-checks: ${checks.length - failures.length} / ${checks.length} passed in this browser. Rendering and handling still need playtesting; no hardware performance benchmark is claimed.`;
      loadStored(); syncSettingsUI();
      $('loading-text').textContent = 'LOADING CONCEPT GT...';
      await APEX.vehicles.loadConcept(); delete window.APEX_CAR_GLB_B64;
      engine = new APEX.engine.Engine($('world')); engine.quality = settings.quality; engine.motion = settings.motion; engine.applyPixelRatio();
      engine.register('garage', new APEX.engine.GarageStage(engine)); engine.register('rush', new APEX.RushStage(engine)); engine.setQuality(settings.quality);
      initMaps(); $('rpm').innerHTML = Array.from({ length: 20 }, (_, i) => `<i class="${i > 16 ? 'red' : ''}"></i>`).join('');
      showHome(); setLoading(''); requestAnimationFrame(frame);
      window.APEX.debug = { core, get engine() { return engine; }, get sim() { return sim; }, get profile() { return profile; }, get view() { return view; }, start: async (cfg = {}) => { openConfig(cfg.mode || 'rush'); for (const k of ['weather', 'time', 'difficulty', 'laps']) if (cfg[k] !== undefined) $(k).value = String(cfg[k]); await startSession(); } };
      const h = location.hash.slice(1); if (['rush', 'circuit', 'trial', 'free'].includes(h)) APEX.debug.start({ mode: h });
    } catch (error) {
      setLoading(''); const p = document.createElement('div'); p.className = 'error-box'; p.textContent = 'The game could not finish loading. Try a recent browser with WebGL enabled. Detail: ' + error.message; document.body.append(p); console.error(error);
    }
  }
  initialize();
})();
