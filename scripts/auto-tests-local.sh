#!/bin/bash
# https://www.codeword.xyz/2015/09/02/three-ways-to-script-processes-in-parallel/
# Run fast local tests as a sanity check before committing or pushing.

RAND=$RANDOM
node js/local/test.js $RAND 3 0 UNIT &
node js/local/test.js $RAND 3 1 UNIT &
node js/local/test.js $RAND 3 2 UNIT &
node js/local/test.js $RAND 1 0 FUZZ &
grunt lint-everything --repo=faradays-law &

wait
echo all processes complete