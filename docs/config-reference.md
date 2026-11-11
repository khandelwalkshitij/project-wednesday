# Config reference

A run is described by one JSON config. The JSON box in the app ("Edit config as JSON") is the source of truth, and the setup form edits it. The same config is written into every `plan.csv`, so a run can be repeated exactly. Every example on this page is a complete config: paste it into the JSON box and press Run. The test suite runs each one.

Before a run, the whole config is checked and every problem is listed by field name. Warnings (a coarse step, predicted space weather and so on) are listed too, but do not stop the run.

## Field summary

| Field | Meaning |
|---|---|
| `parent` | Required. `{"shape": "earth_default"}`, or `{"shape": "sphere_uniform", "radius_m", "density_kg_m3", "rotation": {...}}` for a uniform body. [Details](#parent) |
| `earth_orientation.dut1_s` | Optional, Earth only. UT1 minus UTC in seconds, -0.9 to 0.9. Default 0. |
| `start_epoch` | Required. `"YYYY-MM-DDThh:mm:ss.sss SCALE"`, SCALE one of UTC, TAI, TT, TDB, GPS. |
| `duration` or `end_epoch` | One of them. Seconds, or an ISO 8601 duration such as `"P1DT6H"`; or an end epoch in the start_epoch format. |
| `integrator` | Required. `{"type": "rk4", "time_step_s": 10}` (fixed step) or `{"type": "dop853", "rtol": 1e-10, "atol": 1e-6}` (adaptive; optional `max_step_s`, `initial_step_s`). [Details](#integrator) |
| `output_step_s` | Required. Spacing of rows in plan.csv, independent of the integration step. |
| `force_model` | Optional; gravity is always on. `"gravity_only"`, or an object with `drag`, `srp`, `third_body`, `atmosphere`, `space_weather`. [Details](#force_model) |
| `satellites` | Required. `count`, `mass_kg`, `cd`, `cr`, `area_m2`, `names` or `name_prefix`, and `orbits` or `pattern`. [Details](#satellites) |
| `satellites.orbits[ ]` | One per satellite: `"keplerian"`, `"cartesian"` or `"tle"`, each able to override `mass_kg`, `cd`, `cr`, `area_m2`. [Details](#orbits) |
| `satellites.pattern` | Instead of `orbits`: a Walker constellation or a train. [Details](#pattern) |
| `maneuvers[ ]` | Optional impulsive burns: `{"sat", "t_s" or "epoch", "dv_m_s": [a, b, c], "frame": "lvlh" or "inertial"}`. [Details](#maneuvers) |

## A minimal config

One satellite in a 500 km orbit around Earth for a day, with the fixed-step integrator:

```json
{
  "parent": { "shape": "earth_default" },
  "start_epoch": "2026-11-10T06:30:00.000 UTC",
  "duration": "P1D",
  "integrator": { "type": "rk4", "time_step_s": 10 },
  "output_step_s": 60,
  "satellites": {
    "count": 1,
    "mass_kg": 100,
    "orbits": [
      { "type": "keplerian", "a_m": 6878137, "e": 0.001, "i_deg": 53, "raan_deg": 0, "argp_deg": 0, "ta_deg": 0 }
    ]
  }
}
```

## parent

| Field | Type and limits | Notes |
|---|---|---|
| `shape` | `"earth_default"` or `"sphere_uniform"` | `"custom"` (a mesh body) is not available in this build. |
| `radius_m` | number > 0 | `sphere_uniform` only. |
| `density_kg_m3` | number > 0 | `sphere_uniform` only. μ = G × mass follows from radius and density. |
| `rotation.spin_period_s` | number > 0 | `sphere_uniform` only. |
| `rotation.pole_ra_deg` | number | Right ascension of the spin pole, in ICRF. |
| `rotation.pole_dec_deg` | -90 to 90 | Declination of the spin pole. |
| `rotation.prime_meridian_deg` | number | Rotation angle W of the prime meridian at the start epoch. |

`earth_default` takes no other fields. It is the WGS84 ellipsoid with J2 to J4, Earth rotation, an atmosphere and a dipole magnetic field (shown in the telemetry). `earth_orientation: {"dut1_s": ...}` sets UT1 minus UTC for Earth.

A small asteroid-like body, with a satellite 1 km from its centre:

```json
{
  "parent": {
    "shape": "sphere_uniform", "radius_m": 250, "density_kg_m3": 1900,
    "rotation": { "spin_period_s": 15480, "pole_ra_deg": 0, "pole_dec_deg": 90, "prime_meridian_deg": 0 }
  },
  "start_epoch": "2026-11-10T06:30:00.000 UTC",
  "duration": "P1D",
  "integrator": { "type": "rk4", "time_step_s": 10 },
  "output_step_s": 300,
  "satellites": {
    "count": 1,
    "mass_kg": 10,
    "names": ["PROBE"],
    "orbits": [
      { "type": "keplerian", "a_m": 1000, "e": 0, "i_deg": 30, "raan_deg": 0, "argp_deg": 0, "ta_deg": 0 }
    ]
  }
}
```

## Time

| Field | Type and limits | Notes |
|---|---|---|
| `start_epoch` | `"YYYY-MM-DDThh:mm:ss.sss SCALE"` | SCALE is UTC, TAI, TT, TDB or GPS. Years 1900 to 2200; UTC from 1972 on. A seconds value of 60 is allowed only in UTC during a leap second. |
| `duration` | number of seconds > 0, or ISO 8601 | `"P1D"`, `"PT6H"`, `"P1DT6H30M"`, `"P2W"`; decimals are allowed. |
| `end_epoch` | epoch, same format as `start_epoch` | Must be after the start. Give `duration` or `end_epoch`, not both. The run length is measured in TT, so an end epoch in TDB can fall a few microseconds short of a whole number of output steps. |
| `output_step_s` | number > 0 | Rows are written at the start and every `output_step_s` after it. A run may write at most 1,500,000 rows in total. |

A run given by start and end epochs in TT, with a UT1 correction:

```json
{
  "parent": { "shape": "earth_default" },
  "earth_orientation": { "dut1_s": 0.05 },
  "start_epoch": "2026-11-10T06:30:00.000 TT",
  "end_epoch": "2026-11-10T18:30:00.000 TT",
  "integrator": { "type": "rk4", "time_step_s": 10 },
  "output_step_s": 120,
  "satellites": {
    "count": 1,
    "mass_kg": 100,
    "orbits": [
      { "type": "keplerian", "a_m": 7078137, "e": 0.001, "i_deg": 98.2, "raan_deg": 120, "argp_deg": 0, "ta_deg": 0 }
    ]
  }
}
```

## integrator

| Field | Type and limits | Notes |
|---|---|---|
| `type` | `"rk4"` or `"dop853"` | |
| `time_step_s` | number > 0 | `rk4` only. A step above 25% of an orbit's period is rejected; above 5% gives a warning. |
| `rtol` | 1e-13 to below 1 | `dop853` only. Allowed error per step as a fraction of each value. 1e-10 is a good default; 1e-12 for reference runs. |
| `atol` | number > 0 | `dop853` only. Allowed absolute error per step, in metres for position and m/s for velocity. 1e-6 suits most runs. |
| `max_step_s` | number > 0 | `dop853`, optional. Caps the step. Default: no cap. |
| `initial_step_s` | number > 0 | `dop853`, optional. Default: chosen automatically. |

RK4 runs at most 300 million satellite-steps; DOP853 stops with an error if it would need more, or if its step becomes too small to make progress. [Accuracy and limits](accuracy.md#choosing-a-step) has a table of the error each setting gives.

A Molniya orbit with the adaptive integrator, which takes small steps at perigee and large ones at apogee:

```json
{
  "parent": { "shape": "earth_default" },
  "start_epoch": "2026-11-10T06:30:00.000 UTC",
  "duration": "P2D",
  "integrator": { "type": "dop853", "rtol": 1e-10, "atol": 1e-6, "max_step_s": 600 },
  "output_step_s": 300,
  "satellites": {
    "count": 1,
    "mass_kg": 1500,
    "names": ["MOLNIYA-1"],
    "orbits": [
      { "type": "keplerian", "a_m": 26600000, "e": 0.72, "i_deg": 63.4, "raan_deg": 40, "argp_deg": 270, "ta_deg": 0 }
    ]
  }
}
```

## force_model

Gravity is always on. Leave `force_model` out, or set it to `"gravity_only"`, for gravity alone. Every other force needs `parent.shape` `"earth_default"`.

| Field | Type | Notes |
|---|---|---|
| `drag` | true or false | Atmospheric drag below 1,500 km; re-entry is declared at 80 km. Needs an area (`satellites.area_m2` or per orbit). Cd defaults to 2.2. |
| `atmosphere` | `"exponential"` or `"nrlmsise00"` | Needs `drag: true`. Default `"exponential"`. |
| `space_weather` | `{"f107", "f107a", "ap"}` | Needs `"atmosphere": "nrlmsise00"`. Any subset: F10.7 and its 81-day mean (above 0, at most 1000), daily Ap (0 to 400). What is left out comes from the bundled table. Fixing `ap` uses the daily-Ap form of the model. |
| `srp` | true or false | Solar radiation pressure with a cylindrical shadow. Needs an area. Cr defaults to 1.8. `solar_drag` is accepted as another name. |
| `third_body` | true or false | Sun and Moon gravity. |

Drag with NRLMSISE-00 during the May 2024 storm, using the bundled space-weather table:

```json
{
  "parent": { "shape": "earth_default" },
  "start_epoch": "2024-05-10T12:00:00.000 UTC",
  "duration": "P1D",
  "integrator": { "type": "dop853", "rtol": 1e-10, "atol": 1e-6 },
  "output_step_s": 300,
  "force_model": { "drag": true, "atmosphere": "nrlmsise00" },
  "satellites": {
    "count": 1,
    "mass_kg": 100,
    "cd": 2.2,
    "area_m2": 1,
    "orbits": [
      { "type": "keplerian", "a_m": 6778137, "e": 0.0005, "i_deg": 51.6, "raan_deg": 10, "argp_deg": 0, "ta_deg": 0 }
    ]
  }
}
```

The same model with fixed solar and geomagnetic activity, and SRP with a Cr that ramps from 1.8 to 2.0 over the first day (a sail deploying, say). Cr between schedule entries is interpolated linearly and held flat outside them:

```json
{
  "parent": { "shape": "earth_default" },
  "start_epoch": "2026-11-10T06:30:00.000 UTC",
  "duration": "P2D",
  "integrator": { "type": "rk4", "time_step_s": 10 },
  "output_step_s": 300,
  "force_model": { "drag": true, "srp": true, "atmosphere": "nrlmsise00", "space_weather": { "f107": 120, "f107a": 120, "ap": 12 } },
  "satellites": {
    "count": 1,
    "mass_kg": 50,
    "cd": 2.2,
    "area_m2": 2,
    "cr": [[0, 1.8], { "epoch": "2026-11-11T06:30:00.000 UTC", "cr": 2.0 }],
    "orbits": [
      { "type": "keplerian", "a_m": 6928137, "e": 0.001, "i_deg": 97.6, "raan_deg": 80, "argp_deg": 0, "ta_deg": 0 }
    ]
  }
}
```

A geostationary satellite with Sun and Moon gravity, where they are the main perturbation:

```json
{
  "parent": { "shape": "earth_default" },
  "start_epoch": "2026-11-10T06:30:00.000 UTC",
  "duration": "P30D",
  "integrator": { "type": "dop853", "rtol": 1e-10, "atol": 1e-6 },
  "output_step_s": 3600,
  "force_model": { "third_body": true },
  "satellites": {
    "count": 1,
    "mass_kg": 3000,
    "names": ["GEO-1"],
    "orbits": [
      { "type": "keplerian", "a_m": 42164000, "e": 0.0002, "i_deg": 0.05, "raan_deg": 20, "argp_deg": 0, "ta_deg": 0 }
    ]
  }
}
```

## satellites

| Field | Type and limits | Notes |
|---|---|---|
| `count` | integer 1 to 100 | May be left out when it follows from `orbits` or a Walker pattern. |
| `mass_kg` | above 0, at most 10,000 | Shared mass. Required here or on every orbit. |
| `cd` | number > 0 | Drag coefficient. Default 2.2. |
| `cr` | number above 0, at most 3, or a schedule | Reflectivity coefficient (1 absorbs all light, 2 is a mirror). Default 1.8. A schedule is a list of `[t_s, cr]`, `{"t_s", "cr"}` or `{"epoch", "cr"}` entries. |
| `area_m2` | number > 0 | Cross-section for drag and SRP. Required when either is on. |
| `names` | list of `count` names | Unique, non-empty, without commas, quotes, #, ; or =. |
| `name_prefix` | text | Instead of `names`: satellites are called PREFIX-01, PREFIX-02 and so on. Default `"SAT"`. |
| `orbits` | list of `count` orbits | See below. |
| `pattern` | Walker or train | Instead of `orbits`. See below. |

### orbits

| Type | Fields | Notes |
|---|---|---|
| `"keplerian"` | `a_m` (> 0), `e` (0 to below 1), `i_deg` (0 to 180), `raan_deg`, `argp_deg`, `ta_deg` | Osculating elements in the parent's inertial frame at the start epoch. |
| `"cartesian"` | `r_m: [x, y, z]`, `v_m_s: [vx, vy, vz]` | Inertial position and velocity at the start epoch. |
| `"tle"` | `line1`, `line2` | Earth only. Checksums are checked. SGP4 gives the state at the start epoch; the simulator's own force model takes it from there. |

Every orbit may also give its own `mass_kg`, `cd`, `cr` and `area_m2`, overriding the shared values. A satellite may not start below the surface, or below 80 km when drag is on.

Three satellites from Keplerian elements, a state vector and a TLE, two with their own properties:

```json
{
  "parent": { "shape": "earth_default" },
  "start_epoch": "2026-10-28T00:00:00.000 UTC",
  "duration": "PT12H",
  "integrator": { "type": "rk4", "time_step_s": 10 },
  "output_step_s": 120,
  "force_model": { "drag": true },
  "satellites": {
    "count": 3,
    "mass_kg": 150,
    "area_m2": 1.5,
    "names": ["KEP-1", "STATE-1", "ISS-LIKE"],
    "orbits": [
      { "type": "keplerian", "a_m": 6928137, "e": 0, "i_deg": 53, "raan_deg": 0, "argp_deg": 0, "ta_deg": 0, "cd": 2.4 },
      { "type": "cartesian", "r_m": [6878137, 0, 0], "v_m_s": [0, 4612.5, 6038.2], "mass_kg": 80, "area_m2": 0.5 },
      { "type": "tle",
        "line1": "1 25544U 98067A   26300.50000000  .00016717  00000-0  10270-3 0  9991",
        "line2": "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.50125391 56316" }
    ]
  }
}
```

### pattern

**Walker delta** (`"type": "walker"`): `t` satellites (1 to 100) in `p` evenly spaced planes (`p` must divide `t`), phasing `f` from 0 to p - 1 (default 0), all at `a_m` and `i_deg`. Optional `e` (default 0), `raan0_deg`, `ta0_deg` and `argp_deg` (default 0). Plane k has RAAN `raan0_deg` + 360k/p; satellite j in it has true anomaly `ta0_deg` + 360j/(t/p) + 360fk/t. `count`, if given, must equal `t`.

```json
{
  "parent": { "shape": "earth_default" },
  "start_epoch": "2026-11-10T06:30:00.000 UTC",
  "duration": "PT6H",
  "integrator": { "type": "rk4", "time_step_s": 10 },
  "output_step_s": 120,
  "satellites": {
    "mass_kg": 260,
    "name_prefix": "WALKER",
    "pattern": { "type": "walker", "a_m": 6928137, "i_deg": 53, "t": 24, "p": 3, "f": 1 }
  }
}
```

**Train** (`"type": "train"`): `count` satellites in one base orbit (Keplerian fields), each offset from the one before by exactly one of `raan_deg`, `ta_deg` or `along_track_m` (an arc length along the orbit, converted to true anomaly at the base orbit's semi-major axis).

```json
{
  "parent": { "shape": "earth_default" },
  "start_epoch": "2026-11-10T06:30:00.000 UTC",
  "duration": "PT6H",
  "integrator": { "type": "rk4", "time_step_s": 10 },
  "output_step_s": 60,
  "satellites": {
    "count": 4,
    "mass_kg": 100,
    "name_prefix": "TRAIN",
    "pattern": {
      "type": "train",
      "base": { "a_m": 6878137, "e": 0.001, "i_deg": 97.4, "raan_deg": 30, "argp_deg": 0, "ta_deg": 0 },
      "offset": { "along_track_m": 50000 }
    }
  }
}
```

## maneuvers

A list of impulsive burns, each applied at its exact time.

| Field | Type and limits | Notes |
|---|---|---|
| `sat` | a satellite name | |
| `t_s` or `epoch` | seconds after the start (0 or more), or an epoch | One of them. The burn must fall inside the run. |
| `dv_m_s` | three numbers, m/s | For `"lvlh"`: radial, along-track, cross-track. For `"inertial"`: x, y, z in the inertial frame. |
| `frame` | `"lvlh"` or `"inertial"` | Default `"lvlh"`. |

Two satellites in a train; one raises its orbit with two along-track burns, then makes a small inertial correction:

```json
{
  "parent": { "shape": "earth_default" },
  "start_epoch": "2026-11-10T06:30:00.000 UTC",
  "duration": "P1D",
  "integrator": { "type": "rk4", "time_step_s": 10 },
  "output_step_s": 60,
  "satellites": {
    "count": 2,
    "mass_kg": 100,
    "names": ["CHASER", "TARGET"],
    "pattern": {
      "type": "train",
      "base": { "a_m": 6778137, "e": 0, "i_deg": 51.6, "raan_deg": 0, "argp_deg": 0, "ta_deg": 0 },
      "offset": { "ta_deg": 2 }
    }
  },
  "maneuvers": [
    { "sat": "CHASER", "t_s": 3600, "dv_m_s": [0, 1.5, 0] },
    { "sat": "CHASER", "epoch": "2026-11-10T08:15:00.000 UTC", "dv_m_s": [0, 1.5, 0], "frame": "lvlh" },
    { "sat": "CHASER", "t_s": 43200, "dv_m_s": [0.1, -0.2, 0.05], "frame": "inertial" }
  ]
}
```

## Warnings

These do not stop a run:

- **Coarse step:** an RK4 step above 5% of an orbit's period.
- **High eccentricity:** e above 0.85 with RK4, where a small step is needed at periapsis.
- **Near-equatorial orbit:** inclination within 0.05° of the equator, where the ascending node and LTAN are undefined.
- **Space weather:** with NRLMSISE-00, when any part of the run uses CelesTrak's predictions or the defaults rather than measured values.

## plan.csv reference

Every run writes `plan.csv`: comment lines starting with `#`, a column header, then one row per satellite per output time. The app can open a saved `plan.csv` again ("Open plan.csv"), and reruns its config from the `# config:` line.

### Header lines

| Line | Content |
|---|---|
| `# sim_version:` | The simulator version that wrote the file. |
| `# inertial_frame:` | `GCRF (ICRF axes)` for Earth; `ICRF axes` for a sphere. The centre is the parent's centre of mass. |
| `# body_fixed_frame:` | How the body-fixed frame is defined (for Earth: ITRF via IAU 2006/2000B and the Earth rotation angle, no polar motion). |
| `# integrator:` | `rk4; time_step_s=...`, or `dop853; rtol=...; atol=...; accepted_steps; rejected_steps; shadow_events; step_s_min; step_s_max`. |
| `# force_model:` | Every force in use, with its model (atmosphere, space-weather source, shadow, ephemerides). |
| `# parent_pole_ra_deg:`, `# parent_pole_dec_deg:` | The parent's pole at the start epoch. |
| `# data_file:` | One line per data set used: `name; version; crc32; source`. Always the leap-second table and the built-in models; also the NRLMSISE-00 coefficients, the space-weather table and the Moon series when those are used. |
| `# config:` | The full config, as one line of JSON. |
| `# column:` | Name, unit and frame of each column. |
| `# report:` | One line per satellite; keys below. |
| `# impact:` | One line per satellite that hit the surface or re-entered; keys below. |

### Columns

| Column | Unit | Meaning |
|---|---|---|
| `sat_name` | | Satellite name. |
| `epoch_utc` | ISO 8601, UTC | Time of the row. |
| `t_s` | s | Seconds since the start epoch. |
| `x_m`, `y_m`, `z_m` | m | Position in the inertial frame. |
| `vx_m_s`, `vy_m_s`, `vz_m_s` | m/s | Velocity in the inertial frame. |
| `parent_rot_deg` | deg | Prime meridian angle W of the parent: how far it has turned about its pole. |
| `in_shadow` | | 1 in Earth's cylindrical shadow, 0 sunlit, blank when no Sun is modelled (sphere parents). |

A satellite that hits the surface or re-enters has no rows after that time.

### Report keys

| Key | Meaning |
|---|---|
| `energy_rel_drift` | Largest relative change in orbital energy over the run, after removing the work of drag, SRP and Sun and Moon gravity and the energy of burns: numerical error alone. |
| `jacobi_rel_drift` | The same for the Jacobi integral (sphere parents). |
| `period_s`, `perigee_alt_m`, `apogee_alt_m` | Of the osculating orbit at the start epoch; altitudes above the equatorial radius. |
| `drag_work_j_per_kg` | Work done by drag, when drag is the only extra force. |
| `nongrav_work_j_per_kg` | Work done by drag and SRP, when SRP is on (without Sun and Moon gravity). |
| `perturbation_work_j_per_kg` | Work done by all extra forces, when Sun and Moon gravity is on. |
| `burns`, `dv_total_m_s` | Number of burns and their total delta-v. |
| `ltan_start`, `ltan_end`, `ltan_drift_min_per_day` | LTAN at the start and end, and its drift rate (Earth). |

Impact lines have `sat`, `kind` (`reentry` with drag, `impact` without), `epoch_utc`, `t_s`, `body_fixed_m` (x y z), `lat_deg` and `lon_deg`.
