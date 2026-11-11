"""Propagates every case in validation/runs/ with Orekit and compares against the simulator's output.

The Orekit runs use the same force models as the simulator wherever a choice exists, so the differences are
the simulator's numerical error plus the few documented model differences (SRP Sun ephemeris and shadow model).

Reference set-up:
  - Orekit 13 (orekit_jpype), Dormand-Prince 8(5,3), absolute tolerance 1e-7 m / 1e-10 m/s, relative 1e-13.
  - Gravity: Holmes-Featherstone with only C20, C30, C40 from the simulator's J2, J3, J4, in Orekit's TIRF
    (IERS 2010 precession-nutation, no EOP corrections, no polar motion: same pole as the simulator).
  - Earth shape for drag heights and SRP shadow: WGS84 OneAxisEllipsoid.
  - Drag: Orekit DragForce with the simulator's exponential density table re-implemented below. The density table
    is a model choice, not something being validated. Height from Orekit's exact geodetic conversion.
  - SRP: Orekit SolarRadiationPressure (conical shadow with penumbra, oblate Earth) with the Sun from JPL DE421,
    reference pressure 4.56e-6 N/m^2 at 1 AU.
  - Burns: ImpulseManeuver in the QSW local frame (radial, along-track, cross-track), no mass change.
  - Leap seconds: tai-utc.dat generated from ERFA, independent of the simulator's table.

Usage: python3 validation/compare_orekit.py   (after node validation/export-runs.mjs)
Needs: pip install orekit-jpype pyerfa jplephem de421 numpy, and a Java 11+ runtime.
"""
import glob
import json
import math
import os
import re
import sys
import time

import erfa
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'orekit-data')
AU = 149597870700.0


def write_leap_file():
    months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
    lines, prev = [], None
    for y in range(1972, 2028):
        for m in range(1, 13):
            d = erfa.dat(y, m, 1, 0.0)
            if d != prev:
                jd = sum(erfa.cal2jd(y, m, 1))
                lines.append(f" {y} {months[m - 1]:3s}  1 =JD {jd:9.1f}  TAI-UTC= {d:11.7f} S + (MJD - 41317.) X 0.0      S")
                prev = d
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, 'tai-utc.dat'), 'w') as f:
        f.write('\n'.join(lines) + '\n')


write_leap_file()
import orekit_jpype as orekit  # noqa: E402

orekit.initVM()
import jpype  # noqa: E402
from jpype import JImplements, JOverride, JArray, JDouble  # noqa: E402
from java.io import File  # noqa: E402
from org.orekit.data import DataContext, DirectoryCrawler  # noqa: E402

DataContext.getDefault().getDataProvidersManager().addProvider(DirectoryCrawler(File(DATA)))
from org.hipparchus.geometry.euclidean.threed import Vector3D  # noqa: E402
from org.hipparchus.ode.nonstiff import DormandPrince853Integrator  # noqa: E402
from org.orekit.attitudes import LofOffset, FrameAlignedProvider  # noqa: E402
from org.orekit.bodies import OneAxisEllipsoid  # noqa: E402
from org.orekit.forces.drag import DragForce, IsotropicDrag  # noqa: E402
from org.orekit.forces.gravity import HolmesFeatherstoneAttractionModel  # noqa: E402
from org.orekit.forces.gravity.potential import GravityFieldFactory, TideSystem  # noqa: E402
from org.orekit.forces.maneuvers import ImpulseManeuver  # noqa: E402
from org.orekit.forces.radiation import SolarRadiationPressure, IsotropicRadiationSingleCoefficient  # noqa: E402
from org.orekit.frames import FramesFactory, LOFType  # noqa: E402
from org.orekit.models.earth.atmosphere import Atmosphere  # noqa: E402
from org.orekit.orbits import CartesianOrbit, KeplerianOrbit, OrbitType, PositionAngleType  # noqa: E402
from org.orekit.propagation import SpacecraftState  # noqa: E402
from org.orekit.propagation.events import DateDetector  # noqa: E402
from org.orekit.propagation.numerical import NumericalPropagator  # noqa: E402
from org.orekit.time import AbsoluteDate, TimeScalesFactory  # noqa: E402
from org.orekit.utils import ExtendedPositionProvider, IERSConventions, PVCoordinates, TimeStampedPVCoordinates  # noqa: E402

GCRF = FramesFactory.getGCRF()
TIRF = FramesFactory.getTIRF(IERSConventions.IERS_2010, True)
TT = TimeScalesFactory.getTT()


def date_of(tt_seconds):
    return AbsoluteDate(AbsoluteDate.J2000_EPOCH, float(tt_seconds), TT)


# ---- simulator's exponential density table (same numbers as src/core/environment.js)
ATMO = [[0, 1.225, 7.249], [25, 3.899e-2, 6.349], [30, 1.774e-2, 6.682], [40, 3.972e-3, 7.554], [50, 1.057e-3, 8.382], [60, 3.206e-4, 7.714],
        [70, 8.770e-5, 6.549], [80, 1.905e-5, 5.799], [90, 3.396e-6, 5.382], [100, 5.297e-7, 5.877], [110, 9.661e-8, 7.263], [120, 2.438e-8, 9.473],
        [130, 8.484e-9, 12.636], [140, 3.845e-9, 16.149], [150, 2.070e-9, 22.523], [180, 5.464e-10, 29.740], [200, 2.789e-10, 37.105], [250, 7.248e-11, 45.546],
        [300, 2.418e-11, 53.628], [350, 9.518e-12, 53.298], [400, 3.725e-12, 58.515], [450, 1.585e-12, 60.828], [500, 6.967e-13, 63.822], [600, 1.454e-13, 71.835],
        [700, 3.614e-14, 88.667], [800, 1.170e-14, 124.64], [900, 5.245e-15, 181.05], [1000, 3.019e-15, 268.00]]


def density(h_m):
    hk = max(0.0, h_m / 1000.0)
    i = 0
    for k, row in enumerate(ATMO):
        if row[0] <= hk:
            i = k
    return ATMO[i][1] * math.exp(-(hk - ATMO[i][0]) / ATMO[i][2])


@JImplements(Atmosphere)
class TableAtmosphere:
    def __init__(self, earth):
        self.earth = earth

    @JOverride
    def getFrame(self):
        return TIRF

    @JOverride
    def getDensity(self, date, position, frame):
        if isinstance(date, AbsoluteDate):
            h = self.earth.transform(position, frame, date).getAltitude()
            return 0.0 if h > 1.5e6 else density(h)
        raise NotImplementedError('field version not needed')

    @JOverride
    def getVelocity(self, date, position, frame):     # air co-rotating with the Earth (fixed in TIRF)
        if not isinstance(date, AbsoluteDate):
            raise NotImplementedError('field version not needed')
        body_pos = frame.getTransformTo(TIRF, date).transformPosition(position)
        return TIRF.getTransformTo(frame, date).transformPVCoordinates(PVCoordinates(body_pos, Vector3D.ZERO)).getVelocity()


# ---- Sun from JPL DE421 (geocentric, ICRF axes)
from jplephem.ephem import Ephemeris  # noqa: E402
import de421  # noqa: E402

EPH = Ephemeris(de421)


def sun_gcrf(tt_seconds):
    jd = 2451545.0 + tt_seconds / 86400.0          # TT used for TDB: < 2 ms, irrelevant for the Sun direction
    emb, moon, sun = EPH.position('earthmoon', jd), EPH.position('moon', jd), EPH.position('sun', jd)
    earth = emb - moon * EPH.earth_share
    return (sun - earth)[:, 0] * 1000.0


@JImplements(ExtendedPositionProvider)
class SunProvider:
    @JOverride
    def getPosition(self, date, frame):
        if not isinstance(date, AbsoluteDate):
            raise NotImplementedError('field version not needed')
        p = sun_gcrf(date.durationFrom(AbsoluteDate.J2000_EPOCH))
        v = Vector3D(float(p[0]), float(p[1]), float(p[2]))
        return v if frame == GCRF else GCRF.getStaticTransformTo(frame, date).transformPosition(v)

    @JOverride
    def getPVCoordinates(self, date, frame):
        dt = 30.0
        a, b = self.getPosition(date.shiftedBy(-dt), frame), self.getPosition(date.shiftedBy(dt), frame)
        vel = Vector3D(1.0 / (2 * dt), b.subtract(a))
        return TimeStampedPVCoordinates(date, self.getPosition(date, frame), vel)


def zonal_provider(P):
    c = JArray(JArray(JDouble))(5)
    s = JArray(JArray(JDouble))(5)
    for n in range(5):
        c[n] = JArray(JDouble)(n + 1)
        s[n] = JArray(JDouble)(n + 1)
    c[0][0] = 1.0
    for n, J in ((2, P['J2']), (3, P['J3']), (4, P['J4'])):
        c[n][0] = -J / math.sqrt(2 * n + 1)        # fully normalised C_n0
    return GravityFieldFactory.getNormalizedProvider(P['a'], P['mu'], TideSystem.UNKNOWN, c, s)


def propagator(case, sat, init_state, tol_scale=1.0):
    P, earth_like = case['parent'], case['parent']['shape'] == 'earth_default'
    span = max(abs(x) for x in init_state[:3])
    abs_p, abs_v = 1e-7 * tol_scale * max(1.0, span / 7e6), 1e-10 * tol_scale * max(1.0, span / 7e6)
    if not earth_like:
        abs_p, abs_v = 1e-10 * tol_scale, 1e-13 * tol_scale
    atol = JArray(JDouble)([abs_p] * 3 + [abs_v] * 3 + [1e-6])
    rtol = JArray(JDouble)([1e-13 * tol_scale] * 7)
    integ = DormandPrince853Integrator(1e-6, 120.0, atol, rtol)
    prop = NumericalPropagator(integ)
    prop.setOrbitType(OrbitType.CARTESIAN)
    d0 = date_of(case['tt0'])
    pv = PVCoordinates(Vector3D(*map(float, init_state[:3])), Vector3D(*map(float, init_state[3:])))
    orbit = CartesianOrbit(pv, GCRF, d0, float(P['mu']))
    prop.setInitialState(SpacecraftState(orbit).withMass(float(sat['mass'])))
    if earth_like:
        body = OneAxisEllipsoid(P['a'], P['f'], TIRF)
        prop.addForceModel(HolmesFeatherstoneAttractionModel(TIRF, zonal_provider(P)))
        if case['drag']:
            prop.addForceModel(DragForce(TableAtmosphere(body), IsotropicDrag(float(sat['area']), float(sat['cd']))))
        if case['srp']:
            prop.addForceModel(SolarRadiationPressure(AU, 4.56e-6, SunProvider(), body,
                                                      IsotropicRadiationSingleCoefficient(float(sat['area']), float(sat['cr']))))
    for b in sat['burns']:
        att = LofOffset(GCRF, LOFType.QSW) if b['frame'] == 'lvlh' else FrameAlignedProvider(GCRF)
        prop.addEventDetector(ImpulseManeuver(DateDetector(d0.shiftedBy(float(b['t']))), att, Vector3D(*map(float, b['dv'])), 1e30))
    return prop, d0


def run_orekit(case, sat, times, init_state, tol_scale=1.0):
    prop, d0 = propagator(case, sat, init_state, tol_scale)
    out, burn_t = [], {float(b['t']) for b in sat['burns']}
    for t in times:
        # the simulator's row at a burn time carries the post-burn velocity; step just past the impulse to match
        st = prop.propagate(d0.shiftedBy(float(t) + (1e-6 if float(t) in burn_t else 0.0)))
        pv = st.getPVCoordinates(GCRF)
        p, v = pv.getPosition(), pv.getVelocity()
        out.append([p.getX(), p.getY(), p.getZ(), v.getX(), v.getY(), v.getZ()])
    return np.array(out)


def kep_check(case, sat):
    el = sat['elements']
    if not el:
        return None
    D = math.pi / 180
    o = KeplerianOrbit(float(el['a_m']), float(el['e']), el['i_deg'] * D, el['argp_deg'] * D, el['raan_deg'] * D, el['ta_deg'] * D,
                       PositionAngleType.TRUE, GCRF, date_of(case['tt0']), float(case['parent']['mu']))
    p = o.getPVCoordinates().getPosition()
    r0 = sat['rows'][0]
    return math.dist([p.getX(), p.getY(), p.getZ()], r0[1:4])


def fmt_len(m):
    if m < 1e-3:
        return '< 1 mm'
    if m < 1:
        return f'{m * 1000:.0f} mm' if m < 0.1 else f'{m * 100:.1f} cm'
    if m < 1000:
        return f'{m:.2f} m' if m < 10 else f'{m:.1f} m'
    return f'{m / 1000:.2f} km'


def dur(s):
    return f'{s / 86400:g} d' if s >= 86400 else f'{s / 3600:g} h'


results = []
for f in sorted(glob.glob(os.path.join(HERE, 'runs', '*.json'))):
    case = json.load(open(f))
    forces = ['J2-J4' if case['parent']['shape'] == 'earth_default' else 'point mass']
    if case['drag']:
        forces.append('drag')
    if case['srp']:
        forces.append('SRP')
    for sat in case['sats']:
        t0 = time.time()
        rows, half = np.array(sat['rows']), np.array(sat['rows_half'])
        times = rows[:, 0]
        if any(b for b in sat['burns']):
            forces_s = forces + ['burns']
        else:
            forces_s = forces
        ref = run_orekit(case, sat, times, sat['state'])
        ref_loose = run_orekit(case, sat, times, sat['state'], tol_scale=10.0)
        dp = np.linalg.norm(rows[:, 1:4] - ref[:, :3], axis=1)
        dv = np.linalg.norm(rows[:, 4:7] - ref[:, 3:], axis=1)
        n = min(len(half), len(ref))
        dp_half = np.linalg.norm(half[:n, 1:4] - ref[:n, :3], axis=1)
        noise = np.linalg.norm(ref[:, :3] - ref_loose[:, :3], axis=1)
        r = {'case': case['name'], 'sat': sat['name'], 'duration_s': float(times[-1]), 'step_s': case['step_s'], 'forces': ' + '.join(forces_s),
             'max_pos_m': float(dp.max()), 'final_pos_m': float(dp[-1]), 'max_vel_m_s': float(dv.max()), 'max_pos_half_step_m': float(dp_half.max()),
             'ref_noise_m': float(noise.max()), 'kep_to_cart_m': kep_check(case, sat), 'impact_s': sat['impact'],
             'orbit_m': float(np.linalg.norm(rows[0, 1:4]))}
        results.append(r)
        print(f"{r['case'][:44]:44s} {r['sat'][:16]:16s} max {fmt_len(r['max_pos_m']):>9s}  half-step {fmt_len(r['max_pos_half_step_m']):>9s}"
              f"  ref noise {fmt_len(r['ref_noise_m']):>8s}  ({time.time() - t0:.1f} s)", flush=True)

json.dump(results, open(os.path.join(HERE, 'results.json'), 'w'), indent=1)

# ---- README table. Cases with many identical satellites (the Walker preset) collapse to their worst satellite.
def vel(x):
    return '< 0.001 mm/s' if x < 1e-6 else f'{x * 1000:.2g} mm/s'


lines = ['| Case | Satellite | Span | Step | Forces | Max position error | Final position error | Max velocity error | Max error at half step |',
         '|---|---|---|---|---|---|---|---|---|']
for name in dict.fromkeys(r['case'] for r in results):
    group = [r for r in results if r['case'] == name]
    if len(group) > 4:
        w = max(group, key=lambda r: r['max_pos_m'])
        w = dict(w, sat=f"{len(group)} satellites (worst: {w['sat']})", final_pos_m=max(r['final_pos_m'] for r in group),
                 max_vel_m_s=max(r['max_vel_m_s'] for r in group), max_pos_half_step_m=max(r['max_pos_half_step_m'] for r in group))
        group = [w]
    for r in group:
        span = dur(r['duration_s']) + (' (to impact)' if r['impact_s'] else '')
        lines.append(f"| {r['case']} | {r['sat']} | {span} | {r['step_s']:g} s | {r['forces']} | {fmt_len(r['max_pos_m'])} | {fmt_len(r['final_pos_m'])} |"
                     f" {vel(r['max_vel_m_s'])} | {fmt_len(r['max_pos_half_step_m'])} |")
kc = [r['kep_to_cart_m'] for r in results if r['kep_to_cart_m'] is not None]
noise = max(r['ref_noise_m'] for r in results)
stamp = time.strftime('%Y-%m-%d')
block = '\n'.join(lines)
md = os.path.join(HERE, 'table.md')
open(md, 'w').write(block + '\n')
print(f'\nKeplerian to Cartesian vs Orekit: worst {fmt_len(max(kc))} over {len(kc)} satellites')
print(f'Orekit reference noise (tolerances x10 looser): worst {fmt_len(noise)}')
json.dump({'date': stamp, 'kep_worst_m': max(kc), 'kep_n': len(kc), 'noise_worst_m': noise},
          open(os.path.join(HERE, 'summary.json'), 'w'))

# replace the table in README.md between the markers
readme = os.path.join(HERE, '..', 'README.md')
text = open(readme).read()
m = re.search(r'(<!-- validation-table:start -->\n)(.*?)(<!-- validation-table:end -->)', text, re.S)
if m:
    text = text[:m.start(2)] + block + '\n' + text[m.end(2):]
    open(readme, 'w').write(text)
    print('README.md table updated')
