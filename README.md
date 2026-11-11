# Project Wednesday

A browser orbital simulator. Set up satellites around Earth or a small body, propagate them, and play the result back on a 3D globe, a Mercator ground-track map and drift charts. Everything runs in the page. No server, no build needed to use it.

**Use it:** open `dist/project-wednesday.html` in a browser (works straight from disk), or host `index.html` and its folders on any static host such as GitHub Pages.

## What it models

- **Gravity:** WGS84 Earth with J2, J3, J4 zonals, or a uniform sphere (asteroid, moon) with its own spin pole.
- **Earth orientation:** GCRF to ITRF with IAU 2006 precession, IAU 2000B nutation (77 terms) and the Earth rotation angle. Checked against ERFA. Polar motion not applied.
- **Time:** UTC, TAI, TT, TDB, GPS, with the IERS leap-second table kept as data in `index.html`.
- **Integrator:** fixed-step RK4. Output rows are Hermite-interpolated, so the output step is independent of the integration step.
- **Drag:** exponential atmosphere (Vallado's table), co-rotating air, re-entry declared at 80 km. No solar activity.
- **Solar radiation pressure:** cannonball model, 4.56e-6 N/m² at 1 AU scaled by 1/r², switched off in a cylindrical Earth shadow. Cr can be a constant or a time schedule.
- **Burns:** impulsive, in LVLH (radial, along-track, cross-track) or inertial axes, applied at the exact commanded time.
- **Inputs:** Keplerian or Cartesian states, TLEs (approximate: mean elements treated as osculating), Walker and train patterns.
- **Checks:** energy residual after removing drag work, SRP work and burn energy, so the report shows pure numerical error. Jacobi integral for a uniform sphere.
- **Outputs:** `plan.csv` ephemeris, LTAN, altitude, beta angle, eclipse and inter-satellite range charts, each exportable as CSV.

Not modelled: tesseral harmonics, Sun and Moon gravity, penumbra, attitude, adaptive integrators. See `docs/` for the full requirement list and status.

## Layout

```
index.html               page markup, leap-second table, loads css/ and src/main.js
css/                     base, Windows 98 controls, viewer, docs tab, narrow-screen overrides
src/main.js              entry point: runs each app module's init() in order
src/core/                physics, no DOM. Runs in the browser and in Node
  constants, math, time, earth-orientation, elements, environment, parent, sun,
  interp, patterns, tle, cr-schedule, config, propagator, plan-csv, ltan, index
src/data/                generated tables: nutation series, TDB series, land outlines
src/app/                 page logic: boot, presets, form, run, report, infotip, start
src/viewer/              three.js globe, Mercator map, charts, docs tab, playback loop
scripts/build.mjs        bundles everything into dist/project-wednesday.html
scripts/serve.mjs        local static server for development
tests/core/              Node tests for the physics (ERFA, SGP4 and independent-integrator checks)
tests/browser/           Playwright smoke test of both builds
tools/gen_tables.py      regenerates the ERFA-derived tables and test truth
validation/              Orekit comparison: export script, comparison script, results
docs/                    requirement sheets (baseline and additional)
```

How the pieces talk:

- `src/core/index.js` exports `SimCore`, the only API the page and tests use.
- `normalizeConfig` in `core/config.js` is the single place that validates input and produces warnings.
- The JSON config box is the source of truth. The setup form edits it.
- Viewer modules share mutable state through `src/viewer/state.js` (`V.plan`, `V.simT`, `V.selected` and so on). Everything else is passed by ES module imports.
- Each module with start-up work exports `init()`. `src/main.js` and `viewer/index.js` call them in a fixed order.

## Validation against Orekit

Every example config in the Trial menu, plus the Reset config and two extra SRP cases, was propagated with [Orekit](https://www.orekit.org/) 13 and compared with this simulator, row by row in GCRF.

Orekit was set up to use the same physics, so differences show implementation and numerical error, not model choice:

- Gravity: Holmes-Featherstone with only J2, J3, J4 (same values), pole from IERS 2010 precession-nutation, no polar motion.
- Drag: Orekit's drag force with the same density table, air co-rotating with the Earth.
- Burns: impulses in the same radial, along-track, cross-track frame.
- SRP: Orekit's own model, which is more detailed than ours: Sun from JPL DE421, conical shadow with penumbra, oblate Earth. These rows measure model difference.
- Integrator: Dormand-Prince 8(5,3) with tight tolerances. Loosening them 10x moves the reference by at most 8 cm in the SRP and drag cases, and 2 mm or less in the rest.
- Leap seconds from ERFA, independent of the table in this repo.

Results, 2026-11-11, simulator v0.3.0. Errors are the largest 3D difference over all output rows:

<!-- validation-table:start -->
| Case | Satellite | Span | Step | Forces | Max position error | Final position error | Max velocity error | Max error at half step |
|---|---|---|---|---|---|---|---|---|
| Reset (New Trial) | SAT-01 | 1 d | 10 s | J2-J4 | 44.4 cm | 44.4 cm | 0.49 mm/s | 20 mm |
| Earth: LTAN drift, sun-synchronous vs 53 deg | SSO 10:30 | 5 d | 10 s | J2-J4 | 6.18 m | 6.18 m | 6.8 mm/s | 22.7 cm |
| Earth: LTAN drift, sun-synchronous vs 53 deg | Inclined 53 | 5 d | 10 s | J2-J4 | 6.21 m | 6.21 m | 6.8 mm/s | 22.5 cm |
| Earth: one satellite in low orbit | LEO-550 | 6 h | 10 s | J2-J4 | 69 mm | 69 mm | 0.073 mm/s | 4 mm |
| Earth: Walker constellation, 12 satellites in 3 planes | 12 satellites (worst: SAT-03) | 4 h | 10 s | J2-J4 | 40 mm | 40 mm | 0.043 mm/s | 3 mm |
| Earth: low orbit, Molniya and geostationary | LEO state vector | 1 d | 10 s | J2-J4 | 49.3 cm | 49.3 cm | 0.56 mm/s | 24 mm |
| Earth: low orbit, Molniya and geostationary | Molniya | 1 d | 10 s | J2-J4 | 60 mm | 60 mm | 0.018 mm/s | 4 mm |
| Earth: low orbit, Molniya and geostationary | GEO | 1 d | 10 s | J2-J4 | < 1 mm | < 1 mm | < 0.001 mm/s | < 1 mm |
| Small body: two orbiters and an impact | orbiter | 1 d | 20 s | point mass | < 1 mm | < 1 mm | < 0.001 mm/s | < 1 mm |
| Small body: two orbiters and an impact | polar | 1 d | 20 s | point mass | < 1 mm | < 1 mm | < 0.001 mm/s | < 1 mm |
| Small body: two orbiters and an impact | impactor | 3.1 h (to impact) | 20 s | point mass | < 1 mm | < 1 mm | < 0.001 mm/s | < 1 mm |
| Earth: drag decay and re-boost burns | Decaying 300 | 3 d | 10 s | J2-J4 + drag | 8.39 m | 8.39 m | 9.7 mm/s | 33.4 cm |
| Earth: drag decay and re-boost burns | Boosted 300 | 3 d | 10 s | J2-J4 + drag + burns | 5.21 m | 5.21 m | 6 mm/s | 23.1 cm |
| Earth: drag decay and re-boost burns | High 550 | 3 d | 10 s | J2-J4 + drag | 2.50 m | 2.50 m | 2.7 mm/s | 99 mm |
| Validation: SRP, 700 km sun-synchronous, A/m = 0.1 | SRP-LEO | 2 d | 10 s | J2-J4 + SRP | 2.94 m | 1.86 m | 2.7 mm/s | 2.43 m |
| Validation: SRP, geostationary, A/m = 0.1 | SRP-GEO | 3 d | 60 s | J2-J4 + SRP | 2.23 m | 2.22 m | 0.11 mm/s | 2.23 m |
<!-- validation-table:end -->

How to read it:

- **Keplerian to Cartesian conversion** matches Orekit to under 1 mm for all 26 satellites with element input.
- **Small-body and GEO cases** agree to under 1 mm.
- **Gravity, drag and burn cases** are limited by the fixed-step RK4. Halving the step cuts the error 13 to 27 times, close to the 16 times a 4th-order method should give. So the physics is implemented right and the error is the step size. Rough guide for LEO at the default 10 s step: under 0.5 m after a day, about 6 m after 5 days. At 5 s, about 25 cm after 5 days.
- **SRP cases** don't improve with a smaller step, so the 2 to 3 m is model difference, not numerical error. Both cases use A/m = 0.1 m²/kg, about 10 times a typical satellite, so a normal satellite would see roughly a tenth of this.
  - GEO: about 1.5 m comes from the low-precision Sun position (0.01°). With Orekit fed the same Sun formula, the error drops to 0.7 m. The rest is because we take the Sun direction from Earth's centre, not from the satellite.
  - LEO: almost all of it comes from the shadow model. We use a cylinder with a hard edge. Orekit has a penumbra and an oblate Earth.
- This checks that the code does what the models say. It does not check that the models match reality. The density table ignores solar activity, and there is no Sun or Moon gravity. Against real tracking data, those dominate.

To re-run (needs Java 11+ and Python):

```
pip install orekit-jpype pyerfa jplephem de421 numpy
node validation/export-runs.mjs
python3 validation/compare_orekit.py      # rewrites the table above, validation/results.json and validation/table.md
```

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

MIT, see `LICENSE`. Land outlines from Natural Earth (public domain). three.js r128 loaded from cdnjs (MIT). Nutation and TDB coefficients from ERFA (BSD-style licence, derived from IAU SOFA).
