# How to use the multi-snapshot-comparison tool

1. Have independent checked out copies of all phet repos in different directories
2. Ensure that both of those repos are being transpiled (2 different transpiler processes)
3. Run HTTP servers either serving both copies (or it's a bit easier to run node's http-server from multiple directories). For example: `http-server -c-1 -p 80 > /dev/null` in one (ideally your working copy), and `http-server -c-1 -p 8080 > /dev/null` in the other (to be used for comparison).
4. Load /aqua/html/multi-snapshot-comparison.html in a browser (ideally a private window in Firefox, so that caching doesn't apply). Firefox works better currently, Chrome seems to sometimes have minor pixel differences.
5. See MultiSnapshotComparison.ts for query parameters: Some particularly useful ones are:

- ?urls: multiple URLs should be comma-separated, and the URLs might need to be urlencoded depending on the browser (run `encodeURIComponent( url )` on it and use the output). The default is `?urls=http://localhost,http://localhost:8080`. One, two, or more URLs can be used, and will have a column each
- ?runnables: if provided, a comma-separated list of runnables to test (useful if you know some that are failing), e.g. `?runnables=acid-base-solutions,density`
- ?simWidth/?simHeight: controls the size of the sims (can be used for higher resolution)

It will show columns corresponding to each URL, and rows corresponding to each thing to snapshot. It will take multiple screenshots (default of 10) and will hash their contents together to create a single hash for each test. If all the hashes match on a row, it means no difference in observable behavior between those checkouts was found.

If a difference does occur, it will show up in red. Click on the name of the runnable to pop open screenshots to the right (including difference images). Clicking on any image will copy its data URL to the clipboard (paste it into another browser tab and copy/save the image if needed).

If an error occurs, it will show magenta instead (with no hash).