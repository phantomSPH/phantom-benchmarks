#!/bin/bash
#
# The Phantom benchmarking suite
# This wrapper script runs all benchmarks and collates the results
# Written by: Daniel Price, Feb 2019
#
if [ X$SYSTEM == X ]; then
   echo "Error: Need SYSTEM environment variable set to run PHANTOM benchmarks";
   echo "Usage: $0";
   exit;
fi
#
# user-changeable settings
#
listofbenchmarks='polar crap';
phantomdir=~/phantom-nightly;
htmlfile="opt-report-$SYSTEM.html";
#
# preset variables
#
datetagiso=`date "+%Y-%m-%d %H:%M:%S %z"`;
red="#FF0000";
amber="#FF6600";
green="#009900";
difflog="diff.log";
benchlog="bench.log";
codelog="code.log";
timelog="time.log";
makelog="make.log";
perflog="stats.txt";
#
# run a particular benchmark
#
nfail=0
nslow=0
nbench=0
err=0
check_benchmark_dir()
{
   errlog=''
   if [ ! -e Makefile ]; then
      if [ ! -e SETUP ]; then
         errlog="setup not found"
      else
         $phantomdir/scripts/writemake.sh `cat SETUP` > Makefile
      fi
   fi
   ls *.in.s *.ref > /dev/null; err=$?;
   if [ ! $err -eq 0 ]; then
      errlog+=": infiles not found"
   fi
   if [ ! -e diffdumps ]; then
      make diffdumps >& /dev/null
      if [ ! -e diffdumps ]; then
         errlog+=": diffdumps not found"
      fi
   fi
   echo "$errlog"
}
run_benchmark()
{
   name=$1;
   rm -f $benchlog $difflog $codelog $timelog $makelog;
   nbench=$(( nbench + 1 ));
   msg=`check_benchmark_dir`
   if [ "X$msg" != "X" ]; then
      log_failure $name "$msg"
   else
      make >& $makelog; err=$?
      if [ $err -eq 0 ]; then
         run_code
         parse_results $name
      else
         log_failure $name "failed to build"
      fi
   fi
}
#
# run code and generate timing output
# could replace this routine with
# external script if desired
#
run_code()
{
  # find .in.s file and .ref file
  sfile=`ls *.in.s | head -1`;
  reffile=`ls *.ref | head -1`;
  infile=${sfile/.in.s/.in};
  # copy blah.in.s blah.in
  cp ${sfile} ${infile};
  # run code and time it
  time -p (./phantom $infile >& $codelog) >& $timelog;
  #walltime=`grep 'Total wall time' $codelog | cut -d'=' -f 2 | cut -d's' -f 1`
  walltime=`head -1 $timelog`;
  walltime=${walltime/real/};
  # check differences
  diffdumps ${reffile/.ref/} ${reffile} > $difflog
  check=`grep FILES diff.log`
  if [ "$check" == " FILES ARE IDENTICAL " ]; then
     echo "$datetagiso $walltime" > $benchlog
  else
     echo "$datetagiso failed" > $benchlog
  fi
  cat $benchlog >> $perflog
}
log_failure()
{
  nfail=$(( nfail + 1 ));
  name=$1;
  msg=$2;
  line="<tr><td bgcolor=\"$red\">$name</td><td>FAILED: $msg</td><td>N/A</td>"
  rmserr=`get_rmserr`
  line+="<td>$rmserr</td></tr>"
  echo "$line" >> ../$htmlfile;
  echo "*** $msg ***";
}
log_success()
{
  name=$1;
  timing=$5;
  resultsprev=`tail -1 ${benchlog}.prev`;
  line="<tr><td bgcolor=\"$green\">$name</td><td>$timing</td>"
  #
  # check if timings slowed by more than 10% compared to previous run
  #
  change=`get_percent $timing $resultsprev`;
  gtr_than $change 10.0; slowdown=$?
  gtr_than $change 5.0; amberslowdown=$?
  if [ $slowdown -eq 1 ]; then
     line+="<td bgcolor=\"$red\">$change</td>"
     nslow=$(( nslow + 1 ))
  elif [ $amberslowdown -eq 1 ]; then
     line+="<td bgcolor=\"$amber\">$change</td>"
  else
     line+="<td bgcolor=\"$green\">$change</td>"
  fi
  rmserr=`get_rmserr`
  line+="<td>$rmserr</td></tr>"
  echo "$line" >> ../$htmlfile;
  echo "TIME: ${timing}s CHANGE: ${change}%";
}
#
# find RMS error from diffdumps output
#
get_rmserr()
{
  rmserr=`grep 'RMS ERROR' diff.log | cut -d':' -f 2`;
  if [ "X$rmserr" == "X" ]; then
     echo "N/A"
  else
     echo "$rmserr"
  fi
}
# find percentage change in timing results
get_percent()
{
   timing=$1
   timingprev=$5
   percent=`awk -v n1="$timing" -v n2="$timingprev" 'BEGIN { print (100.*(n1-n2)/n2) }'`
   echo $percent;
}
# awk utility for floating point comparison
gtr_than()
{
 awk -v n1="$1" -v n2="$2" 'BEGIN { exit (n2 <= n1) }'
}
parse_results()
{
  results=`tail -1 $benchlog`
  fail=`echo "$results" | grep fail`;
  if [ "X${results}X" == "XX" ]; then
     log_failure $name "no output";
  elif [ "X${fail}X" == "XX" ]; then
     log_success $name $results;
     cp ${benchlog} ${benchlog}.prev;
  else
     log_failure $name "results differ from reference";
  fi
}
make_graph()
{
  echo "not implemented"
}
#
# run all benchmarks in turn
#
run_all_benchmarks()
{
  open_html_file
  for dir in "$@"; do
      echo;
      if [ -d ${dir} ]; then
         echo "Running ${dir} benchmark..."
         cd $dir;
         run_benchmark $dir
         cd ..;
      else
         echo "Directory '${dir}' does not exist, skipping..."
      fi
  done
  close_html_file
}
open_html_file()
{
  echo "<h2>Checking Phantom benchmarks, SYSTEM=$SYSTEM</h2>" > $htmlfile;
  echo "<p>Benchmarks performed: `date`" >> $htmlfile;
  echo "<br/>$HOSTNAME" >> $htmlfile;
  echo "<br/>OMP_NUM_THREADS=$OMP_NUM_THREADS" >> $htmlfile;
  echo "</p><table>" >> $htmlfile;
  echo "<tr><td><strong>Benchmark</strong></td><td><strong>Time (s)</strong></td><td><strong>%Change</strong></td><td><strong>RMS error</strong></td></tr>" >> $htmlfile;
}
close_html_file()
{
  echo "</table>" >> $htmlfile;
  echo "<p>Completed $nbench benchmarks; <strong>$nfail failures</strong>; <strong>$nslow slowdowns</strong></p>" >> $htmlfile;
}
########################
# Start of main script #
########################
if [ $# -le 0 ]; then
   run_all_benchmarks $listofbenchmarks
else
   run_all_benchmarks $@;
fi
echo; echo "output written to $htmlfile"
