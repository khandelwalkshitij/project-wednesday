// Physical constants, WGS84 Earth model, run limits and the ConfigError type.
/* Orbital simulator core. Baseline requirements only. SI units, radians internally.
   Internal time: TT seconds past J2000.0. Inertial frame: ICRF axes centred on the parent (GCRF for Earth). */
export var VERSION = '0.3.0';

export var G = 6.67430e-11, TWO_PI = 2 * Math.PI, D2R = Math.PI / 180, R2D = 180 / Math.PI, AS2R = D2R / 3600, TURNAS = 1296000;

export var EARTH = { mu: 3.986004418e14, a: 6378137.0, f: 1 / 298.257223563, J2: 1.08262668e-3, J3: -2.53265649e-6, J4: -1.61962159e-6,
  omega: 7.292115e-5, B0: 2.99e-5, magPoleLat: 80.7, magPoleLon: -72.7 };

export var GM_SUN = 1.32712440041e20, GM_MOON = 4.9028001218e12, AU = 1.495978707e11;   // DE440 GMs [m^3/s^2], IAU 2012 au [m]
export var LIMITS = { maxRows: 1500000, maxSatSteps: 3e8 };

export function ConfigError(list) { this.name = 'ConfigError'; this.errors = list; this.message = list.join('\n'); }

ConfigError.prototype = Object.create(Error.prototype);
