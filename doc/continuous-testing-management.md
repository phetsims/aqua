# How to manage Continuous Testing (CT) service

_Everything in this document is intended to be run on sparky.colorado.edu while logged in as user phet (unless otherwise
stated)._ The simplest way to accomplish this is to login to bayes with your CU Identikey, then run `sudo -i -u phet`.
VPN may be required to reach sparky.colorado.edu if off campus.

At a high level, there is:

- The server process hosting CT (ct-main), serving browser tests and the report, and running local node tests.
- Browser client instances (we run Puppeteer and Playwright browser instances via node processes on sparky). (
  ct-node-BROWSER-client)
- The report interface (e.g. https://sparky.colorado.edu/) which displays the CT state.

# Tests, and changing what is tested

`perennial/js/listContinuousTests.js` controls what tests are run. Simply commit/push to change what will be tested on
the next CT snapshot. Run `sage run js/listContinuousTests.js` in perennial in order to test the output.

There is no need to restart the CT server or other interfaces to change what is tested (unless a new test type is added,
etc.)

# Server setup and structure

## Overview

The general CT structure is made of 3 parts.

* A server (ct-main) that hosts snapshots and tests
* headless browser clients that run browser tests and deliver results back to the server (ct-node-client).
* A "quick" server (ct-quick) that is a separate process to find quick and obvious issues with the codebase even faster.

`sparky.colorado.edu` hosts the majority of the code for CT. It's located under `/data/share/phet/continuous-testing/`
and it is run/managed by `pm2`. All tasks are run from aqua/ grunt tasks. The current list of tasks being run can be
found in `aqua/js/config/sparky.pm2.config`. There you can find where each grunt task (explained below) is run from.

There are clients run from outside sparky as well. On bayes and on a macbook in the Physics building, more clients are
running that test browser tests. See `aqua/js/config/bayes.pm2.config` and `aqua/js/config/safari-mac.pm2.config`.

## The Continuous Server (ct-main)

The CT server runs from the `continuous-server` grunt task, and on sparky is kept running (and logging) with pm2 (more
information below). The code is under `aqua/js/server`, and launches from aqua's `Gruntfile.cjs`.

The server by default will scan the (clean) working copy (pulling/cloning repos as needed), and when changes are
detected will (by default) copy things over into a snapshot directory (under `ct-snapshots/`). Browser-based testing
will load files from under that directory, and builds will be done there also. This snapshot will never change SHAs or
contents (besides the builds and being deleted when it is not needed).

Continuous testing on sparky.colorado.edu has all of our repositories checked out
at `/data/share/phet/continuous-testing`. Everything under this directory is served via HTTPS
at https://sparky.colorado.edu/continuous-testing/. Requests to the server are made
to https://sparky.colorado.edu/aquaserver/* (internal API) which is redirected to the port 45366 internally to our
server process.

The server will have a certain number of locally running loops, doing build/lint tasks for tests. This is specified with
a command-line flag when starting (currently we're using 8 concurrent builds/lints on sparky.colorado.edu).

It also saves state information in `aqua/.continuous-testing-state.json`, so on relaunches it won't lose data. This will
need to be wiped when the internal server formats change.

sparky's web server is `nginx`. You likely shouldn't need to change anything about this, but if you do manage config
with
`/etc/nginx/default.d/sparky.colorado.edu.conf` and manage the process called `nginx` with `systemctl`

## The Quick Server (ct-quick)

The quick server is a side process that reports a basic and fast set of tests to see if anything large and important is
wrong with the code base. This server is run separately, and can be viewed as part of the same report as the full CT.

## Node Clients (ct-node-client)

Aqua supporting browser testing via Puppeteer and Playwright Node packages. These load browser tests through headless
browsers on the server and report problems to ct-main.

## Clients running continuous-loop.html (ct-browser-clients)

An outdated approach of browser testing with worse logging and error handling. Use only with caution.

NOTE: that this has replaced been replaced by ct-node-clients.

## pm2 on sparky.colorado.edu

We've pm2 (https://github.com/Unitech/pm2) to handle running the server process (handling automatic restarting, logging,
etc.).

Typically, you can run `pm2 list` to display the running processes, and it will display something like:

```
[phet@sparky ~]$ pm2 list
┌────┬─────────────────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┬──────────┬──────────┐
│ id │ name                        │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │ user     │ watching │
├────┼─────────────────────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┼──────────┼──────────┤
│ 0  │ ct-main                     │ default     │ N/A     │ fork    │ 722866   │ 14D    │ 3    │ online    │ 125%     │ 1.0gb    │ phet     │ disabled │
│ 1  │ ct-quick                    │ default     │ N/A     │ fork    │ 1499044  │ 14D    │ 167  │ online    │ 50%      │ 147.8mb  │ phet     │ disabled │
│ 4  │ ct-firefox-client      │ default     │ N/A     │ cluster │ 723037   │ 14D    │ 2    │ online    │ 0%       │ 76.6mb   │ phet     │ disabled │
│ 6  │ ct-firefox-client      │ default     │ N/A     │ cluster │ 723038   │ 14D    │ 2    │ online    │ 0%       │ 91.0mb   │ phet     │ disabled │
│ 8  │ ct-firefox-client      │ default     │ N/A     │ cluster │ 724765   │ 14D    │ 2    │ online    │ 0%       │ 104.1mb  │ phet     │ disabled │
│ 10 │ ct-firefox-client      │ default     │ N/A     │ cluster │ 724785   │ 14D    │ 2    │ online    │ 0%       │ 113.5mb  │ phet     │ disabled │
│ 12 │ ct-firefox-client      │ default     │ N/A     │ cluster │ 727279   │ 14D    │ 2    │ online    │ 0%       │ 109.9mb  │ phet     │ disabled │
│ 14 │ ct-firefox-client      │ default     │ N/A     │ cluster │ 727313   │ 14D    │ 2    │ online    │ 0%       │ 103.3mb  │ phet     │ disabled │
│ 16 │ ct-firefox-client      │ default     │ N/A     │ cluster │ 728946   │ 14D    │ 2    │ online    │ 0%       │ 114.7mb  │ phet     │ disabled │
│ 18 │ ct-firefox-client      │ default     │ N/A     │ cluster │ 728974   │ 14D    │ 2    │ online    │ 0%       │ 84.2mb   │ phet     │ disabled │
│ 48 │ ct-firefox-client      │ default     │ N/A     │ cluster │ 740100   │ 14D    │ 2    │ online    │ 0%       │ 97.6mb   │ phet     │ disabled │
│ 50 │ ct-firefox-client      │ default     │ N/A     │ cluster │ 740117   │ 14D    │ 2    │ online    │ 0%       │ 96.7mb   │ phet     │ disabled │
│ 52 │ ct-firefox-client      │ default     │ N/A     │ cluster │ 741709   │ 14D    │ 2    │ online    │ 0%       │ 97.0mb   │ phet     │ disabled │
│ 3  │ ct-puppeteer-client    │ default     │ N/A     │ cluster │ 395012   │ 18h    │ 3    │ online    │ 0%       │ 130.9mb  │ phet     │ disabled │
│ 9  │ ct-puppeteer-client    │ default     │ N/A     │ cluster │ 395073   │ 18h    │ 3    │ online    │ 0%       │ 124.0mb  │ phet     │ disabled │
│ 11 │ ct-puppeteer-client    │ default     │ N/A     │ cluster │ 395186   │ 18h    │ 3    │ online    │ 0%       │ 132.1mb  │ phet     │ disabled │
. . . 
Use `pm2 show <id|name>` to get more details about an app
```

If operating on all pm2 processes, use `aqua/js/config/sparky.pm2.config.js` to set things up, or make changes to what
processes are run.

If you need to just restart or temporarily change a single process, you can do so like:
`pm2 start ct-main` and `pm2 stop ct-main`. Be patient after starting CT; it may take 10 minutes for data to appear
at https://sparky.colorado.edu/continuous-testing.

`pm2 logs` will show recent log lines (stored in files), and will show a stream of logs from that point on (exit with
CTRL-C). `pm2 logs` should be used to diagnose any issues with the server process.

Sometimes on a system reboot, pm2 will forget about everything (we may need to set it up differently, or use an
alternative). In that case:

```sh
pm2 list # see if it is started, and also starts the pm2 daemon if it wasn't running
pm2 resurrect
```

This should work if the previous configuration (all processes) was correctly saved before the reboot, otherwise follow
steps in the sparky config file.

It may not remember GitHub credentials across reboots also, so if the following error message happens (or similar):

```
0|continuo | 2018-01-03T21:27:19.236Z [ERROR] Failure to check remote circuit-construction-kit-dc SHA:
0|continuo |
0|continuo | fatal: could not read Username for 'https://github.com': No such device or address
```

then `cd` into a private repo directory, `git pull`, and put in the phet-dev credentials (username: phet-dev, password
is in the PhET credentials document for "GitHub Machine User"). The credential helper should then remember the password
for future pulls.

## Updating the CT server code

Test locally for server changes, and push when ready. Notify the team on slack#dev-public

1. `git pull` under aqua (`/data/share/phet/continuous-testing/ct-main/aqua`)
2. If the save-file format has changed, or state needs to be wiped, remove the save
   file (`rm /data/share/phet/continuous-testing/ct-main/aqua/.continuous-testing-state.json`). This generally won't be
   needed.
3. Shut down the server (`pm2 stop ct-main`)
4. Start the server (`pm2 start ct-main`)
5. Check the logs (`pm2 logs ct-main`)

These same steps can be done for all processes/directories in CT. This means pulling aqua and restarting. . .  
the quick-server (ct-quick/)
node clients (ct-node-client/)
browser clients (ct-browser-clients/)

# Testing loop

Browsers can be pointed to `aqua/html/continuous-loop.html` to test for any continuous server. For the main CT, this
will be https://sparky.colorado.edu/continuous-testing/aqua/html/continuous-loop.html. It will continuously request
tests from the server, run them, and report back results in a loop. It should still work while the server is down, and
will "reconnect" once the server comes back up. This will do things like fuzz sims, run unit tests, check page loads,
etc.

It's important to note the REQUIRED query parameter `id`, which should be provided to identify what browser is doing the
testing. This will be shown in error reports, and can help track what computer/os/browser were used for specific
failures.

It can take a `server` query parameter, which determines where API requests should be made. This isn't needed for
testing CT though.

# Browser testing (sparky testing loop)

We have a variety of methods for testing our browser tests. The primary way is with `grunt ct-node-client`, which
supports puppeteer and playwright browsers via NodeJS. We support running firefox and puppeteer on sparky (and
potentially on bayes once https://github.com/phetsims/aqua/issues/185 is solved). We also have webkit running on a Mac
computer running in the Physics tower on campus. Contact @zepumph or @jbphet if you need to debug the safari clients.

There is also a separate, and vestigial browser-testing process that still runs on CT as of this writing,
called `ct-browser-clients`. This runs puppeteer instances in worker threads, pointing to the continuous-loop.

# Report interface

The main interface is available at https://sparky.colorado.edu/. It will send API
requests `https://sparky.colorado.edu/aquaserver/*` (which on the server will be mapped to the port 45366, to our
running node server process).

The reports can also be directed to point to any server API with the `?server` query parameter,
e.g. `?server=http%3A%2F%2Flocalhost%3A45366` to point to a CT server running locally with the default port.

There are two ways of running the report interface from any location: `continuous-report.html` (which uses a built form
of aqua), and `continuous-unbuilt-report.html` (which loads the aqua interface with modules, and should be used while
developing the interface).

## Updating the interface on sparky

Notify the team on slack#dev-public

To move interface changes to sparky, you'll want to go to the aqua directory for
CT (`/data/share/phet/continuous-testing/aqua`), pull (since it will not pull aqua during its testing loop), and
run `grunt`. This will build the interface under `aqua/build` which is used by `continuous-report.html`.

# Local testing

## Running the server locally

The documentation under `aqua/js/grunt/tasks/continuous-server.ts` specifies more details for running, but if you want to run some CT tests
locally (without the full server experience) it's best to use the `--useRootDir` flag (it will not copy files into
snapshots, but will use your working copy, creating only one "CT" column, and without saving state to disk).
The `--localCount` parameter is required, and specifies how many concurrent build/lint tasks should happen (which can be
zero).

For example, you can run:

```sh
grunt continuous-server --useRootDir --localCount=2
```

which will launch on the default port `45366`.

See all options and details in `aqua/js/grunt/tasks/continuous-server.ts`.

Then for testing server changes with the report, the report and loop interfaces can be given the query
parameter `?server=http%3A%2F%2Flocalhost%3A45366` to specify the server location (for API access). Depending on your
local testing URL, the report interface then would
be http://localhost/aqua/html/continuous-unbuilt-report.html?server=http%3A%2F%2Flocalhost%3A45366.

Tests can be run in the browser
via: http://localhost/aqua/html/continuous-loop.html?server=http%3A%2F%2Flocalhost%3A45366&id=local

Tests can be run using the node process
via `grunt ct-node-client --ctID=blargity --browser=puppeteer --serverURL=http://localhost:45366 --fileServerURL=http://localhost`

## Running the report locally

The report can be run locally, but pointed to sparky for testing changes to the report.

Both [continuous-report.html](../html/continuous-report.html) (built version)
and [continuous-unbuilt-report.html](../html/continuous-unbuilt-report.html) are available for running locally. the
unbuilt report can be run with just a transpile step, which is helpful when making changes to `js/report/report.js`. Run
with a URL like this for fast iteration: `

http://localhost:8080/aqua/html/continuous-unbuilt-report.html?server=https://sparky.colorado.edu/&maxColumns=5`.

Note how the URL supports retrieving the same data from sparky, so you don't HAVE to have a local server running to
iterate on the front end.

The report is built as a "standalone" scenery-like repo with `grunt`;

# Server Debugging

Usually, inspect `pm2 logs` to see if something is going on. If it's scrolled past an error, you can tail the actual
file that the logs stream to. Typically it might be a missing repo, a private repo that it can't resolve, or sometimes
you'll need to re-clone a repo if there was a history-changing operation. (Since sparky is constantly pulling, if
someone pushes a history change and then reverts it or something like that, a `git pull` won't work and recloning will
be necessary).

Because pm2 stores logs under `/home/phet/.pm2/logs`, it's filled up the partition for `/home` before. We've increased
the size for that, but it may be an issue in the future.

We'll add any future ways of fixing things as we run across them here.

# Troubleshooting

In general please create issues in `aqua/` when there are CT problems.

# Tokens

One problem that happens from time to time is that you need to refresh tokens for GitHub access. Log into sparky and
verify you can pull with git in a private repo. If there is a permission failure, refresh the token. See
https://github.com/phetsims/website-common/blob/main/.github/README.md for information on creating a new token. When
GitHub prompts for credentials during a `git pull`, provide the new token.

Note that a failure to pull a private repo may cause pull failures for all repos.