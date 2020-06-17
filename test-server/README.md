# To run:

1. If you plan to build sims for the tests, go to aqua/ and run `node test-server/test-server.js`
2. Open `aqua/test-server/test-sims.html` with the relevant query parameters in a browser.

# Query parameters:

- All query parameters will be passed to the simulation. To detect errors, it is recommended to pass at least `?ea`, and
  for fuzzing, other query parameters (like ?fuzz) are recommended.
- testTask {boolean} Whether a tested sim should be left open after loading. If false, it will move to the next
  simulation immediately upon the previous simulation loading. Defaults to true.
- testUnbuilt {boolean} Whether tests will be run in unbuilt mode. Defaults to true.
- testBuilt {boolean} Whether the sims will be built (and the built versions tested). Defaults to true.
- testSims {Array.<string>} Comma-separated list of sims to be tested. Defaults to sims in active-runnables
- testDuration {number} Milliseconds to keep simulations open when testTask:true. Starts counting from when the iframe
  loads (not when the sim loads). Defaults to 30,000 ms (30 seconds).
- testConcurrentBuilds {number} Quantity of grunt builds that should be run at a time. Defaults to 1.

# Legend:

#### Boxes:

- Left: Status running unbuilt mode
  - Gray: not yet reached
  - Blue: loading
  - Orange: failure loading (before running sim)
  - Red: failure after loading
- Middle: Status building with chipper
  - Gray: not yet reached
  - Green: built with no errors
  - Red: failed to build
- Right: Status running the built sim.
  - Gray: not yet reached
  - Blue: loading
  - Orange: failure loading (before running sim)
  - Red: failure after loading
