// Documentation tab content.
import { $ } from '../app/dom.js';

export var docDiv;

export function init() {
  docDiv = $('docs');
  if (docDiv) docDiv.innerHTML = `
      <h1>Project Wednesday Documentation</h1>

      <p>Project Wednesday is a simple orbital simulator that can model satellite orbits. My good friend and colleague, Gowtham prefers to treat his Wednesdays as a no meetings day. On this day, he also prefers to work from home which leads to a significant dip in my quality of life because I like bothering him with requests for random orbital simulations. Project Wednesday fills this hole in my heart. I hope it can do the same for you. Enjoy.

      
      <h2>1. Coordinate Systems & Time Scales</h2>
      <p>The simulator relies on two primary reference frames depending on the celestial body defined in the JSON configuration:</p>
      <ul style="margin-left: 20px;">
        <li><b>Earth (WGS84):</b> The inertial frame is the Geocentric Celestial Reference Frame (GCRF, aligned with ICRF axes). The body-fixed frame is the International Terrestrial Reference Frame (ITRF). Transformation between GCRF and ITRF uses the <b>IAU 2006 precession</b> and <b>IAU 2000B nutation</b> series (the 77 luni-solar terms of <code>NUT00B</code>; polar motion is not applied) alongside the Earth Rotation Angle (ERA).</li>
        <li><b>Uniform Sphere:</b> The inertial frame is arbitrary, defined by the user-supplied Right Ascension (RA) and Declination (Dec) of the North Pole (IAU standard convention). The body rotates at a fixed rate <span class="math">&omega;</span> about this pole.</li>
      </ul>
      <p><b>Time Scales:</b> The simulator's internal integrator ticks in Terrestrial Time (TT) seconds past J2000.0. User inputs supporting UTC, TAI, TT, GPS, or TDB are converted rigorously. The system bundles the standard IERS Bulletin C leap-second schedule to compute TT = UTC + <span class="math">&Delta;AT</span> + 32.184s.</p>

      <h2>2. Physics & Propagation (Runge-Kutta 4)</h2>
      <p>The core uses a standard, fixed-step 4th-order Runge-Kutta (RK4) numerical integrator. The force model can be represented by the specific acceleration vector:</p>
      <p style="text-align: center;"><span class="math"><b>a</b> = <b>a</b><sub>grav</sub> + <b>a</b><sub>drag</sub> + <b>a</b><sub>srp</sub></span></p>
      
      <h3>Gravity (<span class="math"><b>a</b><sub>grav</sub></span>)</h3>
      <p>For Earth, the potential function <span class="math">U</span> is expanded using the standard geopotential equation with zonal harmonics <span class="math">J<sub>2</sub></span>, <span class="math">J<sub>3</sub></span> and <span class="math">J<sub>4</sub></span>. Higher-order tesseral harmonics and third-body gravitational perturbations (Lunar/Solar) are currently not computed.</p>

      <h3>Atmospheric Drag (<span class="math"><b>a</b><sub>drag</sub></span>)</h3>
      <p>Active when <code>force_model.drag = true</code> and altitude &lt; 1,500 km. Drag deceleration is given by:</p>
      <p style="text-align: center;"><span class="math"><b>a</b><sub>drag</sub> = -&frac12; C<sub>d</sub> (A/m) &rho; v<sub>rel</sub> <b>v</b><sub>rel</sub></span></p>
      <p>Where <span class="math"><b>v</b><sub>rel</sub></span> is the satellite velocity relative to the co-rotating atmosphere. Density <span class="math">&rho;</span> comes from a piecewise-exponential table (Vallado's table: US Standard Atmosphere 1976 up to 25 km, CIRA-72 above). It ignores solar activity, so real decay rates can differ by a factor of several.</p>
      
      <h3>Solar Radiation Pressure (<span class="math"><b>a</b><sub>srp</sub></span>)</h3>
      <p>Active when <code>force_model.srp = true</code>. Acceleration is directed strictly away from the Sun:</p>
      <p style="text-align: center;"><span class="math"><b>a</b><sub>srp</sub> = -P<sub>srp</sub> (1 AU / r<sub>&odot;</sub>)<sup>2</sup> C<sub>r</sub> (A/m) <b>û</b><sub>&odot;</sub></span></p>
      <p>Where the solar radiation pressure <span class="math">P<sub>srp</sub> &asymp; 4.56 &times; 10<sup>-6</sup> N/m&sup2;</span> at 1 AU, scaled by the Earth-Sun distance <span class="math">r<sub>&odot;</sub></span> (about &plusmn;3.4% over a year). This is the cannonball model: a constant area facing the Sun. SRP is switched off inside a cylindrical Earth shadow (no penumbra) and uses the Sun direction from Earth's centre. Time-varying optical properties can be modelled with a <span class="math">C<sub>r</sub></span> schedule in the JSON. <code>"solar_drag"</code> is accepted as another name for <code>"srp"</code>, but SRP is radiation pressure, not drag.</p>

      <h2>3. Orbit Metrics & Analytics</h2>
      <table class="doc-table">
        <tr><th>Metric</th><th>Definition & Computation</th></tr>
        <tr><td><b>Energy Drift</b></td><td>Specific orbital energy (and the Jacobi integral for a uniform sphere) is checked at every output row. The simulator adds up the work done by drag and SRP, and the energy added by burns, and removes them. The residual change in energy constitutes the <i>numerical integration error</i> (typically &lt; 10<sup>-8</sup>).</td></tr>
        <tr><td><b>LTAN</b></td><td>Local Time of the Ascending Node. Calculated geometrically using the cross product of the true pole of date and the angular momentum vector. The drift rate is a least-squares line through the LTAN samples, and needs at least 3 orbits and 12 hours of run (important for sun-synchronous orbits).</td></tr>
        <tr><td><b>&beta;-Angle</b></td><td>The elevation angle of the Sun vector relative to the instantaneous orbital plane.</td></tr>
      </table>

      <h2>4. Maneuvers & Impulsive Thrusts</h2>
      <p>Instantaneous velocity changes (<span class="math">&Delta;v</span>) are processed discretely between integration steps. In the <b>LVLH</b> frame (Local Vertical, Local Horizontal), vectors correspond to <span class="math">[Radial, Along-Track, Cross-Track]</span>. In the <b>Inertial</b> frame, vectors correspond to ICRF X, Y, Z axes.</p>
      
      <h2>5. Writing Custom JSON Configurations</h2>
      <p>The simulator uses a strict JSON schema to initialize the astrodynamics engine. You can copy an example from the <b>Trial</b> dropdown and modify it in the <b>Edit config as JSON</b> box.</p>
      
      <h3>Core Setup</h3>
      <pre><code>{
  "parent": { "shape": "earth_default" },
  "start_epoch": "2026-11-10T06:30:00.000 UTC",
  "duration": "P1D",
  "integrator": { "type": "rk4", "time_step_s": 10 },
  "output_step_s": 60,
  "force_model": {
    "drag": true,
    "srp": false
  },
  "satellites": { ... }
}</code></pre>
      
      <h3>Defining Satellites</h3>
      <p>Satellites can be defined individually as a list, or generated as a constellation pattern (Walker or Train).</p>
      
      <h4>Option A: Individual Orbits</h4>
      <pre><code>"satellites": {
  "count": 2,
  "mass_kg": 150,
  "names": ["LEO-1", "GEO-1"],
  "orbits": [
    { 
      "type": "keplerian", 
      "a_m": 6928137, "e": 0, "i_deg": 53, 
      "raan_deg": 0, "argp_deg": 0, "ta_deg": 0,
      "cd": 2.2, "area_m2": 1.5 
    },
    { 
      "type": "tle", 
      "line1": "1 25544U 98067A   ...", 
      "line2": "2 25544  51.6416 ..." 
    }
  ]
}</code></pre>

      <h4>Option B: Walker Constellation</h4>
      <pre><code>"satellites": {
  "mass_kg": 120,
  "name_prefix": "POLAR",
  "pattern": {
    "type": "walker",
    "a_m": 7578137, "i_deg": 87.9,
    "t": 36, "p": 6, "f": 1
  }
}</code></pre>

      <h3>Time-Varying Spacecraft Properties</h3>
      <p>If you want to simulate a solar sail deploying, or a drag skirt extending, you can provide a schedule for <code>cr</code> instead of a single number. Each entry is <code>[t_s, cr]</code> or <code>{"epoch": ..., "cr": ...}</code>. Values between entries are interpolated linearly and held flat outside them. Here Cr is 1.8 at the start and ramps to 2.0 after one day. <code>cd</code> takes a single number only.</p>
      <pre><code>"cr": [
  [0, 1.8],
  [86400, 2.0]
]</code></pre>

      <h3>Adding Maneuvers</h3>
      <p>Maneuvers are defined in a separate top-level array, mapping a target satellite name to a specific epoch and <span class="math">&Delta;v</span> vector.</p>
      <pre><code>"maneuvers": [
  {
    "sat": "LEO-1",
    "t_s": 3600,
    "dv_m_s": [0, 2.5, 0],
    "frame": "lvlh"
  }

]</code></pre>

  <h2>6. Source Code, License &amp; Attribution</h2>
<p>
  The source code is on GitHub at
  <a href="https://github.com/khandelwalkshitij/project-wednesday" target="_blank" rel="noopener">github.com/khandelwalkshitij/project-wednesday</a>.
  Report bugs or request features through the
  <a href="https://github.com/khandelwalkshitij/project-wednesday/issues" target="_blank" rel="noopener">issue tracker</a>.
  The <a href="https://github.com/khandelwalkshitij/project-wednesday/blob/main/CHANGELOG.md" target="_blank" rel="noopener">changelog</a>
  lists what changed in each version.
</p>
<p>
  <b>Project Wednesday</b> is open-source software released under the 
  <a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener">MIT License</a>. 
  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to the standard MIT conditions. The software is provided "as is", without warranty of any kind, express or implied.
</p>


<h3>Third-Party Models &amp; Data Sources</h3>
<ul style="margin-left: 20px;">
  <li>
    <b>Astronomical &amp; Geodetic Standards:</b> Precession and nutation algorithms implement IAU 2006/2000B conventions. Ephemeris tables and time transformations incorporate data published by the International Earth Rotation and Reference Systems Service (IERS Bulletin C) and standard WGS84 / EGM96 geopotential coefficients.
  </li>
  <li>
    <b>Cartographic Vectors:</b> Continental outlines and shoreline reference polygons are derived from <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a> public-domain vector datasets.
  </li>
  <li>
    <b>Graphics Pipeline:</b> 3D globe and celestial rendering powered by <a href="https://threejs.org/" target="_blank" rel="noopener">Three.js</a>, licensed under the MIT License (Copyright &copy; 2010–2026 Three.js Authors).
  </li>
</ul>

`;
}
