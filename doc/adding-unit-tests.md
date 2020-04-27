# How to add unit tests to a repo with no unit tests

Add `"generatedUnitTests": true` under the `phet` section of the repo's package.json, e.g.:

```
{
  "name": "example",
  ...
  "phet": {
    "generatedUnitTests": true,
    ...
  }
}
```

Then go to the repo and `grunt update` will create the top-level tests HTML:

```bash
cd repo
grunt update
```
Then populate js/{{REPO}}-tests.js with tests, see `dot/js/dot-tests.js` for a good example.

Point your browser to {{REPO}}-tests.html to see the QUnit page.

Tests should be placed adjacent to the file they test (if applicable). For example, Vector2Tests.js is adjacent to Vector2.js.

# How to add unit tests to a repo that already has unit tests

1. Please review the QUnit documentation about how to set up tests https://qunitjs.com/
2. Please review example tests in dot, axon or circuit-construction-kit
