#
# The Phantom benchmarking suite
# This wrapper script makes html/javascript plots from benchmarking results
# Written by: Daniel Price, Feb 2019
#
htmlfile="performance.html";
perflog="stats.txt";
systemnames=''
if [ X$PHANTOM_DIR == X ]; then
   echo "WARNING: Need PHANTOM_DIR environment variable set to run PHANTOM benchmarks";
   PHANTOM_DIR=~/phantom;
   echo "Assuming ${PHANTOM_DIR}";
fi
list=()
#
# make a graph from the output files
#
collate_results()
{
   n=0;
   timings='';
   for x in time*.log; do
       if [ -s $x ]; then
          n=$(( n + 1 ));
          systemnames+=" ${x/.log/}";
          walltime=`head -1 $x`;
          timings+=${walltime/real/};
          benchlog=${x/time/bench};
          date=`tail -1 $benchlog | cut -d' ' -f 1`
          time=`tail -1 $benchlog | cut -d' ' -f 2`
          tz=`tail -1 $benchlog | cut -d' ' -f 3`
       fi
   done
   echo; echo "$PWD"
   # append data to file, but only if new data found
   if (( $n > 0 )); then
      line="$date $time $tz $timings"
      lastline=`tail -1 $perflog`
      echo "GOT ${line}"
      echo "WAS ${lastline}"
      if [ "$line" != "$lastline" ]; then
         echo "$date $time $tz $timings" >> $perflog;
      else
         echo "no new data found"
      fi
   else
      echo "no benchmark logs found"
   fi
}
#
# make a graph from the output files
#
make_graph()
{
  name=$1;
  if [ -s $perflog ]; then
     cp $perflog $name.txt;
     ${PHANTOM_DIR}/scripts/make_google_chart.sh $name.txt "Benchmark timings for $name test" "Performed on $HOSTNAME" $systemnames  > ../$name.js
     echo "<div id=\"$name\" style=\"width: 900px; height: 500px\"></div>" >> ../$htmlfile;
     rm $name.txt; # clean up temporary file
  fi
}
#
# loop over all benchmarks to make each graph
#
make_graphs()
{
 for name in "$@"; do
     cd $name;
     collate_results
     make_graph $name;
     cd ..;
 done
}
#
# write html file
#
write_graphs_htmlfile()
{
  echo "<html>" > $htmlfile;
  echo "<head>" >> $htmlfile;
  echo "<script type=\"text/javascript\" src=\"https://www.gstatic.com/charts/loader.js\"></script>" >> $htmlfile;
  for name in "$@"; do
     if [ -e $name.js ]; then
        echo "<script type=\"text/javascript\" src=\"$name.js\"></script>" >> $htmlfile;
     fi
  done
  echo "</head><body>" >> $htmlfile;
  echo "<h1>Phantom nightly benchmarking</h1>" >> $htmlfile;
  echo "<p>[<a href=\"https://phantomsph.bitbucket.io/\">Phantom home</a>] [<a href=\"../index.html\">Nightly home</a>] [<a href=\"../build/index.html\">Build report</a>] [<a href=\"../opt/index.html\">Performance report</a>] [<a href=\"../stats/index.html\">Statistics</a>]</p>" >> $htmlfile;
  make_graphs "$@"
  echo "</body></html>" >> $htmlfile;
  echo; echo "plots written to $htmlfile"
}
#
# find subdirectories
#
get_directory_list()
{
  for dir in "$@"; do
      if [ -d ${dir} ]; then
         list+=("${dir}")
      fi
  done
}
if [ $# -le 0 ]; then
   get_directory_list *;
else
   get_directory_list "$@";
fi
write_graphs_htmlfile ${list[@]};
