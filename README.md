# Phantom benchmark suite

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

1. make a new directory
2. add the phantom input file with ".in.s" as the file extension
3. add the reference dump file to which results should be compared, with ".ref" as the file extension
4. ensure your calculation is SHORT (runs in < 2 minutes) but REPRESENTATIVE, e.g. with typical particle numbers and timestep ranges
