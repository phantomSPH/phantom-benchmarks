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

This builds Phantom with `SYSTEM=gfortran`, downloads the initial conditions and runs the quick benchmarks. It uses one openMP thread per performance core. It then prints a summary and writes `runs/reports/<machine>/report.html`. Nothing is uploaded.

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

On Phantom pull requests this happens automatically on a self-hosted runner if you tick "Run benchmarks" in the PR description, or a maintainer adds the `benchmark` label. See `.github/workflows/benchmark.yml` in Phantom.

## Benchmarks on GitHub Actions

The [benchmarks workflow](.github/workflows/benchmarks.yml) runs the quick benchmarks on GitHub-hosted runners after every push to Phantom's main branch. It runs one job per benchmark, and each job builds and runs every compiler (gfortran, ifx, aocc and nvfortran) in turn on the same machine. Results are committed to `results/github-ubuntu/` and the website is updated. These are shared virtual machines with 4 cores and varying cpus, so the results check correctness and compare compilers, but are not precise timings. To run it by hand, e.g. on a branch:
```
gh workflow run benchmarks -R phantomSPH/phantom-benchmarks -f phantom_ref=mybranch -f systems="gfortran ifx"
```

## Scaling tests for computing time applications

```
./phantombench scaling hh48
./phantombench report --scaling hh48 --su 2e6:5e4:48:20
```

This writes the following to `runs/reports/<machine>/`:

- a wall time / speedup / efficiency table, in markdown and in `scaling-hh48.tex` (a LaTeX table plus a paragraph ready to paste into an application);
- `scaling-hh48.pdf` / `.png` (log-log wall time against cpus, with ideal scaling);
- with `--su NPART:NSTEPS:NCORES:NRUNS`, an estimate of the service units for a production campaign.

On a cluster, run all of the benchmarks with every compiler, with scaling tests on whole nodes, using

```
./phantombench submit
```

This downloads the data on the login node, then submits one job per compiler, each running a scaling test on an exclusive node. Job scripts are written with Phantom's `make qscript`. The settings for each cluster are in [machines/](machines/) (e.g. [machines/ozstar.sh](machines/ozstar.sh)): the compilers and the modules each one needs, the partition, cpus per node, thread counts, wall time and where to store the data. The file is chosen automatically from the login node's hostname. To add a cluster, copy one of these files. When the jobs have finished, commit `results/<machine>/*.csv` to add the results to the website.

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
