// NRLMSISE-00 total mass density for a UTC instant and geodetic position, with space weather from the bundled table
// (or overrides). Shared by the propagator's drag term and the viewer's telemetry readout.
import { R2D } from './constants.js';
import { nrlmsise00 } from './nrlmsise00.js';
import { dayOfUtc, spaceWeather } from './space-weather.js';
import { utcNominal } from './time.js';

var IN = { doy: 0, sec: 0, alt: 0, g_lat: 0, g_long: 0, lst: 0, f107A: 0, f107: 0, ap: 0, ap_a: null }, doyDay = NaN, doyVal = 0;

// utc: nominal UTC seconds from J2000; lat, lon [deg]; h [km]; sw: a spaceWeather() result. Returns kg/m^3.
export function msisAt(utc, lat, lon, h, sw) {
  var dn = dayOfUtc(utc), sec = utc + 43200 - dn * 86400;
  if (dn !== doyDay) { doyDay = dn; var d = new Date((dn + 10957) * 864e5); doyVal = Math.round((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1; }
  IN.doy = doyVal; IN.sec = sec; IN.alt = h; IN.g_lat = lat; IN.g_long = lon; IN.lst = sec / 3600 + lon / 15;
  IN.f107A = sw.f107A; IN.f107 = sw.f107; IN.ap = sw.ap; IN.ap_a = sw.ap_a;
  return nrlmsise00(IN).d[5];
}

// tt: TT seconds from J2000; lat, lon [rad]; h [m]; ov: config override (force_model.space_weather) or null
export function msisDensity(tt, lat, lon, h, ov) { var utc = utcNominal(tt); return msisAt(utc, lat * R2D, ((lon * R2D) % 360 + 540) % 360 - 180, h / 1000, spaceWeather(utc, ov)); }

