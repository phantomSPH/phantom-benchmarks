// The Phantom benchmark suite: interactive website, drawn from data.json written by report.py
// Each tab shows all of its tables and charts one after another, with links to jump to each part
'use strict';

const ROUTINES = ['tree', 'density', 'force', 'radiation', 'other', 'startup'];
const CHANGE = 5;   // per cent change in time that is flagged in the history
let RUNS = [], FIGURES = {}, SHAS = [], SPEEDS = {};

// ---------------------------------------------------------------- utilities
const uniq = a => [...new Set(a)].sort();
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
                      return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]); };
const geomean = a => Math.exp(a.reduce((s, x) => s + Math.log(x), 0) / a.length);
const fmt = (x, d = 1) => (x == null || isNaN(x)) ? '' : x.toFixed(d);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const PALETTE = ['#0b6bcb', '#e8590c', '#2f9e44', '#c2255c', '#7048e8', '#0c8599', '#e67700', '#5c940d'];
const colour = i => PALETTE[i % PALETTE.length];
// markers and dash patterns distinguishing several series of the same colour
const MARKERS = ['circle', 'triangle', 'rect', 'rectRot', 'star', 'crossRot'];
const DASHES = [[], [6, 3], [2, 2], [8, 3, 2, 3], [12, 4], [4, 4]];
const el = (tag, html) => { const e = document.createElement(tag); if (html != null) e.innerHTML = html; return e; };
const content = () => document.getElementById('content');
const benches = () => uniq(RUNS.map(r => r.bench));
// machines with the most cores first, then by name
const machines = () => uniq(RUNS.map(r => r.machine)).sort((a, b) => fullNode(b) - fullNode(a) || a.localeCompare(b));

function groupBy(runs, key) {
  const g = new Map();
  for (const r of runs) { const k = key(r); if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  return g;
}
// largest number of threads run on each machine with openMP alone ("full node")
const fullNode = m => Math.max(...RUNS.filter(r => r.machine === m && !isMpi(r)).map(r => r.threads));
// machines are shown by their cpu and the number of cores in one node, e.g. "AMD EPYC 7763
// (4 cores/node)", with the machine name as a tooltip (runs with MPI can use several nodes)
const cpuName = m => (RUNS.filter(r => r.machine === m).pop().cpu || m)
  .replace(/\(R\)|\(TM\)|\bProcessor\b|\b\d+-Core\b|\bCPU\b|@.*$/g, '').replace(/\s+/g, ' ').trim();
const mlabel = m => `${cpuName(m)} (${fullNode(m)} cores/node)`;
const mcell = m => `<span title="${m}">${mlabel(m)}</span>`;
// total speed of the first n cores of a machine, relative to its fastest core, for machines with
// cores of different speeds (SPEEDS[m] = [[count, speed], ...] in the order threads fill them);
// otherwise n. Cores beyond the last group keep that group's speed, so the ideal line does not
// jump back to full speed past the last measured core. Ideal scaling is then straight lines joined
// where the core speed changes
function capacity(m, n) {
  const groups = SPEEDS[m];
  if (!groups || !groups.length) return n;
  let cap = 0, left = n, speed = 1;
  for (const [count, s] of groups) {
    speed = s;
    const k = Math.min(left, count);
    cap += k * speed;
    left -= k;
    if (left <= 0) return cap;
  }
  return cap + left * speed;
}
// numbers of cores at which the speed of the cores changes, for drawing ideal scaling
const speedBreaks = m => (SPEEDS[m] || []).reduce((a, [count]) => [...a, (a[a.length - 1] || 0) + count], []);
// collapsed table, shown on request
function details(parent, summary, node) {
  const d = el('details', `<summary class="note">${summary}</summary>`); d.appendChild(node); parent.appendChild(d);
}
// phantom version order, from the date of each phantom version
const shaIndex = sha => SHAS.indexOf(sha);
const latestSha = runs => runs.reduce((a, r) => shaIndex(r.sha) > shaIndex(a) ? r.sha : a, runs[0].sha);
// median time of the runs on the most recent phantom version among the given runs
function latestTime(runs) {
  if (!runs.length) return null;
  const sha = latestSha(runs);
  return median(runs.filter(r => r.sha === sha).map(r => r.time));
}
// runs ordered by machine (most cores first), then build, so that series appear in that order
const byMachine = runs => [...runs].sort((p, q) =>
  machines().indexOf(p.machine) - machines().indexOf(q.machine) || p.label.localeCompare(q.label));
const ok = r => r.status !== 'fail' && r.time > 0 && !r.dirty;
// runs with an MPI build (any number of tasks), and openMP-only runs (used for the
// thread scaling of each build, the time per routine and the history)
const isMpi = r => r.nmpi > 1 || r.label.endsWith('-mpi') || !!r.mpi;
const good = r => ok(r) && !isMpi(r);
const cores = r => r.nmpi * r.threads;
// how a run used the cores, e.g. "16 × 16" (MPI tasks × threads) or "64 threads"
const layout = (nmpi, threads, mpi) => mpi ? `${nmpi} × ${threads}` : `${threads} threads`;
// the same, with the total number of cpus for MPI runs, e.g. "256 cpus, 16 × 16"
const cpusText = x => x.mpi ? `${x.cores} cpus, ${layout(x.nmpi, x.threads, true)}` : layout(x.nmpi, x.threads, false);
// builds are named by their compiler, version and MPI library, e.g. "gfortran 12.3.0, Open MPI 4.1.5",
// whatever label they were run with (labels may mark e.g. a branch under test)
const compName = r => [`${r.cname || r.label} ${r.version}`.trim(), r.mpi || (isMpi(r) ? 'MPI' : '')].filter(Boolean).join(', ');
// the compiler name, with the version and MPI library in grey
const compHtml = s => { const i = s.indexOf(' '); return i < 0 ? s : `${s.slice(0, i)} <span class="note">${s.slice(i + 1)}</span>`; };
// compiler of the latest run of a build (label) on a machine
const compOf = (m, lab) => RUNS.filter(r => r.machine === m && r.label === lab).pop().comp;
// latest time of every series of runs (benchmark, machine, build, MPI tasks and threads)
// among the given runs
function seriesTimes(runs) {
  return [...groupBy(runs, r => [r.bench, r.machine, r.label, r.nmpi, r.threads].join('|')).values()].map(rs => {
    const r = rs[0], sha = latestSha(rs), last = rs.filter(x => x.sha === sha).pop();
    return { bench: r.bench, machine: r.machine, label: r.label, comp: last.comp, nmpi: r.nmpi, threads: r.threads,
             cores: cores(r), mpi: isMpi(r), sha, branch: last.branch, time: latestTime(rs) };
  });
}
// the fastest series in xs
const fastest = xs => xs.reduce((a, x) => x.time < a.time ? x : a);
// configurations in which compilers are compared on a machine: openMP alone at full node and,
// where runs with MPI used more cpus than one node, MPI at the largest number of cpus
function configs(m) {
  const n = fullNode(m), nmax = Math.max(0, ...RUNS.filter(r => ok(r) && isMpi(r) && r.machine === m).map(cores));
  const out = [];
  if (nmax > n) out.push({ m, cores: nmax, mpi: true, pick: r => ok(r) && isMpi(r) && r.machine === m && cores(r) === nmax });
  out.push({ m, cores: n, mpi: false, pick: r => good(r) && r.machine === m && r.threads === n });
  return out;
}
// fastest series of each compiler in one configuration, for one benchmark, on the latest phantom version
function configBest(b, cfg) {
  const best = new Map();
  for (const x of seriesTimes(RUNS.filter(r => r.bench === b && cfg.pick(r)))) {
    if (!best.has(x.comp) || x.time < best.get(x.comp).time) best.set(x.comp, x);
  }
  return best;
}
// configuration name, e.g. "AMD EPYC 7543 (256 cpus, 16 × 16)" or "AMD EPYC 7543 (64 threads, openMP)",
// giving the split into MPI tasks × threads where it is the same for every compiler and benchmark
function configName(cfg) {
  if (!cfg.mpi) return `${cpuName(cfg.m)} (${cfg.cores} threads, openMP)`;
  const splits = uniq(benches().flatMap(b => [...configBest(b, cfg).values()].map(x => layout(x.nmpi, x.threads, true))));
  return `${cpuName(cfg.m)} (${cfg.cores} cpus, ${splits.length === 1 ? splits[0] : 'MPI + openMP'})`;
}
const configCell = cfg => `<span title="${cfg.m}">${configName(cfg)}</span>`;
const allConfigs = () => machines().flatMap(configs);

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
  const legend = opts.plugins.legend || {};
  opts.plugins.legend = Object.assign({}, legend, { labels: Object.assign({ color: css('--fg'),
    filter: l => !l.text.startsWith('_') }, legend.labels) });
  opts.plugins.title = Object.assign({ color: css('--fg') }, opts.plugins.title);
  config.options = opts;
  return new Chart(canvas, config);
}

// ---------------------------------------------------------------- overview
// fastest series for each benchmark among the given runs
const fastestSeries = runs => new Map([...groupBy(seriesTimes(runs), x => x.bench)].map(([b, xs]) => [b, fastest(xs)]));
function overview() {
  const c = content();
  section(c, 'record', 'Current record for each benchmark');
  const record = fastestSeries(RUNS.filter(ok));
  c.appendChild(table(['benchmark', 'time (s)', 'machine', 'cores', 'MPI tasks × threads', 'compiler', 'Phantom version'],
    benches().filter(b => record.has(b)).map(b => { const x = record.get(b);
      return [b, fmt(x.time), `<span title="${x.machine}">${cpuName(x.machine)}</span>`, x.cores,
              layout(x.nmpi, x.threads, x.mpi), compHtml(x.comp), `${x.sha} <span class="note">${x.branch}</span>`]; }),
    benches().filter(b => record.has(b)).map(() => ['', 'best'])));
  c.appendChild(el('p', '<span class="note">The fastest result on any machine, with any compiler and number of cores, ' +
    'with or without MPI, on the latest Phantom version run in each configuration.</span>'));
  // the fastest run with MPI, which the overall record hides wherever openMP alone is faster
  section(c, 'record-hybrid', 'Current hybrid MPI + openMP record for each benchmark');
  const hybrid = fastestSeries(RUNS.filter(r => ok(r) && isMpi(r)));
  c.appendChild(table(['benchmark', 'time (s)', 'machine', 'nodes', 'cores', 'MPI tasks × threads', 'compiler', 'Phantom version'],
    benches().filter(b => hybrid.has(b)).map(b => { const x = hybrid.get(b);
      return [b, fmt(x.time), `<span title="${x.machine}">${cpuName(x.machine)}</span>`,
              Math.ceil(x.cores / fullNode(x.machine)), x.cores, layout(x.nmpi, x.threads, x.mpi),
              compHtml(x.comp), `${x.sha} <span class="note">${x.branch}</span>`]; }),
    benches().filter(b => hybrid.has(b)).map(b =>
      ['', record.has(b) && hybrid.get(b).time === record.get(b).time ? 'best' : ''])));
  c.appendChild(el('p', '<span class="note">The fastest result with MPI, on any number of tasks and nodes, ' +
    'on the latest Phantom version run in each configuration; marked when it is also the overall record.</span>'));
  section(c, 'fastest', 'Fastest time on each machine (s), any compiler and number of cores, with or without MPI');
  // fastest series for each benchmark (columns) on each machine (rows)
  const best = new Map(machines().map(m => [m, fastestSeries(RUNS.filter(r => ok(r) && r.machine === m))]));
  c.appendChild(table(['machine', ...benches()], machines().map(m => [mcell(m), ...benches().map(b => {
    const x = best.get(m).get(b);
    return x ? `${fmt(x.time)} <span class="note">${compHtml(x.comp)}, ${cpusText(x)}</span>` : ''; })]),
    machines().map(m => ['', ...benches().map(b => {
      const x = best.get(m).get(b);
      return x && record.has(b) && x.time === record.get(b).time ? 'best' : ''; })])));
  c.appendChild(el('p', '<span class="note">Each cell shows the fastest compiler and how it used the cores ' +
    '(threads, or total cpus and MPI tasks × threads, which can span several nodes). See the Compilers and Hardware ' +
    'tabs for comparisons at full node, and the ' +
    'per-machine reports: ' + machines().map(m => `<a href="${m}/report.html">${m}</a>`).join(', ') + '.</span>'));
  section(c, 'ranking', 'Compiler ranking on each machine');
  c.appendChild(compilerRanking());
  section(c, 'changes', `Changes of more than ${CHANGE}% at full node between the last two Phantom versions`);
  // not the GitHub runners: each run may be on a different virtual machine, so their times vary
  // by tens of per cent between versions (pull requests compare base and head on the same runner)
  const changes = findChanges(RUNS.filter(r => good(r) && r.threads === fullNode(r.machine) &&
                                          !r.machine.startsWith('github'))).filter(x => x.last);
  if (changes.length) changeProfiles(c, changes);
  else c.appendChild(el('p', '<span class="note">none</span>'));
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
  return table(['benchmark', 'machine', 'compiler', 'threads', 'from', 'to', 'time (s)', 'change'],
    changes.map(x => [x.key[0], mcell(x.key[1]), compHtml(compOf(x.key[1], x.key[2])), x.key[3], x.sha0, `<span title="${x.subject}">${x.sha1}</span>`,
                      `${fmt(x.t0)} → ${fmt(x.t1)}`, `${x.pct > 0 ? '+' : ''}${fmt(x.pct)}%`]),
    changes.map(x => [, , , , , , , x.pct > 0 ? 'worse' : 'best']));
}

// ---------------------------------------------------------------- compilers
// compilers in each configuration (see configs), fastest first, by the geometric mean over benchmarks
// of the time relative to the fastest compiler, with the number of benchmarks each is fastest on
function compilerRanking() {
  const ranks = [];
  for (const cfg of allConfigs()) {
    const B = benches().map(b => configBest(b, cfg)).filter(t => t.size);
    const stats = uniq(B.flatMap(t => [...t.keys()])).map(comp => {
      const rel = B.filter(t => t.has(comp)).map(t => t.get(comp).time / fastest([...t.values()]).time);
      return { comp, gm: geomean(rel), wins: rel.filter(x => x === 1).length, n: rel.length };
    }).sort((p, q) => p.gm - q.gm);
    if (stats.length) ranks.push([cfg, stats]);
  }
  const nmax = Math.max(0, ...ranks.map(([, st]) => st.length));
  const ordinal = i => ['1st', '2nd', '3rd'][i] || `${i + 1}th`;
  return table(['machine', ...[...Array(nmax).keys()].map(ordinal)],
    ranks.map(([cfg, st]) => [configCell(cfg), ...st.map(x =>
      `${compHtml(x.comp)} <span class="note">${fmt(x.gm, 2)}, fastest on ${x.wins}/${x.n}</span>`)]),
    ranks.map(() => ['', 'best']));
}
const RANKING_NOTE = 'Compilers ordered by their time relative to the fastest compiler in each configuration, ' +
  'averaged (geometric mean) over the benchmarks they were run on, on the latest Phantom version: openMP alone at ' +
  'full node and, where MPI runs used more than one node, MPI + openMP at the largest number of cpus, using the ' +
  'fastest split into MPI tasks × threads. 1.00 means fastest on every benchmark.';

function compilers() {
  const c = content();
  jumpTo(c, [['compilers-rank', 'ranking'], ['compilers-all', 'all benchmarks'], ...benches().map(b => [`compilers-${b}`, b])]);
  section(c, 'compilers-rank', 'Compiler ranking on each machine');
  c.appendChild(compilerRanking());
  c.appendChild(el('p', `<span class="note">${RANKING_NOTE}</span>`));
  // summary: time relative to the fastest compiler in each configuration, for every benchmark
  section(c, 'compilers-all', 'All benchmarks: time relative to the fastest compiler on each machine (1.00 = fastest)');
  c.appendChild(el('p', '<span class="note">Each entry gives the Phantom version (commit) of the run; hover for the ' +
    'time and branch.</span>'));
  const cfgs = allConfigs();
  const T = new Map(benches().map(b => [b, cfgs.map(cfg => configBest(b, cfg))]));
  const rows = [], classes = [];
  cfgs.forEach((cfg, k) => {
    const comps = uniq(benches().flatMap(b => [...T.get(b)[k].keys()]));
    // fastest series of each compiler on each benchmark, and its time relative to the fastest compiler
    const xs = comps.map(comp => benches().map(b => T.get(b)[k].get(comp)));
    const rel = xs.map(r => r.map((x, j) => x ? x.time / fastest([...T.get(benches()[j])[k].values()]).time : null));
    const gm = rel.map(r => r.filter(Boolean).length ? geomean(r.filter(Boolean)) : null);
    const bestgm = Math.min(...gm.filter(Boolean));
    // each cell gives the Phantom version run, with the time and branch on hover
    const cell = (x, v) => x ? `${fmt(v, 2)} <span class="note" title="${fmt(x.time)} s, ${x.branch}">${x.sha}</span>` : '';
    comps.forEach((comp, i) => {
      rows.push([`${configCell(cfg)} · ${compHtml(comp)}`, ...xs[i].map((x, j) => cell(x, rel[i][j])), fmt(gm[i], 2)]);
      classes.push(['', ...rel[i].map(x => x === 1 ? 'best' : ''), gm[i] === bestgm ? 'best' : '']);
    });
  });
  c.appendChild(table(['machine and compiler', ...benches(), 'geometric mean'], rows, classes));
  // each benchmark: time per compiler in each configuration
  for (const b of benches()) {
    section(c, `compilers-${b}`, `${b}: time per compiler (s), latest Phantom version`);
    const bs = cfgs.map(cfg => [cfg, configBest(b, cfg)]).filter(([, x]) => x.size);
    const comps = uniq(bs.flatMap(([, x]) => [...x.keys()]));
    newChart(chartBox(c, 300), { type: 'bar',
      data: { labels: bs.map(([cfg]) => configName(cfg)), datasets: comps.map((comp, i) => ({ label: comp, backgroundColor: colour(i),
              data: bs.map(([, x]) => x.has(comp) ? x.get(comp).time : null) })) },
      options: { scales: { x: axisStyle({ title: { display: false } }), y: axisStyle({ title: axisTitle('time (s)') }) } } });
    const rows = [], classes = [];
    for (const [cfg, x] of bs) {
      const best = fastest([...x.values()]).time;
      for (const s of [...x.values()].sort((p, q) => p.time - q.time)) {
        rows.push([configCell(cfg), compHtml(s.comp), cpusText(s), fmt(s.time), fmt(s.time / best, 2)]);
        classes.push(['', '', '', s.time === best ? 'best' : '', '']);
      }
    }
    c.appendChild(table(['machine', 'compiler', 'threads, or cpus and MPI tasks × threads', 'time (s)', 'relative'], rows, classes));
  }
}

// ---------------------------------------------------------------- hardware
// fastest result on each machine for one benchmark, on the latest phantom version: on any number of
// cpus (with MPI possibly spanning several nodes), and on a single node (with core-seconds, time × cpus)
function bestPerMachine(b) {
  const res = new Map();
  for (const m of machines()) {
    const xs = seriesTimes(RUNS.filter(r => ok(r) && r.bench === b && r.machine === m));
    const node = xs.filter(x => x.cores <= fullNode(m));
    if (!node.length) continue;
    const n = fastest(node);
    res.set(m, { any: fastest(xs), node: n, cs: n.time * n.cores });
  }
  return res;
}
// quantity f on each machine, relative to the smallest among the machines
const relTo = (res, f) => { const best = Math.min(...[...res.values()].map(f)); return new Map([...res].map(([m, x]) => [m, f(x) / best])); };
// fastest time on any number of cpus, on one node, and core-seconds on one node
const HW_KEYS = [x => x.any.time, x => x.node.time, x => x.cs];
function hardware() {
  const c = content();
  jumpTo(c, [['hardware-all', 'all benchmarks'], ...benches().map(b => [`hardware-${b}`, b])]);
  section(c, 'hardware-all', 'All benchmarks: overall speed of each machine, relative to the fastest (geometric mean)');
  const B = benches().map(bestPerMachine);
  const R = B.map(res => HW_KEYS.map(f => relTo(res, f)));
  const stats = machines().map(m => {
    const rs = R.filter(r => r[0].has(m));
    return { m, n: rs.length, g: HW_KEYS.map((f, k) => rs.length ? geomean(rs.map(r => r[k].get(m))) : null),
             cpus: Math.max(0, ...B.filter(res => res.has(m)).map(res => res.get(m).any.cores)) };
  }).filter(s => s.n);
  const best = HW_KEYS.map((f, k) => Math.min(...stats.map(s => s.g[k])));
  const isBest = (s, k) => s.g[k] === best[k] ? 'best' : '';
  c.appendChild(table(['machine', 'fastest, any number of cpus', 'most cpus used', 'time on one node', 'cost per core', 'benchmarks'],
    stats.map(s => [mcell(s.m), fmt(s.g[0], 2), s.cpus, fmt(s.g[1], 2), fmt(s.g[2], 2), s.n]),
    stats.map(s => ['', isBest(s, 0), '', isBest(s, 1), isBest(s, 2), ''])));
  c.appendChild(el('p', '<span class="note">1.00 is the fastest machine on average. "Fastest" compares the best ' +
    'wall time on any number of cpus, with MPI possibly spanning several nodes; "time on one node" compares the best ' +
    'wall time on a single node; "cost per core" compares core-seconds (time × cpus) on one node, which is what is ' +
    'charged on clusters. Only benchmarks run on a machine are included in its average.</span>'));
  for (const b of benches()) {
    const res = bestPerMachine(b), ms = [...res.keys()];
    section(c, `hardware-${b}`, `${b}: fastest result on each machine, latest Phantom version`);
    newChart(chartBox(c, 70 + 50 * ms.length), { type: 'bar',
      data: { labels: ms.map(mlabel), datasets: [
        { label: 'any number of cpus', backgroundColor: colour(0), data: ms.map(m => res.get(m).any.time) },
        { label: 'one node', backgroundColor: colour(2), data: ms.map(m => res.get(m).node.time) }] },
      options: { indexAxis: 'y', plugins: { title: { display: true, text: 'time (s)' } },
                 scales: { x: axisStyle({ title: { display: false } }), y: axisStyle({ title: { display: false } }) } } });
    newChart(chartBox(c, 70 + 34 * ms.length), { type: 'bar',
      data: { labels: ms.map(mlabel), datasets: [{ label: 'core-seconds', backgroundColor: colour(1), data: ms.map(m => res.get(m).cs) }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false }, title: { display: true, text: 'core-seconds on one node (time × cpus)' } },
                 scales: { x: axisStyle({ title: { display: false } }), y: axisStyle({ title: { display: false } }) } } });
    const [ra, rn, rc] = HW_KEYS.map(f => relTo(res, f));
    const mark = (r, m) => r.get(m) === 1 ? 'best' : '';
    const rs = [...res];
    c.appendChild(table(['machine', 'fastest (s)', 'cpus', 'compiler', 'one node (s)', 'cpus', 'compiler', 'core-seconds'],
      rs.map(([m, x]) => [mcell(m), fmt(x.any.time), cpusText(x.any), compHtml(x.any.comp),
                          fmt(x.node.time), cpusText(x.node), compHtml(x.node.comp), fmt(x.cs, 0)]),
      rs.map(([m]) => ['', mark(ra, m), '', '', mark(rn, m), '', '', mark(rc, m)])));
  }
}

// ---------------------------------------------------------------- scaling
// runs of the latest Phantom version among rs with at least nmin numbers of cores, i.e. the last
// complete scaling test on a machine (machines are benchmarked irregularly, so this may be old)
function lastSet(rs, nmin) {
  const bySha = [...groupBy(rs, r => r.sha)].filter(([, x]) => new Set(x.map(cores)).size >= nmin)
    .sort((p, q) => shaIndex(q[0]) - shaIndex(p[0]));
  return bySha.length ? bySha[0][1] : [];
}
const runDate = rs => rs.map(r => r.date).sort().pop().slice(0, 10);
// median time at each thread count for one benchmark, machine and openMP build, from its last
// scaling test (with the date of that test)
function curve(b, m, lab) {
  const rs = lastSet(RUNS.filter(r => good(r) && r.bench === b && r.machine === m && r.label === lab), 2);
  const cv = new Map([...groupBy(rs, r => r.threads)].map(([n, x]) => [n, median(x.map(r => r.time))]).sort((p, q) => p[0] - q[0]));
  cv.date = rs.length ? runDate(rs) : '';
  return cv;
}
// the fastest openMP build at the most threads, among those run at more than one thread count
function fastestCurve(b, m) {
  const labs = uniq(RUNS.filter(r => r.bench === b && r.machine === m).map(r => r.label));
  const curves = labs.map(l => [l, curve(b, m, l)]).filter(([, cv]) => cv.size > 1);
  const tmax = cv => cv.get(Math.max(...cv.keys()));
  return curves.reduce((a, x) => !a || tmax(x[1]) < tmax(a[1]) ? x : a, null);
}
// the fastest MPI run at each number of cores (any build and split into MPI tasks × threads),
// from the last MPI test of this benchmark on the machine
function mpiCurve(b, m) {
  const rs = lastSet(RUNS.filter(r => ok(r) && isMpi(r) && r.bench === b && r.machine === m), 1);
  const best = new Map();
  for (const x of seriesTimes(rs)) if (!best.has(x.cores) || x.time < best.get(x.cores).time) best.set(x.cores, x);
  if (!best.size) return null;
  const cv = new Map([...best].sort((p, q) => p[0] - q[0]));
  cv.date = runDate(rs);
  return cv;
}
// scaling lines for one benchmark on one machine: the fastest openMP build, and the fastest MPI run
// at each number of cores. Speedups and efficiencies of both are relative to the openMP time
// (times cores) at its smallest number of cores, or to the MPI one if there is no openMP curve
function machineLines(b, m) {
  const lines = [], omp = fastestCurve(b, m), mpi = mpiCurve(b, m);
  // time on one (fastest) core, assuming ideal scaling below the smallest number of cores
  const first = cv => { const [n, t] = [...cv][0]; return capacity(m, n) * t; };
  const ref = omp ? first(omp[1]) : null;
  if (omp) lines.push({ name: `${cpuName(m)}, ${compOf(m, omp[0])}`, date: omp[1].date, cv: omp[1], ref, m });
  if (mpi) {
    const cv = new Map([...mpi].map(([n, x]) => [n, x.time]));
    lines.push({ name: `${cpuName(m)}, ${[...mpi.values()].pop().comp}`, date: mpi.date, cv, ref: ref || first(cv), mpi: true, m,
                 splits: new Map([...mpi].map(([n, x]) => [n, layout(x.nmpi, x.threads, true)])) });
  }
  return lines;
}
// the fastest of the openMP and MPI lines at each number of cores
function bestLine(b, m) {
  const ls = machineLines(b, m);
  if (!ls.length) return null;
  const cv = new Map(), splits = new Map();
  for (const l of ls) for (const [n, t] of l.cv) {
    if (!cv.has(n) || t < cv.get(n)) { cv.set(n, t); l.mpi ? splits.set(n, l.splits.get(n)) : splits.delete(n); }
  }
  return { cv: new Map([...cv].sort((p, q) => p[0] - q[0])), ref: ls[0].ref, splits, m,
           date: ls.map(l => l.date).sort().pop() };
}
// wall time and speedup against number of cores, for lines = [{name, date, cv, ref, m, mpi, splits, ci}, ...];
// MPI lines are dashed, in the colour ci of their machine. Ideal scaling allows for machines whose
// cores differ in speed (see capacity)
function scalingCharts(c, lines) {
  const nmax = Math.max(...lines.flatMap(l => [...l.cv.keys()]));
  // measured core counts as well as the speed changes, so the dotted line is the ideal at every
  // row of the efficiency table and changes slope where slower cores start to be used
  const idealN = (m, ns) => [...new Set([1, ...ns, ...speedBreaks(m).filter(x => x < 2 * nmax), 2 * nmax])]
    .filter(x => x > 0).sort((a, b) => a - b);
  const label = l => l.date ? `${l.name} (${l.date})` : l.name;
  for (const kind of ['time', 'speedup']) {
    const datasets = [];
    lines.forEach((l, i) => {
      const col = colour(l.ci ?? i), n = [...l.cv.keys()];
      datasets.push({ label: label(l), endLabel: l.name, borderColor: col, backgroundColor: 'transparent',
                      pointRadius: 4, borderWidth: 1.5, borderDash: l.mpi ? [6, 3] : [],
                      data: n.map(x => ({ x, y: kind === 'time' ? l.cv.get(x) : l.ref / l.cv.get(x) })) });
      // ideal scaling, for openMP lines and for machines whose cores differ in speed
      if (!l.mpi && (kind === 'time' || SPEEDS[l.m])) {
        datasets.push({ label: '_ideal', borderColor: col, borderDash: [2, 3], borderWidth: 1, pointRadius: 0,
          data: idealN(l.m, n).map(x => ({ x, y: kind === 'time' ? l.ref / capacity(l.m, x) : capacity(l.m, x) })) });
      }
    });
    // one straight ideal, shared by openMP lines whose cores are all the same speed. A chart of
    // only machines with slower cores uses the per-line ideal above, which changes slope
    if (kind === 'speedup' && lines.some(l => !SPEEDS[l.m])) datasets.push({
      label: '_ideal', borderColor: css('--muted'), borderDash: [2, 3], borderWidth: 1, pointRadius: 0,
      data: [1, 2 * nmax].map(x => ({ x, y: x })) });
    newChart(chartBox(c), { type: 'line', data: { datasets }, plugins: [endLabels],
      options: { plugins: { legend: { display: false } }, layout: { padding: { right: 160 } },
        scales: { x: ncpusAxis(nmax), y: axisStyle({ type: 'logarithmic',
                  title: axisTitle(kind === 'time' ? 'Wall Time (s)' : 'Speedup') }) } } });
  }
  // wall time, parallel efficiency and (for MPI) the split into tasks × threads at each number of cores
  const ns = [...new Set(lines.flatMap(l => [...l.cv.keys()]))].sort((a, b) => a - b);
  details(c, 'times and parallel efficiencies', table(['cores', ...lines.map(l => label(l) + (l.mpi ? ', MPI' : ''))],
    ns.map(n => [n, ...lines.map(l => {
      if (!l.cv.has(n)) return '';
      const split = l.splits && l.splits.has(n) ? `, ${l.splits.get(n)}` : '';
      // actual speed over the ideal wall time drawn as the dotted line
      const eff = 100 * l.ref / (l.cv.get(n) * capacity(l.m, n));
      return `${fmt(l.cv.get(n))} <span class="note">${fmt(eff, 0)}%${split}</span>`; })])));
}
// time in each routine against number of cpus, for one benchmark, machine and openMP build
// (solid), and for the fastest MPI run at each number of cores (dashed, as in the scaling charts)
function routineChart(c, b, m, lab) {
  const rs = lastSet(RUNS.filter(r => good(r) && r.bench === b && r.machine === m && r.label === lab && r.routines), 2);
  const byN = [...groupBy(rs, r => r.threads)].sort((p, q) => p[0] - q[0]).map(([n, x]) => [n, x[x.length - 1].routines]);
  const mpiByN = mpiRoutines(b, m);
  if (byN.length + mpiByN.length < 2) return;
  // each routine is labelled at the end of its rightmost line
  const line = (k, i, pts, mpi) => ({ label: mpi ? `${k} (MPI)` : k, endLabel: mpi === (mpiByN.length > 0) ? k : '',
    borderColor: colour(i), backgroundColor: 'transparent', pointRadius: 3, borderWidth: 1.5, borderDash: mpi ? [6, 3] : [],
    data: pts.filter(([, t]) => t[k] > 0).map(([n, t]) => ({ x: n, y: t[k] })) });
  const datasets = ROUTINES.map((k, i) => line(k, i, byN, false));
  if (mpiByN.length) datasets.push(...ROUTINES.map((k, i) => line(k, i, mpiByN, true)));
  const title = `time per routine: ${b} on ${mlabel(m)}, ${compOf(m, lab)}` + (mpiByN.length ? ' (dashed: fastest MPI run)' : '');
  newChart(chartBox(c), { type: 'line', plugins: [endLabels], data: { datasets },
    options: { plugins: { legend: { display: false }, title: { display: true, text: title } },
               layout: { padding: { right: 70 } },
               scales: { x: ncpusAxis(Math.max(...byN.map(x => x[0]), ...mpiByN.map(x => x[0]))),
                         y: axisStyle({ type: 'logarithmic', title: axisTitle('time (s)') }) } } });
}
// time in each routine of the fastest MPI run at each number of cores (as in mpiCurve), as
// [[cores, routines], ...]; with MPI the routine times include waiting for the other tasks
function mpiRoutines(b, m) {
  const mpi = mpiCurve(b, m);
  if (!mpi) return [];
  return [...mpi].map(([n, x]) => [n, RUNS.filter(r => ok(r) && r.bench === b && r.machine === m && r.label === x.label &&
    r.nmpi === x.nmpi && r.threads === x.threads && r.sha === x.sha && r.routines).pop()])
    .filter(([, r]) => r).map(([n, r]) => [n, r.routines]);
}
// every MPI tasks × threads combination run for one benchmark on one machine
function mpiTable(c, b, m) {
  const rs = lastSet(RUNS.filter(r => ok(r) && isMpi(r) && r.bench === b && r.machine === m), 1);
  const xs = seriesTimes(rs).sort((p, q) => q.cores - p.cores || p.nmpi - q.nmpi);
  if (!xs.length) return;
  const bestAt = n => Math.min(...xs.filter(x => x.cores === n).map(x => x.time));
  details(c, `every split into MPI tasks × threads on ${mlabel(m)} (${runDate(rs)})`,
    table(['cores', 'MPI tasks × threads', 'compiler', 'time (s)'],
      xs.map(x => [x.cores, layout(x.nmpi, x.threads, true), compHtml(x.comp), fmt(x.time)]),
      xs.map(x => ['', '', '', x.time === bestAt(x.cores) ? 'best' : ''])));
}
function scaling() {
  const c = content();
  // benchmarks with runs at more than one number of cores, and the lines on each machine
  const byBench = benches().map(b => [b, machines().map((m, ci) => machineLines(b, m).map(l => Object.assign(l, { ci, m })))
    .flat()]).filter(([, ls]) => ls.some(l => l.cv.size > 1));
  // all benchmarks on each machine, best first: the most cpus used, then the fastest at that number
  const byMachine = machines().map(m => [m, benches().map(b => [b, bestLine(b, m)]).filter(([, x]) => x && x.cv.size > 1)])
    .filter(([, ls]) => ls.length).map(([m, ls]) => {
      const nmax = Math.max(...ls.flatMap(([, x]) => [...x.cv.keys()]));
      const t = geomean(ls.filter(([, x]) => x.cv.has(nmax)).map(([, x]) => x.cv.get(nmax)));
      return [m, ls, nmax, t]; }).sort((p, q) => q[2] - p[2] || p[3] - q[3]);
  if (!byBench.length) { c.appendChild(el('p', '<span class="note">no runs at more than one number of cores yet</span>')); return; }
  const onName = (m, nmax) => `${cpuName(m)} (up to ${nmax} cpus)`;
  jumpTo(c, [...byMachine.map(([m, , nmax]) => [`scaling-on-${m}`, `all benchmarks on ${onName(m, nmax)}`]),
             ...byBench.map(([b]) => [`scaling-${b}`, b])]);
  c.appendChild(el('p', '<span class="note">Wall time and speedup against number of cores, from the last scaling test ' +
    'on each machine (dated): the fastest openMP build (solid lines, with dotted lines for ideal scaling), and the ' +
    'fastest MPI run at each number of cores (dashed, same colour), which can span several nodes. On machines whose ' +
    'cores differ in speed, ideal scaling changes slope where threads start to use the slower cores. Parallel ' +
    'efficiency is the actual speed over that ideal, relative to the openMP time at the smallest number of ' +
    'cores (assuming ideal scaling below it).</span>'));
  for (const [m, ls, nmax] of byMachine) {
    section(c, `scaling-on-${m}`, `Strong scaling of all benchmarks on ${onName(m, nmax)}`);
    c.appendChild(el('p', '<span class="note">The fastest run at each number of cores, with or without MPI.</span>'));
    scalingCharts(c, ls.map(([b, x], i) => ({ name: b, date: x.date, cv: x.cv, ref: x.ref, splits: x.splits, m: x.m, ci: i })));
  }
  for (const [b, ls] of byBench) {
    section(c, `scaling-${b}`, `${b} (strong scaling)`);
    scalingCharts(c, ls);
    if (FIGURES[b]) c.appendChild(el('p', 'Figures and LaTeX table for computing time applications: ' +
      FIGURES[b].map(f => `<a href="${f}">${f}</a>`).join(', ')));
    for (const m of machines()) { const omp = fastestCurve(b, m); if (omp) routineChart(c, b, m, omp[0]); }
    for (const m of machines()) mpiTable(c, b, m);
  }
}

// ---------------------------------------------------------------- history
// time of one version of a compiler: the median of the repeated runs of each build (label), taking
// the fastest build where a compiler was run with several
const shaTime = rr => Math.min(...[...groupBy(rr, r => r.label).values()].map(x => median(x.map(r => r.time))));
function historyTab() {
  const c = content();
  jumpTo(c, benches().map(b => [`history-${b}`, b]));
  c.appendChild(el('p', '<span class="note">Time for each machine and compiler, at full node, against Phantom version, ' +
    'in commit order, with the date at the top. Each run is a point, so repeated runs of a version show the spread; ' +
    'lines join the medians. Each machine has the same colour in every chart, with a different marker and dash for ' +
    'each compiler. Hover for commit messages.</span>'));
  for (const b of benches()) {
    section(c, `history-${b}`, b);
    const rs = RUNS.filter(r => good(r) && r.bench === b && r.threads === fullNode(r.machine));
    const shas = uniq(rs.map(r => r.sha)).sort((p, q) => shaIndex(p) - shaIndex(q));
    const dateOf = sha => (RUNS.find(r => r.sha === sha).sha_date || '').slice(0, 10);
    const xaxes = { x: axisStyle({ type: 'category', labels: shas, title: axisTitle('Phantom version') }),
                    x2: axisStyle({ type: 'category', labels: shas.map(dateOf), position: 'top', grid: { display: false },
                                    title: axisTitle('date') }) };
    // each machine has the same colour in every chart, with a different marker and dash for each compiler
    const datasets = [], groups = [...groupBy(byMachine(rs), r => `${mlabel(r.machine)}, ${r.comp}`)];
    groups.forEach(([name, x]) => {
      const m = x[0].machine, k = uniq(rs.filter(r => r.machine === m).map(r => r.comp)).indexOf(x[0].comp);
      const style = { borderColor: colour(machines().indexOf(m)), backgroundColor: colour(machines().indexOf(m)),
                      pointStyle: MARKERS[k % MARKERS.length] };
      // every run as a point, and a line through the median of each version
      datasets.push(Object.assign({ label: '_' + name, type: 'scatter', pointRadius: 3,
                      data: x.map(r => ({ x: r.sha, y: r.time, subject: r.subject })) }, style));
      const bySha = [...groupBy(x, r => r.sha)].sort((p, q) => shaIndex(p[0]) - shaIndex(q[0]));
      datasets.push(Object.assign({ label: name, pointRadius: 0, borderWidth: 1.5, borderDash: DASHES[k % DASHES.length],
                      data: bySha.map(([sha, rr]) => ({ x: sha, y: shaTime(rr) })) }, style));
    });
    // tall enough that the legend (about three series per row) leaves room for the times
    newChart(chartBox(c, 480 + 24 * Math.ceil(groups.length / 3)), { type: 'line', data: { datasets },
      // logarithmic, since times differ by large factors between machines
      options: { scales: Object.assign({ y: axisStyle({ type: 'logarithmic', title: axisTitle('time (s)') }) }, xaxes),
                 plugins: { legend: { labels: { usePointStyle: true, boxHeight: 7 } }, tooltip: { callbacks: {
                   label: ctx => `${ctx.dataset.label.replace(/^_/, '')}: ${fmt(ctx.raw.y)} s`,
                   afterLabel: ctx => ctx.raw.subject || '' } } } } });
    const changes = findChanges(rs);
    if (changes.length) details(c, `changes of more than ${CHANGE}% between versions (${changes.length})`, changeTable(changes));
  }
}


// ---------------------------------------------------------------- profile
// Where the wall time of a run goes, as stacked bars: one bar per machine for each benchmark.
// Runs carry `routines` (tree, density, force, radiation, other, startup: the timers already kept
// in the results) and, where the results keep Phantom's whole timing table, `timers`
// ({name: seconds} for the rows under "step", with "parent/child" for the rows below them).
// With `timers` there is no "other": every timer directly under "step" is a category of its own
// (cons2prim, the sink-gas substep, and whatever else that Phantom version times), and the part of
// the step that no timer covers is shown as "untimed".
const FINE = [
  { key: 'tree', label: 'tree', colour: 0, names: ['tree'] },
  { key: 'density', label: 'density', colour: 1, names: ['density'] },
  { key: 'force', label: 'force', colour: 2, names: ['force'] },
  { key: 'cons2prim', label: 'cons2prim', colour: 6, names: ['cons2prim'] },
  { key: 'substep', label: 'sink-gas substep', colour: 7, names: ['substep'] },
  { key: 'radiation', label: 'radiation', colour: 3, names: ['radiation'] },
  // the leapfrog's own loops in step (timed since phantom 7df0c3449, November 2026)
  { key: 'leapfrog', label: 'predict + correct', colour: '#0c8599', names: ['predict', 'correct'] },
];
// colours for timers not named above, in the order they are first met, and for "untimed"
const EXTRA_COLOURS = ['#a61e4d', '#364fc7', '#d9480f', '#087f5b', '#e64980'];
const UNTIMED = { key: 'untimed', label: 'untimed (rest of step)', colour: '#adb5bd', names: [] };
// startup (reading the dump, initial derivatives: the run's wall time less Phantom's own clock), in
// both splits, so that a run's total is the same whether or not it kept the full timing table
const STARTUP = { key: 'startup', label: 'startup', colour: '#495057', names: [] };
const coarseCats = (startup = true) => ROUTINES.filter(k => startup || k !== 'startup')
  .map((k, i) => k === 'startup' ? STARTUP : { key: k, label: k, colour: i });
const catColour = c => typeof c.colour === 'number' ? colour(c.colour) : c.colour;
let profileUnit = 'seconds';
let changeAlign = false;   // overview change charts: the quicker run stacked, or aligned with the slower

// categories for a set of runs with timers: those in FINE, then every other timer directly under
// step that any of the runs has, then "untimed" and (unless startup is false) "startup"
function fineCats(runs, startup = true) {
  const extra = [];
  for (const r of runs) {
    for (const n of Object.keys(r.timers || {})) {
      if (n !== 'step' && !n.includes('/') && !FINE.some(c => c.names.includes(n)) && !extra.includes(n)) extra.push(n);
    }
  }
  return [...FINE, ...extra.map((n, i) => ({ key: 't:' + n, label: n, colour: EXTRA_COLOURS[i % EXTRA_COLOURS.length], names: [n] })),
          UNTIMED, ...(startup ? [STARTUP] : [])];
}
// split of one run's calculation time into those categories, with the rows inside each category
// for the hover text; scaled, like `routines`, so the parts add up to the run time, plus startup
// when cats has it
function fineSplit(r, cats) {
  const t = r.timers, step = t && t.step;
  if (!step) return null;
  const parts = {}, inside = {};
  for (const c of cats) {
    parts[c.key] = c.names.reduce((s, n) => s + (t[n] || 0), 0);
    // a category of several timers lists them; one of one timer lists the rows inside it
    inside[c.key] = c.names.length > 1 ? c.names.filter(n => n in t).map(n => [n, t[n]]) :
      Object.entries(t).filter(([n]) => c.names.some(p => n.startsWith(p + '/')) && n.split('/').length === 2)
        .map(([n, s]) => [n.split('/').pop(), s]);
  }
  parts.untimed = Math.max(step - cats.reduce((s, c) => s + parts[c.key], 0), 0);
  const scale = (r.time || step) / step;
  Object.keys(parts).forEach(k => { parts[k] *= scale; });
  inside.scale = scale;
  parts.startup = cats.includes(STARTUP) && r.routines ? r.routines.startup || 0 : 0;
  return { parts, inside, total: (r.time || step) + parts.startup };
}
// the same for the routines kept in every result (no detail inside "other")
function coarseSplit(r) {
  if (!r.routines) return null;
  const parts = Object.assign({}, r.routines);
  const total = ROUTINES.reduce((s, k) => s + (parts[k] || 0), 0);
  return { parts, inside: {}, total };
}
// the run behind the fastest one-node result of each machine for a benchmark (as in Hardware): of
// the repeats of that configuration, the one nearest their median time, which Hardware shows
function profileRuns(b) {
  const out = [];
  for (const [m, x] of bestPerMachine(b)) {
    const n = x.node;
    const r = RUNS.filter(q => ok(q) && q.bench === b && q.machine === m && q.label === n.label &&
      q.nmpi === n.nmpi && q.threads === n.threads && q.sha === n.sha && (q.routines || q.timers))
      .reduce((a, q) => !a || Math.abs(q.time - n.time) < Math.abs(a.time - n.time) ? q : a, null);
    if (r) out.push({ name: mlabel(m), title: m, sub: `${compName(r)}, ${cpusText(n)}, ${r.date.slice(0, 10)}`, run: r });
  }
  return out;
}
// a run's total time, to the end of its bar: the bars may be shares, so the total is given in seconds.
// In percent, a thin grey line under each bar also shows the total to scale, the longest run in
// the chart spanning the full width
const fmtTime = t => t < 10 ? `${t.toFixed(2)} s` : t < 100 ? `${t.toFixed(1)} s` : `${t.toFixed(0)} s`;
const barTotals = {
  id: 'barTotals',
  afterDatasetsDraw(chart) {
    const tot = (chart.options.plugins.barTotals || {}).totals;
    if (!tot) return;
    const ctx = chart.ctx; ctx.save(); ctx.font = '12px system-ui'; ctx.fillStyle = css('--muted'); ctx.textBaseline = 'middle';
    chart.data.labels.forEach((_, i) => {
      let x = null, y = null;
      chart.data.datasets.forEach((d, k) => {
        const e = chart.getDatasetMeta(k).data[i];
        const v = d.data[i], on = Array.isArray(v) ? v[1] > v[0] : v > 0;
        if (chart.isDatasetVisible(k) && e && on && (x === null || e.x > x)) { x = e.x; y = e.y; }
      });
      if (x !== null) ctx.fillText(tot[i], x + 6, y);
    });
    const secs = chart.options.plugins.barTotals.lines;
    if (secs) {
      const xs = chart.scales.x, smax = Math.max(...secs), meta = chart.getDatasetMeta(0);
      ctx.strokeStyle = css('--muted'); ctx.lineWidth = 2;
      secs.forEach((t, i) => {
        const e = meta.data[i];
        if (!e) return;
        const y = e.y + e.height / 2 + 3;
        ctx.beginPath(); ctx.moveTo(xs.left, y); ctx.lineTo(xs.left + (xs.right - xs.left) * t / smax, y); ctx.stroke();
      });
    }
    ctx.restore();
  }
};
// rows of an aligned chart whose parts overlap are drawn by this plugin instead: the row is split
// into lanes, each part in the first lane free of the parts it overlaps, so that no part hides
// another (two overlapping parts give two half-height lanes; the chart draws those parts
// transparent, and they keep their hover)
const laneBars = {
  id: 'laneBars',
  afterDatasetsDraw(chart) {
    const o = chart.options.plugins.laneBars;
    if (!o || !o.rows.length) return;
    const ctx = chart.ctx; ctx.save();
    for (const [i, lanes, n] of o.rows) {
      chart.data.datasets.forEach((d, k) => {
        const e = chart.getDatasetMeta(k).data[i];
        if (lanes[k] === undefined || !e || !chart.isDatasetVisible(k)) return;
        const x0 = Math.min(e.base, e.x), w = Math.abs(e.x - e.base), h = e.height / n;
        ctx.fillStyle = o.colours[k];
        ctx.fillRect(x0, e.y - e.height / 2 + lanes[k] * h, Math.max(w - 1, 0.5), h);
      });
    }
    ctx.restore();
  }
};
// lanes for the parts of one aligned row ([start, end] per part, null for none): {part: lane} and
// the number of lanes, by greedy interval colouring in order of start
function assignLanes(segs) {
  const ends = [], lanes = {};
  segs.map((g, k) => [g, k]).filter(([g]) => g).sort((p, q) => p[0][0] - q[0][0]).forEach(([g, k]) => {
    let l = ends.findIndex(e => e <= g[0] + 1e-9);
    if (l < 0) { l = ends.length; ends.push(0); }
    ends[l] = g[1]; lanes[k] = l;
  });
  return [lanes, ends.length];
}
// one stacked bar chart: bars = [{name, sub, split, alignTo}], cats = [{key, label, colour}]
// compact: no title, legend or x axis, and a short box with no margin (the Overview's change rows)
// A bar with alignTo = j (seconds only) starts each of its parts where that part starts in bar j, so
// that a part's gain or loss shows at its own place; the chart is then drawn with floating bars,
// each part from its start to its end.
function profileChart(parent, title, bars, cats, unit = profileUnit, compact = false) {
  const pct = unit === 'percent';
  const used = cats.filter(c => bars.some(bar => (bar.split.parts[c.key] || 0) > 0));
  const size = (bar, k) => pct ? 100 * (bar.split.parts[k] || 0) / bar.split.total : (bar.split.parts[k] || 0);
  const floating = !pct && bars.some(bar => bar.alignTo !== undefined);
  const starts = bars.map(bar => { let x = 0; return Object.fromEntries(used.map(c => { const s0 = x; x += size(bar, c.key); return [c.key, s0]; })); });
  const val = (bar, k, i) => {
    if (!floating) return size(bar, k);
    const v = size(bar, k);
    if (!(v > 0)) return null;
    const s0 = starts[bar.alignTo !== undefined ? bar.alignTo : i][k];
    return [s0, s0 + v];
  };
  // aligned rows with overlapping parts, drawn in lanes (laneBars): [row, {part: lane}, lanes]
  const laneRows = floating ? bars.map((bar, i) => bar.alignTo === undefined ? null :
    [i, ...assignLanes(used.map(c => val(bar, c.key, i)))]).filter(x => x && x[2] > 1) : [];
  const laneIdx = laneRows.map(x => x[0]);
  let canvas;
  if (compact) {
    const box = el('div'); box.className = 'chart';
    Object.assign(box.style, { height: (12 + 24 * bars.length) + 'px', margin: '0', padding: '2px 0 2px 24px' });
    canvas = el('canvas'); box.appendChild(canvas); parent.appendChild(box);
  } else canvas = chartBox(parent, 80 + 44 * bars.length);
  newChart(canvas, { type: 'bar', plugins: [barTotals, laneBars],
    data: { labels: bars.map(bar => bar.name),
      datasets: used.map(c => ({ label: c.label, stack: 'run', borderColor: css('--panel'),
        backgroundColor: ctx => laneIdx.includes(ctx.dataIndex) ? 'transparent' : catColour(c),
        borderWidth: ctx => laneIdx.includes(ctx.dataIndex) ? 0 : { right: 1 },
        data: bars.map((bar, i) => val(bar, c.key, i)) })) },
    options: { indexAxis: 'y',
      layout: { padding: { right: compact ? 48 : 64 } },
      plugins: { title: { display: !compact, text: title }, barTotals: { totals: bars.map(bar => fmtTime(bar.split.total)),
                                                       lines: pct ? bars.map(bar => bar.split.total) : null },
        laneBars: { rows: laneRows, colours: used.map(catColour) },
        // legend swatches in each part's own colour (the lane rows draw their parts transparent)
        legend: { display: !compact, labels: { usePointStyle: true, boxHeight: 7, generateLabels: chart =>
          Chart.defaults.plugins.legend.labels.generateLabels(chart).map((l, k) =>
            Object.assign(l, { fillStyle: catColour(used[k]), strokeStyle: catColour(used[k]) })) } },
        tooltip: { callbacks: {
          title: items => { const bar = bars[items[0].dataIndex]; return [bar.name, bar.sub].filter(Boolean); },
          label: ctx => {
            const bar = bars[ctx.dataIndex], k = used[ctx.datasetIndex].key, s = bar.split.parts[k] || 0;
            return `${ctx.dataset.label}: ${fmt(s, 2)} s (${fmt(100 * s / bar.split.total)}%)`;
          },
          afterLabel: ctx => {
            const bar = bars[ctx.dataIndex], k = used[ctx.datasetIndex].key;
            const rows = (bar.split.inside[k] || []).slice(0, 6), sc = bar.split.inside.scale || 1;
            return rows.map(([n, s]) => `   ${n}: ${fmt(s * sc, 2)} s`);
          },
          footer: items => `total ${fmt(bars[items[0].dataIndex].split.total, 2)} s` } } },
      scales: { x: axisStyle({ display: !compact, stacked: !floating, min: 0, max: pct ? 100 : undefined,
                               title: axisTitle(pct ? 'share of the run time (%)' : 'time (s)') }),
                y: axisStyle({ stacked: true, title: { display: false } }) } } });
}
// the overview's list of changes between Phantom versions, as one table: the column headings once,
// then for each change its row and, below it, a compact profile chart with a bar for the run before
// and a bar for the run after (the run nearest the median time of each version; the bars leave out
// startup, as the table's times do). One legend above the table serves every chart: all charts use the same colours. The
// table is a CSS grid rather than a <table>, since Chart.js does not size itself inside table cells
function changeProfiles(c, changes) {
  const pick = (x, sha) => {
    const rs = RUNS.filter(r => good(r) && r.bench === x.key[0] && r.machine === x.key[1] && r.label === x.key[2] &&
      String(r.threads) === x.key[3] && r.sha === sha && (r.routines || r.timers));
    if (!rs.length) return null;
    const t = median(rs.map(r => r.time));
    return rs.reduce((a, r) => Math.abs(r.time - t) < Math.abs(a.time - t) ? r : a);
  };
  const rows = changes.map(x => ({ x, r0: pick(x, x.sha0), r1: pick(x, x.sha1) }));
  const runs = rows.flatMap(w => [w.r0, w.r1]).filter(Boolean);
  // one set of categories, and so one set of colours, for every chart
  const fine = runs.length && runs.every(r => r.timers);
  // without startup, so that each bar's total is the run's time, as in the table
  const cats = fine ? fineCats(runs, false) : coarseCats(false);
  const split = r => {
    if (fine) return fineSplit(r, cats);
    const s = coarseSplit(r);
    if (s) { s.total -= s.parts.startup || 0; delete s.parts.startup; }
    return s;
  };
  rows.forEach(w => {
    if (!w.r0 || !w.r1) return;
    w.bars = [['from', w.x.sha0, w.r0], ['to', w.x.sha1, w.r1]].map(([name, sha, r]) =>
      ({ name, sub: `${sha}, ${r.date.slice(0, 10)}${r.subject ? ': ' + r.subject : ''}`, split: split(r) }));
    // aligned: the quicker run with each part starting where it starts in the slower run
    if (changeAlign) {
      const [qi, si] = w.bars[1].split.total <= w.bars[0].split.total ? [1, 0] : [0, 1];
      w.bars[qi].alignTo = si;
    }
  });
  const toggle = el('p', '<span class="note">Quicker run:</span> ' + [[false, 'stacked'], [true, 'aligned with the slower run']]
    .map(([a, t]) => `<a href="#changes" data-align="${a}"${a === changeAlign ? ' style="font-weight:600"' : ''}>${t}</a>`).join(' · '));
  toggle.querySelectorAll('a').forEach(a => a.addEventListener('click', ev => {
    ev.preventDefault(); changeAlign = a.dataset.align === 'true'; current = null; show('overview');
    const h = document.getElementById('changes'); if (h) h.scrollIntoView(); }));
  c.appendChild(toggle);
  const used = cats.filter(k => rows.some(w => w.bars && w.bars.some(b => (b.split.parts[k.key] || 0) > 0)));
  c.appendChild(el('p', used.map(k => `<span style="display:inline-flex;align-items:center;margin-right:14px">` +
    `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;background:${catColour(k)}"></i>` +
    `${k.label}</span>`).join('')));
  // a grid of divs with the roles of a table (rows as display: contents, so that their cells sit in
  // the grid's columns), so that screen readers read it as a table
  const grid = el('div');
  grid.setAttribute('role', 'table'); grid.setAttribute('aria-label', 'changes of more than 5%, with the profile of each');
  Object.assign(grid.style, { display: 'grid', gridTemplateColumns: 'max-content '.repeat(7) + '1fr',
                              fontVariantNumeric: 'tabular-nums', margin: '8px 0' });
  const row = () => { const r = el('div'); r.setAttribute('role', 'row'); r.style.display = 'contents'; grid.appendChild(r); return r; };
  const cell = (r, html, opts = {}) => {
    const d = el('div', html);
    d.setAttribute('role', opts.role || 'cell');
    Object.assign(d.style, { padding: '4px 10px', whiteSpace: 'nowrap', borderBottom: `1px solid ${css('--line')}`,
                             textAlign: opts.left ? 'left' : 'right' }, opts.style || {});
    r.appendChild(d);
    return d;
  };
  const head = row();
  ['benchmark', 'machine', 'compiler', 'threads', 'from', 'to', 'time (s)', 'change'].forEach((h, i) =>
    cell(head, h, { role: 'columnheader', left: i === 0, style: { color: css('--muted'), fontWeight: '600' } }));
  for (const w of rows) {
    const x = w.x, r = row();
    [x.key[0], mcell(x.key[1]), compHtml(compOf(x.key[1], x.key[2])), x.key[3], x.sha0,
     `<span title="${x.subject}">${x.sha1}</span>`, `${fmt(x.t0)} → ${fmt(x.t1)}`].forEach((v, i) =>
      cell(r, v, { left: i === 0, style: { borderBottom: 'none', paddingBottom: '0' } }));
    cell(r, `${x.pct > 0 ? '+' : ''}${fmt(x.pct)}%`, { style: { borderBottom: 'none', paddingBottom: '0',
      color: css(x.pct > 0 ? '--bad' : '--good'), fontWeight: x.pct > 0 ? '' : '600' } });
    // the chart: a row of its own, one cell across every column, described for screen readers by
    // the two totals (the chart itself is a canvas)
    const box = cell(row(), '', { style: { gridColumn: '1 / -1', padding: '0 0 4px 0' } });
    if (w.bars) {
      box.setAttribute('aria-label', `profile of the run before, ${fmtTime(w.bars[0].split.total)}, and after, ${fmtTime(w.bars[1].split.total)}`);
      profileChart(box, '', w.bars, cats, 'seconds', true);
    }
  }
  c.appendChild(grid);
}
function profile() {
  const c = content();
  const toggle = el('p', '<span class="note">Show bars as:</span> ' +
    ['seconds', 'percent'].map(u => `<a href="#profile" data-unit="${u}"${u === profileUnit ? ' style="font-weight:600"' : ''}>${u}</a>`).join(' · '));
  toggle.querySelectorAll('a').forEach(a => a.addEventListener('click', ev => {
    ev.preventDefault(); profileUnit = a.dataset.unit; current = null; show('profile'); }));
  c.appendChild(toggle);
  jumpTo(c, benches().map(b => [`profile-${b}`, b]));
  c.appendChild(el('p', '<span class="note">Where the time of each run goes, from Phantom\'s own timers: the fastest ' +
    'result on one node of each machine, latest Phantom version (as in the Hardware tab). Hover a segment for its time. ' +
    'The number after each bar is the run\'s total time; in percent, the thin grey line under each bar shows that total ' +
    'to scale, the longest run in the chart spanning the full width. Where every run in a chart kept Phantom\'s full ' +
    'timing table, each timer under the step is shown, and "untimed" is what no timer covers; otherwise the runs are ' +
    'split into tree, density, force and radiation, with "other" the rest of the step. "startup" is reading the ' +
    'initial dump and computing the initial derivatives.</span>'));
  for (const b of benches()) {
    const rs = profileRuns(b);
    if (!rs.length) continue;
    section(c, `profile-${b}`, `${b}: time per routine on each machine`);
    const fine = rs.every(x => x.run.timers), cats = fine ? fineCats(rs.map(x => x.run)) : null;
    profileChart(c, fine ? 'time per routine (full timing table)' : 'time per routine',
      rs.map(x => ({ name: x.name, sub: x.sub, split: fine ? fineSplit(x.run, cats) : coarseSplit(x.run) })),
      fine ? cats : coarseCats());
  }
}

// ---------------------------------------------------------------- tabs
const TABS = { overview, compilers, hardware, scaling, history: historyTab, profile };
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
  try { window.history.replaceState(null, '', '#' + b.dataset.tab); } catch (e) { /* not allowed here */ }
  show(b.dataset.tab); window.scrollTo(0, 0); }));
fetch('data.json').then(r => r.json()).then(d => {
  RUNS = d.runs.filter(r => r.time > 0);
  // older results lack the compiler version or MPI library: take them from the latest run of the
  // same build on the same machine that has them
  for (const rs of groupBy(RUNS, r => r.machine + '|' + r.label).values()) {
    for (const k of ['version', 'mpi']) {
      const v = (rs.filter(r => r[k]).pop() || {})[k];
      if (v) rs.forEach(r => { r[k] = r[k] || v; });
    }
  }
  RUNS.forEach(r => { r.comp = compName(r); });
  FIGURES = d.figures || {};
  SPEEDS = d.core_speeds || {};
  // phantom versions in order of their date
  SHAS = uniq(RUNS.map(r => r.sha)).sort((a, b) =>
    (RUNS.find(r => r.sha === a).sha_date || '').localeCompare(RUNS.find(r => r.sha === b).sha_date || ''));
  // the tab is the first part of the address after "#" (links within a tab add a section name)
  const hash = location.hash.slice(1);
  show(TABS[hash] ? hash : 'overview');
});
