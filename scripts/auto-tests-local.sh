#!/bin/bash
# https://www.codeword.xyz/2015/09/02/three-ways-to-script-processes-in-parallel/
# Run fast local tests as a sanity check before committing or pushing.

# Share the same random seed across instances
RAND=$RANDOM

# Split unit tests into multiple groups to speed up by parallelism
node js/local/test.js $RAND 3 0 UNIT &
node js/local/test.js $RAND 3 1 UNIT &
node js/local/test.js $RAND 3 2 UNIT &

# Run the long fuzz test on its own, since it takes a while
node js/local/test.js $RAND 1 0 FUZZ &

# Run linting separately since it takes a while
grunt lint-everything --repo=faradays-law &

wait
echo all processes complete