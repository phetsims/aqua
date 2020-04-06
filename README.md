# aqua
Automatic QUality Assurance

## Continuous testing prototype (browser-based)

### How to use

For detailed instructions, particularly how it is running on bayes.colorado.edu, see doc/continuous-testing-management.md. Otherwise:

1. Check out all active-repos
2. `npm install` in aqua
3. `node js/continuous-server.js` in aqua (in Administrator mode in Windows, so it can make symbolic links for node_modules)
4. Visit `aqua/html/continuous-loop.html?id={{SOME_IDENTIFIER_HERE}}` in various test browsers (they will run tests continuously)
5. Visit `aqua/html/continuous-report.html` to view current status

### Top-level documentation

continuous-server.js kicks off:

1. A loop that continuously checks whether newer SHAs are available upstream. When a newer SHA is detected, a "stale" flag is set, and repos are pulled. It continues looping until ALL repos are up-to-date (to ensure we catch all pushes if many repos are being pushed to), then creates a snapshot. A snapshot is a full copy of all repository contents at specific SHAs, that can be tested from without being updated.
2. Some number of build threads. They look for any unbuilt repo from the last snapshot and built it (so we can get lint results and test the built sims).
3. A server on port 45366, which takes requests:
  - /next-test: returns a browser-based test (contains information on the snapshot, test, and URL), for consumption by continuous-loop.html
  - /test-result: accepts test results to be recorded (sent by continuous-loop.js)
  - /results: returns a summary of test results, for consumption by continuous-report.html

A browser visiting continuous-loop.html will begin an infinite loop of requesting a test (/next-test request to the server), running that test in an iframe, forwarding pass/fail results to /test-result, and moving to the next test.

### Loose ends

- Snapshot time may not be accurate. Should change to the time when the last-clean "SHA-check" pass started.
- Allow display of SHAs (in dependencies.json format) so devs can check out exact snapshots.
- Prune old results (only display ~20 snapshots)
- Allow tagging browsers with a name (or display user-agent) so tests can be traced back to specific devices to reproduce.
- Handle cloning of missing repos.
- Persistence between server restarts (currently need to wipe snapshot directories after the server process exits)
- Don't require administrator mode for Windows (that's scary!)

### Ideal testing in the future

- phet-io tests
- `grunt lint-everything`
- Launch examples/doc pages/playgrounds for scenery/kite/dot, and assorted other files to ensure we don't break them with sherpa/lib changes.
- Color profile pages (e.g. molecule-shapes-colors_en.html)
- Sim-specific unit tests
- file: protocol
- Basic iframe tests
- Touch fuzzing (with one or more 'fingers')
- Other locales (in unbuilt and built)
- Other builds, tesing locales/brand/mangle/uglify/allHTML.
- Runtime flags, such as:
  - accessibility
  - brand
  - eall
  - phet-app
  - phet-android-app
  - locale
  - profiler
  - rootRenderer (canvas, svg, dom, webgl)
  - showCanvasNodeBounds/showFittedBlockBounds/showPointerAreas/showPointers/showVisibleBounds/dev
  - stringTest
  - webgl=false
- Test with screenshot references (to determine if we have visual breaks)
- Test with phet-io recorded references (to determine if we have model breaks)
