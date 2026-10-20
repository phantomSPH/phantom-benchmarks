#!/bin/bash
#
# The Phantom benchmarking suite
# Helper functions to describe the machine we are running on
# (sourced by phantombench and run-benchmarks.sh; works on Linux and macOS)
#

# CPU model string, e.g. "Apple M3 Pro" or "AMD EPYC 7543 32-Core Processor"
get_cpu_model()
{
  if [[ "$(uname)" == "Darwin" ]]; then
     sysctl -n machdep.cpu.brand_string
  elif command -v lscpu > /dev/null; then
     lscpu | grep -m1 'Model name' | cut -d: -f2- | sed 's/^ *//'
  else
     grep -m1 'model name' /proc/cpuinfo | cut -d: -f2- | sed 's/^ *//'
  fi
}

# total number of physical cores
get_ncores()
{
  if [[ "$(uname)" == "Darwin" ]]; then
     sysctl -n hw.physicalcpu
  elif command -v lscpu > /dev/null; then
     lscpu -p=core,socket | grep -v '^#' | sort -u | wc -l | tr -d ' '
  else
     getconf _NPROCESSORS_ONLN
  fi
}

# number of performance cores on hybrid CPUs (Apple silicon), otherwise all cores
get_nperfcores()
{
  n=""
  if [[ "$(uname)" == "Darwin" ]]; then
     n=$(sysctl -n hw.perflevel0.physicalcpu 2> /dev/null)
  fi
  echo "${n:-$(get_ncores)}"
}

# short machine name used to label results, overridable via PHANTOMBENCH_MACHINE
get_machine_name()
{
  host=`hostname -s | tr '[:upper:]' '[:lower:]'`
  if [[ -n "$PHANTOMBENCH_MACHINE" ]]; then
     echo "$PHANTOMBENCH_MACHINE"; return
  fi
  # machines/<name>.sh files list the hostnames they apply to on a "# hosts:" line
  for file in $(dirname "${BASH_SOURCE[0]}")/../machines/*.sh; do
     [ -e "$file" ] || continue
     # hostnames are matched ignoring case
     for pattern in `grep -m1 '^# hosts:' $file | cut -d: -f2- | tr '[:upper:]' '[:lower:]'`; do
        if [[ $host == $pattern ]]; then basename $file .sh; return; fi
     done
  done
  echo $host | sed 's/[0-9]*$//'
}
