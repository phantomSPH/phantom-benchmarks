# Settings for the NVIDIA GB10 (DGX Spark) workstation, used by phantombench on this machine
# hosts: MU00249815*
#
# Grace cpu with 20 cores (10 Cortex-X925 + 10 Cortex-A725). Compilers to compare, as phantom SYSTEMs
PHANTOMBENCH_SYSTEMS=${PHANTOMBENCH_SYSTEMS:-"gfortran nvfortran flang"}
# use every core, pinned, so that runs are reproducible
OMP_NUM_THREADS=${OMP_NUM_THREADS:-20}
OMP_PROC_BIND=${OMP_PROC_BIND:-close}
OMP_PLACES=${OMP_PLACES:-cores}
export OMP_PROC_BIND OMP_PLACES
PHANTOMBENCH_THREADS=${PHANTOMBENCH_THREADS:-"1 2 4 6 8 10 12 16 20"}
