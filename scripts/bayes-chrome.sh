#!/bin/bash

# Run with a single command-line argument, generally a number 1 through 9

echo "Running chrome-${1}"

while [ 1 ]
do
  timeout 1${1}h google-chrome --headless --disable-gpu --disable-software-rasterizer --remote-debugging-port=934${1} "https://bayes.colorado.edu/continuous-testing/aqua/html/continuous-loop.html?id=Bayes%20Chrome"
done
