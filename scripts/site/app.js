// The Phantom benchmark suite: interactive website, drawn from data.json written by report.py
// Each tab shows all of its tables and charts one after another, with links to jump to each part
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
const benches = () => uniq(RUNS.map(r => r.bench));
const machines = () => uniq(RUNS.map(r => r.machine));

function groupBy(runs, key) {
  const g = new Map();
  for (const r of runs) { const k = key(r); if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  return g;
}
// largest number of threads run on each machine ("full node")
const fullNode = m => Math.max(...RUNS.filter(r => r.machine === m).map(r => r.threads));
// machines are shown by their cpu and the number of cores used, e.g. "AMD EPYC 7763 (4 cores)",
// with the machine name as a tooltip
const cpuName = m => (RUNS.filter(r => r.machine === m).pop().cpu || m)
  .replace(/\(R\)|\(TM\)|\bProcessor\b|\b\d+-Core\b|\bCPU\b|@.*$/g, '').replace(/\s+/g, ' ').trim();
const mlabel = m => `${cpuName(m)} (${fullNode(m)} cores)`;
const mcell = m => `<span title="${m}">${mlabel(m)}</span>`;
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
// time per build (compiler) at full node on the latest phantom version, for one benchmark and machine
const fullNodeTimes = (b, m) => new Map([...groupBy(RUNS.filter(r =>
  good(r) && r.bench === b && r.machine === m && r.threads === fullNode(m)), r => r.label)]
  .map(([lab, rs]) => [lab, latestTime(rs)]));

// ---------------------------------------------------------------- page elements
function table(header, rows, classes) {
  const t = el('table');
  t.appendChild(el('tr', header.map(h => `<th>${h}</th>`).join('')));
  rows.forEach((row, i) => t.appendChild(el('tr', row.map((c, j) =>
    `<td class="${(classes && classes[i] && classes[i][j]) || ''}">${c}</td>`).join(''))));
  const w = el('div'); w.className = 'scroll'; w.appendChild(t);
  return w;
}
function chartBox(parent, height) {
  const box = el('div'); box.className = 'chart';
  if (height) box.style.height = height + 'px';
  const c = el('canvas'); box.appendChild(c); parent.appendChild(box);
  return c;
}
// heading with an anchor, so that it can be linked to from the list at the top of the tab
function section(parent, id, title, level = 'h2') {
  const h = el(level, title); h.id = id; parent.appendChild(h);
  return h;
}
function jumpTo(parent, items) {
  if (items.length > 1) {
    parent.appendChild(el('p', '<span class="note">Jump to:</span> ' +
      items.map(([id, text]) => `<a href="#${id}">${text}</a>`).join(' · ')));
  }
}

// labels each line at its last point, as in the scaling figures of the phantom paper
const endLabels = {
  id: 'endLabels',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx; ctx.save(); ctx.font = '12px system-ui'; ctx.fillStyle = css('--fg');
    const labels = [];
    chart.data.datasets.forEach((ds, i) => {
      if (!ds.endLabel || !chart.isDatasetVisible(i)) return;
      const pts = chart.getDatasetMeta(i).data; if (!pts.length) return;
      const p = pts[pts.length - 1]; labels.push({ text: ds.endLabel, x: p.x + 6, y: p.y + 4 });
    });
    // move labels apart vertically where they would overlap
    labels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) {
      if (Math.abs(labels[i].x - labels[i - 1].x) < 80) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 13);
    }
    labels.forEach(l => ctx.fillText(l.text, l.x, l.y));
    ctx.restore();
  }
};
function axisStyle(extra) {
  return Object.assign({ grid: { color: css('--line') }, ticks: { color: css('--muted') },
                         title: { color: css('--muted'), display: true } }, extra);
}
const axisTitle = text => ({ display: true, text, color: css('--muted') });
// logarithmic axis of number of cpus, labelled at powers of two
const ncpusAxis = nmax => axisStyle({ type: 'logarithmic', min: 1, max: 2 * nmax, title: axisTitle('Ncpus'),
  ticks: { color: css('--muted'), autoSkip: false, callback: v => Number.isInteger(Math.log2(v)) ? v : '' } });

function newChart(canvas, config) {
  const opts = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false }, config.options);
  // legend in the page colours, leaving out series whose label starts with "_" (e.g. ideal scaling)
  opts.plugins = Object.assign({}, opts.plugins);
  opts.plugins.legend = Object.assign({ labels: { color: css('--fg'), filter: l => !l.text.startsWith('_') } },
                                      opts.plugins.legend);
  opts.plugins.title = Object.assign({ color: css('--fg') }, opts.plugins.title);
  config.options = opts;
  return new Chart(canvas, config);
}

// ---------------------------------------------------------------- overview
function overview() {
  const c = content();
  section(c, 'fastest', 'Fastest time for each benchmark (s), full node, latest Phantom version');
  const rows = [], classes = [];
  for (const b of benches()) {
    const cells = machines().map(m => {
      const t = [...fullNodeTimes(b, m)];
      return t.length ? t.reduce((a, x) => x[1] < a[1] ? x : a) : null;
    });
    const best = Math.min(...cells.filter(Boolean).map(x => x[1]));
    rows.push([b, ...cells.map(x => x ? `${fmt(x[1])} <span class="note">${x[0]}</span>` : '')]);
    classes.push(['', ...cells.map(x => x && x[1] === best ? 'best' : '')]);
  }
  c.appendChild(table(['benchmark', ...machines().map(m => `${cpuName(m)}<br><span class="note" title="${m}">${fullNode(m)} cores</span>`)],
                      rows, classes));
  c.appendChild(el('p', '<span class="note">Each cell shows the best compiler on that machine. ' +
    'See the Compilers and Hardware tabs for the full comparison, and the per-machine reports: ' +
    machines().map(m => `<a href="${m}/report.html">${m}</a>`).join(', ') + '.</span>'));
  section(c, 'ranking', 'Compiler ranking on each machine');
  c.appendChild(compilerRanking());
  section(c, 'changes', `Changes of more than ${CHANGE}% between the last two Phantom versions`);
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
    changes.map(x => [x.key[0], mcell(x.key[1]), x.key[2], x.key[3], x.sha0, `<span title="${x.subject}">${x.sha1}</span>`,
                      `${fmt(x.t0)} → ${fmt(x.t1)}`, `${x.pct > 0 ? '+' : ''}${fmt(x.pct)}%`]),
    changes.map(x => [, , , , , , , x.pct > 0 ? 'worse' : 'best']));
}

// ---------------------------------------------------------------- compilers
// compilers on each machine, fastest first, by the geometric mean over benchmarks of the time
// relative to the fastest compiler on that machine, with the number of benchmarks each is fastest on
function compilerRanking() {
  const ranks = [];
  for (const m of machines()) {
    const T = benches().map(b => fullNodeTimes(b, m)).filter(t => t.size);
    const stats = uniq(T.flatMap(t => [...t.keys()])).map(lab => {
      const rel = T.filter(t => t.has(lab)).map(t => t.get(lab) / Math.min(...t.values()));
      return { lab, gm: geomean(rel), wins: rel.filter(x => x === 1).length, n: rel.length };
    }).sort((p, q) => p.gm - q.gm);
    if (stats.length) ranks.push([m, stats]);
  }
  const nmax = Math.max(0, ...ranks.map(([, st]) => st.length));
  const ordinal = i => ['1st', '2nd', '3rd'][i] || `${i + 1}th`;
  return table(['machine', ...[...Array(nmax).keys()].map(ordinal)],
    ranks.map(([m, st]) => [mcell(m), ...st.map(x =>
      `${x.lab} <span class="note">${fmt(x.gm, 2)}, fastest on ${x.wins}/${x.n}</span>`)]),
    ranks.map(([, st]) => ['', 'best']));
}

function compilers() {
  const c = content();
  jumpTo(c, [['compilers-rank', 'ranking'], ['compilers-all', 'all benchmarks'], ...benches().map(b => [`compilers-${b}`, b])]);
  section(c, 'compilers-rank', 'Compiler ranking on each machine');
  c.appendChild(compilerRanking());
  c.appendChild(el('p', '<span class="note">Compilers ordered by their time relative to the fastest compiler on that ' +
    'machine, averaged (geometric mean) over the benchmarks they were run on, at full node on the latest Phantom version. ' +
    '1.00 means fastest on every benchmark.</span>'));
  // summary: time relative to the fastest compiler on each machine, for every benchmark
  section(c, 'compilers-all', 'All benchmarks: time relative to the fastest compiler on each machine (1.00 = fastest), full node');
  const T = new Map(benches().map(b => [b, new Map(machines().map(m => [m, fullNodeTimes(b, m)]))]));
  const rows = [], classes = [];
  for (const m of machines()) {
    const labels = uniq(benches().flatMap(b => [...T.get(b).get(m).keys()]));
    const rel = labels.map(lab => benches().map(b => {
      const t = T.get(b).get(m), best = Math.min(...t.values());
      return t.has(lab) ? t.get(lab) / best : null; }));
    const gm = rel.map(r => r.filter(Boolean).length ? geomean(r.filter(Boolean)) : null);
    const bestgm = Math.min(...gm.filter(Boolean));
    labels.forEach((lab, i) => {
      rows.push([`${mcell(m)} · ${lab}`, ...rel[i].map(x => fmt(x, 2)), fmt(gm[i], 2)]);
      classes.push(['', ...rel[i].map(x => x === 1 ? 'best' : ''), gm[i] === bestgm ? 'best' : '']);
    });
  }
  c.appendChild(table(['machine and compiler', ...benches(), 'geometric mean'], rows, classes));
  // each benchmark: time per compiler on each machine
  for (const b of benches()) {
    section(c, `compilers-${b}`, `${b}: time per compiler (s), full node, latest Phantom version`);
    const t = new Map(machines().map(m => [m, T.get(b).get(m)]).filter(([, x]) => x.size));
    const ms = [...t.keys()], labels = uniq([...t.values()].flatMap(x => [...x.keys()]));
    newChart(chartBox(c, 300), { type: 'bar',
      data: { labels: ms.map(mlabel), datasets: labels.map((lab, i) => ({ label: lab, backgroundColor: colour(i),
              data: ms.map(m => t.get(m).get(lab) ?? null) })) },
      options: { scales: { x: axisStyle({ title: { display: false } }), y: axisStyle({ title: axisTitle('time (s)') }) } } });
    const rows = [], classes = [];
    for (const m of ms) {
      const best = Math.min(...t.get(m).values());
      for (const [lab, x] of [...t.get(m)].sort((p, q) => p[1] - q[1])) {
        rows.push([mcell(m), lab, fmt(x), fmt(x / best, 2)]);
        classes.push(['', '', x === best ? 'best' : '', '']);
      }
    }
    c.appendChild(table(['machine', 'compiler', 'time (s)', 'relative'], rows, classes));
  }
}

// ---------------------------------------------------------------- hardware
// fastest compiler on each machine at full node: time and core-seconds (time x threads)
function bestPerMachine(b) {
  const res = new Map();
  for (const m of machines()) {
    const t = [...fullNodeTimes(b, m)];
    if (!t.length) continue;
    const [lab, x] = t.reduce((a, y) => y[1] < a[1] ? y : a);
    res.set(m, { lab, t: x, cores: fullNode(m), cs: x * fullNode(m), cpu: RUNS.find(r => r.machine === m).cpu });
  }
  return res;
}
function hardware() {
  const c = content();
  jumpTo(c, [['hardware-all', 'all benchmarks'], ...benches().map(b => [`hardware-${b}`, b])]);
  section(c, 'hardware-all', 'All benchmarks: overall speed of each machine, relative to the fastest (geometric mean)');
  const B = benches().map(bestPerMachine);
  const stats = machines().map(m => {
    const node = [], core = [];
    B.forEach(res => { if (!res.has(m)) return;
      node.push(res.get(m).t / Math.min(...[...res.values()].map(x => x.t)));
      core.push(res.get(m).cs / Math.min(...[...res.values()].map(x => x.cs))); });
    return { m, n: node.length, node: node.length ? geomean(node) : null, core: core.length ? geomean(core) : null };
  });
  const bn = Math.min(...stats.map(s => s.node).filter(Boolean)), bc = Math.min(...stats.map(s => s.core).filter(Boolean));
  const sorted = stats.sort((p, q) => p.node - q.node);
  c.appendChild(table(['machine', 'time per node', 'cost per core', 'benchmarks'],
    sorted.map(s => [mcell(s.m), fmt(s.node, 2), fmt(s.core, 2), s.n]),
    sorted.map(s => ['', s.node === bn ? 'best' : '', s.core === bc ? 'best' : '', ''])));
  c.appendChild(el('p', '<span class="note">1.00 is the fastest machine on average. "Time per node" compares the ' +
    'wall time using the whole machine; "cost per core" compares core-seconds (time × cores), ' +
    'which is what is charged on clusters. Only benchmarks run on a machine are included in its average.</span>'));
  for (const b of benches()) {
    const res = bestPerMachine(b), ms = [...res.keys()];
    section(c, `hardware-${b}`, `${b}: fastest result on each machine, full node, latest Phantom version`);
    for (const [key, text] of [['t', 'time (s)'], ['cs', 'core-seconds (time × cores)']]) {
      newChart(chartBox(c, 70 + 34 * ms.length), { type: 'bar',
        data: { labels: ms.map(mlabel), datasets: [{ label: text, backgroundColor: colour(key === 't' ? 0 : 1),
                data: ms.map(m => res.get(m)[key]) }] },
        options: { indexAxis: 'y', plugins: { legend: { display: false }, title: { display: true, text } },
                   scales: { x: axisStyle({ title: { display: false } }), y: axisStyle({ title: { display: false } }) } } });
    }
    const bt = Math.min(...[...res.values()].map(x => x.t)), bcs = Math.min(...[...res.values()].map(x => x.cs));
    const rs = [...res].sort((p, q) => p[1].t - q[1].t);
    c.appendChild(table(['machine', 'compiler', 'time (s)', 'core-seconds'],
      rs.map(([m, x]) => [mcell(m), x.lab, fmt(x.t), fmt(x.cs, 0)]),
      rs.map(([, x]) => ['', '', x.t === bt ? 'best' : '', x.cs === bcs ? 'best' : ''])));
  }
}

// ---------------------------------------------------------------- scaling
// latest time at each thread count for one benchmark, machine and build
function curve(b, m, lab) {
  const rs = RUNS.filter(r => good(r) && r.bench === b && r.machine === m && r.label === lab);
  return new Map([...groupBy(rs, r => r.threads)].map(([n, x]) => [n, latestTime(x)]).sort((p, q) => p[0] - q[0]));
}
// the fastest build at the most threads, among those run at more than one thread count
function fastestCurve(b, m) {
  const labs = uniq(RUNS.filter(r => r.bench === b && r.machine === m).map(r => r.label));
  const curves = labs.map(l => [l, curve(b, m, l)]).filter(([, cv]) => cv.size > 1);
  const tmax = cv => cv.get(Math.max(...cv.keys()));
  return curves.reduce((a, x) => !a || tmax(x[1]) < tmax(a[1]) ? x : a, null);
}
// wall time and speedup against number of cpus, one line per entry in lines = [[name, curve], ...]
function scalingCharts(c, lines) {
  const nmax = Math.max(...lines.flatMap(l => [...l[1].keys()]));
  for (const kind of ['time', 'speedup']) {
    const datasets = [];
    lines.forEach(([name, cv], i) => {
      const n = [...cv.keys()], t0 = cv.get(n[0]) * n[0];
      datasets.push({ label: name, endLabel: name, borderColor: colour(i), backgroundColor: 'transparent',
                      pointRadius: 4, borderWidth: 1.5,
                      data: n.map(x => ({ x, y: kind === 'time' ? cv.get(x) : t0 / cv.get(x) })) });
      if (kind === 'time') datasets.push({ label: '_ideal', borderColor: colour(i), borderDash: [2, 3], borderWidth: 1,
                                           pointRadius: 0, data: [1, 2 * nmax].map(x => ({ x, y: t0 / x })) });
    });
    if (kind === 'speedup') datasets.push({ label: '_ideal', borderColor: css('--muted'), borderDash: [2, 3], borderWidth: 1,
                                            pointRadius: 0, data: [1, 2 * nmax].map(x => ({ x, y: x })) });
    newChart(chartBox(c), { type: 'line', data: { datasets }, plugins: [endLabels],
      options: { plugins: { legend: { display: false } }, layout: { padding: { right: 140 } },
        scales: { x: ncpusAxis(nmax), y: axisStyle({ type: 'logarithmic',
                  title: axisTitle(kind === 'time' ? 'Wall Time (s)' : 'Speedup') }) } } });
  }
  // wall time and parallel efficiency at each thread count
  const threads = [...new Set(lines.flatMap(l => [...l[1].keys()]))].sort((a, b) => a - b);
  c.appendChild(table(['threads', ...lines.map(l => l[0])], threads.map(n => [n, ...lines.map(([, cv]) => {
    if (!cv.has(n)) return ''; const n0 = [...cv.keys()][0];
    return `${fmt(cv.get(n))} <span class="note">${fmt(100 * cv.get(n0) * n0 / (cv.get(n) * n), 0)}%</span>`; })])));
}
// time in each routine against number of cpus, for one benchmark, machine and build
function routineChart(c, b, m, lab) {
  const rs = RUNS.filter(r => good(r) && r.bench === b && r.machine === m && r.label === lab && r.routines);
  const byN = [...groupBy(rs, r => r.threads)].sort((p, q) => p[0] - q[0]).map(([n, x]) => [n, x[x.length - 1].routines]);
  if (byN.length < 2) return;
  newChart(chartBox(c), { type: 'line', plugins: [endLabels],
    data: { datasets: ROUTINES.map((k, i) => ({ label: k, endLabel: k, borderColor: colour(i), backgroundColor: 'transparent',
            pointRadius: 3, borderWidth: 1.5, data: byN.filter(([, t]) => t[k] > 0).map(([n, t]) => ({ x: n, y: t[k] })) })) },
    options: { plugins: { legend: { display: false }, title: { display: true, text: `time per routine: ${b} on ${mlabel(m)}, ${lab}` } },
               layout: { padding: { right: 70 } },
               scales: { x: ncpusAxis(Math.max(...byN.map(x => x[0]))),
                         y: axisStyle({ type: 'logarithmic', title: axisTitle('time (s)') }) } } });
}
function scaling() {
  const c = content();
  // benchmarks and machines with runs at more than one thread count (fastest compiler on each machine)
  const byBench = benches().map(b => [b, machines().map(m => [m, fastestCurve(b, m)]).filter(([, x]) => x)])
    .filter(([, ls]) => ls.length);
  const byMachine = machines().map(m => [m, benches().map(b => [b, fastestCurve(b, m)]).filter(([, x]) => x)])
    .filter(([, ls]) => ls.length);
  if (!byBench.length) { c.appendChild(el('p', '<span class="note">no runs at more than one thread count yet</span>')); return; }
  jumpTo(c, [...byBench.map(([b]) => [`scaling-${b}`, b]), ...byMachine.map(([m]) => [`scaling-on-${m}`, `all benchmarks on ${mlabel(m)}`])]);
  c.appendChild(el('p', '<span class="note">Wall time and speedup against number of cpus, using the fastest compiler ' +
    'on each machine. Dotted lines show ideal scaling; percentages are parallel efficiency, relative to the smallest ' +
    'number of threads (assuming ideal scaling below it).</span>'));
  for (const [b, ls] of byBench) {
    section(c, `scaling-${b}`, `${b} (strong scaling)`);
    scalingCharts(c, ls.map(([m, [lab, cv]]) => [`${cpuName(m)}, ${lab}`, cv]));
    if (FIGURES[b]) c.appendChild(el('p', 'Figures and LaTeX table for computing time applications: ' +
      FIGURES[b].map(f => `<a href="${f}">${f}</a>`).join(', ')));
    for (const [m, [lab]] of ls) routineChart(c, b, m, lab);
  }
  for (const [m, ls] of byMachine) {
    section(c, `scaling-on-${m}`, `Strong scaling of all benchmarks on ${mlabel(m)}`);
    scalingCharts(c, ls.map(([b, [lab, cv]]) => [`${b} (${lab})`, cv]));
  }
}

// ---------------------------------------------------------------- history
function historyTab() {
  const c = content();
  jumpTo(c, benches().map(b => [`history-${b}`, b]));
  c.appendChild(el('p', '<span class="note">Time for each machine and compiler, at full node, against Phantom version, ' +
    'in commit order, with the date at the top. Each run is a point, so repeated runs of a version show the spread; ' +
    'lines join the medians. Hover for commit messages.</span>'));
  for (const b of benches()) {
    section(c, `history-${b}`, b);
    const rs = RUNS.filter(r => good(r) && r.bench === b && r.threads === fullNode(r.machine));
    const shas = uniq(rs.map(r => r.sha)).sort((p, q) => shaIndex(p) - shaIndex(q));
    const dateOf = sha => (RUNS.find(r => r.sha === sha).sha_date || '').slice(0, 10);
    const xaxes = { x: axisStyle({ type: 'category', labels: shas, title: axisTitle('Phantom version') }),
                    x2: axisStyle({ type: 'category', labels: shas.map(dateOf), position: 'top', grid: { display: false },
                                    title: axisTitle('date') }) };
    const datasets = [];
    [...groupBy(rs, r => `${mlabel(r.machine)}, ${r.label}`)].sort().forEach(([name, x], i) => {
      // every run as a point, and a line through the median of each version
      datasets.push({ label: '_' + name, type: 'scatter', backgroundColor: colour(i), pointRadius: 3,
                      data: x.map(r => ({ x: r.sha, y: r.time, subject: r.subject })) });
      const bySha = [...groupBy(x, r => r.sha)].sort((p, q) => shaIndex(p[0]) - shaIndex(q[0]));
      datasets.push({ label: name, borderColor: colour(i), backgroundColor: colour(i), pointRadius: 0, borderWidth: 1.5,
                      data: bySha.map(([sha, rr]) => ({ x: sha, y: median(rr.map(r => r.time)) })) });
    });
    newChart(chartBox(c), { type: 'line', data: { datasets },
      // logarithmic, since times differ by large factors between machines
      options: { scales: Object.assign({ y: axisStyle({ type: 'logarithmic', title: axisTitle('time (s)') }) }, xaxes),
                 plugins: { tooltip: { callbacks: {
                   label: ctx => `${ctx.dataset.label.replace(/^_/, '')}: ${fmt(ctx.raw.y)} s`,
                   afterLabel: ctx => ctx.raw.subject || '' } } } } });
    // parallel efficiency at full node by version, where runs at more than one thread count exist
    const eff = [];
    for (const [name, x] of groupBy(RUNS.filter(r => good(r) && r.bench === b), r => `${cpuName(r.machine)}, ${r.label}`)) {
      const pts = [];
      for (const [sha, rr] of groupBy(x, r => r.sha)) {
        const n = [...new Set(rr.map(r => r.threads))].sort((p, q) => p - q);
        if (n.length < 2) continue;
        const t = k => median(rr.filter(r => r.threads === k).map(r => r.time)), n0 = n[0], n1 = n[n.length - 1];
        pts.push({ x: sha, y: t(n0) * n0 / (t(n1) * n1) });
      }
      if (pts.length) eff.push({ label: `${name} (${Math.max(...x.map(r => r.threads))} threads)`,
                                 data: pts.sort((p, q) => shaIndex(p.x) - shaIndex(q.x)) });
    }
    if (eff.length) {
      newChart(chartBox(c, 280), { type: 'line',
        data: { datasets: eff.map((d, i) => Object.assign(d, { borderColor: colour(i), backgroundColor: colour(i), pointRadius: 4 })) },
        options: { scales: Object.assign({ y: axisStyle({ min: 0, max: 1.05, title: axisTitle('parallel efficiency, full node') }) }, xaxes) } });
    }
    const changes = findChanges(rs);
    if (changes.length) c.appendChild(changeTable(changes));
  }
}

// ---------------------------------------------------------------- tabs
const TABS = { overview, compilers, hardware, scaling, history: historyTab };
let current = null;
function show(tab) {
  if (!TABS[tab]) tab = 'overview';
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab !== current) {
    content().innerHTML = '';
    TABS[tab]();
    current = tab;
  }
}
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => {
  window.history.replaceState(null, '', '#' + b.dataset.tab); show(b.dataset.tab); window.scrollTo(0, 0); }));
fetch('data.json').then(r => r.json()).then(d => {
  RUNS = d.runs.filter(r => r.time > 0);
  FIGURES = d.figures || {};
  // phantom versions in order of their date
  SHAS = uniq(RUNS.map(r => r.sha)).sort((a, b) =>
    (RUNS.find(r => r.sha === a).sha_date || '').localeCompare(RUNS.find(r => r.sha === b).sha_date || ''));
  // the tab is the first part of the address after "#" (links within a tab add a section name)
  const hash = location.hash.slice(1);
  show(TABS[hash] ? hash : 'overview');
});
