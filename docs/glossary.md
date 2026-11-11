# Glossary

Plain-language explanations of the terms used in the app and these pages. Most come from the requirement sheets in `docs/`.

| Term | Meaning |
|---|---|
| Along-track | The direction of travel along the orbit. |
| Ap | Geomagnetic activity index for a day; ap is the same for a 3-hour slot. Higher means a more disturbed, hotter upper atmosphere and more drag. |
| Apogee, perigee | The highest and lowest points of an orbit. Altitudes here are above the equatorial radius. |
| Argument of periapsis | Where in its orbit the satellite is lowest, measured from the ascending node. |
| atol, rtol | The error the adaptive integrator allows per step: absolute (metres or m/s) and relative (a fraction of the value). |
| Beta angle | The angle between the Sun and the orbit plane. It sets eclipse length and thermal and power loads. |
| Body-fixed | Coordinates that rotate with the parent body, like latitude and longitude on Earth. |
| Burn, delta-v (Δv) | A change in velocity from a thruster. Impulsive means treated as instant, a good approximation for short burns. |
| Cd | Drag coefficient, about 2.2 for satellites. |
| CelesTrak | A public source of orbital and space-weather data. The bundled space-weather table comes from its SW-All file. |
| Cr | Reflectivity coefficient for solar radiation pressure: 1 absorbs all light, 2 is a mirror. |
| Cross-track | Sideways, out of the orbit plane. |
| Cylindrical shadow | Earth's shadow treated as a straight tube, fully on or off. The real shadow is a cone with a partial-shadow edge (penumbra) lasting a few seconds at entry and exit. |
| Dense output | A smooth curve an integrator provides between its steps, so output rows can fall anywhere without extra steps. |
| Differential drag | Two satellites feeling different drag, so they slowly drift apart. Also usable on purpose to steer formations without fuel. |
| DOP853 | A high-accuracy integrator (Dormand-Prince 8th order) that picks its own step size. |
| Drag | Air resistance from the thin upper atmosphere. |
| Eccentricity (e) | How stretched an orbit is: 0 is a circle, close to 1 is a long thin ellipse. |
| Eclipse | Time spent in Earth's shadow. It sets battery depth of discharge. |
| Energy drift | With gravity only, orbital energy should stay exactly constant, so any drift is numerical error: the best overall health check. When drag, SRP or burns change the energy, their work is subtracted first. |
| Ephemeris | A table or formula giving where solar-system bodies are over time. DE440 is JPL's current standard; this simulator uses analytic formulas instead. |
| Epoch | A specific instant in time. |
| ERFA | The open-source standard library for Earth orientation and time scales, derived from the IAU's SOFA. |
| F10.7 | Solar radio flux at 10.7 cm, a proxy for how much the Sun heats the upper atmosphere. Drag swings by a factor of 10 over the solar cycle with it. |
| Force model | The list of forces acting on the satellite. |
| Geodetic | Latitude, longitude and altitude measured on the WGS84 ellipsoid, the same as GPS coordinates. |
| GCRF, ICRF | ICRF is the international standard non-rotating frame, fixed relative to distant quasars. GCRF is the same axes centred on Earth. Same idea as J2000, but more precisely defined. |
| Ground track | The path on the surface directly beneath the satellite. |
| Inclination (i) | The tilt of the orbit from the equator. |
| Inertial frame | A non-rotating reference frame, fixed relative to the stars. |
| ISO 8601 duration | A standard way of writing a length of time: P1DT6H means 1 day 6 hours. |
| J2, J3, J4 | Correction terms to gravity for Earth's equatorial bulge and north-south lopsidedness. J2 is the big one: it turns orbit planes and moves perigees. |
| Jacobi constant | The conserved quantity that takes the place of energy around a rotating body. |
| Leap second | A second occasionally added to UTC. An outdated table shifts every UTC epoch by 1 s, about 7.5 km of orbit in LEO. |
| LTAN | Local time of the ascending node: the mean local solar time when the satellite crosses the equator going north. |
| LVLH | Local vertical, local horizontal: a frame riding with the satellite. Radial is straight up away from the parent, along-track is the direction of travel, cross-track is sideways out of the orbit plane. |
| Mercator | The standard flat world map projection. |
| mu (μ) | G times the mass of the parent body. μ/r² is gravity at distance r from its centre. |
| NRLMSISE-00 | The US Naval Research Laboratory's empirical model of the atmosphere, which follows solar and geomagnetic activity. |
| Osculating elements | The exact instantaneous orbital elements, as opposed to averaged ones like in a TLE. |
| Parent | The body the satellites orbit: Earth or a uniform sphere such as an asteroid. |
| Parent rotation angle | How far the parent has spun, so the surface can be shown turning under the orbit. |
| Pole RA/Dec, prime meridian | The direction of a body's spin axis, given like a star's sky coordinates, and how far the body has rotated at the start: where its longitude zero points. |
| Precession, nutation | The slow wobble of Earth's spin axis. Precession alone moves it about 0.36° between 2000 and 2026, which shifts ground tracks by tens of km if ignored. |
| Propagate | Compute a satellite's position and velocity forward in time. |
| RAAN | Right ascension of the ascending node: where the orbit crosses the equator going north. |
| Re-entry | With drag on, a satellite that falls to 80 km is stopped and reported. |
| RK4 | Runge-Kutta 4th order: the standard simple method for stepping equations of motion forward in time with a fixed step. |
| Semi-major axis (a) | Half the long axis of the orbit ellipse: its size. |
| SGP4, SDP4 | The standard models for propagating TLEs. SDP4 is the deep-space version for periods of 225 minutes or more. |
| Space weather | Solar flux (F10.7) and geomagnetic activity (Ap) that drive the upper atmosphere. |
| SRP | Solar radiation pressure: the tiny push from sunlight. |
| SSO | Sun-synchronous orbit. Its plane turns 0.9856° a day to keep pace with the Sun, so it passes overhead at the same local time every day. |
| State | A satellite's position and velocity at one instant. |
| Subsolar point | The spot on Earth with the Sun directly overhead. |
| TEME | The frame SGP4 works in (true equator, mean equinox). It is converted to GCRF before the simulation starts. |
| Third body | The gravity of the Sun and Moon. |
| Time scales | UTC is civil time with leap seconds. TAI, TT, TDB and GPS are atomic or astronomical time scales that differ from UTC by tens of seconds, so the scale must always be stated. |
| TLE | Two-line element set: the standard published orbit format. |
| Train | Satellites following each other in the same orbit, evenly spaced. |
| True anomaly | Where the satellite is on its orbit, measured from periapsis. |
| Walker pattern | The standard constellation layout, written i: T/P/F. T total satellites in P orbital planes, with phasing F between neighbouring planes. Example: 53°: 24/3/1. |
| WGS84 | The standard Earth shape used by GPS. |
