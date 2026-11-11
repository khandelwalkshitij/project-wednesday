| Case | Satellite | Span | Integrator | Forces | Max position error | Final position error | Max velocity error | Max error, finer setting |
|---|---|---|---|---|---|---|---|---|
| Reset (New Trial) | SAT-01 | 1 d | RK4 10 s | J2-J4 | 44.4 cm | 44.4 cm | 0.49 mm/s | 20 mm |
| Earth: LTAN drift, sun-synchronous vs 53 deg | SSO 10:30 | 5 d | RK4 10 s | J2-J4 | 6.18 m | 6.18 m | 6.8 mm/s | 22.7 cm |
| Earth: LTAN drift, sun-synchronous vs 53 deg | Inclined 53 | 5 d | RK4 10 s | J2-J4 | 6.21 m | 6.21 m | 6.8 mm/s | 22.5 cm |
| Earth: one satellite in low orbit | LEO-550 | 6 h | RK4 10 s | J2-J4 | 69 mm | 69 mm | 0.073 mm/s | 4 mm |
| Earth: Walker constellation, 12 satellites in 3 planes | 12 satellites (worst: SAT-03) | 4 h | RK4 10 s | J2-J4 | 40 mm | 40 mm | 0.043 mm/s | 3 mm |
| Earth: low orbit, Molniya and geostationary | LEO state vector | 1 d | RK4 10 s | J2-J4 | 49.3 cm | 49.3 cm | 0.56 mm/s | 24 mm |
| Earth: low orbit, Molniya and geostationary | Molniya | 1 d | RK4 10 s | J2-J4 | 60 mm | 60 mm | 0.018 mm/s | 4 mm |
| Earth: low orbit, Molniya and geostationary | GEO | 1 d | RK4 10 s | J2-J4 | < 1 mm | < 1 mm | < 0.001 mm/s | < 1 mm |
| Small body: two orbiters and an impact | orbiter | 1 d | RK4 20 s | point mass | < 1 mm | < 1 mm | < 0.001 mm/s | < 1 mm |
| Small body: two orbiters and an impact | polar | 1 d | RK4 20 s | point mass | < 1 mm | < 1 mm | < 0.001 mm/s | < 1 mm |
| Small body: two orbiters and an impact | impactor | 3.1 h (to impact) | RK4 20 s | point mass | < 1 mm | < 1 mm | < 0.001 mm/s | < 1 mm |
| Earth: drag decay and re-boost burns | Decaying 300 | 3 d | RK4 10 s | J2-J4 + drag | 8.39 m | 8.39 m | 9.7 mm/s | 33.4 cm |
| Earth: drag decay and re-boost burns | Boosted 300 | 3 d | RK4 10 s | J2-J4 + drag + burns | 5.21 m | 5.21 m | 6 mm/s | 23.1 cm |
| Earth: drag decay and re-boost burns | High 550 | 3 d | RK4 10 s | J2-J4 + drag | 2.50 m | 2.50 m | 2.7 mm/s | 99 mm |
| Validation: SRP, 700 km sun-synchronous, A/m = 0.1 | SRP-LEO | 2 d | RK4 10 s | J2-J4 + SRP | 2.94 m | 1.86 m | 2.7 mm/s | 2.43 m |
| Validation: SRP, geostationary, A/m = 0.1 | SRP-GEO | 3 d | RK4 60 s | J2-J4 + SRP | 2.23 m | 2.22 m | 0.11 mm/s | 2.23 m |
| v0.4.0: DOP853, low orbit, Molniya and geostationary | LEO state vector | 1 d | DOP853 1e-10 | J2-J4 | 4 mm | 3 mm | 0.0044 mm/s | < 1 mm |
| v0.4.0: DOP853, low orbit, Molniya and geostationary | Molniya | 1 d | DOP853 1e-10 | J2-J4 | 43.8 cm | 18.6 cm | 0.33 mm/s | 2 mm |
| v0.4.0: DOP853, low orbit, Molniya and geostationary | GEO | 1 d | DOP853 1e-10 | J2-J4 | 8 mm | 7 mm | < 0.001 mm/s | < 1 mm |
| v0.4.0: DOP853, drag decay and re-boost burns | Decaying 300 | 3 d | DOP853 1e-10 | J2-J4 + drag | 22.8 cm | 12.4 cm | 0.26 mm/s | 65.9 cm |
| v0.4.0: DOP853, drag decay and re-boost burns | Boosted 300 | 3 d | DOP853 1e-10 | J2-J4 + drag + burns | 12.7 cm | 12.7 cm | 0.15 mm/s | 15 mm |
| v0.4.0: DOP853, drag decay and re-boost burns | High 550 | 3 d | DOP853 1e-10 | J2-J4 + drag | 13.6 cm | 13.6 cm | 0.15 mm/s | < 1 mm |
| v0.4.0: NRLMSISE-00 drag, May 2024 storm | STORM-400 | 1 d | DOP853 1e-10 | J2-J4 + NRLMSISE-00 drag | 29 mm | 29 mm | 0.034 mm/s | 13 mm |
| v0.4.0: NRLMSISE-00 drag, solar minimum 2019 | QUIET-400 | 1 d | DOP853 1e-10 | J2-J4 + NRLMSISE-00 drag | 8 mm | 8 mm | 0.0094 mm/s | 6 mm |
| v0.4.0: Sun and Moon gravity, 500 km | LEO-3B | 3 d | DOP853 1e-10 | J2-J4 + Sun + Moon | 14.3 cm | 14.3 cm | 0.16 mm/s | 20 mm |
| v0.4.0: Sun and Moon gravity, geostationary | GEO-3B | 30 d | DOP853 1e-10 | J2-J4 + Sun + Moon | 48.5 m | 47.5 m | 3.5 mm/s | 48.3 m |
