# Changelog

## Unreleased

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
