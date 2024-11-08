# aqua

**A**utomatic **QU**ality **A**ssurance

---------------

This repo contains code related to testing the PhET codebase. This includes multiple separate projects:

1. "Continuous Testing (CT)" - a server that hosts tests based on snapshots of our codebase.
   - Server: run on sparky.colorado.edu
   - Client: node-based browsers that fuzz sim tests
   - Report: a scenery-based display of the CT results (see aqua-main)
   - QuickServer: a separate server that runs a few important tests for faster turn around on larger breakages.
2. Browser tools - Local testing tools, best to be used through phetmarks, for fuzzing many sims for errors, or
   comparing "snapshots" for regressions, all in your local copy.

See [continuous-testing-management](https://github.com/phetsims/aqua/blob/main/doc/continuous-testing-management.md) for
a complete guide on CT.

### Loose ends for CT

- Snapshot time may not be accurate. Should change to the time when the last-clean "SHA-check" pass started.
- Allow display of SHAs (in dependencies.json format) so devs can check out exact snapshots.
- Allow tagging browsers with a name (or display user-agent) so tests can be traced back to specific devices to
  reproduce.
- Handle cloning of missing repos.
- Persistence between server restarts (currently need to wipe snapshot directories after the server process exits)
- Don't require administrator mode for Windows (that's scary!)

### Ideal CT testing in the future

Current tests live in listContinuousTests

- Color profile pages (e.g. molecule-shapes-colors_en.html)
- file: protocol sim tests
- Basic iframe tests
- Touch fuzzing (with one or more 'fingers')
- Other locales (in unbuilt and built)
- Other builds, tesing locales/brand/mangle/uglify/allHTML.
- Runtime flags, such as:
  - accessibility
  - brand
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
