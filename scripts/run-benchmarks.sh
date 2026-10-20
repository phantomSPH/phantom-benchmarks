#!/bin/bash
#
# The Phantom benchmarking suite
# This wrapper script runs all benchmarks and records the results
# Written by: Daniel Price, Feb 2019; revived 2026
#
# Usage: run-benchmarks.sh [list of benchmarks]
#
# Benchmark inputs are read from benchmarks/<name>, the calculations are run in
# runs/<name>/<label> and one line per run is appended to results/<machine>/<name>.csv
#
# Required environment variables:
#   SYSTEM                  phantom SYSTEM (compiler) to build with, e.g. gfortran
#   OMP_NUM_THREADS         number of openMP threads
# Optional environment variables:
#   PHANTOM_DIR             phantom source directory (default ~/phantom)
#   PHANTOMBENCH_LABEL      label for this build in results (default $SYSTEM)
#   PHANTOMBENCH_MAKEFLAGS  extra variables passed to make, e.g. "FC=gfortran-15"
#   PHANTOMBENCH_TIER       quick, full or all (default all)
#   PHANTOMBENCH_DATA       cache for downloaded dump files (default ~/.cache/phantombench)
#   PHANTOMBENCH_RESULTS    where to write results .csv files (default results/)
#   PHANTOMBENCH_RUNDIR     where to run the calculations (default runs/)
#   PHANTOMBENCH_MACHINE    machine name used to label results (default hostname)
#   PHANTOMBENCH_UPDATE_REF set to yes to store this run as the reference for the benchmark
#   MPI=yes                 run with mpirun -np $NMPI (default 4)
#   RETURN_ERR=yes          exit with error status if any benchmark fails
#
if [ X$SYSTEM == X ]; then
   echo "Error: Need SYSTEM environment variable set to run PHANTOM benchmarks";
   echo "Usage: $0 [list of benchmarks]";
   exit 1;
fi
if [ X$OMP_NUM_THREADS == X ]; then
   echo "Error: Need OMP_NUM_THREADS environment variable set to run PHANTOM benchmarks";
   echo "Usage: $0 [list of benchmarks]";
   exit 1;
fi
if [ X$PHANTOM_DIR == X ]; then
   echo "WARNING: Need PHANTOM_DIR environment variable set to run PHANTOM benchmarks";
   PHANTOM_DIR=~/phantom;
   echo "Assuming ${PHANTOM_DIR}";
fi
scriptdir=$(cd "$(dirname "$0")" && pwd)
topdir=$(dirname "$scriptdir")
source "$scriptdir/machine.sh"
#
# user-changeable settings
#
phantomdir=${PHANTOM_DIR};
nthreads=${OMP_NUM_THREADS};
label=${PHANTOMBENCH_LABEL:-$SYSTEM};
tier=${PHANTOMBENCH_TIER:-all};
srcdir=$topdir/benchmarks;
datadir=${PHANTOMBENCH_DATA:-~/.cache/phantombench};
resultsdir=${PHANTOMBENCH_RESULTS:-$topdir/results};
rundir=${PHANTOMBENCH_RUNDIR:-$topdir/runs};
machine=$(get_machine_name);
builddir="build-$label";
codebinary="./$builddir/phantom";
release_url="https://github.com/phantomSPH/phantom-benchmarks/releases/download/data-v1"
if [ ! -d $phantomdir ]; then
   echo "ERROR: $phantomdir not found"; exit 1;
else
   echo "Using phantom from $phantomdir";
fi
#
# preset variables
#
datetagiso=`date "+%Y-%m-%dT%H:%M:%S%z"`;
difflog="diff-$label-$nthreads.log";
codelog="code-$label-$nthreads.log";
timelog="time-$label-$nthreads.log";
evlog="ev-$label-$nthreads.log";
makelog="make-$label.log";
csvheader="date,machine,cpu,label,system,compiler,nthreads,nmpi,phantom_sha,phantom_branch,npart,nsteps,wall,step,tree,density,force,kickdrift,ind_eff,status,conservation,rmserr,fflags,cpu_time,mpart_per_s,code_wall,phantom_date"
phantom_sha=`git -C $phantomdir rev-parse --short HEAD`;
phantom_branch=`git -C $phantomdir rev-parse --abbrev-ref HEAD`;
# date of the phantom commit, so that results can be plotted in commit order
phantom_date=`git -C $phantomdir log -1 --format=%cI`;
if [ -n "$(git -C $phantomdir status --porcelain -uno)" ]; then phantom_sha+="-dirty"; fi
list=()
nfail=0
#
# build phantom and utilities for this benchmark, skipping
# the build if already done for this phantom version
#
build_benchmark()
{
   setup=`awk '{print $1}' $src/SETUP`;
   makeflags="`cut -s -d' ' -f2- $src/SETUP` $PHANTOMBENCH_MAKEFLAGS";
   buildtag="$phantomdir $phantom_sha $SYSTEM $makeflags";
   mkdir -p $builddir; cd $builddir;
   if [[ "$phantom_sha" != *-dirty && -x phantom && -x diffdumps && -x showheader \
         && "`cat .buildtag 2> /dev/null`" == "$buildtag" ]]; then
      echo "Using existing build in $builddir";
   else
      echo "Building ${name} benchmark with SYSTEM=$SYSTEM $makeflags...";
      rm -f phantom .buildtag;
      $phantomdir/scripts/writemake.sh $setup > Makefile;
      # phantom builds in $phantomdir/build, so only one build at a time per phantom directory
      lock=$phantomdir/build/.phantombench.lock;
      until mkdir $lock 2> /dev/null; do echo "waiting for lock $lock"; sleep 10; done
      # utilities must be built one at a time due to the generic rule in writemake.sh
      (make SYSTEM=$SYSTEM $makeflags && for target in setup diffdumps showheader; do
          make SYSTEM=$SYSTEM $makeflags $target || exit 1; done) >& $makelog;
      rmdir $lock;
      if grep -q '\*\*\*' $makelog || [ ! -x phantom ]; then
         cd ..; return 1;
      fi
      echo "$buildtag" > .buildtag;
   fi
   cd ..;
}
#
# find the compiler version from the compile commands in the make log
#
get_compiler_version()
{
   # the compiler is the first word of the line following the "Fortran flags" line
   fc=`awk '/Fortran flags are/ { getline; print $1; exit }' $builddir/$makelog`;
   if [ -n "$fc" ]; then
      $fc --version 2> /dev/null | head -1 | tr ',' ' ';
   else
      echo "unknown";
   fi
}
#
# check that the files needed for this benchmark exist
#
check_benchmark_dir()
{
   errlog=''
   if [ ! -e $src/SETUP ]; then
      errlog="SETUP not found"
   fi
   if [ ! -e $src/$name.in.s ]; then
      errlog+=": $name.in.s not found"
   elif [[ `get_infile_value dumpfile $src/$name.in.s` != ${name}_* ]]; then
      # data files share one namespace in the release, so must be prefixed by the benchmark name
      errlog+=": dumpfile in $name.in.s should be named ${name}_NNNNN"
   fi
   if [ ! -e $src/CONSERVE ]; then
      errlog+=": CONSERVE not found"
   fi
   echo "$errlog"
}
run_benchmark()
{
   name=$1;
   src=$srcdir/$name;
   start_group "${name} benchmark with $label, $nthreads threads"
   # a separate directory for each build, so that runs with different compilers
   # (e.g. simultaneous jobs on a cluster) do not overwrite each other's files
   workdir=$rundir/$name/$label;
   mkdir -p $workdir; cd $workdir;
   rm -f $difflog $codelog $timelog $evlog;
   msg=`check_benchmark_dir`
   if [ "X$msg" != "X" ]; then
      log_failure "$msg"
   elif ! download_reference; then
      log_failure "could not download data files"
   elif [[ "$PHANTOMBENCH_FETCH_ONLY" == "yes" ]]; then
      end_group notice "data files for $name are in $datadir/$name";
   elif ! build_benchmark; then
      log_failure "failed to build (see $workdir/$builddir/$makelog)"
   else
      make_initial_conditions
      echo "Running ${name} benchmark with $nthreads threads..."
      run_code
      parse_results
      if [[ "$PHANTOMBENCH_UPDATE_REF" == "yes" && $status != "fail" ]]; then store_reference; fi
   fi
}
#
# Download data files which are not commited to the repository
# into a shared cache directory, then link them into the run directory.
# Files placed in the benchmark directory itself are used in preference.
# Each line of .hashlist is: sha256sum filename [url ...]
#
download_reference()
{
   # initial dump placed in the benchmark directory (e.g. a new benchmark without a .hashlist)
   dumpin=`get_infile_value dumpfile $src/$name.in.s`;
   if [ -e $src/$dumpin ]; then ln -sf $src/$dumpin .; fi
   [ -e $src/.hashlist ] || return 0;
   mkdir -p $datadir/$name;
   while read -r hash file urls; do
      [ -z "$file" ] && continue;
      # the old reference dump is not needed when making a new reference
      [[ "$PHANTOMBENCH_UPDATE_REF" == "yes" && $file == *.ref ]] && continue;
      cached=$datadir/$name/$file;
      if [ -e $src/$file ]; then cached=$src/$file; fi
      if [ ! -s $cached ]; then
         for url in $urls; do
            echo "Downloading ${url}";
            curl -fL# -o $cached.part "$url" && mv $cached.part $cached && break;
         done
      fi
      if [ ! -s $cached ]; then
         echo "ERROR: could not download $file"; return 1;
      fi
      ln -sf $cached $file;
      echo "$hash  $file" | shasum -a 256 -c --quiet || return 1;
   done < $src/.hashlist
}
#
# generate initial conditions with phantomsetup if a .setup file is given
#
make_initial_conditions()
{
   for setupfile in $src/*.setup; do
      [ -e "$setupfile" ] || continue;
      cp $setupfile .;
      prefix=`basename ${setupfile/.setup/}`;
      echo "Generating initial conditions with phantomsetup $prefix"
      ./$builddir/phantomsetup $prefix < /dev/null >& setup-$label.log;
   done
}
#
# get the value of a variable from a phantom .in file
#
get_infile_value()
{
   grep "^ *$1 *=" $2 | head -1 | cut -d'=' -f2 | awk '{print $1}';
}
#
# name of the dump file written after the one given, e.g. blah_00000.tmp -> blah_00001
#
next_dump()
{
   dumpnum=${1##*_};
   printf "%s_%05d" ${1%_*} $(( 10#${dumpnum%.tmp} + 1 ));
}
#
# run code and generate timing output
#
run_code()
{
  infile=$name.in;
  cp $src/$name.in.s ${infile};
  logfile=`get_infile_value logfile ${infile}`;
  evfile=${logfile/.log/.ev};
  # name of the dump that will be written, to check run completed
  dumpfile=`get_infile_value dumpfile ${infile}`;
  dumpout=`next_dump $dumpfile`;
  rm -f ${dumpout} ${evfile} ${logfile};
  if [[ $MPI == "yes" ]]; then
    nmpi=${NMPI:-4}
    mpirun="mpirun -np $nmpi"
  else
    nmpi=1
    mpirun=""
  fi
  infile_changed=1
  while [ $infile_changed -eq 1 ]; do
    cp ${infile} infile.orig;
    time -p ($mpirun $codebinary $infile >& $codelog) >& $timelog;
    # Continue if the code ran fine
    if [ $? -eq 0 ]; then
      break
    fi
    # Otherwise, check if the .in file was rewritten
    cmp -s ${infile} infile.orig
    infile_changed=$?
    if [ $infile_changed -eq 1 ]; then
      echo "${infile} was modified, re-running phantom..."
    fi
  done
  rm infile.orig;
  # check conservation properties against reference run
  if [[ "$PHANTOMBENCH_UPDATE_REF" == "yes" ]]; then refflag="--update-ref"; else refflag=""; fi
  if [ -e ${evfile} ]; then
     python3 $scriptdir/evcheck.py ${evfile} $src/CONSERVE $src/conservation.ref $refflag > $evlog;
     # keep the .ev file of each completed run, so it can be rechecked if tolerances change
     if [ -e ${dumpout} ]; then cp ${evfile} saved-$label-$nthreads.ev; fi
  fi
  # informational only: differences compared to reference dump
  if [ -e ${dumpout}.ref ] && [ -e ${dumpout} ]; then
     ./$builddir/diffdumps ${dumpout} ${dumpout}.ref 1.e-12 > $difflog;
  fi
}
#
# keep the output of this run as the reference dump and record checksums
# of the data files that need to be downloaded to run the benchmark
#
store_reference()
{
  mkdir -p $datadir/$name;
  mv -f $dumpout $datadir/$name/$dumpout.ref && ln -sf $datadir/$name/$dumpout.ref .;
  rm -f $src/.hashlist;
  # initial conditions are only stored if they cannot be generated by phantomsetup
  for file in `ls $src/*.setup > /dev/null 2>&1 || echo $dumpfile` $dumpout.ref; do
     echo "`shasum -a 256 $file | awk '{print $1}'` $file $release_url/$file" >> $src/.hashlist;
  done
  echo "wrote $src/.hashlist and $src/conservation.ref"
  echo "data files to upload are in $datadir/$name"
}
#
# extract a wall time in seconds from the timer table in the phantom log
#
get_timer()
{
  # timer table entries are printed in s, min or h depending on total run time
  grep -m1 -E "[├└]─$1 " $codelog | awk -F: '{print $2}' | awk '{ t=$1;
     fac = (t ~ /min$/) ? 60. : ((t ~ /h$/) ? 3600. : 1.); sub(/[a-z]+$/,"",t);
     printf "%.2f", fac*t }';
}
#
# write results of this run to the .csv file for this benchmark
#
write_csv()
{
  csvfile=$resultsdir/$machine/$name.csv;
  fflags=`grep -m1 'Fortran flags are' $builddir/$makelog | sed 's/.*flags are //' | tr ',' ' '`;
  ind=`grep -m1 'IND TIMESTEPS efficiency' $codelog | sed 's/.*efficiency[: =]*//; s/%.*//'`;
  cons=`grep RESULT $evlog 2> /dev/null | awk '{print $3}' | tr ',' ';'`;
  mkdir -p $resultsdir/$machine;
  if [ ! -e $csvfile ]; then echo "$csvheader" > $csvfile; fi
  # update the header of files written before columns were added
  if [ "`head -1 $csvfile`" != "$csvheader" ]; then
     (echo "$csvheader"; tail -n +2 $csvfile) > $csvfile.tmp && mv $csvfile.tmp $csvfile;
  fi
  echo "$datetagiso,$machine,`get_cpu_model | tr ',' ' '`,$label,$SYSTEM,`get_compiler_version`,$nthreads,$nmpi,$phantom_sha,$phantom_branch,$npart,$nsteps,$wall,`get_timer step`,`get_timer tree`,`get_timer density`,`get_timer force`,`get_timer kickdrift`,$ind,$status,$cons,$rmserr,$fflags,$cputime,$mpart,$codewall,$phantom_date" >> $csvfile;
}
log_failure()
{
  nfail=$(( nfail + 1 ));
  status="fail";
  end_group error "*** $1 ***";
}
#
# when running in GitHub Actions, collapse the output of each run and highlight the result
#
start_group()
{
  if [ "$GITHUB_ACTIONS" == "true" ]; then echo "::group::$1"; else echo "$1"; fi
}
end_group()
{
  if [ "$GITHUB_ACTIONS" == "true" ]; then
     echo "::endgroup::"; echo "::$1 title=$name ($label, $nthreads threads)::$2";
  else
     echo "$2";
  fi
}
#
# check whether the run completed and conserved as well as the reference run
#
parse_results()
{
  # wall time measured externally, independent of the clock used by the code
  wall=`head -1 $timelog | awk '{print $2}'`;
  cputime=`awk '$1=="user" || $1=="sys" {t+=$2} END {printf "%.2f", t}' $timelog`;
  # total wall time according to phantom's own clock, used to rescale the timers in its
  # timing table to the externally measured wall time; printed as e.g. "59.90 s" or
  # "2 min,  25.88 s (=  1.4588E+02s)"
  codewall=`awk '/Total wall time/ { if (match($0,/\(= *[0-9.E+-]+/)) { s=substr($0,RSTART+2,RLENGTH-2) }
            else { for (i=1;i<=NF;i++) if ($i=="s") s=$(i-1) }; printf "%.2f", s }' $codelog`;
  nsteps=`grep 'Since code start' $codelog | tail -1 | awk '{print $4}'`;
  npart=`./$builddir/showheader ${dumpout} 2> /dev/null | grep -m1 -i 'nparttot' | awk '{print $NF}'`;
  # millions of particle updates per second: as printed by phantom with individual timesteps,
  # otherwise every particle is updated on every step
  mpart=`grep 'M particles per second' $codelog | tail -1 | sed 's/M particles.*//' | tr -d ' '`;
  if [ -z "$mpart" ] && [ -n "$npart" ] && [ -n "$nsteps" ]; then
     mpart=`awk -v n=$npart -v s=$nsteps -v w=$wall 'BEGIN { if (w > 0) printf "%.3f", 1e-6*n*s/w }'`;
  fi
  rmserr=`grep 'RMS ERROR' $difflog 2> /dev/null | cut -d':' -f 2 | tr -d ' '`;
  rmserr=${rmserr:-N/A};
  status=`grep RESULT $evlog 2> /dev/null | awk '{print $2}'`;
  cat $evlog 2> /dev/null;
  if [ ! -s $codelog ]; then
     log_failure "no output";
  elif [ ! -e ${dumpout} ]; then
     log_failure "did not complete (see $workdir/$codelog)";
  elif [ "$status" != "pass" ] && [ "$status" != "improved" ]; then
     log_failure "conservation worse than reference (see $workdir/$evlog)";
  else
     cpuwall=`awk -v c=$cputime -v w=$wall 'BEGIN { if (w > 0) printf "%.1f", c/w }'`;
     # time for the calculation from phantom's clock (excludes reading the dump and initial
     # derivatives), unless that is not plausible, in which case the externally measured time
     runtime=`awk -v c="$codewall" -v w=$wall 'BEGIN { if (c > 0 && c <= 1.02*w + 1) print c; else print w }'`;
     end_group notice "TIME: ${runtime}s (TOTAL: ${wall}s) CPU/WALL: $cpuwall MPART/S: $mpart NSTEPS: $nsteps CONSERVATION: $status";
  fi
  write_csv;
}
#
# run all benchmarks in turn
#
run_all_benchmarks()
{
  for name in "$@"; do
      echo;
      run_benchmark $name;
  done
}
#
# use only benchmarks that exist in list of arguments,
# contain a SETUP file and match the requested tier
#
get_benchmark_list()
{
  for dir in "$@"; do
      dir=`basename $dir`;
      if [ -e $srcdir/${dir}/SETUP ]; then
         dirtier=`cat $srcdir/$dir/TIER 2> /dev/null || echo quick`;
         if [ "$tier" == "all" ] || [ "$tier" == "$dirtier" ]; then
            list+=("${dir}")
         fi
      fi
  done
}
########################
# Start of main script #
########################
if [ $# -le 0 ]; then
   get_benchmark_list $srcdir/*;
else
   get_benchmark_list "$@";
fi
if [ ${#list[@]} -eq 0 ]; then
   echo "No benchmarks found matching tier=$tier"; exit 1;
fi
run_all_benchmarks ${list[@]};
echo; echo "Completed ${#list[@]} benchmarks; $nfail failures";
if [ "$nfail" -gt 0 ] && [ "$RETURN_ERR" == "yes" ]; then exit 1; fi
