#!/usr/bin/env python3
"""
The Phantom benchmarking suite: make reports from benchmark results

Results are read from <results>/<machine>/<benchmark>.csv as written by run-benchmarks.sh

Examples:
  report.py --machine gb10                      summary of latest results on gb10
  report.py --machine gb10 --scaling polar      strong scaling tables, figure and text
  report.py --machine gb10 --compare base head  markdown comparison of two labels (PRs)
  report.py --machine gb10 --status-html gfortran  html summary in the old nightly format
  report.py --site site/                        static website from all results
  report.py --machine ozstar --scaling polar --su 2e6:5e4:48:20
      estimate kSU for 20 runs of 2e6 particles for 5e4 steps on 48 cores
"""
import argparse
import csv
import html
import os
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


def previous_wall(rows, row):
    """wall time of the previous successful run with the same benchmark, label and threads"""
    prev = None
    for r in rows:
        if r is row:
            return prev
        if (r['bench'], r['label'], r['nthreads']) == (row['bench'], row['label'], row['nthreads']) \
                and r['status'] != 'fail':
            prev = fnum(r['wall'])
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
    last = latest(rows, lambda r: (r['bench'], r['label'], r['nthreads']))
    header = ['benchmark', 'build', 'threads', 'npart', 'steps', 'wall (s)', 'change',
              'status', 'phantom', 'date']
    body = [[r['bench'], r['label'], r['nthreads'], r['npart'], r['nsteps'], r['wall'],
             pct(fnum(r['wall']), previous_wall(rows, r)), r['status'], r['phantom_sha'],
             r['date'][:10]] for r in last.values()]
    return header, body


def scaling_data(rows, bench):
    """latest successful wall time for each build (label) and thread count"""
    ok = [r for r in rows if r['bench'] == bench and r['status'] != 'fail' and fnum(r['wall'])]
    last = latest(ok, lambda r: (r['label'], int(r['nthreads'])))
    data = defaultdict(dict)
    for (label, n), r in sorted(last.items(), key=lambda kv: kv[0][1]):
        data[label][n] = fnum(r['wall'])
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


def latex_table(data, bench, machine, npart):
    """LaTeX table of wall times in the style used in computing time applications"""
    labels = sorted(data)
    threads = sorted({n for d in data.values() for n in d})
    lines = [r'\begin{table}', r'\centering',
             r'\begin{tabular}{r' + 'r' * len(labels) + '}', r'\hline',
             'OMP threads & ' + ' & '.join(f'{machine} ({lab})' for lab in labels) + r' \\',
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
    t = fnum(ref['wall']) * (npart / fnum(ref['npart'])) * (nsteps / fnum(ref['nsteps']))
    ksu = t * ncores * nruns / 3600. / 1000.
    return (f'Based on the {bench} benchmark ({ref["npart"]} particles, {ref["nsteps"]} steps in '
            f'{fnum(ref["wall"]):.1f}\\,s on {ref["nthreads"]} cores), each calculation with '
            f'{npart:.3g} particles and {nsteps:.3g} steps takes approximately '
            f'{t / 86400.:.1f} days on {ncores:.0f} cores ({t * ncores / 3.6e6:.1f} kSU per '
            f'calculation). This leads to a request for {ksu:.0f} kSU in total for '
            f'{nruns:.0f} calculations.')


def scaling_plot(data, bench, machine, filebase):
    """log-log plot of wall time vs number of threads with ideal scaling, if matplotlib exists"""
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
    except ImportError:
        print('matplotlib not found: skipping scaling figure')
        return []
    fig, ax = plt.subplots(figsize=(5, 4))
    for lab in sorted(data):
        n = sorted(data[lab])
        line, = ax.plot(n, [data[lab][i] for i in n], 'o-', label=f'{machine} ({lab})')
        ax.plot(n, [data[lab][n[0]] * n[0] / i for i in n], ':', color=line.get_color())
    ax.set_xscale('log', base=2)
    ax.set_yscale('log')
    threads = sorted({n for d in data.values() for n in d})
    ax.set_xticks(threads)
    ax.set_xticklabels([str(n) for n in threads])
    ax.set_xlabel('number of cpus (openMP threads)')
    ax.set_ylabel('wall time (s)')
    ax.set_title(f'{bench}: strong scaling')
    ax.legend(frameon=False)
    fig.tight_layout()
    files = [filebase + ext for ext in ('.pdf', '.png')]
    for f in files:
        fig.savefig(f, dpi=150)
    plt.close(fig)
    return files


def history_chart(rows, bench, subtitle):
    """interactive google chart of wall time vs date for each build, as in the original nightly pages"""
    series = defaultdict(dict)
    for r in rows:
        if r['bench'] == bench and r['status'] != 'fail' and fnum(r['wall']):
            series[f"{r['machine']}-{r['label']}-{r['nthreads']}"][r['date'][:19]] = fnum(r['wall'])
    if not series:
        return ''
    keys = sorted(series)
    datarows = []
    for date in sorted({d for s in series.values() for d in s}):
        y, mo, d, h, mi, sec = (int(x) for x in date.replace('T', '-').replace(':', '-').split('-'))
        vals = ','.join(str(series[k].get(date, 'null')) for k in keys)
        datarows.append(f'    [new Date({y},{mo - 1},{d},{h},{mi},{sec}),{vals}],')
    cols = '\n'.join(f"      data.addColumn('number', '{k}');" for k in keys)
    return (f'<div id="{bench}" style="width: 900px; height: 500px"></div>\n'
            '<script type="text/javascript">\n'
            '    google.charts.setOnLoadCallback(function() {\n'
            '      var data = new google.visualization.DataTable();\n'
            "      data.addColumn('date', 'Date');\n"
            f'{cols}\n      data.addRows([\n' + '\n'.join(datarows) + '\n      ]);\n'
            # classic line chart, since it shows points, so series with a single run are visible
            f"      var options = {{ title: 'Benchmark timings for {bench} test ({subtitle})', "
            "vAxis: { title: 'wall time (s)', viewWindow: { min: 0 } }, pointSize: 5, interpolateNulls: true, "
            "width: 900, height: 500 };\n"
            f"      var chart = new google.visualization.LineChart(document.getElementById('{bench}'));\n"
            '      chart.draw(data, options);\n'
            '    });\n</script>')


def compare(rows, base, head):
    """markdown comparison between two labelled builds, e.g. master vs a pull request"""
    last = latest(rows, lambda r: (r['bench'], r['label'], r['nthreads']))
    header = ['benchmark', 'threads', f'{base} (s)', f'{head} (s)', 'change',
              'steps', 'conservation']
    body = []
    for (bench, label, n), h in last.items():
        b = last.get((bench, base, n))
        if label != head or b is None:
            continue
        change = pct(fnum(h['wall']), fnum(b['wall']))
        slow = fnum(change.rstrip('%')) or 0.
        flag = ' :red_circle:' if slow > 10. else (' :orange_circle:' if slow > 5. else '')
        body.append([bench, n, b['wall'], h['wall'], change + flag,
                     f"{b['nsteps']} → {h['nsteps']}", f"{b['status']} → {h['status']}"])
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
        change = pct(fnum(r['wall']), previous_wall(rows, r))
        slow = fnum(change.rstrip('%')) or 0.
        ccol = colours['red'] if slow > 10. else (colours['amber'] if slow > 5. else colours['green'])
        ok = r['status'] != 'fail'
        nfail += not ok
        nslow += slow > 10.
        out.append(f'<tr><td bgcolor="{colours["green"] if ok else colours["red"]}">{bench}</td>'
                   f'<td>{r["wall"]}</td><td bgcolor="{ccol}">{change or "N/A"}</td>'
                   f'<td>{r["rmserr"]}</td><td>{r["nsteps"]}</td><td>{r["status"]}</td></tr>')
    out.append(f'</table>\n<p>Completed {len(last)} benchmarks; <strong>{nfail} failures</strong>; '
               f'<strong>{nslow} slowdowns</strong></p>')
    return '\n'.join(out)


def write_report(rows, outdir, machine, do_scaling, su):
    """write markdown and html reports for one machine, print summary to terminal"""
    os.makedirs(outdir, exist_ok=True)
    header, body = summary(rows)
    md = [f'# Phantom benchmarks on {machine}', '', f'CPU: {rows[-1]["cpu"]}', '',
          markdown_table(header, body)]
    htm = [f'<h1>Phantom benchmarks on {html.escape(machine)}</h1>',
           f'<p>CPU: {html.escape(rows[-1]["cpu"])}</p>', html_table(header, body)]
    print(markdown_table(header, body))
    for bench in sorted({r['bench'] for r in rows}):
        htm.append(history_chart(rows, bench, f'Performed on {machine}'))
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
    with open(os.path.join(outdir, 'report.md'), 'w') as f:
        f.write('\n'.join(md) + '\n')
    with open(os.path.join(outdir, 'report.html'), 'w') as f:
        f.write(page(f'Phantom benchmarks: {machine}', '\n'.join(htm)))
    print(f'\nreport written to {outdir}/report.html')


def page(title, body, home='../index.html'):
    """standalone html page with google charts and navigation links, as in the original nightly pages"""
    return ('<html>\n<head>\n<meta charset="utf-8">\n'
            f'<title>{html.escape(title)}</title>\n'
            '<script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>\n'
            "<script type=\"text/javascript\">google.charts.load('current', {'packages':['corechart']});</script>\n"
            '<style>table{border-collapse:collapse;margin:1em 0}td,th{border:1px solid #ccc;'
            'padding:3px 8px;text-align:right}img{max-width:900px}</style>\n'
            '</head><body>\n'
            '<p>[<a href="https://phantomsph.github.io/">Phantom home</a>] '
            f'[<a href="{home}">Performance report</a>]</p>\n'
            f'{body}\n</body></html>\n')


def write_site(resultsdir, sitedir):
    """static website with a report for each machine and an index page"""
    os.makedirs(sitedir, exist_ok=True)
    links = []
    for machine in sorted(os.listdir(resultsdir)):
        rows = read_results(resultsdir, [machine])
        if not rows:
            continue
        write_report(rows, os.path.join(sitedir, machine), machine, True, None)
        links.append(f'<li><a href="{machine}/report.html">{machine}</a> '
                     f'({html.escape(rows[-1]["cpu"])}, last run {rows[-1]["date"][:10]})</li>')
    # history of timings for each benchmark across all machines and builds
    allrows = read_results(resultsdir)
    charts = [history_chart(allrows, b, 'All machines') for b in sorted({r['bench'] for r in allrows})]
    body = ('<h1>Phantom nightly benchmarking</h1>\n'
            '<p>Source and raw data: <a href="https://github.com/phantomSPH/phantom-benchmarks">'
            'phantom-benchmarks</a>. Detailed reports for each machine:</p>\n<ul>'
            + '\n'.join(links) + '</ul>\n' + '\n'.join(charts))
    with open(os.path.join(sitedir, 'index.html'), 'w') as f:
        f.write(page('Phantom nightly benchmarking', body, home='index.html'))
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
    parser.add_argument('--compare', nargs=2, metavar=('BASE', 'HEAD'))
    parser.add_argument('--su', metavar='NPART:NSTEPS:NCORES:NRUNS',
                        help='estimate service units for a production run')
    parser.add_argument('--site', metavar='DIR', help='write static website to DIR')
    args = parser.parse_args()

    if args.site:
        write_site(args.results, args.site)
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
                 args.scaling or bool(args.su), args.su)


if __name__ == '__main__':
    main()
