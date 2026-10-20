#!/bin/bash
#
# The Phantom benchmarking suite
# Hybrid MPI and openMP scaling test: runs benchmarks with combinations of MPI tasks and
# openMP threads per task
#
# Usage: hybrid.sh [list of benchmarks]
#
# Environment variables:
#   PHANTOMBENCH_HYBRID   list of combinations as nmpi:nomp, e.g. "1:64 2:32 2:64 4:32"
#   PHANTOMBENCH_MPIRUN   command to launch MPI tasks, e.g. "srun -n $NMPI -c $OMP_NUM_THREADS"
#   plus all variables used by run-benchmarks.sh
#
scriptdir=$(cd "$(dirname "$0")" && pwd)
if [ -z "$PHANTOMBENCH_HYBRID" ]; then
   echo "ERROR: set PHANTOMBENCH_HYBRID to the combinations to run, e.g. \"1:64 2:32 4:16\""; exit 1;
fi
# most cores in total first, so a job that runs out of time still has the largest runs
combinations=`for c in $PHANTOMBENCH_HYBRID; do echo "$(( ${c%:*} * ${c#*:} )) $c"; done | sort -rn | awk '{print $2}' | xargs`

# pin threads to cores so timings are reproducible
export OMP_PROC_BIND=${OMP_PROC_BIND:-close}
export OMP_PLACES=${OMP_PLACES:-cores}
export OMP_SCHEDULE=${OMP_SCHEDULE:-dynamic}
export OMP_STACKSIZE=${OMP_STACKSIZE:-1024m}

echo "Hybrid scaling with MPI tasks:threads = $combinations"
nfail=0
for c in $combinations; do
   MPI=yes NMPI=${c%:*} OMP_NUM_THREADS=${c#*:} $scriptdir/run-benchmarks.sh "$@" || nfail=$(( nfail + 1 ));
done
[ $nfail -eq 0 ]
