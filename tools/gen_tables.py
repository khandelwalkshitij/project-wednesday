# Regenerates the ERFA-derived tables and test truth. Usage: python3 tools/gen_tables.py <path to erfa/src>
# Needs numpy and pyerfa. Writes src/data/*.js (then add the one-line header comment back) and tests/fixtures/erfa_truth.json.
import re, json, sys, math
import numpy as np, erfa
E = sys.argv[1]
src = open(f"{E}/nut00b.c").read()
blk = src[src.index("} x[] = {"):]
blk = blk[:blk.index("};")]
nut = [[float(v) for v in m.split(",")] for m in re.findall(r"\{([^{}]+)\}", blk)]
assert len(nut) == 77 and all(len(r) == 11 for r in nut)

src = open(f"{E}/dtdb.c").read()
blk = src[src.index("fairhd[787][3] = {"):]
blk = blk[:blk.index("};")]
fh = [[float(v) for v in m.split(",")] for m in re.findall(r"\{([^{}]+)\}", blk)]
assert len(fh) == 787
groups = [(0, 474), (474, 679), (679, 764), (764, 784), (784, 787)]
TMAX, THR = 0.1, 4e-9
tdb = []
for k, (a, b) in enumerate(groups):
    tdb.append([fh[j] for j in range(a, b) if abs(fh[j][0]) * TMAX**k > THR])
print("tdb terms kept:", [len(g) for g in tdb], file=sys.stderr)
def mine(t):
    w = 0.0
    for k in range(4, -1, -1):
        w = w * t + sum(a * math.sin(f * t + p) for a, f, p in tdb[k])
    return w
err = 0
for jd in np.linspace(2444239.5, 2473459.5, 4000):
    t = (jd - 2451545.0) / 365250.0
    err = max(err, abs(mine(t) - erfa.dtdb(jd, 0.0, 0.0, 0.0, 0.0, 0.0)))
print("max TDB-TT error vs ERFA 1980-2060 [s]:", err, file=sys.stderr)

src = open(f"{E}/dat.c").read()
leap = [(int(y), int(m), float(d)) for y, m, d in re.findall(r"\{\s*(\d{4}),\s*(\d+),\s*([\d.]+)\s*\}", src) if int(y) >= 1972]
print("leap entries:", len(leap), "last:", leap[-1], file=sys.stderr)
leap_obj = {"name": "leap_seconds", "source": "IERS Bulletin C (same content as NAIF naif0012.tls)", "version": "%04d-%02d-01" % leap[-1][:2],
            "entries": [["%04d-%02d-01" % (y, m), int(d)] for y, m, d in leap]}
print("leap-second JSON for index.html:", json.dumps(leap_obj))
open("src/data/nutation-iau2000b.js", "w").write("export var NUT00B = " + json.dumps(nut, separators=(",", ":")).replace(".0,", ",").replace(".0]", "]") + ";\n")
open("src/data/tdb-series.js", "w").write("export var TDB_TERMS = " + json.dumps(tdb, separators=(",", ":")) + ";\n")

# ERFA truth for tests
truth = []
for utc in [(2000,1,1,12,0,0.0),(2015,6,30,23,59,59.5),(2020,3,1,0,0,0.0),(2026,11,10,6,30,0.0),(2026,11,10,18,45,12.345),(2031,7,4,3,2,1.0),(2040,12,31,23,0,0.0)]:
    u1, u2 = erfa.dtf2d("UTC", *utc)
    a1, a2 = erfa.utctai(u1, u2); t1, t2 = erfa.taitt(a1, a2)
    for dut in (0.0, 0.0731):
        r1, r2 = erfa.utcut1(u1, u2, dut)
        M = erfa.c2t06a(t1, t2, r1, r2, 0.0, 0.0)
        tt_s = ((t1 - 2451545.0) + t2) * 86400.0
        g = erfa.dtdb(t1, t2, 0.0, 0.0, 0.0, 0.0)
        truth.append({"utc": "%04d-%02d-%02dT%02d:%02d:%06.3f" % utc, "dut1": dut, "tt_s": tt_s, "dat": float(erfa.dat(utc[0], utc[1], utc[2], 0.0)), "M": M.tolist(), "tdb_minus_tt": float(g)})
open("tests/fixtures/erfa_truth.json", "w").write(json.dumps(truth))
