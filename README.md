# APEX//RUN — merged build

Open `index.html` in a current desktop or mobile browser. No server, npm or build step is needed (it works from `file://`).

## What is in the game
- **Highway Rush** (the original game, now the core mode): endless oncoming traffic, near-miss combos, nitro, rising pace.
- **Circuit Race** (5 AI rivals), **Time Trial** (race your own ghost) and **Free Drive** on the Riviera circuit (from V2).
- **Garage**: 4 cars (Concept GT, Aerion GT/01 owned; Velaris R/8 and Nexo E/X to acquire), 8 paints per car, 3 upgrade stages each for power, grip and brakes. Upgrades and car stats apply in *every* mode, Rush included.
- **Weather and time of day** (clear/rain × day/golden hour/night) in every mode, with night headlights.
- **Replay** of your last run (Rush or race) and **Photo mode** (orbit, zoom, exposure, PNG capture).
- V2's handling model, layered synthesized engine audio, Poly Haven scenery, gamepad and touch controls.
- **Autosave** in the browser (localStorage) plus export/import of save files. V2 (Velocity Atelier) saves import fine. Your old best score is migrated.

## Controls
W/S or ↑/↓ accelerate/brake · A/D or ←/→ steer · Rush: Space or Shift = nitro · Circuit: Shift = boost, Space = handbrake · C camera · R recover (circuit) · Esc/P pause.
Debug shortcut: open `index.html#rush`, `#circuit`, `#trial` or `#free` to start straight into a mode.

## Project layout
```
index.html            UI markup           css/style.css    styles
js/core.js            physics, track, Race, RushRun, profile/saves (pure logic)
js/vehicles.js        Concept GT (GLB), V2 procedural cars, traffic, wheel rigs
js/engine.js          renderer, garage showroom, photo camera, rain
js/stage-rush.js      city boulevard    js/stage-circuit.js   Riviera circuit
js/scenery.js         Poly Haven loader js/audio.js            engine audio
js/game.js            menus, input, HUD, sessions, replay, saves
js/tests.js           36 logic self-checks (run on every launch; results in Driver Guide)
vendor/               three.js r160 + GLTFLoader converted to a classic script
assets/               car-data.js (Concept GT, embedded), scenery-data.js, car.glb, credits
legacy/               your previous bundled game.js / index.html and backups
```
To swap the car model: replace `assets/car.glb`, then regenerate `assets/car-data.js` (base64 of the file assigned to `window.APEX_CAR_GLB_B64`).

## Credits
Concept GT model: Eric Chadwick / Darmstadt Graphics Group, CC BY 4.0. Pine and apartment-facade meshes: Poly Haven, CC0. Three.js: MIT. Aerion, Velaris and Nexo are fictional original vehicles.
