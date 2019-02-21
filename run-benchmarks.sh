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
if [ X$PHANTOM_DIR == X ]; then
   echo "WARNING: Need PHANTOM_DIR environment variable set to run PHANTOM benchmarks";
   PHANTOM_DIR=~/phantom;
   echo "Assuming ${PHANTOM_DIR}";
fi
phantomdir=${PHANTOM_DIR};
htmlfile="opt-status-$SYSTEM.html";
htmlgraphs="opt-report-$SYSTEM.html";
#
# tolerance on how similar files shuold be
#
tol="1.e-12"
if [ ! -d $phantomdir ]; then
   echo "WARNING: $phantomdir not found";
   nographs=1;
else
   nographs=0;
fi
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
htmllog="log.html"
list=()
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
  ./diffdumps ${reffile/.ref/} ${reffile} $tol > $difflog
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
  echo "$line" > $htmllog;
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
  echo "$line" > $htmllog;
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
  name=$1;
  if [ -s $perflog ]; then
     cp $perflog $name.txt;
     $phantomdir/scripts/make_google_chart.sh $name.txt "Benchmark timings for $name test" "Performed on $HOSTNAME" "Wall time(s)" > ../$name.js
     echo "<div id=\"$name\" style=\"width: 900px; height: 500px\"></div>" >> ../$htmlgraphs;
  fi
}
make_graphs()
{
 for name in "$@"; do
     cd $name;
     make_graph $name;
     cd ..;
 done
}
#
# run all benchmarks in turn
#
run_all_benchmarks()
{
  for name in "$@"; do
      echo;
      echo "Running ${name} benchmark..."
      cd $name;
      run_benchmark $name
      cd ..;
  done
}
#
# use only directories that exist in list of arguments
#
get_directory_list()
{
  for dir in "$@"; do
      if [ -d ${dir} ]; then
         list+=("${dir}")
      fi
  done
}
collate_and_print_results()
{
  open_html_file
  for name in $@; do
      cat $name/$htmllog >> $htmlfile;
  done
  close_html_file
  write_graphs_htmlfile "$@"
}
open_html_file()
{
  echo "<h2>Checking Phantom benchmarks, SYSTEM=$SYSTEM</h2>" > $htmlfile;
  echo "<p>Benchmarks completed: `date`" >> $htmlfile;
  echo "<br/>$HOSTNAME" >> $htmlfile;
  echo "<br/>OMP_NUM_THREADS=$OMP_NUM_THREADS" >> $htmlfile;
  echo "</p><table>" >> $htmlfile;
  echo "<tr><td><strong>Benchmark</strong></td><td><strong>Time (s)</strong></td><td><strong>%Change</strong></td><td><strong>RMS error</strong></td></tr>" >> $htmlfile;
}
close_html_file()
{
  echo "</table>" >> $htmlfile;
  echo "<p>Completed $nbench benchmarks; <strong>$nfail failures</strong>; <strong>$nslow slowdowns</strong></p>" >> $htmlfile;
  echo; echo "output written to $htmlfile"
}
write_graphs_htmlfile()
{
  echo "<html>" > $htmlgraphs;
  echo "<head>" >> $htmlgraphs;
  echo "<script type=\"text/javascript\" src=\"https://www.gstatic.com/charts/loader.js\"></script>" >> $htmlgraphs;
  for name in "$@"; do
     if [ -e $name.js ]; then
        echo "<script type=\"text/javascript\" src=\"$name.js\"></script>" >> $htmlgraphs;
     fi
  done
  echo "</head><body>" >> $htmlgraphs;
  echo "<h1>Phantom nightly benchmarking</h1>" >> $htmlgraphs;
  echo "<p>[<a href=\"../build/index.html\">Nightly build report</a>] [<a href=\"../logs/\">build logs</a>]</p>" >> $htmlgraphs;
  make_graphs "$@"
  echo "</body></html>" >> $htmlgraphs;
  echo "plots written to $htmlgraphs"
}
########################
# Start of main script #
########################
if [ $# -le 0 ]; then
   get_directory_list *;
else
   get_directory_list "$@";
fi
run_all_benchmarks ${list[@]};
collate_and_print_results ${list[@]};
