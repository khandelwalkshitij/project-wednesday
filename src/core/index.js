// Public API of the physics core. The page and the tests use this object.
import { normalizeConfig } from './config.js';
import { ConfigError, EARTH, G, LIMITS, VERSION } from './constants.js';
import { getCr, parseCr } from './cr-schedule.js';
import { bodyMatrix, earthPole, earthRotation, poleRaDec, primeMeridianAngle } from './earth-orientation.js';
import { kepToState, stateToKep } from './elements.js';
import { atmosphereDensity, geodetic, magneticField } from './environment.js';
import { hermite, interpState } from './interp.js';
import { fitLine, fmtHms, ltanFromMatrix, ltanHours, unwrapHours } from './ltan.js';
import { crc32, mTvec, mvec } from './math.js';
import { makeParent } from './parent.js';
import { expandPattern } from './patterns.js';
import { parsePlanCsv } from './plan-csv.js';
import { run, simulate } from './propagator.js';
import { betaAngle, eclipseEvents, inShadow, sunDirection } from './sun.js';
import { formatUtc, leap, parseDuration, parseEpoch, setLeapSeconds, tdbMinusTt } from './time.js';
import { parseTle, tleState } from './tle.js';
import { sgp4 } from '../vendor/sgp4.js';

export var SimCore = { VERSION: VERSION, G: G, EARTH: EARTH, LIMITS: LIMITS, ConfigError: ConfigError, setLeapSeconds: setLeapSeconds, parseEpoch: parseEpoch, parseDuration: parseDuration, formatUtc: formatUtc,
  tdbMinusTt: tdbMinusTt, earthRotation: earthRotation, earthPole: earthPole, bodyMatrix: bodyMatrix, poleRaDec: poleRaDec, primeMeridianAngle: primeMeridianAngle,
  kepToState: kepToState, stateToKep: stateToKep, geodetic: geodetic, atmosphereDensity: atmosphereDensity, magneticField: magneticField, makeParent: makeParent,
  normalizeConfig: normalizeConfig, simulate: simulate, run: run, parsePlanCsv: parsePlanCsv, mvec: mvec, mTvec: mTvec, hermite: hermite, crc32: crc32,
  sunDirection: sunDirection, inShadow: inShadow, betaAngle: betaAngle, interpState: interpState, eclipseEvents: eclipseEvents, expandPattern: expandPattern, parseTle: parseTle, tleState: tleState, sgp4: sgp4, getCr: getCr, parseCr: parseCr,
  ltanFromMatrix: ltanFromMatrix, ltanHours: ltanHours, unwrapHours: unwrapHours, fitLine: fitLine, fmtHms: fmtHms,
  leapInfo: function () { return leap; } };
