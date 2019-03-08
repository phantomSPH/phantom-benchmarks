#!/usr/bin/perl
#
# script to parse .html files from performance results
# to create slack message
#
# Daniel Price, Mar 2019
#
if ($#ARGV < 0) {
   die "Usage: $0 opt-status-gfortran.html\n";
}
foreach my $file (@ARGV) {
   open my $fh, '<', $file or die "can't open $file\n";
   while (<$fh>) {
      #print "$_\n";
      my $line="$_";
      if ($line =~ m/SYSTEM=(\w+)\W/) {
         print "*SYSTEM=$1*\n";
      }
      if ($line =~ m/\<td bgcolor=\".*\"\>(\w+)\<\/td\>\<td\>(.*)\<\/td\>\<td.*\>(.*)\<\/td\>\<td\>(.*)\<\/td\>\<\/tr\>/) {
         print "*$1*: ${2}s change $3% error $4\\n";
      }
   }
}
