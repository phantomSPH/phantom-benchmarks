# Settings for the NVIDIA GB10 (DGX Spark) workstation, used by phantombench on this machine
# hosts: MU00249815*
#
# Grace cpu with 20 cores (10 Cortex-X925 + 10 Cortex-A725). Compilers to compare, as phantom SYSTEMs
PHANTOMBENCH_SYSTEMS=${PHANTOMBENCH_SYSTEMS:-"gfortran nvfortran flang"}
# name of the processor in the results (the system reports only the type of its cores)
export PHANTOMBENCH_CPU=${PHANTOMBENCH_CPU:-"NVIDIA GB10"}
# use every core, pinned, so that runs are reproducible. Threads fill the fast Cortex-X925
# cores (cpus 5-9 and 15-19) first, then the Cortex-A725 cores, so that scaling up to
# 10 threads is measured on the fast cores
OMP_NUM_THREADS=${OMP_NUM_THREADS:-20}
OMP_PROC_BIND=${OMP_PROC_BIND:-close}
OMP_PLACES=${OMP_PLACES:-"{5},{6},{7},{8},{9},{15},{16},{17},{18},{19},{0},{1},{2},{3},{4},{10},{11},{12},{13},{14}"}
export OMP_PROC_BIND OMP_PLACES
PHANTOMBENCH_THREADS=${PHANTOMBENCH_THREADS:-"1 2 4 6 8 10 12 16 20"}
# speed of the cores relative to the first, in the order threads fill them (count:speed), so
# that ideal scaling on the website allows for the slower Cortex-A725 cores
# (set once measured: time of a 1-thread run on cpu 5 divided by that on cpu 0)
#PHANTOMBENCH_CORE_SPEEDS=${PHANTOMBENCH_CORE_SPEEDS:-"10:1 10:0.5"}
