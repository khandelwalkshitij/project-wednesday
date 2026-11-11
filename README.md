# Project Wednesday

A browser orbital simulator. Set up satellites around Earth or a small body, propagate them, and play the result back on a 3D globe, a Mercator ground-track map and drift charts. Everything runs in the page. No server, no build needed to use it.

**Use it:** open `dist/project-wednesday.html` in a browser (works straight from disk), or host `index.html` and its folders on any static host such as GitHub Pages.

## What it models

- **Gravity:** WGS84 Earth with J2, J3, J4 zonals, or a uniform sphere (asteroid, moon) with its own spin pole.
- **Earth orientation:** GCRF to ITRF with IAU 2006 precession, IAU 2000B nutation (77 terms) and the Earth rotation angle. Checked against ERFA. Polar motion not applied.
- **Time:** UTC, TAI, TT, TDB, GPS, with the IERS leap-second table kept as data in `index.html`.
- **Integrators:** fixed-step RK4 (output rows Hermite-interpolated), or adaptive DOP853 with rtol/atol step control and 7th-order dense output. DOP853 steps land on burns and shadow boundaries. Either way the output step is independent of the integration step.
- **Drag:** exponential atmosphere (Vallado's table), co-rotating air, re-entry declared at 80 km. No solar activity.
- **Solar radiation pressure:** cannonball model, 4.56e-6 N/m² at 1 AU scaled by 1/r², switched off in a cylindrical Earth shadow. Cr can be a constant or a time schedule.
- **Burns:** impulsive, in LVLH (radial, along-track, cross-track) or inertial axes, applied at the exact commanded time.
- **Inputs:** Keplerian or Cartesian states, TLEs (initial state from SGP4/SDP4, then propagated with this force model), Walker and train patterns.
- **Checks:** energy residual after removing drag work, SRP work and burn energy, so the report shows pure numerical error. Jacobi integral for a uniform sphere.
- **Outputs:** `plan.csv` ephemeris, LTAN, altitude, beta angle, eclipse and inter-satellite range charts, each exportable as CSV.

Not modelled: tesseral harmonics, Sun and Moon gravity, penumbra, attitude. See `docs/` for the full requirement list and status.

## Layout

```
index.html               page markup, leap-second table, loads css/ and src/main.js
css/                     base, Windows 98 controls, viewer, docs tab, narrow-screen overrides
src/main.js              entry point: runs each app module's init() in order
src/core/                physics, no DOM. Runs in the browser and in Node
  constants, math, time, earth-orientation, elements, environment, parent, sun,
  interp, patterns, tle, cr-schedule, config, propagator, plan-csv, ltan, index
src/data/                generated tables: nutation series, TDB series, land outlines, DOP853 coefficients
src/app/                 page logic: boot, presets, form, run, report, infotip, start
src/viewer/              three.js globe, Mercator map, charts, docs tab, playback loop
scripts/build.mjs        bundles everything into dist/project-wednesday.html
scripts/serve.mjs        local static server for development
src/vendor/sgp4.js       SGP4/SDP4 from satellite.js (MIT), unchanged
tests/core/              Node tests for the physics (ERFA, SGP4, SciPy DOP853 and independent-integrator checks)
tools/gen_dop853.py      regenerates the DOP853 coefficient table and its SciPy test truth
tests/browser/           Playwright smoke test of both builds
tools/gen_tables.py      regenerates the ERFA-derived tables and test truth
docs/                    requirement sheets (baseline and additional)
```

How the pieces talk:

- `src/core/index.js` exports `SimCore`, the only API the page and tests use.
- `normalizeConfig` in `core/config.js` is the single place that validates input and produces warnings.
- The JSON config box is the source of truth. The setup form edits it.
- Viewer modules share mutable state through `src/viewer/state.js` (`V.plan`, `V.simT`, `V.selected` and so on). Everything else is passed by ES module imports.
- Each module with start-up work exports `init()`. `src/main.js` and `viewer/index.js` call them in a fixed order.

## Develop

```
npm install
npm run serve            # http://localhost:8080/  (ES modules do not load from file://)
npm run lint
npm run build            # writes dist/project-wednesday.html
npm test                 # core tests, build, browser smoke test
```

The browser test needs Chromium for Playwright: `npx playwright install chromium`.

Edit `src/`, `css/` or `index.html`, then run `npm run build` so `dist/` stays in step. Commit both.

## Config

The Documentation tab in the app and the "Config fields" list under the JSON box describe every field. Minimal example:

```json
{
  "parent": { "shape": "earth_default" },
  "start_epoch": "2026-11-11T00:00:00.000 UTC",
  "duration": "P1D",
  "integrator": { "type": "rk4", "time_step_s": 10 },
  "output_step_s": 60,
  "force_model": { "drag": true, "srp": true },
  "satellites": {
    "count": 1, "mass_kg": 100, "cd": 2.2, "cr": 1.8, "area_m2": 1, "names": ["SAT-01"],
    "orbits": [{ "type": "keplerian", "a_m": 6878137, "e": 0, "i_deg": 53, "raan_deg": 0, "argp_deg": 0, "ta_deg": 0 }]
  }
}
```

## Source and feedback

The code lives at <https://github.com/khandelwalkshitij/project-wednesday>. Bugs and feature requests go in the [issue tracker](https://github.com/khandelwalkshitij/project-wednesday/issues). Releases are described in [`CHANGELOG.md`](CHANGELOG.md).

```
git clone https://github.com/khandelwalkshitij/project-wednesday.git
cd project-wednesday
npm install
```

## Licence

MIT, see `LICENSE`. Land outlines from Natural Earth (public domain). three.js r128 loaded from cdnjs (MIT). SGP4/SDP4 from satellite.js 6.0.2 (MIT, see `src/vendor/sgp4.js`). Nutation and TDB coefficients from ERFA (BSD-style licence, derived from IAU SOFA).
