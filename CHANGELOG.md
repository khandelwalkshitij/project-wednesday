# Changelog

## 0.4.0

- Validated against Orekit on every example config plus two SRP cases. Table in the README, scripts in `validation/`.
- Fixed: a burn landing exactly on an integration step boundary showed the pre-burn state in that row, while off-grid burns showed post-burn. Both now show post-burn. Found by the Orekit comparison.
- Documentation: `docs/config-reference.md` (every config field, with complete examples, and the plan.csv format), `docs/models.md`, `docs/accuracy.md` (validation numbers and a step-size table from `tools/step-table.mjs`) and `docs/glossary.md`. The app's Documentation tab and the field list under the JSON box are generated from them (`npm run docs`, `tools/build-docs.mjs`). A test runs every JSON example in the docs and README and checks that the generated files are current, that links resolve and that every config field is documented. The form links to Accuracy and limits from the integrator settings.
- Requirement sheets: every row now has a status. plan.csv now starts `# plan.csv written by Project Wednesday`.
- Benchmark against Orekit (`tools/bench_orekit.py`, results in `docs/benchmark-orekit.md`).
- NRLMSISE-00 atmosphere (SIM_061): `force_model.atmosphere: "nrlmsise00"` with drag. Ported from Dominik Brodowski's public-domain C version; matches NRL's Fortran (via pymsis) to 8e-5 in total density over 120 cases. Space weather from a bundled CelesTrak SW-All table (`tools/gen_space_weather.py`): measured F10.7 and 3-hour ap to 2025-07-20, then CelesTrak predictions, then defaults, with warnings; `force_model.space_weather` fixes any of F10.7, F10.7A, Ap. No network access. Adaptive steps stop at 3-hour space-weather boundaries. plan.csv lists the model, table version and checksums (SIM_062). Form: atmosphere selector and fixed-value fields; telemetry shows MSIS density. The page grows to about 700 KB for the table.
- Sun and Moon gravity (SIM_026): `force_model.third_body: true`, as point masses with the indirect term. Moon from the Meeus series as tabulated in ERFA `moon98.c` (`tools/gen_moon98.py`), matching `erfa.moon98` to 1 mm. GM values from DE440. Checked against a short-arc analytic result and the classic GEO inclination drift (0.95°/yr in 2026). With it on, plan.csv reports `perturbation_work_j_per_kg` in place of the drag or SRP work. Not JPL-grade, so SIM_059 is not met. Setup form has a checkbox.
- Adaptive integrator (SIM_017): `{"type": "dop853", "rtol": 1e-10, "atol": 1e-6}`, with optional `max_step_s` and `initial_step_s`. Dormand-Prince 8(5,3) with SciPy's step control and 7th-order dense output for the rows. Coefficients generated from SciPy by `tools/gen_dop853.py`. Steps land exactly on burns, and with SRP on, on every shadow entry and exit, with the lit/shadow state held fixed within a step, so runs keep converging as rtol is tightened. A day in LEO at rtol 1e-10 takes about 450 steps (RK4 at 10 s: 8,640), and its 1e-10 and 1e-12 runs agree to 4 mm. plan.csv now has an `# integrator:` header line for both integrators. The setup form has an integrator selector.
- TLE orbits use real SGP4/SDP4 for the state at start_epoch, ported from satellite.js 6.0.2 (MIT) into `src/vendor/sgp4.js`, with no runtime dependency. Matches SGP4 with ERFA to under 1 m, where the old J2 approximation was 8 to 56 km out. Tests include Vallado's verification vectors.

## 0.3.0

- Solar radiation pressure (cannonball model) with Earth shadow. Cr as a constant or a schedule. `force_model.srp`, with `solar_drag` accepted as another name.
- SRP pressure now scales with the Earth-Sun distance (1/r²). Before, it was fixed at the 1 AU value, about 3% off at perihelion and aphelion.
- With SRP on, plan.csv reports `nongrav_work_j_per_kg` (drag plus SRP). `drag_work_j_per_kg` only appears when drag is the only extra force, so the label matches what was summed.
- Mass per satellite: `satellites.mass_kg` is optional if every satellite gives its own.
- Warnings: coarse time step (above 5% of the period, error above 25%), high eccentricity, near-equatorial orbits where LTAN is undefined.
- Documentation tab, ? tooltips on every group, Reset button, project renamed to Project Wednesday.
- Group-box legends no longer have the border line running through them.
- Docs fixes: IAU 2000B has 77 terms, not 106. Only `cr` takes a schedule, not `cd`. The Walker example had 648 satellites, over the 100 limit. The Cr schedule example had comments, which are not valid JSON. Subscripts render properly.
- Code split from one HTML file into ES modules, with a build that still produces a single standalone file.

## 0.2.0

Drag, burns, Walker and train patterns, TLE import, beta angle and eclipses, orbit summary, LTAN, altitude, beta, eclipse and range charts with CSV export, trail control, setup form.
