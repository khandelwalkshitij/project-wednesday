# Accuracy and limits

How far the results can be trusted, and how to choose an integration step. The numbers come from the test suite (`npm test`) and from a benchmark against Orekit, an independent flight-dynamics library ([full results](benchmark-orekit.md)).

Two kinds of error matter. **Numerical error** is how far the integrator is from the exact solution of the simulator's own equations; the step setting controls it, and the table below shows how much. **Model error** is how far those equations are from the real world: an exponential atmosphere instead of the real one, no tesseral gravity and so on. For anything below 1,000 km, model error is usually far larger, especially drag.

## What was checked

| Part | Checked against | Agreement |
|---|---|---|
| J2-J4 gravity and integrators | Orekit, 1 to 3 days in LEO, SSO and Molniya orbits | 0.6 to 2.6 mm with DOP853 at rtol 1e-12 |
| DOP853 integrator | SciPy's DOP853 (same step count), an analytic Kepler orbit | 0.2 mm after 10 orbits |
| SGP4/SDP4 for TLEs | Vallado's verification vectors; Orekit | 0.1 mm (vectors); 0.03 mm in TEME (Orekit) |
| TLE to inertial state | SGP4 with ERFA's TEME to GCRF | under 0.1 m. Orekit's TEME definition differs by up to 10 m in GCRF. |
| NRLMSISE-00 density | NRL's original Fortran; Orekit with the same space weather | 8e-5 relative; 1.3e-5 relative |
| Drag runs (NRLMSISE-00, 400 km, 1 day) | Orekit | 5 mm on a quiet day, 0.2 m on the May 2024 storm day |
| Sun and Moon gravity | Orekit (30 days in GEO); the textbook GEO tilt rate | 1.2 cm; 0.95° a year in 2026 |
| Moon position | ERFA `eraMoon98` | under 1 mm (the model itself is good to about 6 km) |
| Earth orientation | ERFA's full IAU 2006/2000A (`c2t06a`) | 7.5 mm at the surface |
| Time scales (UTC, TAI, TT, TDB, GPS) | ERFA | 0.12 µs |
| Energy bookkeeping | every run reports it | relative energy drift typically 1e-9 or less |

## Choosing a step

Position error after one day, against DOP853 at rtol 1e-13 (which matches Orekit to millimetres). Produced by `node tools/step-table.mjs`.

| Orbit, 1 day | RK4 1 s | RK4 5 s | RK4 10 s | RK4 30 s | RK4 60 s | RK4 120 s | DOP853 1e-8 | DOP853 1e-10 | DOP853 1e-12 |
|---|---|---|---|---|---|---|---|---|---|
| LEO 400 km | < 1 mm | 2.4 cm | 51 cm | 82 m | 2.3 km | 68 km | 1.9 m (250 steps) | 0.44 cm (447 steps) | < 1 mm (798 steps) |
| LEO 400 km, drag + SRP | 1.1 cm | 4.1 cm | 59 cm | 86 m | 2.4 km | 69 km | 1.7 m (269 steps) | 1.9 cm (487 steps) | 0.15 cm (836 steps) |
| SSO 800 km | < 1 mm | 1.5 cm | 32 cm | 49 m | 1.4 km | 40 km | 1.7 m (230 steps) | 0.44 cm (411 steps) | < 1 mm (734 steps) |
| Molniya (e = 0.72) | < 1 mm | 3.2 cm | 53 cm | 50 m | 950 m | 20 km | 21 m (58 steps) | 49 cm (92 steps) | 0.32 cm (154 steps) |
| GEO | < 1 mm | < 1 mm | < 1 mm | < 1 mm | 0.24 cm | 3.8 cm | 84 cm (21 steps) | 0.83 cm (34 steps) | < 1 mm (56 steps) |

RK4 at 1 day takes 86,400 / step steps, so 8,640 at 10 s. Errors grow roughly in proportion to run length, mostly along the track.

- **For most runs, use DOP853 at rtol 1e-10, atol 1e-6.** Centimetres a day or better in LEO, in a few hundred steps.
- **For reference runs or comparisons, use rtol 1e-12.**
- **With RK4,** 10 s is fine for LEO pictures and charts (tens of centimetres a day). Use 1 to 5 s for precise work. For eccentric orbits the step must suit perigee, not the average: the Molniya row shows this. GEO is forgiving even at 60 s.
- **With drag and SRP, RK4 cannot do better than about 1 cm a day** in LEO however small the step, because the shadow boundary and space-weather changes fall inside its steps. DOP853 lands on them and keeps converging.

## Limits

- **Gravity:** zonal terms J2 to J4 only. Tesseral harmonics are left out; in LEO they cause metres to tens of metres of difference over a day.
- **Atmosphere:** the exponential table has no solar activity, so drag can be off by a factor of several. NRLMSISE-00 follows solar activity, but empirical models typically have 10 to 20% density errors, more in storms. The bundled space-weather table is measured to 20 July 2025; after that it uses CelesTrak's predictions (Ap = 15 where none is predicted), and the run warns.
- **Sun and Moon positions:** analytic, not JPL DE440. The Moon is good to about 6 km and the Sun to about 30 arcseconds (10,000 km). That is plenty for their gravity and for SRP, but not where precise Sun or Moon positions themselves matter.
- **Shadow:** a cylinder with no penumbra, so eclipse entry and exit times are off by up to several seconds.
- **Earth orientation:** no polar motion (about 10 m at the surface), and UT1 is UTC plus a fixed `dut1_s`. UT1 - UTC is always within 0.9 s, which is up to about 400 m of ground position at the equator if left at 0. Inertial positions, and the orbit itself, are hardly affected; ground tracks and longitudes are.
- **TLEs:** SGP4 sets the starting state; the simulator's own forces carry it from there, so the trajectory drifts from what SGP4 would predict. Measured after one day: 0.25 to 12 km for LEO TLEs, about 170 km for a Molniya TLE (SDP4 includes lunisolar and resonance terms that a short run here does not reproduce from a single state). TLEs themselves are typically good to about a kilometre at their epoch.
- **Re-entry:** a satellite is stopped at 80 km. Below that neither the models nor a point mass are meaningful.
- **Burns** are instantaneous. Long burns lose a little efficiency in reality that is not modelled.
- **Not modelled:** attitude, solar panels or any shape beyond a single area, gravity between satellites, mesh-shaped bodies, relativity, Earth tides.
- **Size:** up to 100 satellites and 1,500,000 output rows per run.
