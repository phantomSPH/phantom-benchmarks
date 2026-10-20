#!/usr/bin/env python3
"""
The Phantom benchmarking suite: make reports from benchmark results

Results are read from <results>/<machine>/<benchmark>.csv as written by run-benchmarks.sh

Examples:
  report.py --machine gb10                      summary of latest results on gb10
  report.py --machine gb10 --scaling polar      strong scaling tables, figure and text
  report.py --machine gb10 --compare base head  markdown comparison of two labels (PRs)
  report.py --machine gb10 --status-html gfortran  html summary in the old nightly format
  report.py --site site/ --phantom ~/phantom    static website from all results, with the
                                                phantom commit history used to order them
  report.py --machine ozstar --scaling polar --su 2e6:5e4:48:20
      estimate kSU for 20 runs of 2e6 particles for 5e4 steps on 48 cores
"""
import argparse
import csv
import html
import json
import os
import shutil
import subprocess
import sys
from collections import defaultdict

STATUS_COLOUR = {'pass': '#009900', 'improved': '#0066cc', 'fail': '#ff0000'}


def read_results(resultsdir, machines=None, benches=None):
    """read all .csv files into a list of dicts, one per run"""
    rows = []
    if not os.path.isdir(resultsdir):
        return rows
    for machine in sorted(os.listdir(resultsdir)):
        mdir = os.path.join(resultsdir, machine)
        if not os.path.isdir(mdir) or (machines and machine not in machines):
            continue
        for fname in sorted(os.listdir(mdir)):
            bench = fname[:-4]
            if not fname.endswith('.csv') or (benches and bench not in benches):
                continue
            with open(os.path.join(mdir, fname)) as f:
                for row in csv.DictReader(f):
                    row['bench'] = bench
                    rows.append(row)
    return rows


def fnum(x):
    """convert to float, returning None for empty or invalid entries"""
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def latest(rows, key):
    """latest run for each unique key, preserving order of first appearance"""
    out = {}
    for row in rows:
        out[key(row)] = row
    return out


def run_time(row):
    """time for the calculation, excluding startup (reading the dump, initial derivatives),
    from phantom's own clock; falls back to the externally measured wall time, which includes
    startup, if phantom's clock is missing or not plausible (e.g. longer than the whole run)"""
    wall, code = fnum(row['wall']), fnum(row.get('code_wall'))
    if code and wall and code <= 1.02 * wall + 1.:
        return code
    return wall


def fmt(t):
    """time in seconds as a string"""
    return f'{t:.2f}' if t is not None else ''


def nmpi(row):
    """number of MPI tasks (1 for runs without MPI)"""
    return int(fnum(row.get('nmpi')) or 1)


def is_mpi(row):
    """run with a build that uses MPI (labelled e.g. gfortran-mpi), with any number of tasks"""
    return nmpi(row) > 1 or row['label'].endswith('-mpi')


def cpus(row):
    """threads, or MPI tasks x threads for runs with MPI"""
    return f"{nmpi(row)}x{row['nthreads']}" if nmpi(row) > 1 else row['nthreads']


def previous_wall(rows, row):
    """wall time of the previous successful run with the same benchmark, label and threads"""
    prev = None
    for r in rows:
        if r is row:
            return prev
        if (r['bench'], r['label'], r['nthreads'], nmpi(r)) == (row['bench'], row['label'], row['nthreads'], nmpi(row)) \
                and r['status'] != 'fail':
            prev = run_time(r)
    return prev


def pct(new, old):
    """percentage change, as a string"""
    if new is None or not old:
        return ''
    return f'{100. * (new - old) / old:+.1f}%'


def markdown_table(header, body):
    """simple github-flavoured markdown table"""
    lines = ['| ' + ' | '.join(header) + ' |', '|' + '---|' * len(header)]
    lines += ['| ' + ' | '.join(str(c) for c in r) + ' |' for r in body]
    return '\n'.join(lines)


def html_table(header, body):
    """html table, colouring status cells"""
    out = ['<table><tr>' + ''.join(f'<th>{html.escape(h)}</th>' for h in header) + '</tr>']
    for r in body:
        cells = []
        for c in r:
            colour = STATUS_COLOUR.get(str(c))
            style = f' style="color:{colour};font-weight:bold"' if colour else ''
            cells.append(f'<td{style}>{html.escape(str(c))}</td>')
        out.append('<tr>' + ''.join(cells) + '</tr>')
    return '\n'.join(out) + '</table>'


def summary(rows):
    """table of the latest result for each benchmark, build and thread count"""
    last = latest(rows, lambda r: (r['bench'], r['label'], r['nthreads'], nmpi(r)))
    header = ['benchmark', 'build', 'threads', 'npart', 'steps', 'time (s)', 'change',
              'total (s)', 'Mpart/s', 'cpu (s)', 'cpu/wall', 'status', 'phantom', 'date']
    body = [[r['bench'], r['label'], cpus(r), r['npart'], r['nsteps'], fmt(run_time(r)),
             pct(run_time(r), previous_wall(rows, r)), r['wall'], r.get('mpart_per_s') or '',
             r.get('cpu_time') or '', cpu_per_wall(r), r['status'], r['phantom_sha'],
             r['date'][:10]] for r in last.values()]
    return header, body


def cpu_per_wall(row):
    """ratio of cpu to wall time, which is below the number of threads if cpus are shared"""
    cpu, wall = fnum(row.get('cpu_time')), fnum(row['wall'])
    return f'{cpu / wall:.1f}' if cpu and wall else ''


# parts of the run timed by phantom: building the tree, density and force calculations, the
# rest of the calculation, and startup (reading the dump and initial derivatives)
ROUTINES = ['tree', 'density', 'force', 'other', 'startup']


def routine_times(row):
    """time in each part of the run, adding up to the externally measured wall time"""
    wall, code = fnum(row['wall']), fnum(row.get('code_wall'))
    parts = [fnum(row.get(k)) for k in ('tree', 'density', 'force')]
    if not wall or None in parts:
        return None
    # proportions come from phantom's timers, scaled to the time for the calculation
    # (if phantom's clock is unreliable this is the whole run, so startup is not separated)
    total = code or fnum(row.get('step'))
    if not total:
        return None
    calc = run_time(row)
    times = {k: t * calc / total for k, t in zip(ROUTINES, parts)}
    times['other'] = calc - sum(times.values())
    times['startup'] = wall - calc
    return {k: max(t, 0.) for k, t in times.items()}


def breakdown(rows):
    """percentage of the wall time spent in each part, for the latest run of each build"""
    last = latest(rows, lambda r: (r['bench'], r['label'], r['nthreads'], nmpi(r)))
    header = ['benchmark', 'build', 'threads', 'total (s)'] + [f'{k} %' for k in ROUTINES]
    body = []
    for r in last.values():
        t = routine_times(r)
        if t:
            body.append([r['bench'], r['label'], cpus(r), r['wall']] +
                        [f'{100. * t[k] / fnum(r["wall"]):.0f}' for k in ROUTINES])
    return header, body


def routine_scaling(rows, bench, label):
    """time in each part of the calculation against number of threads, for one build"""
    ok = [r for r in rows if r['bench'] == bench and r['label'] == label and r['status'] != 'fail' and not is_mpi(r)]
    data = defaultdict(dict)
    for (n,), r in sorted(latest(ok, lambda r: (int(r['nthreads']),)).items()):
        t = routine_times(r)
        if t:
            for k in ROUTINES:
                data[k][n] = t[k]
    return data


def routine_table(data):
    """seconds in each part of the calculation for each thread count, with speedup at the end"""
    threads = sorted(data['tree']) if data else []
    header = ['threads'] + [f'{k} (s)' for k in ROUTINES]
    body = [[n] + [f'{data[k][n]:.1f}' for k in ROUTINES] for n in threads]
    if len(threads) > 1:
        body.append(['speedup'] + [f'{speedup(data[k])[threads[-1]][0]:.1f}' if data[k][threads[0]] > 0
                                   else '' for k in ROUTINES])
    return header, body


def scaling_data(rows, bench):
    """latest successful wall time for each build (label) and thread count"""
    ok = [r for r in rows if not is_mpi(r) and r['bench'] == bench and r['status'] != 'fail' and run_time(r)]
    last = latest(ok, lambda r: (r['label'], int(r['nthreads'])))
    data = defaultdict(dict)
    for (label, n), r in sorted(last.items(), key=lambda kv: kv[0][1]):
        data[label][n] = run_time(r)
    return data, (ok[-1] if ok else None)


def speedup(times):
    """speedup and parallel efficiency relative to the smallest thread count"""
    n0 = min(times)
    return {n: (times[n0] * n0 / t, times[n0] * n0 / (t * n)) for n, t in times.items()}


def scaling_tables(data):
    """wall time per thread count for each build, plus speedup and efficiency"""
    labels = sorted(data)
    threads = sorted({n for d in data.values() for n in d})
    header = ['threads'] + [f'{lab} (s)' for lab in labels] + \
             [f'{lab} speedup / eff.' for lab in labels]
    body = []
    for n in threads:
        row = [n] + [f'{data[lab][n]:.1f}' if n in data[lab] else '' for lab in labels]
        for lab in labels:
            s = speedup(data[lab]).get(n)
            row.append(f'{s[0]:.1f} / {100 * s[1]:.0f}%' if s else '')
        body.append(row)
    return header, body


def hybrid_table(rows, bench):
    """time for each combination of MPI tasks and openMP threads, by total number of cores,
    compared with the fastest openMP-only run on the same number of cores"""
    ok = [r for r in rows if r['bench'] == bench and r['status'] != 'fail' and run_time(r)
          and is_mpi(r)]
    if not ok:
        return None, None
    omp, _ = scaling_data(rows, bench)
    last = latest(ok, lambda r: (r['label'], nmpi(r), int(r['nthreads'])))
    header = ['cores', 'build', 'MPI tasks x threads', 'time (s)', 'openMP only (s)']
    body = []
    for (lab, n, t), r in sorted(last.items(), key=lambda kv: (-kv[0][1] * kv[0][2], kv[0][1])):
        ref = [d[n * t] for d in omp.values() if n * t in d]
        body.append([n * t, lab, f'{n}x{t}', fmt(run_time(r)), fmt(min(ref)) if ref else ''])
    return header, body


def latex_table(data, bench, machine, npart, colname=None):
    """LaTeX table of wall times in the style used in computing time applications"""
    colname = colname or (lambda lab: f'{machine} ({lab})')
    labels = sorted(data)
    threads = sorted({n for d in data.values() for n in d})
    lines = [r'\begin{table}', r'\centering',
             r'\begin{tabular}{r' + 'r' * len(labels) + '}', r'\hline',
             'OMP threads & ' + ' & '.join(colname(lab) for lab in labels) + r' \\',
             r'\hline']
    for n in threads:
        lines.append(f'{n} & ' + ' & '.join(f'{data[lab][n]:.1f}' if n in data[lab] else ''
                                            for lab in labels) + r' \\')
    lines += [r'\hline', r'\end{tabular}',
              rf'\caption{{Wall time in seconds for strong scaling of the {bench} benchmark '
              rf'using {npart} SPH particles, running Phantom in openMP-only mode on {machine}.}}',
              rf'\label{{tab:scaling-{bench}}}', r'\end{table}']
    return '\n'.join(lines)


def scaling_text(data, bench, machine, npart):
    """paste-ready paragraph summarising the scaling results"""
    best = min(((t, n, lab) for lab, d in data.items() for n, t in d.items()))
    t, n, lab = best
    s, eff = speedup(data[lab])[n]
    n0 = min(data[lab])
    # speedup is relative to one thread, assuming ideal scaling below the smallest thread count
    caveat = '' if n0 == 1 else f' (assuming ideal scaling up to {n0} threads)'
    return (f'Strong scaling of the {bench} benchmark ({npart} particles) on {machine} is shown '
            f'in Table~\\ref{{tab:scaling-{bench}}} and Figure~\\ref{{fig:scaling-{bench}}}. '
            f'The fastest configuration used {n} openMP threads with {lab}, completing in '
            f'{t:.1f}\\,s, a speedup of {s:.1f} ({100 * eff:.0f}\\% parallel efficiency) '
            f'relative to a single thread{caveat}.')


def su_estimate(rows, data, spec, bench):
    """estimate kSU for a production run by scaling the benchmark cost per particle-step"""
    npart, nsteps, ncores, nruns = (float(x) for x in spec.split(':'))
    ok = [r for r in rows if r['bench'] == bench and r['status'] != 'fail' and fnum(r['npart'])]
    ref = min(ok, key=lambda r: abs(int(r['nthreads']) - ncores))
    t = run_time(ref) * (npart / fnum(ref['npart'])) * (nsteps / fnum(ref['nsteps']))
    ksu = t * ncores * nruns / 3600. / 1000.
    return (f'Based on the {bench} benchmark ({ref["npart"]} particles, {ref["nsteps"]} steps in '
            f'{run_time(ref):.1f}\\,s on {ref["nthreads"]} cores), each calculation with '
            f'{npart:.3g} particles and {nsteps:.3g} steps takes approximately '
            f'{t / 86400.:.1f} days on {ncores:.0f} cores ({t * ncores / 3.6e6:.1f} kSU per '
            f'calculation). This leads to a request for {ksu:.0f} kSU in total for '
            f'{nruns:.0f} calculations.')


def pyplot():
    """matplotlib.pyplot if it is installed (it is optional), otherwise None"""
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        return plt
    except ImportError:
        print('matplotlib not found: skipping scaling figures')
        return None


def paper_plot(series, kind, title, filebase):
    """log-log plot against number of cpus in the style of the phantom paper (Price et al. 2018):
    black lines with open circles, each labelled at its end, and dotted lines for ideal scaling.
    kind is 'time' (wall time) or 'speedup' (relative to one cpu, assuming ideal scaling below
    the smallest number of cpus measured)"""
    plt = pyplot()
    if plt is None:
        return []
    fig, ax = plt.subplots(figsize=(5.5, 4.2))
    nmax = max(max(d) for d in series.values() if d)
    xideal = [0.8, 1.5 * nmax]
    for name, times in series.items():
        n = [i for i in sorted(times) if times[i] and times[i] > 0]
        if not n:
            continue
        t0 = times[n[0]] * n[0]
        y = [times[i] for i in n] if kind == 'time' else [t0 / times[i] for i in n]
        ax.plot(n, y, 'k-', marker='o', mfc='none', ms=6, lw=1)
        ax.annotate(name, (n[-1], y[-1]), xytext=(6, 0), textcoords='offset points',
                    va='center', fontsize=9)
        if kind == 'time':
            ax.plot(xideal, [t0 / x for x in xideal], 'k:', lw=0.8)
    if kind == 'speedup':
        ax.plot(xideal, xideal, 'k:', lw=0.8)
    ax.set_xscale('log')
    ax.set_yscale('log')
    ax.set_xlim(xideal[0], 4. * nmax)
    ax.xaxis.set_major_formatter('{x:g}')
    ax.set_xlabel('Ncpus')
    ax.set_ylabel('Wall Time (s)' if kind == 'time' else 'Speedup')
    ax.text(0.96, 0.96, title, transform=ax.transAxes, ha='right', va='top')
    fig.tight_layout()
    files = [filebase + ext for ext in ('.pdf', '.png')]
    for f in files:
        fig.savefig(f, dpi=150)
    plt.close(fig)
    return files


def scaling_plot(data, bench, machine, filebase):
    """wall time and speedup against number of cpus for each build on one machine"""
    title = f'{bench} (strong scaling) - {machine}'
    return (paper_plot(data, 'time', title, filebase) +
            paper_plot(data, 'speedup', title, filebase.replace('scaling-', 'speedup-', 1)))


def compare(rows, base, head):
    """markdown comparison between two labelled builds, e.g. master vs a pull request"""
    last = latest(rows, lambda r: (r['bench'], r['label'], r['nthreads']))
    header = ['benchmark', 'threads', f'{base} (s)', f'{head} (s)', 'change',
              'steps', 'cpu/wall', 'conservation']
    body = []
    for (bench, label, n), h in last.items():
        b = last.get((bench, base, n))
        if label != head or b is None:
            continue
        change = pct(run_time(h), run_time(b))
        slow = fnum(change.rstrip('%')) or 0.
        flag = ' :red_circle:' if slow > 10. else (' :orange_circle:' if slow > 5. else '')
        body.append([bench, n, fmt(run_time(b)), fmt(run_time(h)), change + flag,
                     f"{b['nsteps']} → {h['nsteps']}", f"{cpu_per_wall(b)} → {cpu_per_wall(h)}",
                     f"{b['status']} → {h['status']}"])
    return header, body


def status_html(rows, label):
    """html table of the latest results for one build, in the format of the original nightly pages"""
    colours = {'red': '#FF0000', 'amber': '#FF6600', 'green': '#009900'}
    last = latest([r for r in rows if r['label'] == label], lambda r: r['bench'])
    out = [f'<h2>Checking Phantom benchmarks, SYSTEM={html.escape(label)}</h2>']
    if last:
        r = list(last.values())[-1]
        out.append(f'<p>Benchmarks completed: {r["date"]}<br/>{html.escape(r["machine"])} '
                   f'({html.escape(r["cpu"])})<br/>OMP_NUM_THREADS={r["nthreads"]}</p>')
    out.append('<table><tr><td><strong>Benchmark</strong></td><td><strong>Time (s)</strong></td>'
               '<td><strong>%Change</strong></td><td><strong>RMS diff</strong></td>'
               '<td><strong>Steps</strong></td><td><strong>Conservation</strong></td></tr>')
    nfail = nslow = 0
    for bench, r in sorted(last.items()):
        change = pct(run_time(r), previous_wall(rows, r))
        slow = fnum(change.rstrip('%')) or 0.
        ccol = colours['red'] if slow > 10. else (colours['amber'] if slow > 5. else colours['green'])
        ok = r['status'] != 'fail'
        nfail += not ok
        nslow += slow > 10.
        out.append(f'<tr><td bgcolor="{colours["green"] if ok else colours["red"]}">{bench}</td>'
                   f'<td>{fmt(run_time(r))}</td><td bgcolor="{ccol}">{change or "N/A"}</td>'
                   f'<td>{r["rmserr"]}</td><td>{r["nsteps"]}</td><td>{r["status"]}</td></tr>')
    out.append(f'</table>\n<p>Completed {len(last)} benchmarks; <strong>{nfail} failures</strong>; '
               f'<strong>{nslow} slowdowns</strong></p>')
    return '\n'.join(out)


def write_report(rows, outdir, machine, do_scaling, su, do_hybrid=False):
    """write markdown and html reports for one machine, print summary to terminal"""
    os.makedirs(outdir, exist_ok=True)
    header, body = summary(rows)
    md = [f'# Phantom benchmarks on {machine}', '', f'CPU: {rows[-1]["cpu"]}', '',
          markdown_table(header, body)]
    htm = [f'<h1>Phantom benchmarks on {html.escape(machine)}</h1>',
           f'<p>CPU: {html.escape(rows[-1]["cpu"])}</p>', html_table(header, body)]
    print(markdown_table(header, body))
    bheader, bbody = breakdown(rows)
    if bbody:
        md += ['', '## Where the time goes (% of wall time)', '', markdown_table(bheader, bbody)]
        htm += ['<h2>Where the time goes (% of wall time)</h2>', html_table(bheader, bbody)]
        print('\nWhere the time goes (% of wall time)\n' + markdown_table(bheader, bbody))
    for bench in sorted({r['bench'] for r in rows}):
        hheader, hbody = hybrid_table(rows, bench) if do_hybrid else (None, None)
        if hbody:
            md += ['', f'## Hybrid MPI and openMP: {bench}', '', markdown_table(hheader, hbody)]
            htm += [f'<h2>Hybrid MPI and openMP: {bench}</h2>', html_table(hheader, hbody)]
            print(f'\nHybrid MPI and openMP: {bench}\n' + markdown_table(hheader, hbody))
        if not do_scaling:
            continue
        data, ref = scaling_data(rows, bench)
        if not data or max(len(d) for d in data.values()) < 2:
            continue
        sheader, sbody = scaling_tables(data)
        npart = ref['npart'] if ref else '?'
        tex = latex_table(data, bench, machine, npart)
        text = scaling_text(data, bench, machine, npart)
        if su:
            text += '\n\n' + su_estimate(rows, data, su, bench)
        figs = scaling_plot(data, bench, machine, os.path.join(outdir, f'scaling-{bench}'))
        with open(os.path.join(outdir, f'scaling-{bench}.tex'), 'w') as f:
            f.write(text + '\n\n' + tex + '\n')
        md += ['', f'## Strong scaling: {bench}', '', markdown_table(sheader, sbody), '', text,
               '', '```latex', tex, '```']
        htm += [f'<h2>Strong scaling: {bench}</h2>', html_table(sheader, sbody),
                f'<p>{html.escape(text)}</p>', f'<pre>{html.escape(tex)}</pre>']
        htm += [f'<img src="{os.path.basename(f)}">' for f in figs if f.endswith('.png')]
        print(f'\nStrong scaling: {bench}\n' + markdown_table(sheader, sbody) + '\n\n' + text)
        # scaling of each part of the calculation, for each build
        for lab in sorted(data):
            rdata = routine_scaling(rows, bench, lab)
            if len(rdata.get('tree', {})) < 2:
                continue
            rheader, rbody = routine_table(rdata)
            rfigs = paper_plot({k: rdata[k] for k in ROUTINES}, 'time', f'{bench} ({lab}) - {machine}',
                               os.path.join(outdir, f'scaling-{bench}-{lab}-routines'))
            md += ['', f'### Time per routine: {bench} ({lab})', '', markdown_table(rheader, rbody)]
            htm += [f'<h3>Time per routine: {bench} ({lab})</h3>', html_table(rheader, rbody)]
            htm += [f'<img src="{os.path.basename(f)}">' for f in rfigs if f.endswith('.png')]
            print(f'\nTime per routine: {bench} ({lab})\n' + markdown_table(rheader, rbody))
    with open(os.path.join(outdir, 'report.md'), 'w') as f:
        f.write('\n'.join(md) + '\n')
    with open(os.path.join(outdir, 'report.html'), 'w') as f:
        f.write(page(f'Phantom benchmarks: {machine}', '\n'.join(htm)))
    print(f'\nreport written to {outdir}/report.html')


def page(title, body, home='../index.html'):
    """standalone html page with navigation links"""
    return ('<html>\n<head>\n<meta charset="utf-8">\n'
            f'<title>{html.escape(title)}</title>\n'
            '<style>body{font-family:sans-serif;max-width:1000px;margin:auto;padding:1em}table{border-collapse:collapse;margin:1em 0}td,th{border:1px solid #ccc;'
            'padding:3px 8px;text-align:right}img{max-width:900px}</style>\n'
            '</head><body>\n'
            '<p>[<a href="https://phantomsph.github.io/">Phantom home</a>] '
            f'[<a href="{home}">Performance report</a>]</p>\n'
            f'{body}\n</body></html>\n')


def read_commits(phantomdir):
    """date and subject of each commit in a phantom git checkout, keyed by full hash"""
    if not phantomdir:
        return {}
    try:
        out = subprocess.run(['git', '-C', phantomdir, 'log', '--all', '--format=%H|%cI|%s'],
                             capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        print(f'could not read the history of {phantomdir}')
        return {}
    commits = {}
    for line in out.splitlines():
        sha, date, subject = line.split('|', 2)
        commits[sha] = {'date': date, 'subject': subject}
    return commits


def commit_info(sha, commits):
    """full hash, date and subject for an abbreviated hash, if known"""
    if not sha:
        return {}
    if not commits.get('_prefix'):
        # index by the first 7 characters, the shortest abbreviation used
        commits['_prefix'] = defaultdict(list)
        for full in list(commits):
            if full != '_prefix':
                commits['_prefix'][full[:7]].append(full)
    for full in commits['_prefix'].get(sha[:7], []):
        if full.startswith(sha):
            return dict(commits[full], full=full)
    return {}


def site_data(rows, commits):
    """compact list of runs for the interactive website"""
    runs = []
    for r in rows:
        info = commit_info(r['phantom_sha'].replace('-dirty', ''), commits)
        # the same abbreviation for each version, whatever length git chose on each machine
        sha = info['full'][:7] if info else r['phantom_sha'].replace('-dirty', '')
        runs.append({
            'machine': r['machine'], 'cpu': r['cpu'], 'bench': r['bench'], 'label': r['label'],
            'compiler': r['compiler'], 'threads': int(r['nthreads']), 'nmpi': nmpi(r), 'sha': sha,
            'dirty': r['phantom_sha'].endswith('-dirty'), 'branch': r['phantom_branch'],
            'sha_date': info.get('date') or r.get('phantom_date') or r['date'],
            'subject': info.get('subject', ''), 'date': r['date'], 'npart': fnum(r['npart']),
            'nsteps': fnum(r['nsteps']), 'time': run_time(r), 'total': fnum(r['wall']),
            'cpu_time': fnum(r.get('cpu_time')), 'mpart': fnum(r.get('mpart_per_s')),
            'status': r['status'], 'routines': routine_times(r)})
    return runs


def best_scaling(rows, bench):
    """for each machine, the strong scaling of its fastest build with at least two thread counts"""
    series = {}
    for machine in sorted({r['machine'] for r in rows}):
        data, _ = scaling_data([r for r in rows if r['machine'] == machine], bench)
        data = {lab: d for lab, d in data.items() if len(d) > 1}
        if data:
            # fastest at the largest number of threads measured for that build
            lab = min(data, key=lambda lab: data[lab][max(data[lab])])
            series[f'{machine} ({lab})'] = data[lab]
    return series


def write_site(resultsdir, sitedir, phantomdir=None):
    """interactive website (index.html, app.js, data.json), with a report for each machine and
    figures and tables comparing the strong scaling of each benchmark across machines"""
    os.makedirs(sitedir, exist_ok=True)
    allrows = read_results(resultsdir)
    for machine in sorted({r['machine'] for r in allrows}):
        write_report([r for r in allrows if r['machine'] == machine],
                     os.path.join(sitedir, machine), machine, True, None, True)
    figures = {}
    for bench in sorted({r['bench'] for r in allrows}):
        series = best_scaling(allrows, bench)
        if not series:
            continue
        base = os.path.join(sitedir, f'scaling-{bench}')
        files = (paper_plot(series, 'time', f'{bench} (strong scaling)', base) +
                 paper_plot(series, 'speedup', f'{bench} (strong scaling)',
                            os.path.join(sitedir, f'speedup-{bench}')))
        npart = next((r['npart'] for r in allrows if r['bench'] == bench), '?')
        with open(base + '.tex', 'w') as f:
            f.write(latex_table(series, bench, 'several machines', npart, colname=str) + '\n')
        figures[bench] = [os.path.basename(f) for f in files] + [os.path.basename(base) + '.tex']
    data = {'runs': site_data(allrows, read_commits(phantomdir)), 'figures': figures}
    with open(os.path.join(sitedir, 'data.json'), 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    for name in ('index.html', 'app.js'):
        shutil.copy(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'site', name), sitedir)
    print(f'site written to {sitedir}/index.html')


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('benchmarks', nargs='*', help='benchmarks to include (default: all)')
    topdir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    parser.add_argument('--results', default=os.path.join(topdir, 'results'),
                        help='directory containing <machine>/<benchmark>.csv files')
    parser.add_argument('--reports', default=os.path.join(topdir, 'runs', 'reports'),
                        help='directory to write reports to, in <machine>/ subdirectories')
    parser.add_argument('--machine', help='machine name (results subdirectory)')
    parser.add_argument('--status-html', metavar='LABEL',
                        help='print html summary of latest results for one build')
    parser.add_argument('--scaling', action='store_true', help='include strong scaling output')
    parser.add_argument('--hybrid', action='store_true', help='include hybrid MPI and openMP output')
    parser.add_argument('--compare', nargs=2, metavar=('BASE', 'HEAD'))
    parser.add_argument('--su', metavar='NPART:NSTEPS:NCORES:NRUNS',
                        help='estimate service units for a production run')
    parser.add_argument('--site', metavar='DIR', help='write static website to DIR')
    parser.add_argument('--phantom', metavar='DIR',
                        help='phantom git checkout, used to order results by phantom version')
    args = parser.parse_args()

    if args.site:
        write_site(args.results, args.site, args.phantom)
        return
    rows = read_results(args.results, [args.machine] if args.machine else None,
                        args.benchmarks or None)
    if not rows:
        sys.exit(f'no results found in {args.results}')
    if args.compare:
        header, body = compare(rows, *args.compare)
        print(f'### Benchmarks: {args.compare[0]} vs {args.compare[1]} on {rows[-1]["machine"]}'
              f' ({rows[-1]["cpu"]})\n')
        print(markdown_table(header, body))
        return
    if args.status_html:
        print(status_html(rows, args.status_html))
        return
    machine = args.machine or rows[-1]['machine']
    write_report(rows, os.path.join(args.reports, machine), machine,
                 args.scaling or bool(args.su), args.su, args.hybrid)


if __name__ == '__main__':
    main()
