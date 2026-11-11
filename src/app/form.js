// Setup form. It edits the JSON config, which stays the single source of truth. Includes the TLE import dialog.
import { S } from './boot.js';
import { $ } from './dom.js';
import { RE } from './presets.js';
import { showErrors } from './run.js';

export var formCfg = null, formRoot;

export function mk(tag, props, kids) {
  var e = document.createElement(tag), k; props = props || {};
  for (k in props) { if (k === 'text') e.textContent = props[k]; else if (k === 'cls') e.className = props[k]; else e[k] = props[k]; }
  (kids || []).forEach(function (c) { if (c) e.appendChild(c); }); return e;
}

export function commit(rerender) { $('config').value = JSON.stringify(formCfg, null, 2); showErrors(null); if (rerender) renderForm(); }

export function lab(text, input, cls) { return mk('label', { cls: 'ff' + (cls ? ' ' + cls : '') }, [mk('span', { text: text }), input]); }

export function show(v, sc) { return v === undefined || v === null || typeof v !== 'number' ? '' : String(+(v / sc).toPrecision(12)); }

export function numIn(obj, key, opt) {       // text box bound to obj[key]; opt: scale, def, w, int, rerender
  opt = opt || {}; var sc = opt.scale || 1, i = mk('input', { type: 'text', inputMode: 'decimal', value: show(obj[key] === undefined ? opt.def : obj[key], sc) });
  if (opt.w) i.style.width = opt.w + 'px';
  i.addEventListener('change', function () {
    var x = parseFloat(i.value); if (!isFinite(x)) { i.value = show(obj[key] === undefined ? opt.def : obj[key], sc); return; }
    obj[key] = opt.int ? Math.round(x) : +(x * sc).toPrecision(15); i.value = show(obj[key], sc); commit(opt.rerender);
  });
  return i;
}

export function txtIn(value, onset, w) { var i = mk('input', { type: 'text', value: value || '' }); if (w) i.style.width = w + 'px'; i.addEventListener('change', function () { onset(i.value.trim()); }); return i; }

export function selIn(options, value, onset) {
  var s = mk('select'); options.forEach(function (o) { var op = mk('option', { text: o[1] }); op.value = o[0]; s.appendChild(op); }); s.value = value;
  s.addEventListener('change', function () { onset(s.value); }); return s;
}

export function infoIcon(htmlTip) {
  var s = mk('span', { cls: 'info-btn', text: '?' });
  s.setAttribute('tabindex', '0');
  s.setAttribute('role', 'button');
  s.setAttribute('aria-label', 'Help');
  s.setAttribute('data-tip', htmlTip);
  return s;
}

export function grp(title, kids, tipHtml) {
  var legNodes = [document.createTextNode(title)];
  if (tipHtml) legNodes.push(infoIcon(tipHtml));
  return mk('fieldset', { cls: 'fg' }, [mk('legend', {}, legNodes)].concat(kids));
}

export function row(kids) { return mk('div', { cls: 'fr' }, kids); }

export function btn(text, onclick, cls) { var b = mk('button', { type: 'button', text: text, cls: cls || '' }); b.addEventListener('click', onclick); return b; }

export function cleanName(n) { return String(n).replace(/[,"#;=\r\n]/g, ' ').trim(); }

export function satNames(c) {
  var sa = c.satellites || {}; if (Array.isArray(sa.names)) return sa.names.slice();
  var n = sa.pattern && sa.pattern.type === 'walker' ? sa.pattern.t : sa.count !== undefined ? sa.count : (sa.orbits || []).length, pre = sa.name_prefix === undefined ? 'SAT' : sa.name_prefix, out = [];
  for (var i = 0; i < (n | 0); i++) out.push(pre + '-' + (i + 1 < 10 ? '0' : '') + (i + 1)); return out;
}

export function defaultOrbit(c) {
  var sa = c.satellites || {}, o = (sa.orbits || []).filter(function (q) { return q && q.type === 'keplerian'; }).pop();
  if (!o && sa.pattern && sa.pattern.type === 'train' && sa.pattern.base) o = sa.pattern.base;
  if (!o && sa.pattern && sa.pattern.type === 'walker') o = { a_m: sa.pattern.a_m, e: sa.pattern.e || 0, i_deg: sa.pattern.i_deg, raan_deg: 0, argp_deg: 0, ta_deg: 0 };
  var m_kg = (o && o.mass_kg !== undefined) ? o.mass_kg : (sa.mass_kg !== undefined ? sa.mass_kg : 100);
  var dragOn = !!(c.force_model && c.force_model.drag);
  var srpOn = !!(c.force_model && (c.force_model.srp || c.force_model.solar_drag));
  var res = o ? { type: 'keplerian', a_m: o.a_m, e: o.e, i_deg: o.i_deg, raan_deg: o.raan_deg, argp_deg: o.argp_deg, ta_deg: o.ta_deg, mass_kg: m_kg } :
    { type: 'keplerian', a_m: (c.parent && c.parent.shape === 'earth_default') ? RE + 550e3 : 2.4 * ((c.parent && c.parent.radius_m) || 250), e: 0, i_deg: 53, raan_deg: 0, argp_deg: 0, ta_deg: 0, mass_kg: m_kg };
  if (dragOn) res.cd = (o && o.cd !== undefined) ? o.cd : (sa.cd !== undefined ? sa.cd : 2.2);
  if (srpOn) res.cr = (o && o.cr !== undefined) ? o.cr : (sa.cr !== undefined ? sa.cr : 1.8);
  if (dragOn || srpOn) res.area_m2 = (o && o.area_m2 !== undefined) ? o.area_m2 : (sa.area_m2 !== undefined ? sa.area_m2 : 1);
  return res;
}

export function toList(c) {                  // turn a pattern into an explicit list so single satellites can be edited
  var sa = c.satellites, names = satNames(c);
  var dragOn = !!(c.force_model && c.force_model.drag);
  var srpOn = !!(c.force_model && (c.force_model.srp || c.force_model.solar_drag));
  if (sa.pattern) { try { sa.orbits = S.expandPattern(sa.pattern, sa.pattern.type === 'walker' ? sa.pattern.t : sa.count); } catch (e) { sa.orbits = [defaultOrbit(c)]; } delete sa.pattern; }
  if (!Array.isArray(sa.orbits) || !sa.orbits.length) sa.orbits = [defaultOrbit(c)];
  sa.count = sa.orbits.length; sa.names = sa.orbits.map(function (o, i) { return names[i] || 'SAT-' + (i + 1 < 10 ? '0' : '') + (i + 1); });
  sa.orbits.forEach(function (o) {
    if (o && o.mass_kg === undefined) o.mass_kg = sa.mass_kg || 100;
    if (o && dragOn && o.cd === undefined) o.cd = sa.cd !== undefined ? sa.cd : 2.2;
    if (o && srpOn && o.cr === undefined) o.cr = sa.cr !== undefined ? sa.cr : 1.8;
    if (o && (dragOn || srpOn) && o.area_m2 === undefined) o.area_m2 = sa.area_m2 !== undefined ? sa.area_m2 : 1;
  });
  delete sa.name_prefix; delete sa.mass_kg; delete sa.cd; delete sa.cr; delete sa.area_m2;
}

export function kepFields(o, w) {
  return [lab('a (km)', numIn(o, 'a_m', { scale: 1000, w: w })), lab('e', numIn(o, 'e', { w: w })), lab('i (deg)', numIn(o, 'i_deg', { w: w })), lab('RAAN (deg)', numIn(o, 'raan_deg', { w: w })), lab('Arg. perigee (deg)', numIn(o, 'argp_deg', { w: w })), lab('True anomaly (deg)', numIn(o, 'ta_deg', { w: w }))];
}

export function renderForm() {
  var c; try { c = JSON.parse($('config').value); } catch (e) { c = null; }
  formRoot.textContent = '';
  if (!c || typeof c !== 'object' || Array.isArray(c)) {
    formCfg = null; formRoot.appendChild(mk('p', { cls: 'warn', text: 'The JSON config is not valid, so the form is off. Fix it under "Edit config as JSON", or pick an example.' })); $('jsonBox').open = true; return;
  }
  formCfg = c; if (!c.parent || typeof c.parent !== 'object') c.parent = { shape: 'earth_default' };
  if (!c.satellites || typeof c.satellites !== 'object') c.satellites = { count: 1, mass_kg: 100, orbits: [defaultOrbit(c)] };
  if (!c.integrator || typeof c.integrator !== 'object') c.integrator = { type: 'rk4', time_step_s: 10 };
  var earth = c.parent.shape === 'earth_default', sa = c.satellites, kids;
  var ig = c.integrator, adaptive = ig.type === 'dop853';
  var integSel = lab('Integrator', selIn([['rk4', 'RK4, fixed step'], ['dop853', 'DOP853, adaptive']], adaptive ? 'dop853' : 'rk4', function (v) {
    c.integrator = v === 'dop853' ? { type: 'dop853', rtol: 1e-10, atol: 1e-6 } : { type: 'rk4', time_step_s: 10 }; commit(true);
  }));
  var stepFields = function () { return adaptive ? [lab('rtol', numIn(ig, 'rtol', { w: 70 })), lab('atol', numIn(ig, 'atol', { w: 70 }))] : [lab('Time step (s)', numIn(ig, 'time_step_s', { w: 70 }))]; };
  // parent
  kids = [row([lab('Body', selIn([['earth_default', 'Earth (WGS84, J2 to J4)'], ['sphere_uniform', 'Uniform sphere']], earth ? 'earth_default' : 'sphere_uniform', function (v) {
    if (v === 'earth_default') c.parent = { shape: 'earth_default' };
    else { c.parent = { shape: 'sphere_uniform', radius_m: 250, density_kg_m3: 1900, rotation: { spin_period_s: 15480, pole_ra_deg: 0, pole_dec_deg: 90, prime_meridian_deg: 0 } }; delete c.force_model; delete c.earth_orientation; }
    commit(true);
  }))])];
  if (!earth) {
    if (!c.parent.rotation || typeof c.parent.rotation !== 'object') c.parent.rotation = { spin_period_s: 15480, pole_ra_deg: 0, pole_dec_deg: 90, prime_meridian_deg: 0 };
    kids.push(row([lab('Radius (m)', numIn(c.parent, 'radius_m')), lab('Density (kg/m³)', numIn(c.parent, 'density_kg_m3')), lab('Spin period (s)', numIn(c.parent.rotation, 'spin_period_s')),
      lab('Pole RA (deg)', numIn(c.parent.rotation, 'pole_ra_deg')), lab('Pole Dec (deg)', numIn(c.parent.rotation, 'pole_dec_deg')), lab('Prime meridian (deg)', numIn(c.parent.rotation, 'prime_meridian_deg'))]));
  }
  formRoot.appendChild(grp('Parent body', kids, '<b>Parent Body Advice</b><br>• <b>Earth (WGS84)</b>: WGS84 ellipsoid geometry, J2–J4 zonal gravity, Earth rotation, exponential atmosphere, and magnetic dipole.<br>• <b>Uniform sphere</b>: For asteroids or moons. Enter radius (m), bulk density (kg/m³), spin period (s), and rotation pole celestial coordinates (RA/Dec in degrees).'));
  // time
  var em = /^\s*(\S*)\s*(UTC|TAI|TT|TDB|GPS)?\s*$/.exec(typeof c.start_epoch === 'string' ? c.start_epoch : '') || [0, '', 'UTC'], ep = em[1], scl = em[2] || 'UTC';
  var setEp = function () { c.start_epoch = ep + ' ' + scl; commit(); };
  kids = [row([lab('Start epoch', txtIn(ep, function (v) { ep = v; setEp(); }, 178)), lab('Scale', selIn(['UTC', 'TAI', 'TT', 'TDB', 'GPS'].map(function (q) { return [q, q]; }), scl, function (v) { scl = v; setEp(); }))])];
  if (c.end_epoch !== undefined) kids.push(row([lab('End epoch (with scale)', txtIn(String(c.end_epoch), function (v) { c.end_epoch = v; commit(); }, 230))]));
  else {
    var secs = NaN; try { secs = S.parseDuration(c.duration, 'duration'); } catch (e) {}
    var unit = !isFinite(secs) ? 3600 : secs % 86400 === 0 ? 86400 : secs % 3600 === 0 ? 3600 : secs % 60 === 0 ? 60 : 1, dv = mk('input', { type: 'text', inputMode: 'decimal', value: isFinite(secs) ? String(+(secs / unit).toPrecision(12)) : '' }); dv.style.width = '70px';
    var setDur = function () { var x = parseFloat(dv.value); if (isFinite(x) && x > 0) { c.duration = +(x * unit).toPrecision(15); commit(); } };
    dv.addEventListener('change', setDur);
    kids.push(row([lab('Duration', dv), lab('Unit', selIn([[86400, 'days'], [3600, 'hours'], [60, 'minutes'], [1, 'seconds']], unit, function (v) { unit = +v; setDur(); })),
      lab('Output step (s)', numIn(c, 'output_step_s', { w: 70 }))]));
  }
  if (c.end_epoch !== undefined) kids.push(row([lab('Output step (s)', numIn(c, 'output_step_s', { w: 70 }))]));
  kids.push(row([integSel].concat(stepFields())));
  formRoot.appendChild(grp('Time', kids, '<b>Time &amp; Integrator Advice</b><br>• <b>Start epoch</b>: Enter as ISO 8601 format: <code>YYYY-MM-DDThh:mm:ss.sss SCALE</code> (SCALE: UTC, TAI, TT, GPS, or TDB).<br>• <b>Duration</b>: Enter seconds or ISO 8601 duration (e.g. <code>P1D</code> = 1 day, <code>PT6H</code> = 6 hours).<br>• <b>RK4</b>: fixed time step (s). Must not exceed 25% of orbital period (recommended &le; period / 20).<br>• <b>DOP853</b>: picks its own step to keep the error per step within <b>rtol</b> (fraction of the value) and <b>atol</b> (m or m/s). rtol 1e-10 is a good default; 1e-12 for reference runs. Usually faster than RK4 at the same accuracy.'));
  // forces
  if (earth) {
    var dragOn = !!(c.force_model && c.force_model.drag === true);
    var srpOn = !!(c.force_model && (c.force_model.srp === true || c.force_model.solar_drag === true));
    var cbDrag = mk('input', { type: 'checkbox', checked: dragOn });
    cbDrag.addEventListener('change', function () {
      if (!c.force_model || typeof c.force_model !== 'object') c.force_model = {};
      if (cbDrag.checked) {
        c.force_model.drag = true;
        if (mode === 'list') {
          (sa.orbits || []).forEach(function (o) {
            if (o && o.cd === undefined) o.cd = 2.2;
            if (o && o.area_m2 === undefined) o.area_m2 = 1;
          });
        } else {
          if (sa.cd === undefined) sa.cd = 2.2;
          if (sa.area_m2 === undefined) sa.area_m2 = 1;
        }
      } else {
        delete c.force_model.drag;
        if (!Object.keys(c.force_model).length) delete c.force_model;
      }
      commit(true);
    });
    var cbSrp = mk('input', { type: 'checkbox', checked: srpOn });
    cbSrp.addEventListener('change', function () {
      if (!c.force_model || typeof c.force_model !== 'object') c.force_model = {};
      if (cbSrp.checked) {
        c.force_model.srp = true;
        delete c.force_model.solar_drag;
        if (mode === 'list') {
          (sa.orbits || []).forEach(function (o) {
            if (o && o.cr === undefined) o.cr = 1.8;
            if (o && o.area_m2 === undefined) o.area_m2 = 1;
          });
        } else {
          if (sa.cr === undefined) sa.cr = 1.8;
          if (sa.area_m2 === undefined) sa.area_m2 = 1;
        }
      } else {
        delete c.force_model.srp;
        delete c.force_model.solar_drag;
        if (!Object.keys(c.force_model).length) delete c.force_model;
      }
      commit(true);
    });
    var cbTb = mk('input', { type: 'checkbox', checked: !!(c.force_model && c.force_model.third_body === true) });
    cbTb.addEventListener('change', function () {
      if (!c.force_model || typeof c.force_model !== 'object') c.force_model = {};
      if (cbTb.checked) c.force_model.third_body = true; else delete c.force_model.third_body;
      if (!Object.keys(c.force_model).length) delete c.force_model;
      commit(true);
    });
    var fkids = [
      mk('label', { cls: 'ff inl' }, [cbDrag, mk('span', { text: 'Atmospheric drag' })]),
      mk('label', { cls: 'ff inl' }, [cbSrp, mk('span', { text: 'Solar radiation pressure (SRP)' })]),
      mk('label', { cls: 'ff inl' }, [cbTb, mk('span', { text: 'Sun and Moon gravity' })])
    ];
    formRoot.appendChild(grp('Forces (gravity is always on)', [row(fkids)], '<b>Forces Advice</b><br>• <b>Atmospheric drag</b>: Aerodynamic deceleration through Earth co-rotating atmosphere (active below 1,500 km).<br>• <b>Solar radiation pressure (SRP)</b>: Solar radiation pressure force directed away from the Sun, with automatic Earth shadow cutoff.<br>• <b>Sun and Moon gravity</b>: third-body pull of the Sun and Moon as point masses. Tens to hundreds of metres a day in LEO; the main perturbation in GEO (inclination grows about 0.75 to 0.95° a year).<br><br><i>Note: Spacecraft ballistic and optical properties (Cd, Cr, Area) are configured under <b>Satellites</b>.</i>'));
  }
  // satellites
  var mode = sa.pattern && typeof sa.pattern === 'object' ? (sa.pattern.type === 'train' ? 'train' : 'walker') : 'list';
  var topRowItems = [];
  if (mode !== 'list') {
    topRowItems.push(lab('Mass (kg)', numIn(sa, 'mass_kg', { def: 100, w: 65 })));
    if (dragOn) topRowItems.push(lab('Cd', numIn(sa, 'cd', { def: 2.2, w: 50 })));
    if (srpOn) topRowItems.push(lab('Cr', numIn(sa, 'cr', { def: 1.8, w: 50 })));
    if (dragOn || srpOn) topRowItems.push(lab('Area (m²)', numIn(sa, 'area_m2', { def: 1, w: 55 })));
  }
  topRowItems.push(lab('Orbits from', selIn([['list', 'List of satellites'], ['walker', 'Walker pattern'], ['train', 'Train (one orbit, spaced)']], mode, function (v) {
    var d = defaultOrbit(c), pre = sa.name_prefix || 'SAT';
    if (v === 'list') toList(c);
    else {
      delete sa.orbits; delete sa.names; sa.name_prefix = pre;
      if (sa.mass_kg === undefined) sa.mass_kg = d.mass_kg || 100;
      if (dragOn && sa.cd === undefined) sa.cd = d.cd !== undefined ? d.cd : 2.2;
      if (srpOn && sa.cr === undefined) sa.cr = d.cr !== undefined ? d.cr : 1.8;
      if ((dragOn || srpOn) && sa.area_m2 === undefined) sa.area_m2 = d.area_m2 !== undefined ? d.area_m2 : 1;
      delete d.mass_kg; delete d.cd; delete d.cr; delete d.area_m2;
      if (v === 'walker') { sa.pattern = { type: 'walker', a_m: d.a_m, e: 0, i_deg: d.i_deg, t: 12, p: 3, f: 1, raan0_deg: 0, ta0_deg: 0 }; delete sa.count; }
      else { sa.pattern = { type: 'train', base: d, offset: { along_track_m: 100000 } }; sa.count = 4; }
    }
    commit(true);
  })));
  kids = [row(topRowItems)];
  if (mode === 'walker') {
    var pt = sa.pattern;
    kids.push(row([lab('a (km)', numIn(pt, 'a_m', { scale: 1000 })), lab('e', numIn(pt, 'e', { def: 0, w: 60 })), lab('i (deg)', numIn(pt, 'i_deg', { w: 60 })), lab('Total T', numIn(pt, 't', { int: true, w: 50 })), lab('Planes P', numIn(pt, 'p', { int: true, w: 50 })), lab('Phasing F', numIn(pt, 'f', { int: true, def: 0, w: 50 })),
      lab('First RAAN (deg)', numIn(pt, 'raan0_deg', { def: 0, w: 70 })), lab('First true anomaly (deg)', numIn(pt, 'ta0_deg', { def: 0, w: 70 })), lab('Name prefix', txtIn(sa.name_prefix === undefined ? 'SAT' : sa.name_prefix, function (v) { sa.name_prefix = cleanName(v) || 'SAT'; commit(); }, 90))]));
  } else if (mode === 'train') {
    var tp = sa.pattern; if (!tp.base || typeof tp.base !== 'object') tp.base = defaultOrbit(c); if (!tp.offset || typeof tp.offset !== 'object') tp.offset = { along_track_m: 100000 };
    var ok = Object.keys(tp.offset)[0] || 'along_track_m';
    kids.push(row([lab('Satellites', numIn(sa, 'count', { int: true, w: 50 }))].concat(kepFields(tp.base, 70))));
    kids.push(row([lab('Spacing', selIn([['along_track_m', 'Along-track distance (km)'], ['ta_deg', 'True anomaly (deg)'], ['raan_deg', 'RAAN (deg)']], ok, function (v) { tp.offset = {}; tp.offset[v] = v === 'along_track_m' ? 100000 : 5; commit(true); })),
      lab('Per satellite', numIn(tp.offset, ok, { scale: ok === 'along_track_m' ? 1000 : 1, w: 70 })), lab('Name prefix', txtIn(sa.name_prefix === undefined ? 'SAT' : sa.name_prefix, function (v) { sa.name_prefix = cleanName(v) || 'SAT'; commit(); }, 90))]));
  } else {
    if (!Array.isArray(sa.orbits)) sa.orbits = [];
    var names = satNames(c), tbl = mk('table'), hd = mk('tr');
    var cols = ['Name', 'a (km)', 'e', 'i', 'RAAN', 'Arg. per.', 'True an.', 'Mass (kg)'];
    if (dragOn) cols.push('Cd');
    if (srpOn) cols.push('Cr');
    if (dragOn || srpOn) cols.push('Area (m²)');
    cols.push('');
    cols.forEach(function (h) { hd.appendChild(mk('th', { text: h })); }); tbl.appendChild(mk('thead', {}, [hd]));
    var body = mk('tbody'); tbl.appendChild(body);
    sa.orbits.forEach(function (o, i) {
      var tr = mk('tr'), td = function (k) { tr.appendChild(mk('td', {}, [k])); };
      td(txtIn(names[i] || '', function (v) { toList(c); sa.names[i] = cleanName(v) || sa.names[i]; commit(true); }, 104));
      if (o && o.type === 'keplerian') { td(numIn(o, 'a_m', { scale: 1000, w: 74 })); td(numIn(o, 'e', { w: 54 })); td(numIn(o, 'i_deg', { w: 50 })); td(numIn(o, 'raan_deg', { w: 50 })); td(numIn(o, 'argp_deg', { w: 50 })); td(numIn(o, 'ta_deg', { w: 50 })); }
      else { var what = o && o.type === 'tle' ? 'TLE, catalogue number ' + String(o.line1 || '').substr(2, 5).trim() : o && o.type === 'cartesian' ? 'State vector (edit in JSON)' : 'Unknown orbit type'; var cell = mk('td', { text: what, colSpan: 6 }); tr.appendChild(cell); }
      td(numIn(o, 'mass_kg', { def: sa.mass_kg, w: 54 }));
      if (dragOn) td(numIn(o, 'cd', { def: sa.cd === undefined ? 2.2 : sa.cd, w: 46 }));
      if (srpOn) td(numIn(o, 'cr', { def: sa.cr === undefined ? 1.8 : sa.cr, w: 46 }));
      if (dragOn || srpOn) td(numIn(o, 'area_m2', { def: sa.area_m2 === undefined ? 1 : sa.area_m2, w: 50 }));
      td(btn('×', function () { if (sa.orbits.length < 2) return; toList(c); sa.orbits.splice(i, 1); sa.names.splice(i, 1); sa.count = sa.orbits.length; commit(true); }, 'mini'));
      tr.lastChild.firstChild.title = 'Remove this satellite'; body.appendChild(tr);
    });
    kids.push(mk('div', { cls: 'grid' }, [tbl]));
    kids.push(row([btn('Add satellite', function () {
      if (sa.orbits.length >= 100) return; toList(c); var d = defaultOrbit(c), n = sa.orbits.length + 1, nm; d.ta_deg = (d.ta_deg + 30) % 360;
      var last = sa.orbits[sa.orbits.length - 1];
      d.mass_kg = (last && last.mass_kg !== undefined) ? last.mass_kg : (sa.mass_kg || 100);
      if (dragOn) d.cd = (last && last.cd !== undefined) ? last.cd : (sa.cd !== undefined ? sa.cd : 2.2);
      if (srpOn) d.cr = (last && last.cr !== undefined) ? last.cr : (sa.cr !== undefined ? sa.cr : 1.8);
      if (dragOn || srpOn) d.area_m2 = (last && last.area_m2 !== undefined) ? last.area_m2 : (sa.area_m2 !== undefined ? sa.area_m2 : 1);
      do { nm = 'SAT-' + (n < 10 ? '0' : '') + n; n++; } while (sa.names.indexOf(nm) >= 0);
      sa.orbits.push(d); sa.names.push(nm); sa.count = sa.orbits.length; commit(true);
    }), earth ? btn('Import TLE…', tleDialog) : null]));
  }
  formRoot.appendChild(grp('Satellites', kids, '<b>Satellites &amp; Spacecraft Parameters Advice</b><br>• <b>Mass</b>: Spacecraft mass in kg (up to 10,000 kg).<br>• <b>Aerodynamic &amp; Optical Properties</b> (active when corresponding force is enabled):<br>&nbsp;&nbsp;– <b>Cd</b>: Drag coefficient (typically 2.2 in LEO).<br>&nbsp;&nbsp;– <b>Cr</b>: Radiation pressure coefficient (1.0 = total absorption, 2.0 = specular reflection).<br>&nbsp;&nbsp;– <b>Area</b>: Cross-sectional projected area in m².<br>• <b>Time-Varying Cr</b>: In <b>Edit config as JSON</b>, an epoch schedule can be supplied, e.g. <code>"cr": [[0, 2.0], [86400, 1.4]]</code>.<br>• <b>Orbits</b>: Enter Keplerian elements (a in km, e, i, RAAN, &omega;, &nu;) or import a TLE.'));
  // manoeuvres
  var mans = Array.isArray(c.maneuvers) ? c.maneuvers : [], nm2 = satNames(c); kids = [];
  if (mans.length) {
    var mt = mk('table'), mh = mk('tr'); ['Satellite', 'Time (s)', 'Frame', 'Δv 1', 'Δv 2', 'Δv 3 (m/s)', ''].forEach(function (h) { mh.appendChild(mk('th', { text: h })); }); mt.appendChild(mk('thead', {}, [mh]));
    var mb = mk('tbody'); mt.appendChild(mb);
    mans.forEach(function (b, j) {
      var tr = mk('tr'), td = function (k) { tr.appendChild(mk('td', {}, [k])); }; if (!Array.isArray(b.dv_m_s)) b.dv_m_s = [0, 0, 0];
      td(selIn((nm2.indexOf(b.sat) < 0 ? [[b.sat, String(b.sat)]] : []).concat(nm2.map(function (q) { return [q, q]; })), b.sat, function (v) { b.sat = v; commit(); }));
      if (b.epoch !== undefined) td(txtIn(String(b.epoch), function (v) { b.epoch = v; commit(); }, 150)); else td(numIn(b, 't_s'));
      td(selIn([['lvlh', 'Radial / along / cross'], ['inertial', 'Inertial x / y / z']], b.frame || 'lvlh', function (v) { b.frame = v; commit(); }));
      td(numIn(b.dv_m_s, 0, { w: 52 })); td(numIn(b.dv_m_s, 1, { w: 52 })); td(numIn(b.dv_m_s, 2, { w: 52 }));
      td(btn('×', function () { mans.splice(j, 1); if (!mans.length) delete c.maneuvers; commit(true); }, 'mini')); tr.lastChild.firstChild.title = 'Remove this burn'; mb.appendChild(tr);
    });
    kids.push(mk('div', { cls: 'grid' }, [mt]));
  }
  kids.push(row([btn('Add burn', function () { if (!Array.isArray(c.maneuvers)) c.maneuvers = []; c.maneuvers.push({ sat: nm2[0] || 'SAT-01', t_s: 3600, dv_m_s: [0, 1, 0], frame: 'lvlh' }); commit(true); })]));
  formRoot.appendChild(grp('Manoeuvres (instant burns)', kids, '<b>Manoeuvres (Impulses) Advice</b><br>• <b>Satellite</b>: Target satellite for the burn.<br>• <b>Time</b>: Seconds from start (<code>t_s</code>) or an ISO 8601 epoch.<br>• <b>Frame &amp; &Delta;v</b>:<br>&nbsp;&nbsp;– <i>lvlh</i>: &Delta;v components along Radial, Along-track (in-flight direction), and Cross-track (normal to plane).<br>&nbsp;&nbsp;– <i>inertial</i>: &Delta;v components along the parent body non-rotating X, Y, Z axes.'));
}

// TLE import dialog
export function tleDialog() {
  var c = formCfg; if (!c) return;
  var ta = mk('textarea', { spellcheck: false, placeholder: 'Paste two lines (or three with a name line):\n1 25544U 98067A   ...\n2 25544  51.6416 ...' }), err = mk('p', { cls: 'warn' });
  var cbE = mk('input', { type: 'checkbox', checked: true }), cbR = mk('input', { type: 'checkbox' });
  var close = function () { dlg.remove(); };
  var ok = btn('OK', function () {
    var ls = ta.value.split(/\r?\n/).map(function (l) { return l.replace(/\s+$/, ''); }).filter(function (l) { return l.trim(); }), i1 = -1, tle;
    ls.forEach(function (l, k) { if (i1 < 0 && /^1 /.test(l) && ls[k + 1] && /^2 /.test(ls[k + 1])) i1 = k; });
    if (i1 < 0) { err.textContent = 'Could not find a line starting with "1 " followed by a line starting with "2 ".'; return; }
    try { tle = S.parseTle(ls[i1], ls[i1 + 1]); } catch (e) { err.textContent = 'That TLE could not be read: ' + e.message + '.'; return; }
    var sa = c.satellites, nm = cleanName(i1 > 0 ? ls[i1 - 1].replace(/^0 /, '') : '') || 'SAT-' + tle.satnum, base = nm, n = 2;
    toList(c); if (cbR.checked) { sa.orbits = []; sa.names = []; }
    while (sa.names.indexOf(nm) >= 0) nm = base + ' (' + (n++) + ')';
    sa.orbits.push({ type: 'tle', line1: ls[i1], line2: ls[i1 + 1], mass_kg: sa.mass_kg || 100 }); sa.names.push(nm); sa.count = sa.orbits.length;
    if (cbE.checked) c.start_epoch = S.formatUtc(tle.tt).replace('Z', ' UTC');
    close(); commit(true);
  }, 'primary');
  var dlg = mk('div', { id: 'dlg' }, [mk('div', { cls: 'window' }, [mk('div', { cls: 'title-bar', text: 'Import TLE' }), mk('div', { cls: 'dbody' }, [ta,
    mk('label', { cls: 'ff inl' }, [cbE, mk('span', { text: 'Set the start epoch to the TLE epoch' })]), mk('label', { cls: 'ff inl' }, [cbR, mk('span', { text: 'Replace the current satellites' })]),
    mk('p', { cls: 'muted', text: 'The TLE is propagated to start_epoch with SGP4 (SDP4 for periods of 225 minutes or more). From there the simulator uses its own force model, so it drifts from SGP4 over time.' }), err, row([ok, btn('Cancel', close)])])])]);
  document.body.appendChild(dlg); ta.focus();
}

export var formTimer = 0;

export function init() {
  // ------------------------------------------------------------ setup form. It edits the JSON config, which stays the single source of truth.
  formRoot = $('form');
  $('config').addEventListener('input', function () { clearTimeout(formTimer); formTimer = setTimeout(renderForm, 500); });
}
