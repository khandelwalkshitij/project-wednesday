// Example configs for the Trial menu and the Reset button.
import { D2R, R2D, S } from './boot.js';
import { $, el } from './dom.js';
import { renderForm } from './form.js';
import { runSim, showErrors } from './run.js';

export var RE;

export function kep(a, e, i, raan, argp, ta) { return { type: 'keplerian', a_m: a, e: e, i_deg: i, raan_deg: raan, argp_deg: argp, ta_deg: ta }; }

export var PRESETS;

export var defaultOpt;

export function setPreset(i) { 
  $('config').value = JSON.stringify(PRESETS[i][1](), null, 2); 
  renderForm(); 
}

export function init() {
  // ------------------------------------------------------------ example configs
  RE = S.EARTH.a;

  PRESETS = [
    ['Earth: LTAN drift, sun-synchronous vs 53 deg', function () {
      var a = RE + 550e3, n = Math.sqrt(S.EARTH.mu / Math.pow(a, 3)), inc = Math.acos(-(0.9856473 * D2R / 86400) / (1.5 * n * S.EARTH.J2 * Math.pow(RE / a, 2))) * R2D;
      var tt0 = S.parseEpoch('2026-11-10T06:30:00.000 UTC').tt, raan = 0;
      for (var it = 0; it < 5; it++) { var d = 10.5 - S.ltanHours(S.kepToState(S.EARTH.mu, a, 0, inc * D2R, raan * D2R, 0, 0), tt0, 0); d -= 24 * Math.round(d / 24); raan += d * 15; }
      raan = Math.round((((raan % 360) + 360) % 360) * 1e4) / 1e4; inc = Math.round(inc * 1e4) / 1e4;
      return { parent: { shape: 'earth_default' }, start_epoch: '2026-11-10T06:30:00.000 UTC', duration: 'P5D', integrator: { type: 'rk4', time_step_s: 10 }, output_step_s: 300,
        satellites: { count: 2, mass_kg: 150, names: ['SSO 10:30', 'Inclined 53'], orbits: [kep(a, 0, inc, raan, 0, 0), kep(a, 0, 53, raan, 0, 0)] } };
    }],
    ['Earth: one satellite in low orbit', function () {
      return { parent: { shape: 'earth_default' }, start_epoch: '2026-11-10T06:30:00.000 UTC', duration: 'PT6H', integrator: { type: 'rk4', time_step_s: 10 }, output_step_s: 30,
        satellites: { count: 1, mass_kg: 150, names: ['LEO-550'], orbits: [kep(RE + 550e3, 0.001, 97.6, 40, 90, 0)] } };
    }],
    ['Earth: Walker constellation, 12 satellites in 3 planes', function () {
      return { parent: { shape: 'earth_default' }, start_epoch: '2026-11-10T06:30:00.000 UTC', duration: 'PT4H', integrator: { type: 'rk4', time_step_s: 10 }, output_step_s: 30,
        satellites: { mass_kg: 150, name_prefix: 'SAT', pattern: { type: 'walker', a_m: RE + 600e3, e: 0, i_deg: 53, t: 12, p: 3, f: 1, raan0_deg: 0, ta0_deg: 0 } } };
    }],
    ['Earth: low orbit, Molniya and geostationary', function () {
      var st = S.kepToState(S.EARTH.mu, RE + 420e3, 0.0005, 51.6 * D2R, 200 * D2R, 0, 0).map(function (v) { return Math.round(v * 1000) / 1000; });
      return { parent: { shape: 'earth_default' }, start_epoch: '2026-11-10T06:30:00.000 UTC', duration: 'P1D', integrator: { type: 'rk4', time_step_s: 10 }, output_step_s: 120,
        satellites: { count: 3, mass_kg: 500, names: ['LEO state vector', 'Molniya', 'GEO'],
          orbits: [{ type: 'cartesian', r_m: st.slice(0, 3), v_m_s: st.slice(3) }, kep(26554e3, 0.72, 63.4, 80, 270, 180), kep(42164137, 0, 0.05, 0, 0, 100)] } };
    }],
    ['Small body: two orbiters and an impact', function () {
      return { parent: { shape: 'sphere_uniform', radius_m: 250, density_kg_m3: 1900, rotation: { spin_period_s: 15480, pole_ra_deg: 85, pole_dec_deg: -60, prime_meridian_deg: 0 } },
        start_epoch: '2026-11-10T06:30:00.000 UTC', duration: 'P1D', integrator: { type: 'rk4', time_step_s: 20 }, output_step_s: 120,
        satellites: { count: 3, mass_kg: 20, names: ['orbiter', 'polar', 'impactor'], orbits: [kep(600, 0, 60, 0, 0, 0), kep(450, 0.1, 90, 120, 0, 90), kep(500, 0.6, 30, 0, 0, 180)] } };
    }],
    ['Earth: drag decay and re-boost burns', function () {
      return { parent: { shape: 'earth_default' }, start_epoch: '2026-11-10T06:30:00.000 UTC', duration: 'P3D', integrator: { type: 'rk4', time_step_s: 10 }, output_step_s: 60, force_model: { drag: true },
        satellites: { count: 3, mass_kg: 100, cd: 2.2, area_m2: 1, names: ['Decaying 300', 'Boosted 300', 'High 550'], orbits: [kep(RE + 300e3, 0, 51.6, 10, 0, 0), kep(RE + 300e3, 0, 51.6, 10, 0, 90), kep(RE + 550e3, 0, 97.6, 80, 0, 0)] },
        maneuvers: [{ sat: 'Boosted 300', t_s: 86400, dv_m_s: [0, 2, 0], frame: 'lvlh' }, { sat: 'Boosted 300', t_s: 172800, dv_m_s: [0, 2, 0], frame: 'lvlh' }] };
    }]
  ];

  defaultOpt = el('option', 'New Trial');

  defaultOpt.value = '';

  $('preset').appendChild(defaultOpt);

  PRESETS.forEach(function (p, i) { var o = el('option', p[0]); o.value = i; $('preset').appendChild(o); });

  $('preset').addEventListener('change', function () { 
    if (this.value !== '') {
      setPreset(+this.value); 
      runSim(); 
    }
  });

  $('newCfg').addEventListener('click', function () {
    $('preset').value = '';
    $('config').value = JSON.stringify({
      parent: { shape: 'earth_default' },
      start_epoch: '2026-11-11T00:00:00.000 UTC',
      duration: 'P1D',
      integrator: { type: 'rk4', time_step_s: 10 },
      output_step_s: 60,
      satellites: {
        count: 1,
        names: ['SAT-01'],
        orbits: [{ type: 'keplerian', a_m: RE + 500e3, e: 0, i_deg: 53, raan_deg: 0, argp_deg: 0, ta_deg: 0, mass_kg: 100 }]
      }
    }, null, 2);
    showErrors(null);
    renderForm();
  });
}
