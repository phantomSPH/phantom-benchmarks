# Settings for OzSTAR / Ngarrgu Tindebeek (Swinburne), used by phantombench on this machine
# hosts: tooarrana* farnarkle*
#
# compilers to benchmark, as phantom SYSTEMs (nt = aocc on the milan nodes)
PHANTOMBENCH_SYSTEMS=${PHANTOMBENCH_SYSTEMS:-"nt gfortran ifx"}
# modules to load in the job script for each SYSTEM
modules_nt="aocc"
modules_gfortran="gompi/2023a"
modules_ifx="intel-compilers/2023.0.0"
# whole milan node (all 64 cores), with thread counts up to 64
QPARTITION=${QPARTITION:-milan}
NOMP=${NOMP:-64}
QEXCLUSIVE=${QEXCLUSIVE:-no}
# partition for the job that publishes the results (needs internet access), if not the one above
#QPUBLISH_PARTITION=
PHANTOMBENCH_THREADS=${PHANTOMBENCH_THREADS:-"1 2 4 8 16 32 48 64"}
WALLTIME=${WALLTIME:-48:00:00}
# benchmark data (~3 GB) in project space rather than the home directory
PHANTOMBENCH_DATA=${PHANTOMBENCH_DATA:-/fred/oz015/$USER/phantombench-data}
