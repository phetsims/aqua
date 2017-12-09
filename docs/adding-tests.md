# How to add unit tests to a repo with no unit tests

Presuming you are using chipper 2.0 or later

```
cd repo
grunt generate-test-html
```
Then populate js/{{REPO}}-tests.js with tests, see `dot/js/dot-tests.js` for a good example.

Point your browser to {{REPO}}-tests.html to see the QUnit page.

Tests should be placed adjacent to the file they test (if applicable). For example, Vector2Tests.js is adjacent to Vector2.js.

To add a new repo for testing on Bayes, add it to the list in `continuous-server.js` which is currently:

```js
// repo-specific Unit tests (require.js mode) from `grunt generate-test-harness`
[ 'axon', 'circuit-construction-kit-common', 'dot', 'kite', 'phetcommon', 'phet-core', 'phet-io', 'query-string-machine', 'scenery' ].forEach( function( repo ) {
```

Then make a request to @jonathanolson to restart bayes. @jonathan will be automating this as part of https://github.com/phetsims/aqua/issues/29

# How to add unit tests to a repo that already has unit tests

1. Please review the QUnit documentation about how to set up tests https://qunitjs.com/
2. Please review example tests in dot, axon or circuit-construction-kit