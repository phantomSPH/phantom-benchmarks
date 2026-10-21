# Settings for the Ngarrgu Tindebeek (milan) nodes of OzSTAR (Swinburne), used by phantombench
# on this machine
# hosts: tooarrana* farnarkle* dave*
#
# compilers to benchmark, as phantom SYSTEMs (nt = aocc on the milan nodes)
PHANTOMBENCH_SYSTEMS=${PHANTOMBENCH_SYSTEMS:-"nt gfortran ifx"}
# modules to load in the job script for each SYSTEM
modules_nt="aocc/4.0.0"
modules_gfortran="gompi/2023a"
modules_ifx="intel-compilers/2023.0.0"
# whole milan node (2 x 32-core AMD EPYC 7543, 256 GB), with thread counts up to 64
QPARTITION=${QPARTITION:-milan}
NOMP=${NOMP:-64}
QEXCLUSIVE=${QEXCLUSIVE:-no}
# partition for the job that publishes the results (needs internet access), if not the one above
#QPUBLISH_PARTITION=
PHANTOMBENCH_THREADS=${PHANTOMBENCH_THREADS:-"1 2 4 8 16 32 48 64"}
# hybrid MPI and openMP tests (phantombench submit-hybrid): compilers with an MPI library from
# their modules, number of nodes, and combinations of MPI tasks:threads on one and two nodes
PHANTOMBENCH_HYBRID_SYSTEMS=${PHANTOMBENCH_HYBRID_SYSTEMS:-"gfortran"}
PHANTOMBENCH_HYBRID_NODES=${PHANTOMBENCH_HYBRID_NODES:-2}
PHANTOMBENCH_HYBRID=${PHANTOMBENCH_HYBRID:-"1:64 2:32 4:16 8:8 64:1 2:64 4:32 8:16 16:8 32:4 64:2 128:1"}
PHANTOMBENCH_MPIRUN=${PHANTOMBENCH_MPIRUN:-'srun -n $NMPI -c $OMP_NUM_THREADS'}
WALLTIME=${WALLTIME:-48:00:00}
