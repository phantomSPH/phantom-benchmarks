#!/bin/bash
#
# The Phantom benchmarking suite
# Strong scaling test: runs benchmarks with increasing numbers of openMP threads
#
# Usage: scaling.sh [list of benchmarks]
#
# Optional environment variables:
#   PHANTOMBENCH_THREADS  list of thread counts (default: 1 2 4 8 ... up to ncores, plus ncores)
#   plus all variables used by run-benchmarks.sh
#
scriptdir=$(cd "$(dirname "$0")" && pwd)
source "$scriptdir/machine.sh"

# powers of two up to the number of cores, plus the number of cores itself
default_threads()
{
  ncores=$(get_ncores) n=1 list="";
  while [ $n -lt $ncores ]; do list+="$n "; n=$(( 2*n )); done
  echo "$list$ncores";
}
threads=${PHANTOMBENCH_THREADS:-$(default_threads)};

# pin threads to cores so timings are reproducible
export OMP_PROC_BIND=${OMP_PROC_BIND:-close}
export OMP_PLACES=${OMP_PLACES:-cores}
export OMP_SCHEDULE=${OMP_SCHEDULE:-dynamic}
export OMP_STACKSIZE=${OMP_STACKSIZE:-1024m}

echo "Strong scaling with OMP_NUM_THREADS = $threads"
nfail=0
for nthreads in $threads; do
   OMP_NUM_THREADS=$nthreads $scriptdir/run-benchmarks.sh "$@" || nfail=$(( nfail + 1 ));
done
[ $nfail -eq 0 ]
