# Project Wednesday

**Live:** <https://khandelwalkshitij.github.io/project-wednesday/>

![Project Wednesday showing a 24-satellite Walker constellation on the 3D globe, with the setup form on the left](docs/images/screenshot.png)

A browser orbital simulator. Set up satellites around Earth or a small body, propagate them, and play the result back on a 3D globe, a Mercator ground-track map and drift charts. Everything runs in the page. No server, no build needed to use it.

**Use it:** open the live link, or `dist/project-wednesday.html` straight from disk, or host `index.html` and its folders on any static host.

## Documentation

- [Overview and models](docs/models.md): what is simulated and how.
- [Config reference](docs/config-reference.md): every config field, with complete examples, and the `plan.csv` format.
- [Accuracy and limits](docs/accuracy.md): validation results and how to choose a step size.
- [Glossary](docs/glossary.md).
- [Benchmark against Orekit](docs/benchmark-orekit.md), and the requirement sheets (`docs/requirements-*.csv`) with the status of each requirement.

The app's Documentation tab and the field list under its JSON box are generated from these pages.

## What it models

- **Gravity:** WGS84 Earth with J2, J3, J4 zonals, or a uniform sphere (asteroid, moon) with its own spin pole.
- **Earth orientation:** GCRF to ITRF with IAU 2006 precession, IAU 2000B nutation (77 terms) and the Earth rotation angle. Checked against ERFA. Polar motion not applied.
- **Time:** UTC, TAI, TT, TDB, GPS, with the IERS leap-second table kept as data in `index.html`.
- **Integrators:** fixed-step RK4 (output rows Hermite-interpolated), or adaptive DOP853 with rtol/atol step control and 7th-order dense output. DOP853 steps land on burns and shadow boundaries. Either way the output step is independent of the integration step.
- **Drag:** co-rotating air, re-entry declared at 80 km. Exponential atmosphere (Vallado's table, no solar activity), or NRLMSISE-00 driven by a bundled CelesTrak table of F10.7 and 3-hour ap (measured to July 2025, predicted after), with fixed values as an override. Nothing is fetched at run time.
- **Solar radiation pressure:** cannonball model, 4.56e-6 N/m² at 1 AU scaled by 1/r², switched off in a cylindrical Earth shadow. Cr can be a constant or a time schedule.
- **Sun and Moon gravity:** point masses, Moon from the Meeus series as in ERFA `eraMoon98`, Sun from a low-precision analytic formula. Optional (`force_model.third_body`).
- **Burns:** impulsive, in LVLH (radial, along-track, cross-track) or inertial axes, applied at the exact commanded time.
- **Inputs:** Keplerian or Cartesian states, TLEs (initial state from SGP4/SDP4, then propagated with this force model), Walker and train patterns.
- **Checks:** energy residual after removing the work of drag, SRP and Sun and Moon gravity and the energy of burns, so the report shows pure numerical error. Jacobi integral for a uniform sphere.
- **Outputs:** `plan.csv` ephemeris, LTAN, altitude, beta angle, eclipse and inter-satellite range charts, each exportable as CSV.

Not modelled: tesseral harmonics, JPL-grade ephemerides, penumbra, attitude. See [accuracy and limits](docs/accuracy.md).

## Layout

```
index.html               page markup, leap-second table, loads css/ and src/main.js
css/                     base, Windows 98 controls, viewer, docs tab, narrow-screen overrides
src/main.js              entry point: runs each app module's init() in order
src/core/                physics, no DOM. Runs in the browser and in Node
  constants, math, time, earth-orientation, elements, environment, parent, sun, moon,
  interp, patterns, tle, cr-schedule, config, propagator, dop853, nrlmsise00,
  space-weather, atmosphere, plan-csv, ltan, index
src/data/                generated tables: nutation series, TDB series, land outlines, DOP853 coefficients, Moon series, NRLMSISE-00 coefficients, space weather
src/app/                 page logic: boot, presets, form, run, report, infotip, start
src/viewer/              three.js globe, Mercator map, charts, docs tab, playback loop
  docs-content.js        the Documentation tab, generated from docs/*.md (do not edit)
scripts/build.mjs        bundles everything into dist/project-wednesday.html
scripts/serve.mjs        local static server for development
src/vendor/sgp4.js       SGP4/SDP4 from satellite.js (MIT), unchanged
tests/core/              Node tests: physics against ERFA, SGP4, SciPy, NRL and independent integrators; docs examples
tools/bench_orekit.py    benchmark against Orekit (Java, via orekit-jpype); results in docs/benchmark-orekit.md
tools/gen_space_weather.py  rebuilds the space-weather table from a CelesTrak SW-All.txt (download a fresh one to update it)
tools/gen_nrlmsise00.py  regenerates the NRLMSISE-00 coefficients and their pymsis test truth
tools/gen_moon98.py      regenerates the Moon series from ERFA moon98.c and its pyerfa test truth
tools/gen_dop853.py      regenerates the DOP853 coefficient table and its SciPy test truth
tests/browser/           Playwright smoke test of both builds
tools/gen_tables.py      regenerates the ERFA-derived tables and test truth
docs/                    the documentation pages, Orekit benchmark, requirement sheets, screenshot
tools/build-docs.mjs     builds the Documentation tab and field list from docs/*.md
tools/step-table.mjs     prints the step-size table in docs/accuracy.md
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
npm run docs             # regenerates the Documentation tab and field list from docs/*.md
npm run build            # runs docs, then writes dist/project-wednesday.html
npm test                 # core tests, build, browser smoke test
```

The browser test needs Chromium for Playwright: `npx playwright install chromium`.

Edit `src/`, `css/`, `index.html` or `docs/*.md`, then run `npm run build` so the generated files and `dist/` stay in step. Commit them all. The tests fail if the generated documentation is out of date.

## Config

A run is one JSON config. Minimal example (the [config reference](docs/config-reference.md) has every field and more examples, all tested):

```json
{
  "parent": { "shape": "earth_default" },
  "start_epoch": "2026-11-11T00:00:00.000 UTC",
  "duration": "P1D",
  "integrator": { "type": "dop853", "rtol": 1e-10, "atol": 1e-6 },
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

MIT, see `LICENSE`. Land outlines from Natural Earth (public domain). three.js r128 loaded from cdnjs (MIT). SGP4/SDP4 from satellite.js 6.0.2 (MIT, see `src/vendor/sgp4.js`). NRLMSISE-00 ported from Dominik Brodowski's public-domain C version (U.S. Government work, no NRL endorsement implied). Space weather from CelesTrak (https://celestrak.org/SpaceData/). Nutation, TDB and Moon series coefficients from ERFA (BSD-style licence, derived from IAU SOFA).
