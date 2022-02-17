# Phantom benchmark suite
Benchmarking and performance suite for the phantom code http://github.com/danieljprice/phantom

 Tests in this repo are run nightly and checked for speed and are used for performance evaluation/code scaling tests. Results are currently published to http://phantomsph.bitbucket.io/nightly/opt/

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

1. Clone the repository to your local machine
```
git clone https://github.com/phantomSPH/phantom-benchmarks
```

2. Make a new directory
```
cd phantom-benchmarks
mkdir mybench
cd mybench
```

3. Add the phantom input file with ".in.s" as the file extension
```
cp mybench.in mybench.in.s
```

4. Add the reference dump file to which results should be compared, with ".ref" as the file extension
```
cp mybench_00001 mybench_00001.ref
```

5. Ensure your calculation is SHORT (runs in < 2 minutes) but REPRESENTATIVE, e.g. with typical particle numbers and timestep ranges

6. Verify that the test passes by running
```
./run-benchmarks mybench
```


7. Open an Issue to make a request for the dump files to be copied to the web server (http://data.phantom.cloud.edu.au/data/benchmarks/)

8. Paste the checksums into a file named `.hashlist` in the test directory, for example
```
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx mybench_00000
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx mybench_00000.ref
```
These files are automatically downloaded at run time.

9. Commit and push the benchmark to the repository, excluding the dump files (to avoid bloating the repository)
```
git add mybench.in.s SETUP .hashlist
git commit -m 'added benchmark mybench'
git push
```
