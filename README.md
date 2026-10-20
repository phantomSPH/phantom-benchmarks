# Phantom benchmark suite

Benchmarking and performance suite for the [Phantom](https://github.com/danieljprice/phantom) SPH code. Use it to:

- compare compilers and compiler options on a machine;
- check that a claimed optimisation is faster and still correct (run automatically on Phantom pull requests);
- produce strong-scaling tables, figures and service unit estimates for computing time applications;
- test performance on a new machine.

Results are stored as `.csv` files in [results/](results/), one directory per machine. They are published at https://phantomsph.github.io/phantom-benchmarks/.

## Quick start (any machine)

```
git clone https://github.com/phantomSPH/phantom-benchmarks
cd phantom-benchmarks
PHANTOM_DIR=~/phantom ./phantombench
```

This builds Phantom with `SYSTEM=gfortran`, downloads the initial conditions and runs the quick benchmarks. It uses one openMP thread per performance core. It then prints a summary, including where the time goes (tree build, density, force, the rest of the calculation, and startup, from Phantom's timing table), and writes `runs/reports/<machine>/report.html`. Nothing is uploaded.

The benchmark time is Phantom's own total wall time, which excludes startup (reading the dump and computing the initial derivatives), so that timings are not dominated by disk speed. If Phantom's clock is not reliable (e.g. longer than the whole run), the externally measured time is used instead. The total including startup is also recorded.

Requirements: what Phantom itself needs to build (a Fortran compiler and make), plus bash, curl, shasum and python3 (version 3.6 or later, standard library only). matplotlib is optional and only used to draw the scaling figures.

Layout:

```
phantombench              the command to run everything
benchmarks/<name>/        inputs for each benchmark (no run output is written here)
scripts/                  run-benchmarks.sh, scaling.sh, evcheck.py, report.py, machine.sh
results/<machine>/*.csv   results, one line per run (committed to the repository)
runs/                     where the calculations are run, plus reports (not committed)
machines/<name>.sh        settings for clusters (compilers, modules, queue)
```

Commands:

| command | does |
|---|---|
| `phantombench [run] [bench...]` | runs the benchmarks (default: quick tier) and reports |
| `phantombench scaling [bench...]` | strong scaling over 1, 2, 4, ... threads up to the number of cores, then writes scaling tables and figures |
| `phantombench compilers [bench...]` | runs once per compiler in `PHANTOMBENCH_SYSTEMS`, e.g. `PHANTOMBENCH_SYSTEMS="gfortran flang nvfortran"` |
| `phantombench compare BASE HEAD` | compares two labelled builds, e.g. master vs a branch (see below) |
| `phantombench report [--scaling] [--su ...]` | regenerates reports from stored results |
| `phantombench submit [bench...]` | on a cluster: downloads the data and submits one scaling-test job per compiler (see below) |
| `phantombench fetch [bench...]` | downloads and checks the data files only |
| `phantombench qscript [bench...]` | writes the batch job script for one compiler (via Phantom's `make qscript`) |
| `phantombench reference [bench...]` | regenerates the reference data for a benchmark (maintainers) |
| `phantombench status` | writes an html summary of the latest results (used by `phantom/scripts/nightly.sh`) |
| `phantombench site [dir]` | builds the website from all results |
| `phantombench recheck [bench...]` | rechecks conservation of the runs saved on this machine against the current tolerances (e.g. after changing a `CONSERVE` file), updating their status in the results |
| `phantombench publish` | commits this machine's results and pushes them to GitHub, which updates the website (needs push access). With `PHANTOMBENCH_PUBLISH=yes`, `run`, `scaling` and `compilers` publish when they finish |

Settings are environment variables:

| variable | default | meaning |
|---|---|---|
| `PHANTOM_DIR` | `~/phantom` | Phantom source directory |
| `SYSTEM` | `gfortran` | Phantom `SYSTEM`, i.e. compiler (`gfortran`, `ifx`, `flang`, `aocc`, `nvfortran`, `nt`, ...) |
| `OMP_NUM_THREADS` | performance cores | number of openMP threads |
| `PHANTOMBENCH_LABEL` | `$SYSTEM` | label for this build in the results, e.g. `gfortran-native` |
| `PHANTOMBENCH_MAKEFLAGS` | | extra make variables, e.g. `"FFLAGS=-O3 -march=native"` |
| `PHANTOMBENCH_TIER` | `quick` | `quick`, `full` or `all` |
| `PHANTOMBENCH_THREADS` | 1 2 4 ... ncores | thread counts for scaling tests |
| `PHANTOMBENCH_MACHINE` | hostname | machine name used for the results directory |
| `PHANTOMBENCH_DATA` | `~/.cache/phantombench` | cache for downloaded dump files |
| `PHANTOMBENCH_RUNDIR` | `runs/` | where the calculations are run |

## Benchmarks

| benchmark | tier | setup | particles | description |
|---|---|---|---|---|
| `sedov` | quick | sedov, global timesteps | 1.7e5 | Sedov blast wave, generated with phantomsetup |
| `discbinary` | quick | disc | 5e5 | disc around one star of a binary (Franchini) |
| `hh48` | quick | disc | 1e6 | two discs in the HH48 binary |
| `commonenv` | quick | star, global timesteps | 8e5 | common envelope with self-gravity and two sinks (Kayla) |
| `polar` | quick | disc | 1e6 | polar disc around a binary |
| `grtde10m` | full | grtde | 1e7 | tidal disruption event in general relativity (Fitz) |

## Correctness checks

A benchmark passes if the run completes and its conservation properties are no worse than before. Results that differ from a reference dump are not failed, since a change may make the answer more accurate. The `.ev` file is checked by [evcheck.py](scripts/evcheck.py) against the `CONSERVE` file in each benchmark directory. That file lists each conserved quantity in one of two modes:

- `exact`: must be conserved to round-off, e.g. linear and angular momentum with global timesteps (the treecode conserves both exactly), or the centre of mass after removing uniform motion. The tolerance is `C` times machine epsilon, with a default `C` of 100, or the precision of the `.ev` file if that is larger.
- `ref`: conserved only to truncation error, e.g. energy, or momentum with individual timesteps. The error must be no more than 1.1 times that in the reference run (`conservation.ref`); these errors agree to three digits between compilers and thread counts, so any change is significant. A run that conserves at least 10% better is reported as `improved`.

The RMS difference from the reference dump (`diffdumps`) and the number of steps are also reported, so you can see if a speedup comes from taking fewer steps.

## Comparing a branch against master

```
PHANTOM_DIR=~/phantom-master PHANTOMBENCH_LABEL=master ./phantombench run
PHANTOM_DIR=~/phantom        PHANTOMBENCH_LABEL=mybranch ./phantombench run
./phantombench compare master mybranch
```

On Phantom pull requests this happens automatically on a GitHub-hosted runner if you tick "Run benchmarks" in the PR description, or a maintainer adds the `benchmark` label. The pull request and its base are run one after the other on the same machine, and the comparison is posted as a comment. See `.github/workflows/benchmark.yml` in Phantom.

## Website

The [website](https://phantomsph.github.io/phantom-benchmarks/) is rebuilt from the results in `results/` whenever they change. Its tabs answer:

- **Overview:** the fastest time for each benchmark on each machine, and any recent change of more than 5% in speed;
- **Compilers:** the fastest compiler for a benchmark on each machine, or overall (geometric mean over benchmarks);
- **Hardware:** the best hardware for a benchmark, or in general, compared both by time on a whole node and by cost per core (core-seconds);
- **Scaling:** strong scaling of one benchmark across machines, or of all benchmarks on one machine, with the time spent in each routine (tree, density, force, other, startup). Figures and LaTeX tables for computing time applications can be downloaded from this tab;
- **History:** time and parallel efficiency against Phantom version, in the order of the commits, with the date on the top axis. Repeated runs of the same version show the spread between runs.

To build it locally, use `./phantombench site` and open `site/index.html` through a web server (e.g. `cd site && python3 -m http.server`). `PHANTOM_DIR` should be a Phantom git checkout, which is used to put the versions in order. Generated files are never committed.

## Benchmarks on GitHub Actions

The [benchmarks workflow](.github/workflows/benchmarks.yml) runs the quick benchmarks on GitHub-hosted runners after every push to Phantom's main branch. It runs one job per benchmark, and each job builds and runs every compiler (gfortran, ifx, aocc and nvfortran) in turn on the same machine. Results are committed to `results/github-ubuntu/` and the website is updated. These are shared virtual machines with 4 cores and varying cpus, so the results check correctness and compare compilers, but are not precise timings. To run it by hand, e.g. on a branch:
```
gh workflow run benchmarks -R phantomSPH/phantom-benchmarks -f phantom_ref=mybranch -f systems="gfortran ifx"
```

To fill in the history for past versions, give a list of versions, e.g. the last 10 on main (one job per version and benchmark):
```
gh workflow run benchmarks -R phantomSPH/phantom-benchmarks -f phantom_ref="$(git -C ~/phantom log --format=%h -10 main | xargs)"
```

## Running regularly on a workstation

To benchmark Phantom's main branch regularly on a machine of your own, use cron. For example, compare compilers every night except Sunday, and run scaling tests on Sundays (the two must not overlap, since they use the same run directories), publishing the results each time (`crontab -e`):
```
0 2 * * 1-6 bash -lc 'cd ~/phantom && git pull -q && cd ~/phantom-benchmarks && git pull -q && PHANTOMBENCH_PUBLISH=yes ./phantombench compilers' > ~/phantombench-cron.log 2>&1
0 2 * * 0   bash -lc 'cd ~/phantom && git pull -q && cd ~/phantom-benchmarks && git pull -q && PHANTOMBENCH_PUBLISH=yes ./phantombench scaling' > ~/phantombench-cron.log 2>&1
```
`bash -lc` loads your login environment, so that compilers such as nvfortran are on the `PATH`. Settings for the machine (compilers, threads) come from its file in [machines/](machines/), and publishing needs push access (see `phantombench publish`).

## Scaling tests for computing time applications

```
./phantombench scaling hh48
./phantombench report --scaling hh48 --su 2e6:5e4:48:20
```

This writes the following to `runs/reports/<machine>/`:

- a wall time / speedup / efficiency table, in markdown and in `scaling-hh48.tex` (a LaTeX table plus a paragraph ready to paste into an application);
- `scaling-hh48.pdf` / `.png` (log-log wall time against cpus, with ideal scaling);
- for each compiler, a table and figure (`scaling-hh48-<compiler>-routines.pdf` / `.png`) of how the time in each routine (tree, density, force, other, setup and I/O) scales with the number of cpus;
- with `--su NPART:NSTEPS:NCORES:NRUNS`, an estimate of the service units for a production campaign.

On a cluster, run all of the benchmarks with every compiler, with scaling tests on whole nodes, using

```
./phantombench submit
```

This downloads the data on the login node, then submits one job per compiler, each running a scaling test on a whole node. Job scripts are written with Phantom's `make qscript`. The settings for each cluster are in [machines/](machines/) (e.g. [machines/ozstar.sh](machines/ozstar.sh)): the compilers and the modules each one needs, the partition, cpus per node, thread counts, wall time and where to store the data. The file is chosen automatically from the login node's hostname. To add a cluster, copy one of these files. When the jobs have finished, run `./phantombench publish` to add the results to the website, or use `./phantombench submit-and-publish` instead of `submit`, which also submits a small job that publishes the results once all of the benchmark jobs have finished. That job needs internet access and push access to GitHub; if the compute nodes have no internet access, set `QPUBLISH_PARTITION` in the machine file to a partition that does.

### Hybrid MPI and openMP

To test combinations of MPI tasks and openMP threads on several nodes, use

```
./phantombench submit-hybrid            # or submit-hybrid-and-publish
```

This submits one job per compiler in `PHANTOMBENCH_HYBRID_SYSTEMS` (which need an MPI library in their modules), each on `PHANTOMBENCH_HYBRID_NODES` nodes, running the quick benchmarks with each combination `tasks:threads` in `PHANTOMBENCH_HYBRID`, launched with `PHANTOMBENCH_MPIRUN` (all set in the machine file, e.g. `srun -n $NMPI -c $OMP_NUM_THREADS --cpu-bind=cores`). Phantom is built with `MPI=yes`, and the results are labelled e.g. `gfortran-mpi`. The reports and the Scaling tab of the website compare the time for each combination with the openMP-only result on the same number of cores. On a single machine, `PHANTOMBENCH_HYBRID="1:8 2:4 4:2" ./phantombench hybrid` runs the same test directly.

## How to add benchmark problems to this suite

1. Clone the repository to your local machine
```
git clone https://github.com/phantomSPH/phantom-benchmarks
```

2. Make a new directory
```
cd phantom-benchmarks
mkdir benchmarks/mybench
cd benchmarks/mybench
```

3. Add the phantom input file, named after the benchmark with ".in.s" as the file extension, and the dump file it starts from (or a `mybench.setup` file, in which case the initial conditions are generated with phantomsetup). The dump files must also be named after the benchmark, e.g. `mybench_00000`, with `logfile = mybench01.log` and `dumpfile = mybench_00000` in the input file
```
cp mybench.in mybench.in.s
cp mybench_00000 .
```

4. Add a file named `SETUP` containing the phantom SETUP (optionally followed by make variables, e.g. `sedov IND_TIMESTEPS=no`), a file named `TIER` containing `quick` or `full`, and a file named `CONSERVE` listing the conserved quantities to check (see "Correctness checks" above)
```
echo disc > SETUP
echo quick > TIER
printf "totmom ref\nangtot ref\n" > CONSERVE
```

5. Ensure your calculation is SHORT (runs in < 2 minutes) but REPRESENTATIVE, e.g. with typical particle numbers and timestep ranges

6. Generate the reference data to which results should be compared. This runs the benchmark, writes `conservation.ref`, keeps the output dump as the reference dump with ".ref" as the file extension (stored in `~/.cache/phantombench/mybench/`), and writes the `.hashlist` file
```
cd ../..
./phantombench reference mybench
```

7. Verify that the test passes by running
```
./phantombench run mybench
```

8. Open an Issue to make a request for the dump files to be uploaded to the [data-v1 release](https://github.com/phantomSPH/phantom-benchmarks/releases/tag/data-v1) (and the Zenodo mirror), keeping the same file names, e.g. `mybench_00000`

9. Check the file named `.hashlist`, which points to the files that need to be automatically downloaded at run time. Each line gives the SHA256 checksum (from `shasum -a 256`), the file name and the URL to download it from. Your file should look like this:
```
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx mybench_00000 https://github.com/phantomSPH/phantom-benchmarks/releases/download/data-v1/mybench_00000
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx mybench_00001.ref https://github.com/phantomSPH/phantom-benchmarks/releases/download/data-v1/mybench_00001.ref
```

10. Commit and push the benchmark to the repository, excluding the dump files (to avoid bloating the repository)
```
git add benchmarks/mybench/mybench.in.s benchmarks/mybench/SETUP benchmarks/mybench/TIER benchmarks/mybench/CONSERVE benchmarks/mybench/conservation.ref benchmarks/mybench/.hashlist
git commit -m 'added benchmark mybench'
git push
```
