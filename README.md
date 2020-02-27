# Phantom benchmark suite
Benchmarking and performance suite for the phantom code http://bitbucket.org/danielprice/phantom
 
 Tests in this repo are run nightly and checked for speed and are used for performance evaluation/code scaling tests

## Run all benchmarks
```
./run-benchmarks.sh
```

## Run selected benchmarks
```
./run-benchmarks.sh polar
```
where arguments are subdirectories of the current one

## How to add benchmark problems to this suite

1. clone the repository to your local machine
```
git clone https://bitbucket.org/danielprice/phantom-benchmarks
```
2. make a new directory
3. add the phantom input file with ".in.s" as the file extension
4. add the reference dump file to which results should be compared, with ".ref" as the file extension
5. ensure your calculation is SHORT (runs in < 2 minutes) but REPRESENTATIVE, e.g. with typical particle numbers and timestep ranges

## problems with git-lfs

 The benchmarks in this repository rely on git large file storage, requiring git-lfs to be installed, e.g.:
```
 git lfs install
```
If you have difficulty or do not have access to a git-lfs installation, the files can be downloaded manually as follows:
```
cd polar
wget https://bitbucket.org/danielprice/phantom-benchmarks/downloads/polar_00000
wget https://bitbucket.org/danielprice/phantom-benchmarks/downloads/polar_00001.ref
```
