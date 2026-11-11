// Validates and normalises the JSON config. All input errors and warnings come from here.
import { ConfigError, D2R, LIMITS, R2D, TWO_PI } from './constants.js';
import { parseCr } from './cr-schedule.js';
import { kepToState, stateToKep } from './elements.js';
import { geoHeight } from './environment.js';
import { makeParent } from './parent.js';
import { expandPattern } from './patterns.js';
import { parseDuration, parseEpoch } from './time.js';
import { parseTle, tleState } from './tle.js';

// ---------------------------------------------------------------- config validation (SIM_055 and all INPUT rows)
export var NOT_BASELINE = ' is an Additional requirement and is not part of this build', REENTRY_ALT = 80e3;

export function normalizeConfig(raw) {
  var E = [], W = [];
  function isObj(o) { return o && typeof o === 'object' && !Array.isArray(o); }
  function keys(o, allowed, path) { Object.keys(o).forEach(function (k) { if (allowed.indexOf(k) < 0) E.push((path ? path + '.' : '') + k + ': unknown field'); }); }
  function num(o, k, path, opt) {
    var v = o[k], p = (path ? path + '.' : '') + k; opt = opt || {};
    if (typeof v !== 'number' || !isFinite(v)) { E.push(p + ': must be a number'); return NaN; }
    if (opt.gt !== undefined && !(v > opt.gt)) E.push(p + ': must be greater than ' + opt.gt);
    if (opt.min !== undefined && v < opt.min) E.push(p + ': must be at least ' + opt.min);
    if (opt.max !== undefined && v > opt.max) E.push(p + ': must be at most ' + opt.max);
    if (opt.lt !== undefined && !(v < opt.lt)) E.push(p + ': must be less than ' + opt.lt);
    return v;
  }
  function int(o, k, path, lo, hi) { var v = o[k]; if (typeof v !== 'number' || v !== Math.floor(v) || v < lo || v > hi) { E.push(path + '.' + k + ': must be an integer from ' + lo + ' to ' + hi); return NaN; } return v; }
  function kepOk(o, p, extra) {
    var n0 = E.length; keys(o, ['type', 'a_m', 'e', 'i_deg', 'raan_deg', 'argp_deg', 'ta_deg'].concat(extra || []), p);
    num(o, 'a_m', p, { gt: 0 }); num(o, 'e', p, { min: 0, lt: 1 }); num(o, 'i_deg', p, { min: 0, max: 180 }); num(o, 'raan_deg', p); num(o, 'argp_deg', p); num(o, 'ta_deg', p);
    return E.length === n0;
  }
  if (!isObj(raw)) throw new ConfigError(['config: must be a JSON object']);
  keys(raw, ['parent', 'earth_orientation', 'start_epoch', 'duration', 'end_epoch', 'integrator', 'output_step_s', 'satellites', 'force_model', 'maneuvers'], '');
  var c = {}, pr = raw.parent;
  // parent
  if (!isObj(pr)) E.push('parent: required object');
  else if (pr.shape === 'custom') E.push('parent.shape: "custom" (mesh parent, SIM_004)' + NOT_BASELINE);
  else if (pr.shape === 'earth_default') { keys(pr, ['shape'], 'parent'); c.parent = { shape: 'earth_default', dut1: 0 }; }
  else if (pr.shape === 'sphere_uniform') {
    keys(pr, ['shape', 'radius_m', 'density_kg_m3', 'rotation'], 'parent');
    c.parent = { shape: 'sphere_uniform', radius: num(pr, 'radius_m', 'parent', { gt: 0 }), density: num(pr, 'density_kg_m3', 'parent', { gt: 0 }) };
    var ro = pr.rotation;
    if (!isObj(ro)) E.push('parent.rotation: required object with spin_period_s, pole_ra_deg, pole_dec_deg, prime_meridian_deg');
    else {
      keys(ro, ['spin_period_s', 'pole_ra_deg', 'pole_dec_deg', 'prime_meridian_deg'], 'parent.rotation');
      c.parent.spinPeriod = num(ro, 'spin_period_s', 'parent.rotation', { gt: 0 });
      c.parent.poleRa = num(ro, 'pole_ra_deg', 'parent.rotation') * D2R;
      c.parent.poleDec = num(ro, 'pole_dec_deg', 'parent.rotation', { min: -90, max: 90 }) * D2R;
      c.parent.w0 = num(ro, 'prime_meridian_deg', 'parent.rotation') * D2R;
    }
  } else E.push('parent.shape: must be "sphere_uniform" or "earth_default"');
  if (raw.earth_orientation !== undefined) {
    if (!isObj(raw.earth_orientation)) E.push('earth_orientation: must be an object');
    else if (c.parent && c.parent.shape !== 'earth_default') E.push('earth_orientation: only applies to parent.shape "earth_default"');
    else { keys(raw.earth_orientation, ['dut1_s'], 'earth_orientation'); if (c.parent) c.parent.dut1 = num(raw.earth_orientation, 'dut1_s', 'earth_orientation', { min: -0.9, max: 0.9 }); }
  }
  // time
  try { c.epoch = parseEpoch(raw.start_epoch, 'start_epoch'); } catch (e) { E.push(e.message); }
  var hasD = raw.duration !== undefined, hasE = raw.end_epoch !== undefined;
  if (hasD && hasE) E.push('duration, end_epoch: give one or the other, not both');
  else if (!hasD && !hasE) E.push('duration: required (or give end_epoch)');
  else try {
    if (hasD) c.duration = parseDuration(raw.duration, 'duration');
    else if (c.epoch) { c.duration = parseEpoch(raw.end_epoch, 'end_epoch').tt - c.epoch.tt; if (!(c.duration > 0)) E.push('end_epoch: must be after start_epoch'); }
  } catch (e) { E.push(e.message); }
  var ig = raw.integrator;
  if (!isObj(ig)) E.push('integrator: required object, e.g. {"type": "rk4", "time_step_s": 10} or {"type": "dop853", "rtol": 1e-10, "atol": 1e-6}');
  else if (ig.type === 'dop853') {     // adaptive step (SIM_017)
    keys(ig, ['type', 'rtol', 'atol', 'max_step_s', 'initial_step_s'], 'integrator'); c.integrator = 'dop853';
    c.rtol = num(ig, 'rtol', 'integrator', { min: 1e-13, lt: 1 }); c.atol = num(ig, 'atol', 'integrator', { gt: 0 });
    c.maxStep = ig.max_step_s === undefined ? Infinity : num(ig, 'max_step_s', 'integrator', { gt: 0 });
    c.initialStep = ig.initial_step_s === undefined ? 0 : num(ig, 'initial_step_s', 'integrator', { gt: 0 });
  } else if (ig.type !== 'rk4') E.push('integrator.type: must be "rk4" or "dop853"');
  else { keys(ig, ['type', 'time_step_s'], 'integrator'); c.integrator = 'rk4'; c.dt = num(ig, 'time_step_s', 'integrator', { gt: 0 }); }
  c.outStep = num(raw, 'output_step_s', '', { gt: 0 });
  // forces (SIM_026, SIM_093)
  c.drag = false; c.srp = false; var fm = raw.force_model;
  if (fm !== undefined && fm !== 'gravity_only') {
    if (!isObj(fm)) E.push('force_model: must be "gravity_only" or an object such as {"drag": true, "srp": true}');
    else {
      keys(fm, ['drag', 'srp', 'solar_drag'], 'force_model');
      if (fm.drag !== undefined && typeof fm.drag !== 'boolean') E.push('force_model.drag: must be true or false');
      if (fm.srp !== undefined && typeof fm.srp !== 'boolean') E.push('force_model.srp: must be true or false');
      if (fm.solar_drag !== undefined && typeof fm.solar_drag !== 'boolean') E.push('force_model.solar_drag: must be true or false');
      c.drag = fm.drag === true;
      c.srp = fm.srp === true || fm.solar_drag === true;
      if (c.drag && c.parent && c.parent.shape !== 'earth_default') E.push('force_model.drag: only available for parent.shape "earth_default"');
      if (c.srp && c.parent && c.parent.shape !== 'earth_default') E.push('force_model.srp: only available for parent.shape "earth_default"');
    }
  }
  // satellites
  var sa = raw.satellites; c.sats = [];
  if (!isObj(sa)) E.push('satellites: required object');
  else {
    keys(sa, ['count', 'mass_kg', 'cd', 'cr', 'area_m2', 'names', 'name_prefix', 'orbits', 'pattern'], 'satellites');
    var ob = sa.orbits, pat = sa.pattern, N = sa.count, patOk = false;
    if (ob !== undefined && pat !== undefined) E.push('satellites.orbits, satellites.pattern: give one or the other, not both');
    else if (pat !== undefined) {
      if (!isObj(pat)) E.push('satellites.pattern: must be an object');
      else if (pat.type === 'walker') {
        var n1 = E.length; keys(pat, ['type', 'a_m', 'e', 'i_deg', 't', 'p', 'f', 'raan0_deg', 'ta0_deg', 'argp_deg'], 'satellites.pattern');
        num(pat, 'a_m', 'satellites.pattern', { gt: 0 }); num(pat, 'i_deg', 'satellites.pattern', { min: 0, max: 180 }); if (pat.e !== undefined) num(pat, 'e', 'satellites.pattern', { min: 0, lt: 1 });
        ['raan0_deg', 'ta0_deg', 'argp_deg'].forEach(function (k) { if (pat[k] !== undefined) num(pat, k, 'satellites.pattern'); });
        var Tn = int(pat, 't', 'satellites.pattern', 1, 100), Pn = int(pat, 'p', 'satellites.pattern', 1, 100), Fn = pat.f === undefined ? 0 : int(pat, 'f', 'satellites.pattern', 0, 99);
        if (Tn % Pn) E.push('satellites.pattern.p: number of planes must divide the total t'); else if (Fn >= Pn) E.push('satellites.pattern.f: must be from 0 to p - 1');
        if (N !== undefined && N !== Tn) E.push('satellites.count: must equal satellites.pattern.t (' + Tn + '), or be left out');
        patOk = E.length === n1; if (patOk) N = Tn;
      } else if (pat.type === 'train') {
        var n2 = E.length; keys(pat, ['type', 'base', 'offset'], 'satellites.pattern');
        if (!isObj(pat.base)) E.push('satellites.pattern.base: required Keplerian orbit'); else kepOk(pat.base, 'satellites.pattern.base');
        var ok = isObj(pat.offset) ? Object.keys(pat.offset) : [];
        if (ok.length !== 1 || ['raan_deg', 'ta_deg', 'along_track_m'].indexOf(ok[0]) < 0) E.push('satellites.pattern.offset: give exactly one of raan_deg, ta_deg or along_track_m');
        else num(pat.offset, ok[0], 'satellites.pattern.offset');
        patOk = E.length === n2;
      } else E.push('satellites.pattern.type: must be "walker" or "train"');
    }
    if (N === undefined && Array.isArray(ob)) N = ob.length;
    if (typeof N !== 'number' || N !== Math.floor(N) || N < 1 || N > 100) { E.push('satellites.count: must be an integer from 1 to 100'); N = 0; }
    if (patOk && N) ob = expandPattern(pat, N);
    var mass = sa.mass_kg === undefined ? null : num(sa, 'mass_kg', 'satellites', { gt: 0, max: 10000 }), names = [];
    var cd = sa.cd === undefined ? 2.2 : num(sa, 'cd', 'satellites', { gt: 0 }), cr = parseCr(sa.cr, 'satellites.cr', c.epoch ? c.epoch.tt : 0, E), area = sa.area_m2 === undefined ? null : num(sa, 'area_m2', 'satellites', { gt: 0 });
    if (sa.names !== undefined && sa.name_prefix !== undefined) E.push('satellites.names, satellites.name_prefix: give one or the other, not both');
    else if (sa.names !== undefined) {
      if (!Array.isArray(sa.names) || sa.names.length !== N) E.push('satellites.names: must be a list of ' + N + ' names (one per satellite)');
      else sa.names.forEach(function (nm, i) {
        if (typeof nm !== 'string' || !nm.trim() || /[,"\n\r#;=]/.test(nm)) E.push('satellites.names[' + i + ']: must be non-empty text without commas, quotes, #, ; or =');
        else if (names.indexOf(nm.trim()) >= 0) E.push('satellites.names[' + i + ']: duplicate name "' + nm.trim() + '"');
        names.push(typeof nm === 'string' ? nm.trim() : '');
      });
    } else {
      var pre = sa.name_prefix === undefined ? 'SAT' : sa.name_prefix;
      if (typeof pre !== 'string' || !pre.trim() || /[,"\n\r#;=]/.test(pre)) E.push('satellites.name_prefix: must be non-empty text without commas, quotes, #, ; or =');
      else for (var i = 0; i < N; i++) names.push(pre.trim() + '-' + (i + 1 < 10 ? '0' : '') + (i + 1));
    }
    var mu = null; if (c.parent && !E.length) mu = makeParent(c.parent).mu;
    if (pat !== undefined && !patOk) { /* pattern errors already listed */ }
    else if (!Array.isArray(ob) || ob.length !== N) E.push('satellites.orbits: must be a list of ' + N + ' initial orbits (one per satellite), found ' + (Array.isArray(ob) ? ob.length : 'none'));
    else ob.forEach(function (o, i) {
      var p = 'satellites.orbits[' + i + ']', st = null, own = ['mass_kg', 'cd', 'cr', 'area_m2'];
      if (!isObj(o)) { E.push(p + ': must be an object'); return; }
      if (o.type === 'keplerian') { if (kepOk(o, p, own) && mu) st = kepToState(mu, o.a_m, o.e, o.i_deg * D2R, o.raan_deg * D2R, o.argp_deg * D2R, o.ta_deg * D2R); }
      else if (o.type === 'cartesian') {
        keys(o, ['type', 'r_m', 'v_m_s'].concat(own), p);
        var ok3 = function (v) { return Array.isArray(v) && v.length === 3 && v.every(function (q) { return typeof q === 'number' && isFinite(q); }); };
        if (!ok3(o.r_m)) E.push(p + '.r_m: must be [x, y, z] in metres');
        if (!ok3(o.v_m_s)) E.push(p + '.v_m_s: must be [vx, vy, vz] in m/s');
        if (ok3(o.r_m) && ok3(o.v_m_s)) st = o.r_m.concat(o.v_m_s);
      } else if (o.type === 'tle') {
        keys(o, ['type', 'line1', 'line2'].concat(own), p);
        if (c.parent && c.parent.shape !== 'earth_default') E.push(p + '.type: "tle" needs parent.shape "earth_default"');
        else try { var tl = parseTle(o.line1, o.line2); if (c.epoch) st = tleState(tl, c.epoch.tt); } catch (e) { E.push(p + ': ' + e.message); }
      } else E.push(p + '.type: must be "keplerian", "cartesian" or "tle"');
      var mi = o.mass_kg !== undefined ? num(o, 'mass_kg', p, { gt: 0, max: 10000 }) : mass;
      if (mi === null || isNaN(mi)) E.push(p + '.mass_kg: mass must be specified on each satellite object (e.g. mass_kg: 100)');
      var ci = o.cd === undefined ? cd : num(o, 'cd', p, { gt: 0 }), cri = o.cr === undefined ? cr : parseCr(o.cr, p + '.cr', c.epoch ? c.epoch.tt : 0, E), ai = o.area_m2 === undefined ? area : num(o, 'area_m2', p, { gt: 0 });
      if ((c.drag || c.srp) && ai === null) E.push(p + '.area_m2: drag or solar radiation pressure is on, so give satellites.area_m2 or an area for this satellite');
      c.sats.push({ name: names[i], mass: mi, cd: ci, cr: cri, area: ai, state: st });
    });
  }
  // manoeuvres (SIM_038)
  c.burns = c.sats.map(function () { return []; });
  if (raw.maneuvers !== undefined) {
    if (!Array.isArray(raw.maneuvers)) E.push('maneuvers: must be a list');
    else raw.maneuvers.forEach(function (b, j) {
      var p = 'maneuvers[' + j + ']', t, si = -1;
      if (!isObj(b)) { E.push(p + ': must be an object'); return; }
      keys(b, ['sat', 't_s', 'epoch', 'dv_m_s', 'frame'], p);
      c.sats.forEach(function (s, k) { if (s.name === b.sat) si = k; });
      if (si < 0) E.push(p + '.sat: no satellite named "' + b.sat + '"');
      if ((b.t_s !== undefined) === (b.epoch !== undefined)) E.push(p + ': give t_s (seconds after start_epoch) or epoch, one of them');
      else if (b.t_s !== undefined) t = num(b, 't_s', p, { min: 0 });
      else if (c.epoch) try { t = parseEpoch(b.epoch, p + '.epoch').tt - c.epoch.tt; } catch (e) { E.push(e.message); }
      if (t !== undefined && c.duration && !(t >= 0 && t < c.duration)) E.push(p + ': burn time must be inside the run');
      var dv = b.dv_m_s, dvOk = Array.isArray(dv) && dv.length === 3 && dv.every(function (q) { return typeof q === 'number' && isFinite(q); });
      if (!dvOk) E.push(p + '.dv_m_s: must be three numbers in m/s (radial, along-track, cross-track for "lvlh"; x, y, z for "inertial")');
      var fr = b.frame === undefined ? 'lvlh' : b.frame; if (fr !== 'lvlh' && fr !== 'inertial') E.push(p + '.frame: must be "lvlh" or "inertial"');
      if (si >= 0 && dvOk && t >= 0) c.burns[si].push({ t: t, dv: dv, frame: fr });
    });
    c.burns.forEach(function (l) { l.sort(function (a, b) { return a.t - b.t; }); });
  }
  if (!E.length) {
    var P = makeParent(c.parent), pole = P.poleAt(c.epoch.tt);
    c.sats.forEach(function (s, i) {
      var x = s.state[0], y = s.state[1], z = s.state[2];
      if (P.surface(x, y, z, pole) <= 0) E.push('satellites.orbits[' + i + ']: initial position is at or below the parent surface');
      else if (c.drag) { var zz = x * pole[0] + y * pole[1] + z * pole[2]; if (geoHeight(Math.sqrt(Math.max(0, x * x + y * y + z * z - zz * zz)), zz) <= REENTRY_ALT) E.push('satellites.orbits[' + i + ']: starts below 80 km, where the run treats a satellite as re-entered'); }
    });
    c.sats.forEach(function (s, i) {
      var el = stateToKep(P.mu, s.state);
      if (el.a > 0 && el.e < 1) {
        var period = TWO_PI * Math.sqrt(el.a * el.a * el.a / P.mu);
        if (c.integrator === 'rk4' && c.dt > period * 0.25) {
          E.push('integrator.time_step_s: step (' + c.dt + ' s) exceeds 25% of orbital period (' + Math.round(period) + ' s) for "' + s.name + '". Fixed-step RK4 will diverge. Reduce time_step_s.');
        } else if (c.integrator === 'rk4' && c.dt > period / 20) {
          W.push('Time step ' + c.dt + ' s is coarse (>5% of orbital period ' + Math.round(period) + ' s for "' + s.name + '"). Recommend time_step_s <= ' + Math.round(period / 20) + ' s for high numerical fidelity.');
        }
        if (el.e > 0.85 && c.integrator === 'rk4') {
          W.push('Satellite "' + s.name + '" has high eccentricity (e = ' + el.e.toFixed(3) + '). High curvature at periapsis requires small step sizes (recommend time_step_s <= 1 s, or the adaptive dop853 integrator).');
        }
        var incDeg = el.i * R2D;
        if ((incDeg < 0.05 || incDeg > 179.95) && P.shape === 'earth_default') {
          W.push('Satellite "' + s.name + '" is near-equatorial (i = ' + incDeg.toFixed(2) + '°); ascending node and LTAN are geometrically undefined (displays as n/a).');
        }
      }
    });
    var nSteps = c.integrator === 'rk4' ? Math.ceil(c.duration / c.dt - 1e-9) : 0, nOut = Math.floor(c.duration / c.outStep + 1e-9) + 1;
    if (nOut * c.sats.length > LIMITS.maxRows) E.push('output_step_s: run would write ' + nOut * c.sats.length + ' rows (limit ' + LIMITS.maxRows + '). Increase output_step_s or shorten the run');
    if (nSteps * c.sats.length > LIMITS.maxSatSteps) E.push('integrator.time_step_s: run needs ' + nSteps * c.sats.length + ' satellite-steps (limit ' + LIMITS.maxSatSteps + '). Increase the step or shorten the run');
    c.nSteps = nSteps; c.nOut = nOut; c.warnings = W;
  }
  if (E.length) throw new ConfigError(E);
  return c;
}
