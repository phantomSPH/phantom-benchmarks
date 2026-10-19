#!/usr/bin/env python3
"""
The Phantom benchmarking suite: check conservation properties from a .ev file

Usage: evcheck.py run.ev CONSERVE [conservation.ref] [--update-ref]

CONSERVE lists the quantities that should be conserved, one per line:
    <ev column label>  <exact|ref>  [C]
  exact : conserved to round-off by construction, must stay below C*eps
          (e.g. linear/angular momentum, centre of mass with global timesteps)
  ref   : conserved only to truncation error; must be no worse than
          factor*(error in reference run), stored in conservation.ref
  C     : multiplier on machine epsilon for the round-off floor (default 100)
An optional line "factor <value>" sets the allowed degradation (default 1.1).

The error in quantity Q is max_t |Q(t) - Q(0)| (for the centre of mass, after
removing uniform motion), normalised by |Q(0)| when
|Q(0)| > 1e-3, as in check_conservation_error in phantom/src/main/checkconserved.f90

Prints one line per quantity followed by "RESULT <pass|improved|fail> q=err,..."
Exit status is 1 on failure, 0 otherwise.
"""
import math
import os
import re
import sys

EPS = 2.220446049250313e-16  # double precision machine epsilon
EV_DIGITS = 11               # significant figures in .ev files (written with es18.10)
EV_NQUANTA = 10              # allowed error in units of the last digit written to the .ev file


def read_ev(filename):
    """read an .ev file into a dict of column label -> list of values"""
    with open(filename) as f:
        labels = re.findall(r'\[\d+\s+(.*?)\]', f.readline())
        cols = {lab.strip(): [] for lab in labels}
        keys = list(cols)
        for line in f:
            if line.startswith('#') or not line.strip():
                continue
            for key, val in zip(keys, line.split()):
                cols[key].append(float(val))
    return cols


def read_pairs(filename):
    """read lines of whitespace-separated tokens, ignoring comments"""
    with open(filename) as f:
        return [line.split('#')[0].split() for line in f if line.split('#')[0].strip()]


def detrend(t, vals):
    """remove uniform motion: the centre of mass moves in a straight line if momentum is conserved"""
    if len(t) < 2 or t[-1] == t[0]:
        return vals
    v = (vals[-1] - vals[0]) / (t[-1] - t[0])
    return [q - v * (ti - t[0]) for ti, q in zip(t, vals)]


def ev_quantum(vals):
    """largest round-off from writing values with EV_DIGITS significant figures"""
    return max(10.**(math.floor(math.log10(abs(q))) - EV_DIGITS + 1) if q else 0. for q in vals)


def conservation_error(vals, raw):
    """max error over the run; returns (err, floor due to .ev output precision)"""
    q0 = vals[0]
    floor = EV_NQUANTA * ev_quantum(raw)
    if abs(q0) > 1.e-3:
        return max(abs(q - q0) for q in vals) / abs(q0), floor / abs(q0)
    return max(abs(q - q0) for q in vals), floor


def check(evfile, conservefile, reffile=None, update_ref=False):
    """compare conservation errors against round-off or the reference run"""
    ev = read_ev(evfile)
    have_ref = reffile and os.path.exists(reffile) and not update_ref
    ref = {k: float(v) for k, v in read_pairs(reffile)} if have_ref else {}
    factor = 1.1
    status = 'pass'
    errs = {}
    for tokens in read_pairs(conservefile):
        if tokens[0] == 'factor':
            factor = float(tokens[1])
            continue
        name, mode = tokens[0], tokens[1]
        if name not in ev:
            print(f'{name:>10s}: not found in {evfile}')
            status = 'fail'
            continue
        vals = detrend(ev['time'], ev[name]) if name in ('xcom', 'ycom', 'zcom') else ev[name]
        err, evfloor = conservation_error(vals, ev[name])
        errs[name] = err
        floor = max((float(tokens[2]) if len(tokens) > 2 else 100.) * EPS, evfloor)
        if mode == 'exact':
            tol, verdict = floor, ('ok' if err <= floor else 'FAIL')
        elif name in ref:
            tol = max(factor * ref[name], floor)
            if err > tol:
                verdict = 'FAIL'
            elif ref[name] > floor and err < ref[name] / factor:
                verdict = 'improved'
            else:
                verdict = 'ok'
        else:
            tol, verdict = float('nan'), 'ok (no reference)'
        print(f'{name:>10s}: err = {err:.3e}  tol = {tol:.3e}  [{mode}] {verdict}')
        if verdict == 'FAIL':
            status = 'fail'
        elif verdict == 'improved' and status == 'pass':
            status = 'improved'
    if update_ref and reffile:
        with open(reffile, 'w') as f:
            f.write(f'# conservation errors from reference run {evfile}\n')
            f.writelines(f'{k} {v:.6e}\n' for k, v in errs.items())
        print(f'wrote {reffile}')
    print('RESULT', status, ','.join(f'{k}={v:.2e}' for k, v in errs.items()))
    return status


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) < 2:
        sys.exit(__doc__)
    result = check(*args[:3], update_ref='--update-ref' in sys.argv)
    sys.exit(1 if result == 'fail' else 0)
