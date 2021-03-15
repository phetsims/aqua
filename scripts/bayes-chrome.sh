#!/bin/bash

# Run with a single command-line argument, generally a number 01 through 99

echo "Running chrome-${1}"

while [ 1 ]
do
  google-chrome --headless --disable-gpu --disable-software-rasterizer --remote-debugging-port=94${1} --enable-precise-memory-info --enable-logging=stderr --v=1 "https://bayes.colorado.edu/continuous-testing/aqua/html/continuous-loop.html?id=Bayes%20Chrome"
done
