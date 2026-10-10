# APEX//RUN — Supercar Overhaul

## Run

Open `index.html` in a current desktop browser (Chrome, Edge, Firefox, or Safari). Keep `game.js` and every included image in the same folder. The game is fully local after extraction; no build process, server, or internet connection is required.

> **Performance:** This edition uses a detailed textured GLB car and PBR materials. A current desktop GPU and WebGL 2 browser are recommended. Mobile browsers are supported, but may be less smooth.

## Controls

- **W / Up Arrow** — accelerate
- **S / Down Arrow** — brake
- **A / D or Left / Right** — steer
- **Space** — nitro
- **P / Escape** — pause / resume

Touch steering and nitro controls appear on phones and tablets after the race starts. The car accelerates automatically on touch devices.

## Overhaul changes

- **Corrected direction:** the player car now faces down the road, while oncoming traffic travels toward the player.
- **Wheel animation:** both the detailed supercar wheels and traffic wheels spin from their actual movement speed.
- **Luxury supercar treatment:** high-detail GLB body, premium metallic paint variants, clear-coat material response, textured body surfaces, glass, chrome, tyre/rim detail, a contact shadow, and a tighter dynamic chase camera.
- **Traffic upgrade:** an eight-car pool of sculpted coupe models with low chassis, separate hood, glasshouse, trunk, grille, bumpers, side skirts, lamp clusters, distinct wheels and rims, varied paint colours, lane distribution, respawning, collision detection, and near-miss scoring.
- **Camera and handling:** gentle steering, score-driven pace, speed-responsive FOV, and nitro while retaining the controlled opening pace.
- **City:** bright daytime boulevard with facade/window materials, sidewalks, trees, street furniture, road markings, distant haze, and varied building volumes.

## Asset attribution

**CarConcept GLB:** © 2024 Darmstadt Graphics Group GmbH; model and textures by Eric Chadwick. Licensed under **Creative Commons Attribution 4.0 International (CC BY 4.0)**. The source model is a concept car, not a Bugatti or Lamborghini replica.

Source and full legal notice: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept

**Three.js:** MIT License, bundled into `game.js`.

The user-provided car photographs remain visual/menu references only. The city, traffic cars, materials configuration, and game code are procedural project work.
