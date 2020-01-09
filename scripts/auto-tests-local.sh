#!/bin/bash
# https://www.codeword.xyz/2015/09/02/three-ways-to-script-processes-in-parallel/
# Run fast local tests as a sanity check before committing or pushing.
# "$@" passes through options
# TODO: support arbitrary number of args and fork each out to another fuzz test.
#       This will allow developers to customize usage of this script. https://github.com/phetsims/aqua/issues/81

# Choose a testable-runnable sim for fuzzing.  Trim whitespace lines.
RANDOM_SIM="$(sed '/^[[:space:]]*$/d' ../perennial/data/testable-runnables | sort -R | head -n 1)"

# Split unit tests into multiple groups to speed up by parallelism
node js/local/unitTestBatch.js 4 0 "$@" &
node js/local/unitTestBatch.js 4 1 "$@" &
node js/local/unitTestBatch.js 4 2 "$@" &
node js/local/unitTestBatch.js 4 3 "$@" &

# Fuzz test a random sim
# node js/local/fuzzOneSim.js ${RANDOM_SIM} "$@" &

# Fuzz test a random sim
node js/local/fuzzOneSim.js wave-interference "$@" &

# Test wave interference since it is in active development
node js/local/fuzzOneSim.js circuit-construction-kit-dc "$@" &

# Run linting separately since it takes a while
grunt lint-everything --repo=faradays-law "$@" &

wait
echo Tests Complete.