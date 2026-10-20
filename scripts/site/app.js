// The Phantom benchmark suite: interactive website, drawn from data.json written by report.py
'use strict';

const ROUTINES = ['tree', 'density', 'force', 'other', 'startup'];
const CHANGE = 5;   // per cent change in time that is flagged in the history
let RUNS = [], FIGURES = {}, SHAS = [];

// ---------------------------------------------------------------- utilities
const uniq = a => [...new Set(a)].sort();
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
                      return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]); };
const geomean = a => Math.exp(a.reduce((s, x) => s + Math.log(x), 0) / a.length);
const fmt = (x, d = 1) => (x == null || isNaN(x)) ? '' : x.toFixed(d);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const PALETTE = ['#0b6bcb', '#e8590c', '#2f9e44', '#c2255c', '#7048e8', '#0c8599', '#e67700', '#5c940d'];
const colour = i => PALETTE[i % PALETTE.length];
const el = (tag, html) => { const e = document.createElement(tag); if (html != null) e.innerHTML = html; return e; };
const content = () => document.getElementById('content');

function groupBy(runs, key) {
  const g = new Map();
  for (const r of runs) { const k = key(r); if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  return g;
}
// largest number of threads run on each machine ("full node")
const fullNode = m => Math.max(...RUNS.filter(r => r.machine === m).map(r => r.threads));
// phantom version order, from the date of each phantom version
const shaIndex = sha => SHAS.indexOf(sha);
const latestSha = runs => runs.reduce((a, r) => shaIndex(r.sha) > shaIndex(a) ? r.sha : a, runs[0].sha);
// median time of the runs on the most recent phantom version among the given runs
function latestTime(runs) {
  if (!runs.length) return null;
  const sha = latestSha(runs);
  return median(runs.filter(r => r.sha === sha).map(r => r.time));
}
const good = r => r.status !== 'fail' && r.time > 0 && !r.dirty;

// ---------------------------------------------------------------- page elements
function select(id, label, options, value, onchange) {
  const wrap = el('label', label + ' ');
  const s = el('select'); s.id = id;
  for (const o of options) { const opt = el('option', o[1]); opt.value = o[0]; s.appendChild(opt); }
  if (value != null) s.value = value;
  s.addEventListener('change', onchange);
  wrap.appendChild(s);
  return wrap;
}
const val = id => document.getElementById(id).value;
function table(header, rows, classes) {
  const t = el('table');
  t.appendChild(el('tr', header.map(h => `<th>${h}</th>`).join('')));
  rows.forEach((row, i) => t.appendChild(el('tr', row.map((c, j) =>
    `<td class="${(classes && classes[i] && classes[i][j]) || ''}">${c}</td>`).join(''))));
  const w = el('div'); w.className = 'scroll'; w.appendChild(t);
  return w;
}
function chartBox(parent) {
  const box = el('div'); box.className = 'chart';
  const c = el('canvas'); box.appendChild(c); parent.appendChild(box);
  return c;
}
const benchOptions = all => (all ? [['all', 'all benchmarks']] : [])
  .concat(uniq(RUNS.map(r => r.bench)).map(b => [b, b]));
const machineOptions = () => uniq(RUNS.map(r => r.machine)).map(m => [m, m]);

// labels each line at its last point, as in the scaling figures of the phantom paper
const endLabels = {
  id: 'endLabels',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx; ctx.save(); ctx.font = '12px system-ui'; ctx.fillStyle = css('--fg');
    chart.data.datasets.forEach((ds, i) => {
      if (!ds.endLabel || !chart.isDatasetVisible(i)) return;
      const pts = chart.getDatasetMeta(i).data; if (!pts.length) return;
      const p = pts[pts.length - 1]; ctx.fillText(ds.endLabel, p.x + 6, p.y + 4);
    });
    ctx.restore();
  }
};
function axisStyle(extra) {
  return Object.assign({ grid: { color: css('--line') }, ticks: { color: css('--muted') },
                         title: { color: css('--muted'), display: true } }, extra);
}
// logarithmic axis of number of cpus, labelled at powers of two
const ncpusAxis = nmax => axisStyle({ type: 'logarithmic', min: 1, max: 2 * nmax,
  title: { display: true, text: 'Ncpus', color: css('--muted') },
  ticks: { color: css('--muted'), autoSkip: false, callback: v => Number.isInteger(Math.log2(v)) ? v : '' } });

function newChart(canvas, config) {
  Chart.getChart(canvas)?.destroy();
  const opts = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false }, config.options);
  // legend in the page colours, leaving out series whose label starts with "_" (e.g. ideal scaling)
  opts.plugins = Object.assign({}, opts.plugins);
  opts.plugins.legend = Object.assign({ labels: { color: css('--fg'), filter: l => !l.text.startsWith('_') } },
                                      opts.plugins.legend);
  config.options = opts;
  return new Chart(canvas, config);
}

// ---------------------------------------------------------------- overview
function overview() {
  const c = content();
  c.appendChild(el('h2', 'Fastest time for each benchmark (s), full node, latest Phantom version'));
  const benches = uniq(RUNS.map(r => r.bench)), machines = uniq(RUNS.map(r => r.machine));
  const rows = [], classes = [];
  for (const b of benches) {
    const cells = machines.map(m => {
      const runs = RUNS.filter(r => good(r) && r.bench === b && r.machine === m && r.threads === fullNode(m));
      if (!runs.length) return null;
      const byLabel = [...groupBy(runs, r => r.label)].map(([lab, rs]) => [lab, latestTime(rs)]);
      return byLabel.reduce((a, x) => x[1] < a[1] ? x : a);
    });
    const best = Math.min(...cells.filter(Boolean).map(x => x[1]));
    rows.push([b, ...cells.map(x => x ? `${fmt(x[1])} <span class="note">${x[0]}</span>` : '')]);
    classes.push(['', ...cells.map(x => x && x[1] === best ? 'best' : '')]);
  }
  c.appendChild(table(['benchmark', ...machines.map(m => `${m}<br><span class="note">${fullNode(m)} threads</span>`)],
                      rows, classes));
  c.appendChild(el('p', '<span class="note">Each cell shows the best compiler on that machine. ' +
    'See the Compilers and Hardware tabs for the full comparison, and the per-machine reports: ' +
    machines.map(m => `<a href="${m}/report.html">${m}</a>`).join(', ') + '.</span>'));
  c.appendChild(el('h2', `Changes of more than ${CHANGE}% between the last two Phantom versions`));
  const changes = findChanges(RUNS.filter(good)).filter(x => x.last);
  c.appendChild(changes.length ? changeTable(changes) : el('p', '<span class="note">none</span>'));
}

// series (benchmark, machine, build, threads) whose median time changes by more than CHANGE per cent
// between consecutive Phantom versions, by more than the spread of repeated runs
function findChanges(runs) {
  const out = [];
  for (const [key, rs] of groupBy(runs, r => [r.bench, r.machine, r.label, r.threads].join('|'))) {
    const bySha = [...groupBy(rs, r => r.sha)].sort((a, b) => shaIndex(a[0]) - shaIndex(b[0]));
    for (let i = 1; i < bySha.length; i++) {
      const [sha0, r0] = bySha[i - 1], [sha1, r1] = bySha[i];
      const t0 = median(r0.map(r => r.time)), t1 = median(r1.map(r => r.time));
      const spread = Math.max(...[r0, r1].map(x => Math.max(...x.map(r => r.time)) - Math.min(...x.map(r => r.time))));
      const pct = 100 * (t1 - t0) / t0;
      if (Math.abs(pct) > CHANGE && Math.abs(t1 - t0) > spread) {
        out.push({ key: key.split('|'), sha0, sha1, t0, t1, pct, last: i === bySha.length - 1,
                   subject: r1[0].subject });
      }
    }
  }
  return out;
}
function changeTable(changes) {
  return table(['benchmark', 'machine', 'build', 'threads', 'from', 'to', 'time (s)', 'change'],
    changes.map(x => [...x.key, x.sha0, `<span title="${x.subject}">${x.sha1}</span>`,
                      `${fmt(x.t0)} → ${fmt(x.t1)}`, `${x.pct > 0 ? '+' : ''}${fmt(x.pct)}%`]),
    changes.map(x => [, , , , , , , x.pct > 0 ? 'worse' : 'best']));
}

// ---------------------------------------------------------------- compilers
function compilers() {
  const c = content();
  const ctl = el('div'); ctl.className = 'controls'; c.appendChild(ctl);
  ctl.appendChild(select('cbench', 'benchmark', benchOptions(true), 'all', render));
  const out = el('div'); c.appendChild(out);
  function render() {
    out.innerHTML = '';
    const b = val('cbench'), machines = uniq(RUNS.map(r => r.machine));
    // time per machine and compiler at full node on the latest phantom version
    const times = bench => new Map(machines.map(m => [m, new Map([...groupBy(RUNS.filter(r =>
      good(r) && r.bench === bench && r.machine === m && r.threads === fullNode(m)), r => r.label)]
      .map(([lab, rs]) => [lab, latestTime(rs)]))]));
    if (b === 'all') {
      out.appendChild(el('h2', 'Time relative to the fastest compiler on each machine (1.00 = fastest), full node'));
      const benches = uniq(RUNS.map(r => r.bench)), T = new Map(benches.map(x => [x, times(x)]));
      const rows = [], classes = [];
      for (const m of machines) {
        const labels = uniq(benches.flatMap(x => [...T.get(x).get(m).keys()]));
        const rel = labels.map(lab => benches.map(x => {
          const t = T.get(x).get(m), best = Math.min(...t.values());
          return t.has(lab) ? t.get(lab) / best : null; }));
        const gm = rel.map(r => r.filter(Boolean).length ? geomean(r.filter(Boolean)) : null);
        const bestgm = Math.min(...gm.filter(Boolean));
        labels.forEach((lab, i) => {
          rows.push([`${m} ${lab}`, ...rel[i].map(x => fmt(x, 2)), fmt(gm[i], 2)]);
          classes.push(['', ...rel[i].map(x => x === 1 ? 'best' : ''), gm[i] === bestgm ? 'best' : '']);
        });
      }
      out.appendChild(table(['machine and compiler', ...benches, 'geometric mean'], rows, classes));
      return;
    }
    out.appendChild(el('h2', `${b}: time per compiler (s), full node, latest Phantom version`));
    const t = times(b), labels = uniq([...t.values()].flatMap(x => [...x.keys()]));
    const charts = el('div'); charts.className = 'charts'; out.appendChild(charts);
    newChart(chartBox(charts), { type: 'bar',
      data: { labels: machines, datasets: labels.map((lab, i) => ({ label: lab, backgroundColor: colour(i),
              data: machines.map(m => t.get(m).get(lab) ?? null) })) },
      options: { scales: { x: axisStyle({ title: { display: false } }),
                           y: axisStyle({ title: { display: true, text: 'time (s)', color: css('--muted') } }) } } });
    const rows = [], classes = [];
    for (const m of machines) {
      const best = Math.min(...t.get(m).values());
      for (const [lab, x] of [...t.get(m)].sort((p, q) => p[1] - q[1])) {
        rows.push([m, lab, fullNode(m), fmt(x), fmt(x / best, 2)]);
        classes.push(['', '', '', x === best ? 'best' : '', '']);
      }
    }
    out.appendChild(table(['machine', 'compiler', 'threads', 'time (s)', 'relative'], rows, classes));
  }
  render();
}

// ---------------------------------------------------------------- hardware
function hardware() {
  const c = content();
  const ctl = el('div'); ctl.className = 'controls'; c.appendChild(ctl);
  ctl.appendChild(select('hbench', 'benchmark', benchOptions(true), 'all', render));
  const out = el('div'); c.appendChild(out);
  // fastest compiler on each machine at full node: time and core-seconds (time x threads)
  function best(bench) {
    const res = new Map();
    for (const m of uniq(RUNS.map(r => r.machine))) {
      const rs = RUNS.filter(r => good(r) && r.bench === bench && r.machine === m && r.threads === fullNode(m));
      if (!rs.length) continue;
      const [lab, t] = [...groupBy(rs, r => r.label)].map(([l, x]) => [l, latestTime(x)])
        .reduce((a, x) => x[1] < a[1] ? x : a);
      res.set(m, { lab, t, cores: fullNode(m), cs: t * fullNode(m), cpu: rs[0].cpu });
    }
    return res;
  }
  function render() {
    out.innerHTML = '';
    const b = val('hbench');
    if (b === 'all') {
      out.appendChild(el('h2', 'Overall speed of each machine, relative to the fastest (geometric mean over benchmarks)'));
      const benches = uniq(RUNS.map(r => r.bench)), B = benches.map(best), rows = [], classes = [];
      const machines = uniq(RUNS.map(r => r.machine));
      const stats = machines.map(m => {
        const node = [], core = [];
        B.forEach(res => { if (!res.has(m)) return;
          node.push(res.get(m).t / Math.min(...[...res.values()].map(x => x.t)));
          core.push(res.get(m).cs / Math.min(...[...res.values()].map(x => x.cs))); });
        return { m, n: node.length, node: node.length ? geomean(node) : null, core: core.length ? geomean(core) : null };
      });
      const bn = Math.min(...stats.map(s => s.node).filter(Boolean)), bc = Math.min(...stats.map(s => s.core).filter(Boolean));
      for (const s of stats.sort((p, q) => p.node - q.node)) {
        rows.push([s.m, RUNS.find(r => r.machine === s.m).cpu, fullNode(s.m), fmt(s.node, 2), fmt(s.core, 2), s.n]);
        classes.push(['', '', '', s.node === bn ? 'best' : '', s.core === bc ? 'best' : '', '']);
      }
      out.appendChild(table(['machine', 'cpu', 'cores', 'time per node', 'cost per core', 'benchmarks'], rows, classes));
      out.appendChild(el('p', '<span class="note">1.00 is the fastest machine on average. "Time per node" compares the ' +
        'wall time using the whole machine; "cost per core" compares core-seconds (time × cores), ' +
        'which is what is charged on clusters. Only benchmarks run on a machine are included in its average.</span>'));
      return;
    }
    const res = best(b), machines = [...res.keys()];
    out.appendChild(el('h2', `${b}: fastest result on each machine, full node, latest Phantom version`));
    const charts = el('div'); charts.className = 'charts'; out.appendChild(charts);
    for (const [key, text] of [['t', 'time (s)'], ['cs', 'core-seconds']]) {
      newChart(chartBox(charts), { type: 'bar',
        data: { labels: machines, datasets: [{ label: text, backgroundColor: colour(key === 't' ? 0 : 1),
                data: machines.map(m => res.get(m)[key]) }] },
        options: { indexAxis: 'y', plugins: { legend: { display: false }, title: { display: true, text, color: css('--fg') } },
                   scales: { x: axisStyle({ title: { display: false } }), y: axisStyle({ title: { display: false } }) } } });
    }
    const bt = Math.min(...[...res.values()].map(x => x.t)), bc = Math.min(...[...res.values()].map(x => x.cs));
    const sorted = [...res].sort((p, q) => p[1].t - q[1].t);
    out.appendChild(table(['machine', 'cpu', 'compiler', 'cores', 'time (s)', 'core-seconds'],
      sorted.map(([m, x]) => [m, x.cpu, x.lab, x.cores, fmt(x.t), fmt(x.cs, 0)]),
      sorted.map(([, x]) => ['', '', '', '', x.t === bt ? 'best' : '', x.cs === bc ? 'best' : ''])));
  }
  render();
}

// ---------------------------------------------------------------- scaling
function scaling() {
  const c = content();
  const ctl = el('div'); ctl.className = 'controls'; c.appendChild(ctl);
  ctl.appendChild(select('smode', 'compare', [['bench', 'machines, for one benchmark'],
                                              ['machine', 'benchmarks, on one machine']], 'bench', () => { setWhich(); render(); }));
  const which = el('span'); ctl.appendChild(which);
  ctl.appendChild(select('slabel', 'compiler', [['best', 'fastest']].concat(uniq(RUNS.map(r => r.label)).map(l => [l, l])), 'best', render));
  const out = el('div'); c.appendChild(out);
  // start on a benchmark or machine that has been run at more than one thread count
  const scaled = uniq([...groupBy(RUNS.filter(good), r => [r.bench, r.machine, r.label].join('|'))]
    .filter(([, rs]) => uniq(rs.map(r => r.threads)).length > 1).map(([k]) => k));
  function setWhich() {
    which.innerHTML = '';
    const bench = val('smode') === 'bench', first = scaled.length ? scaled[0].split('|')[bench ? 0 : 1] : null;
    which.appendChild(bench ? select('swhich', 'benchmark', benchOptions(false), first, render)
                            : select('swhich', 'machine', machineOptions(), first, render));
  }
  // latest time at each thread count for one benchmark, machine and build
  const curve = (b, m, lab) => {
    const rs = RUNS.filter(r => good(r) && r.bench === b && r.machine === m && r.label === lab);
    return new Map([...groupBy(rs, r => r.threads)].map(([n, x]) => [n, latestTime(x)]).sort((p, q) => p[0] - q[0]));
  };
  // the chosen build, or the fastest at the most threads among builds run at several thread counts
  function pick(b, m) {
    const labs = uniq(RUNS.filter(r => r.bench === b && r.machine === m).map(r => r.label));
    const curves = labs.map(l => [l, curve(b, m, l)]).filter(([, cv]) => cv.size > 1);
    if (val('slabel') !== 'best') return curves.find(([l]) => l === val('slabel'));
    return curves.reduce((a, x) => !a || x[1].get(Math.max(...x[1].keys())) < a[1].get(Math.max(...a[1].keys())) ? x : a, null);
  }
  function render() {
    out.innerHTML = '';
    const mode = val('smode'), w = val('swhich');
    const lines = [];
    if (mode === 'bench') {
      for (const m of uniq(RUNS.map(r => r.machine))) { const p = pick(w, m); if (p) lines.push([`${m} (${p[0]})`, p[1], m, p[0]]); }
    } else {
      for (const b of uniq(RUNS.map(r => r.bench))) { const p = pick(b, w); if (p) lines.push([`${b} (${p[0]})`, p[1], w, p[0]]); }
    }
    if (!lines.length) { out.appendChild(el('p', '<span class="note">no runs at more than one thread count yet</span>')); return; }
    out.appendChild(el('h2', mode === 'bench' ? `${w} (strong scaling)` : `Strong scaling of all benchmarks on ${w}`));
    const charts = el('div'); charts.className = 'charts'; out.appendChild(charts);
    const nmax = Math.max(...lines.flatMap(l => [...l[1].keys()]));
    for (const kind of ['time', 'speedup']) {
      const datasets = [];
      lines.forEach(([name, cv], i) => {
        const n = [...cv.keys()], t0 = cv.get(n[0]) * n[0];
        const y = t => kind === 'time' ? t : t0 / t;
        datasets.push({ label: name, endLabel: name, borderColor: colour(i), backgroundColor: 'transparent',
                        pointStyle: 'circle', pointRadius: 4, borderWidth: 1.5,
                        data: n.map(x => ({ x, y: y(cv.get(x)) })) });
        if (kind === 'time') datasets.push({ label: '_ideal', borderColor: colour(i), borderDash: [2, 3], borderWidth: 1,
                                             pointRadius: 0, data: [1, 2 * nmax].map(x => ({ x, y: t0 / x })) });
      });
      if (kind === 'speedup') datasets.push({ label: '_ideal', borderColor: css('--muted'), borderDash: [2, 3], borderWidth: 1,
                                              pointRadius: 0, data: [1, 2 * nmax].map(x => ({ x, y: x })) });
      newChart(chartBox(charts), { type: 'line', data: { datasets }, plugins: [endLabels],
        options: { plugins: { legend: { display: false } }, layout: { padding: { right: 110 } },
          scales: { x: ncpusAxis(nmax),
                    y: axisStyle({ type: 'logarithmic', title: { display: true, text: kind === 'time' ? 'Wall Time (s)' : 'Speedup', color: css('--muted') } }) } } });
    }
    // table of times and parallel efficiency
    const threads = uniq(lines.flatMap(l => [...l[1].keys()])).map(Number).sort((a, b) => a - b);
    out.appendChild(table(['threads', ...lines.map(l => l[0])], threads.map(n => [n, ...lines.map(([, cv]) => {
      if (!cv.has(n)) return ''; const n0 = [...cv.keys()][0];
      return `${fmt(cv.get(n))} <span class="note">${fmt(100 * cv.get(n0) * n0 / (cv.get(n) * n), 0)}%</span>`; })])));
    out.appendChild(el('p', '<span class="note">Wall time (s) and parallel efficiency, relative to the smallest number of threads ' +
      '(assuming ideal scaling below it). Dotted lines show ideal scaling.</span>'));
    if (mode === 'bench' && FIGURES[w]) {
      out.appendChild(el('p', 'Figures and LaTeX table for computing time applications: ' +
        FIGURES[w].map(f => `<a href="${f}">${f}</a>`).join(', ')));
    }
    // time in each routine against threads, for each line
    out.appendChild(el('h2', 'Time per routine'));
    const rc = el('div'); rc.className = 'charts'; out.appendChild(rc);
    for (const [name, cv, m, lab] of lines) {
      const b = mode === 'bench' ? w : name.split(' ')[0];
      const rs = RUNS.filter(r => good(r) && r.bench === b && r.machine === m && r.label === lab && r.routines);
      const byN = [...groupBy(rs, r => r.threads)].sort((p, q) => p[0] - q[0]).map(([n, x]) => [n, x[x.length - 1].routines]);
      if (byN.length < 2) continue;
      newChart(chartBox(rc), { type: 'line', plugins: [endLabels],
        data: { datasets: ROUTINES.map((k, i) => ({ label: k, endLabel: k, borderColor: colour(i), backgroundColor: 'transparent',
                pointRadius: 3, borderWidth: 1.5, data: byN.filter(([, t]) => t[k] > 0).map(([n, t]) => ({ x: n, y: t[k] })) })) },
        options: { plugins: { legend: { display: false }, title: { display: true, text: name, color: css('--fg') } },
                   layout: { padding: { right: 60 } },
                   scales: { x: ncpusAxis(nmax),
                             y: axisStyle({ type: 'logarithmic', title: { display: true, text: 'time (s)', color: css('--muted') } }) } } });
    }
  }
  setWhich(); render();
}

// ---------------------------------------------------------------- history
function historyTab() {
  const c = content();
  const ctl = el('div'); ctl.className = 'controls'; c.appendChild(ctl);
  ctl.appendChild(select('ybench', 'benchmark', benchOptions(false), null, render));
  ctl.appendChild(select('ymode', 'show', [['time', 'time (s)'], ['relative', 'time relative to median']], 'relative', render));
  ctl.appendChild(select('ythreads', 'threads', [['full', 'full node'], ['all', 'all']], 'full', render));
  const out = el('div'); c.appendChild(out);
  function render() {
    out.innerHTML = '';
    const b = val('ybench');
    let rs = RUNS.filter(r => good(r) && r.bench === b);
    if (val('ythreads') === 'full') rs = rs.filter(r => r.threads === fullNode(r.machine));
    const shas = uniq(rs.map(r => r.sha)).sort((p, q) => shaIndex(p) - shaIndex(q));
    const dateOf = sha => (RUNS.find(r => r.sha === sha).sha_date || '').slice(0, 10);
    const series = [...groupBy(rs, r => `${r.machine} ${r.label} ${r.threads}`)].sort();
    const datasets = [];
    series.forEach(([name, x], i) => {
      const med = median(x.map(r => r.time)), y = r => val('ymode') === 'time' ? r.time : r.time / med;
      // every run as a point, so the spread of repeated runs shows, and a line through the medians
      datasets.push({ label: '_' + name, type: 'scatter', backgroundColor: colour(i), pointRadius: 3,
                      data: x.map(r => ({ x: r.sha, y: y(r), subject: r.subject })) });
      const bySha = [...groupBy(x, r => r.sha)].sort((p, q) => shaIndex(p[0]) - shaIndex(q[0]));
      datasets.push({ label: name, borderColor: colour(i), backgroundColor: colour(i), pointRadius: 0, borderWidth: 1.5,
                      data: bySha.map(([sha, rr]) => ({ x: sha, y: median(rr.map(y)) })) });
    });
    out.appendChild(el('h2', `${b}: ${val('ymode') === 'time' ? 'time (s)' : 'time relative to the median of each series'} by Phantom version`));
    const charts = el('div'); charts.className = 'charts'; out.appendChild(charts);
    const xaxes = { x: axisStyle({ type: 'category', labels: shas, title: { display: true, text: 'Phantom version', color: css('--muted') } }),
                    x2: axisStyle({ type: 'category', labels: shas.map(dateOf), position: 'top', grid: { display: false },
                                    title: { display: true, text: 'date', color: css('--muted') } }) };
    newChart(chartBox(charts), { type: 'line', data: { datasets },
      options: { scales: Object.assign({ y: axisStyle({ title: { display: true, text: val('ymode') === 'time' ? 'time (s)' : 'relative time', color: css('--muted') } }) }, xaxes),
                 plugins: { tooltip: { callbacks: { afterLabel: ctx => ctx.raw.subject || '' } } } } });
    // parallel efficiency at full node by version, where runs at more than one thread count exist
    const eff = [];
    for (const [name, x] of groupBy(RUNS.filter(r => good(r) && r.bench === b), r => `${r.machine} ${r.label}`)) {
      const pts = [];
      for (const [sha, rr] of groupBy(x, r => r.sha)) {
        const n = uniq(rr.map(r => r.threads)).map(Number).sort((p, q) => p - q);
        if (n.length < 2) continue;
        const t = k => median(rr.filter(r => r.threads === k).map(r => r.time)), n0 = n[0], n1 = n[n.length - 1];
        pts.push({ x: sha, y: t(n0) * n0 / (t(n1) * n1) });
      }
      if (pts.length) eff.push({ label: `${name} (${Math.max(...x.map(r => r.threads))} threads)`, data: pts.sort((p, q) => shaIndex(p.x) - shaIndex(q.x)) });
    }
    if (eff.length) {
      newChart(chartBox(charts), { type: 'line',
        data: { datasets: eff.map((d, i) => Object.assign(d, { borderColor: colour(i), backgroundColor: colour(i), pointRadius: 4 })) },
        options: { scales: Object.assign({ y: axisStyle({ min: 0, max: 1.05, title: { display: true, text: 'parallel efficiency, full node', color: css('--muted') } }) }, xaxes) } });
    }
    const changes = findChanges(rs);
    out.appendChild(el('h2', `Changes of more than ${CHANGE}%`));
    out.appendChild(changes.length ? changeTable(changes) : el('p', '<span class="note">none</span>'));
  }
  render();
}

// ---------------------------------------------------------------- tabs
const TABS = { overview, compilers, hardware, scaling, history: historyTab };
function show(tab) {
  if (!TABS[tab]) tab = 'overview';
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  content().innerHTML = '';
  TABS[tab]();
  window.history.replaceState(null, "", "#" + tab);
}
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
fetch('data.json').then(r => r.json()).then(d => {
  RUNS = d.runs.filter(r => r.time > 0);
  FIGURES = d.figures || {};
  // phantom versions in order of their date
  SHAS = uniq(RUNS.map(r => r.sha)).sort((a, b) =>
    (RUNS.find(r => r.sha === a).sha_date || '').localeCompare(RUNS.find(r => r.sha === b).sha_date || ''));
  show(location.hash.slice(1));
});
