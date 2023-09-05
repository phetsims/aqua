# To run:

Open `aqua/test-server/test-sims.html` with the relevant query parameters in a browser.

# Query parameters:

- All query parameters (except ?wrapperName) will be passed to the simulation. To detect errors, it is recommended to
  pass at least `?ea`, and for fuzzing, other query parameters (like ?fuzz) are recommended.
- testTask {boolean} Whether a tested sim should be left open after loading. If false, it will move to the next
  simulation immediately upon the previous simulation loading. Defaults to true.
- testSims {Array.<string>} Comma-separated list of sims to be tested. Defaults to sims in active-runnables
- testDuration {number} Milliseconds to keep simulations open when testTask:true. Starts counting from when the iframe
  loads (not when the sim loads). Defaults to 30,000 ms (30 seconds).
- wrapperName {string} - specify the PhET-iO wrapper to load each sim into.

# Legend:

#### Status Box:

- Gray: not yet reached
- Blue: loading
- Orange: failure loading (before running sim)
- Red: failure after loading
