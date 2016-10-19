# To run:

1. If you plan to build sims for the tests, run `node aqua/test-server/test-server.js`

2. Open `aqua/test-server/test-sims.html` with the relevant query parameters in a browser.

# Query parameters:

- All query parameters will be passed to the simulation. To detect errors, it is recommended to pass at least `?ea`.
- testTask = 'fuzzMouse' or 'none' (default 'none'). If 'none', it will only wait until the simulation is loaded.
- testRequirejs = 'true' or 'false' (default 'true'). Whether tests will be run in require.js mode.
- testBuilt = 'true' or 'false' (default 'true'). Whether tests will be run in built mode (will build the sims first).
- testSims = (comma-separated list of sims), defaults to sims in active-runnables
- testDuration = (milliseconds to keep the simulation open, if testTask != 'none')
- testFuzzRate = (actions per frame, default 100). Controls how fast the fuzzer operates

# Legend:

#### Boxes:

* Left: run in require.js mode with fuzz test
* Middle: build
* Right: run the build version with fuzz test

#### Colors:

* gray = not tested yet
* blue = loading
* green = test completed successfully
* orange = failed during launch
* red = failed to build or run
