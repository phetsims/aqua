#!/bin/bash
# https://www.codeword.xyz/2015/09/02/three-ways-to-script-processes-in-parallel/

node js/local/test.js &
grunt lint-everything --repo=faradays-law &

wait
echo all processes complete