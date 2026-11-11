# Project Wednesday

Project Wednesday is a simple orbital simulator that can model satellite orbits. Enjoy.

This page describes what the simulator models. The other pages are the [config reference](config-reference.md) (every config field and every `plan.csv` line), [accuracy and limits](accuracy.md) (how good the results are and how to choose a step size) and the [glossary](glossary.md).

## Frames and time

- **Earth (`earth_default`).** The inertial frame is the GCRF: Earth-centred, with ICRF axes. The body-fixed frame is the ITRF, reached with IAU 2006 precession, IAU 2000B nutation (the 77 luni-solar terms of `NUT00B`) and the Earth rotation angle, with UT1 = UTC + `earth_orientation.dut1_s`. Polar motion is not applied.
- **Uniform sphere (`sphere_uniform`).** The inertial frame has ICRF axes centred on the body. The body spins at a fixed rate about a pole given by its right ascension and declination, with the prime meridian angle given at the start epoch (IAU convention).
- **Time.** The integrator runs in TT seconds from J2000. Epochs can be given in UTC, TAI, TT, TDB or GPS. UTC uses the IERS leap-second table kept as data in `index.html`: TT = UTC + ΔAT + 32.184 s.

## Integrators

- **RK4** (`"type": "rk4"`): the classic fixed-step 4th-order Runge-Kutta method. All satellites step together. Output rows between steps come from cubic Hermite interpolation.
- **DOP853** (`"type": "dop853"`): the Dormand-Prince 8(5,3) method with adaptive step size. Each step is sized so its estimated error stays within `rtol` × |value| + `atol`, and output rows come from its 7th-order dense output. Each satellite gets its own steps. Steps land exactly on burn times, and, when they apply, on every shadow entry and exit and every 3-hour space-weather change, so a sudden change in force never falls inside a step.

Either way the output step is independent of the integration step. See [accuracy and limits](accuracy.md#choosing-a-step) for how to choose.

## Forces

The acceleration is the sum of the terms that are switched on:

<p style="text-align: center;"><span class="math"><b>a</b> = <b>a</b><sub>grav</sub> + <b>a</b><sub>drag</sub> + <b>a</b><sub>srp</sub> + <b>a</b><sub>3b</sub></span></p>

### Gravity

For Earth, the WGS84 ellipsoid with the zonal harmonics J2, J3 and J4 (EGM96 values), about the true pole of date. For a uniform sphere, point-mass gravity μ/r². Tesseral harmonics (the east-west lumps in Earth's field) are not modelled.

### Atmospheric drag

Active when `force_model.drag` is true and the satellite is below 1,500 km:

<p style="text-align: center;"><span class="math"><b>a</b><sub>drag</sub> = -½ C<sub>d</sub> (A/m) ρ v<sub>rel</sub> <b>v</b><sub>rel</sub></span></p>

where **v**<sub>rel</sub> is the velocity relative to air that rotates with the Earth. A satellite that falls to 80 km is declared re-entered. The density ρ comes from one of two models (`force_model.atmosphere`):

- **Exponential** (the default): Vallado's piecewise-exponential table (US Standard Atmosphere 1976 up to 25 km, CIRA-72 above). A fixed, moderate-activity profile with no solar activity, so real decay rates can differ by a factor of several.
- **NRLMSISE-00** (`"nrlmsise00"`): the NRL empirical model (Picone et al. 2002), which varies with latitude, local time, season, solar flux and geomagnetic activity. Drag at 400 km is about ten times stronger at solar maximum than at minimum, and doubles again in a major storm. Inputs are the previous day's observed F10.7, its 81-day centred mean and the 3-hour ap history, from a CelesTrak space-weather table bundled with the page. The table holds measured values to 20 July 2025, then CelesTrak's daily and monthly predictions. Monthly predictions have no Ap, so Ap = 15 is used there, and beyond October 2041 F10.7 = 150 and Ap = 15. The setup warnings say when predicted or default values are used, and `force_model.space_weather` replaces any of them with your own. Nothing is fetched from the network.

### Solar radiation pressure

Active when `force_model.srp` is true. The cannonball model, pushing directly away from the Sun:

<p style="text-align: center;"><span class="math"><b>a</b><sub>srp</sub> = -P<sub>srp</sub> (1 AU / r<sub>☉</sub>)<sup>2</sup> C<sub>r</sub> (A/m) <b>û</b><sub>☉</sub></span></p>

with P<sub>srp</sub> = 4.56 × 10<sup>-6</sup> N/m² at 1 AU, scaled by the Earth-Sun distance r<sub>☉</sub> (about ±3.4% over a year). It is switched off inside a cylindrical Earth shadow, with no penumbra. C<sub>r</sub> can follow a schedule. `"solar_drag"` is accepted as another name for `"srp"`, though SRP is radiation pressure, not drag.

### Sun and Moon gravity

Active when `force_model.third_body` is true. The Sun and Moon act as point masses. The simulation's origin is the Earth's centre, which they also accelerate, so the force on the satellite is their direct pull minus their pull on the Earth:

<p style="text-align: center;"><span class="math"><b>a</b><sub>3b</sub> = Σ GM<sub>b</sub> [ (<b>r</b><sub>b</sub> - <b>r</b>) / |<b>r</b><sub>b</sub> - <b>r</b>|<sup>3</sup> - <b>r</b><sub>b</sub> / |<b>r</b><sub>b</sub>|<sup>3</sup> ]</span></p>

GM values are from JPL DE440. The Moon's position comes from the Meeus series as implemented in ERFA `eraMoon98` (about 3" RMS, 6 km). The Sun's comes from the same low-precision formula used for SRP and shadows (about 30", 10,000 km), which is ample for a perturbation this size. In LEO the effect is tens to hundreds of metres a day. In GEO it is the main perturbation, tilting the orbit by roughly 0.75 to 0.95° a year.

## Inputs

Initial orbits can be osculating Keplerian elements, an inertial position and velocity, or a two-line element set (TLE). A TLE is propagated to the start epoch with SGP4 (SDP4 for periods of 225 minutes or more), converted from TEME to GCRF, and from then on the simulator's own force model takes over, so the orbit drifts away from what SGP4 would predict. Constellations can be generated as a Walker pattern or a train. Burns are impulsive, in LVLH axes (radial, along-track, cross-track) or inertial axes.

## Run report and checks

| Metric | Meaning |
|---|---|
| Energy drift | The specific orbital energy is checked at every step. The work done by drag, SRP and Sun and Moon gravity, and the energy added by burns, are tracked and removed, so what is left is numerical error alone (typically below 10<sup>-8</sup>). For a uniform sphere the Jacobi integral is checked too. |
| Period, perigee, apogee | From the osculating orbit at the start epoch. Altitudes are above the equatorial radius. |
| LTAN | Local time of the ascending node: the mean local solar time when the satellite crosses the equator going north, with the node measured on the true equator of date. The drift rate is a least-squares line through the samples, and needs at least 3 orbits and 12 hours. |
| Beta angle | The angle between the Sun direction and the orbit plane. |
| Burns, Δv | Number of burns and total delta-v per satellite. |

## Source, licence and attribution

The source code is on GitHub at [github.com/khandelwalkshitij/project-wednesday](https://github.com/khandelwalkshitij/project-wednesday). Report bugs or request features through the [issue tracker](https://github.com/khandelwalkshitij/project-wednesday/issues). The [changelog](https://github.com/khandelwalkshitij/project-wednesday/blob/main/CHANGELOG.md) lists what changed in each version.

**Project Wednesday** is open-source software released under the [MIT License](https://opensource.org/licenses/MIT). The software is provided "as is", without warranty of any kind.

- **Standards:** IAU 2006/2000B precession-nutation, the IERS Bulletin C leap-second table, WGS84 and EGM96 zonal coefficients.
- **SGP4/SDP4:** from [satellite.js](https://github.com/shashwatak/satellite-js) 6.0.2 (MIT), a port of Vallado's reference code.
- **Atmosphere and space weather:** NRLMSISE-00 (Picone, Hedin, Drob and Aikin 2002), ported from the public-domain C version by Dominik Brodowski. A U.S. Government work not subject to copyright; no endorsement by the Naval Research Laboratory is implied. Space weather from [CelesTrak](https://celestrak.org/SpaceData/).
- **Moon ephemeris, nutation and TDB series:** coefficients from [ERFA](https://github.com/liberfa/erfa) (BSD-style licence, derived from IAU SOFA).
- **Map:** continental outlines from [Natural Earth](https://www.naturalearthdata.com/) (public domain).
- **Graphics:** [three.js](https://threejs.org/) (MIT).
