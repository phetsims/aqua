# How to manage Continuous Testing (CT) service

_Everything in this document is intended to be run on bayes.colorado.edu while logged in as user phet-admin._ The
simplest way to accomplish this is to login to bayes with your CU Identikey, then run `sudo -i -u phet-admin`. VPN may
be required to reach bayes.colorado.edu if off campus.

At a high level, there is:

- The server process (running on bayes.colorado.edu, but can also be run anywhere)
- Browsers running tests (we run Chrome processes on bayes, pointed to the main server)
- The report interface (e.g. https://bayes.colorado.edu/continuous-testing/aqua/html/continuous-report.html) which
  displays the CT state.

# Tests, and changing what is tested

perennial/js/listContinuousTests.js controls what tests are run. Simply commit/push to change what will be tested on the
next CT snapshot. Run `node js/listContinuousTests.js` in perennial in order to test the output.

There is no need to restart the CT server or other interfaces to change what is tested (unless a new test type is added,
etc.)

# Server process

The CT server runs from the `continuous-server` grunt task, and on bayes is kept running (and logging) with pm2 (more
information below). The code is under `aqua/js/server`, and launches from aqua's `Gruntfile.js`.

The server by default will scan the (clean) working copy (pulling/cloning repos as needed), and when changes are
detected will (by default) copy things over into a snapshot directory (under `ct-snapshots/`). Browser-based testing
will load files from under that directory, and builds will be done there also. This snapshot will never change SHAs or
contents (besides the builds and being deleted when it is not needed).

Continuous testing on bayes.colorado.edu has all of our repositories checked out
at `/data/share/phet/continuous-testing`. Everything under this directory is served via HTTPS
at https://bayes.colorado.edu/continuous-testing/. Requests to the server are made
to https://bayes.colorado.edu/aquaserver/* (internal API) which is redirected to the port 45366 internally to our server
process.

The server will have a certain number of locally running loops, doing build/lint tasks for tests. This is specified with
a command-line flag when starting (currently we're using 8 concurrent builds/lints on bayes.colorado.edu).

It also saves state information in `aqua/.continuous-testing-state.json`, so on relaunches it won't lose data. This will
need to be wiped when the internal server formats change.

## pm2 on bayes.colorado.edu

So far, we've used pm2 (https://github.com/Unitech/pm2) to handle running the server process (handling automatic
restarting, logging, etc.).

Typically, you can run `pm2 list` to display the running processes, and it will display something like:

```
┌───────────────────┬────┬──────┬───────┬────────┬─────────┬────────┬─────┬───────────┬──────────┐
│ App name          │ id │ mode │ pid   │ status │ restart │ uptime │ cpu │ mem       │ watching │
├───────────────────┼────┼──────┼───────┼────────┼─────────┼────────┼─────┼───────────┼──────────┤
│ continuous-server │ 0  │ fork │ 90467 │ online │ 0       │ 18m    │ 0%  │ 67.1 MB   │ disabled │
└───────────────────┴────┴──────┴───────┴────────┴─────────┴────────┴─────┴───────────┴──────────┘
 Use `pm2 show <id|name>` to get more details about an app
```

`pm2 start continuous-server` and `pm2 stop continuous-server` will start and stop the process. Be patient after
starting CT; it make take 15 minutes for data to appear at https://bayes.colorado.edu/continuous-testing.

`pm2 logs` will show recent log lines (stored in files), and will show a stream of logs from that point on (exit with
CTRL-C). `pm2 logs` should be used to diagnose any issues with the server process.

Sometimes on a system reboot, pm2 will forget about everything (we may need to set it up differently, or use an
alternative). In that case:

```sh
pm2 list # see if it is started, and also starts the pm2 daemon if it wasn't running
cd /data/share/phet/continuous-testing/aqua
pm2 start grunt --name=continuous-server --time -- continuous-server --localCount=8 # starts the process, and adds it to the list seen in pm2 list
```

It may not remember GitHub credentials across reboots also, so if the following error message happens (or similar):

```
0|continuo | 2018-01-03T21:27:19.236Z [ERROR] Failure to check remote circuit-construction-ios-app SHA:
0|continuo |
0|continuo | fatal: could not read Username for 'https://github.com': No such device or address
```

then `cd` into a private repo directory, `git pull`, and put in the phet-dev credentials (username: phet-dev, password
is in the PhET credentials document for "GitHub Machine User"). The credential helper should then remember the password
for future pulls.

**Do the same thing for the quick server!**

```sh
pm2 list # see if it is started, and also starts the pm2 daemon if it wasn't running
cd /data/share/phet/continuous-quick-server/aqua
pm2 start "grunt quick-server" --name "continuous-quick-server" --time
```

## Updating the bayes server code

Test locally for server changes, and push when ready. Notify the team on slack#dev-public

1. Shut down the server (`pm2 stop continuous-server`)
2. If the save-file format has changed, or state needs to be wiped, remove the save
   file (`rm /data/share/phet/continuous-testing/aqua/.continuous-testing-state.json`). This generally won't be needed.
3. `git pull` under aqua (`/data/share/phet/continuous-testing/aqua`)
4. Start the server (`pm2 start continuous-server`)
5. Check the logs (`pm2 logs continuous-server`)

## Running locally

The documentation under `aqua/js/Gruntfile.js` specifies more details for running, but if you want to run some CT tests
locally (without the full server experience) it's best to use the `--useRootDir` flag (it will not copy files into
snapshots, but will use your working copy, creating only one "CT" column, and without saving state to disk).
The `--localCount` parameter is required, and specifies how many concurrent build/lint tasks should happen (which can be
zero).

For example, you can run:

```sh
grunt continuous-server --useRootDir --localCount=2
```

which will launch on the default port 45366.

Then, the report and loop interfaces can be given the query paramter `?server=http%3A%2F%2Flocalhost%3A45366` to specify
the server location (for API access). Depending on your local testing URL, the report interface then would
be http://localhost/aqua/html/continuous-unbuilt-report.html?server=http%3A%2F%2Flocalhost%3A45366 and browser-based
tests can be run with http://localhost/aqua/html/continuous-loop.html?server=http%3A%2F%2Flocalhost%3A45366&id=local (
more details are specified in the report and browser sections).

# Testing loop

Browsers should be pointed to `aqua/html/continuous-loop.html` to test for any continuous server. For the main bayes CT,
this will be https://bayes.colorado.edu/continuous-testing/aqua/html/continuous-loop.html. It will continuously request
tests from the server, run them, and report back results in a loop. It should still work while the server is down, and
will "reconnect" once the server comes back up. This will do things like fuzz sims, run unit tests, check page loads,
etc.

It's important to note the REQUIRED query parameter `id`, which should be provided to identify what browser is doing the
testing. This will be shown in error reports, and can help track what computer/os/browser were used for specific
failures.

It can take a `server` query parameter, which determines where API requests should be made. This isn't needed for bayes'
testing.

# Chrome processes (bayes testing loop)

Since we don't have actual devices set up and running tests, we have a semi-sufficient solution of running headless
Chrome processes server-side. I'll typically run 9 processes or so (running too much more actually taxes things too
much, and can cause "failed to load in time" errors and such).

I'll typically have 9 screens (see https://www.gnu.org/software/screen/manual/screen.html) open, so I can get console
output and restart things. Rebooting resets everything.

To create a screen with a name (and enter it):

```sh
screen -S {{NAME}}
```

or if the screen already exists

```sh
screen -r {{NAME}}
```

to resume it.

To exit a screen, CTRL-A then CTRL-D (it will stay running in the background).

So typically to start things up, I'll `screen -S chrome-1` (chrome-1 through chrome-9) to create the screen, and then in
it run:

```sh
cd /data/share/phet/continuous-testing/aqua/scripts
./bayes-chrome.sh {{NUMBER}}
```

and exit (leaving it still running). Replace `{{NUMBER}}` with the number 1 through 9 (whichever session it is).

If I need to come back and inspect the chrome instance (see if it is erroring out, etc.), `screen -r chrome-1` will
re-enter the screen.

This process should leave 9 chrome processes (think more like processes per tab, running under potentially one main
Chrome process) constantly running tests from the server.

# Report interface

The main interface is available at https://bayes.colorado.edu/continuous-testing/aqua/html/continuous-report.html. It
will send API requests `https://bayes.colorado.edu/aquaserver/*` (which on the server will be mapped to the port 45366,
to our running node server process).

The reports can also be directed to point to any server API with the `?server` query parameter,
e.g. `?server=http%3A%2F%2Flocalhost%3A45366` to point to a CT server running locally with the default port.

There are two ways of running the report interface from any location: `continuous-report.html` (which uses a built form
of aqua), and `continuous-unbuilt-report.html` (which loads the aqua interface with modules, and should be used while
developing the interface).

## Updating the interface on bayes

Notify the team on slack#dev-public

To move interface changes to bayes, you'll want to go to the aqua directory for
CT (`/data/share/phet/continuous-testing/aqua`), pull (since it will not pull aqua during its testing loop), and
run `grunt`. This will build the interface under `aqua/build` which is used by `continuous-report.html`.

# Local testing

## Running the server locally

The serve is set up to run locally via a grunt task. It can be a bit heavy-weight, but is available for testing. It is
HIGHLY recommended that you run with `--useRootDir` so that CT doesn't make another entire copy of your github checkout
before testing on it. See all options and details in `js/Gruntfile`.

## Running the report locally

Both [continuous-report.html](../html/continuous-report.html) (built version)
and [continuous-unbuilt-report.html](../html/continuous-unbuilt-report.html) are available for running locally. the unbuilt
report can be run with just a transpile step, which is helpful when making changes to `js/report/report.js`. Run with a 
URL like this for fast iteration: `

http://localhost:8080/aqua/html/continuous-unbuilt-report.html?server=https://bayes.colorado.edu/&maxColumns=5`.

Note how the URL supports retreiving the same data from bayes, so you don't HAVE to have a local server running to iterate
on the front end.

The report is built as a "standalone" repo with `grunt`;

# Server Debugging

Usually, inspect `pm2 logs` to see if something is going on. If it's scrolled past an error, you can tail the actual
file that the logs stream to. Typically it might be a missing repo, a private repo that it can't resolve, or sometimes
you'll need to re-clone a repo if there was a history-changing operation. (Since bayes is constantly pulling, if someone
pushes a history change and then reverts it or something like that, a `git pull` won't work and recloning will be
necessary).

Because pm2 stores logs under `/home/phet-admin/.pm2/logs`, it's filled up the partition for `/home` before. We've
increased the size for that, but it may be an issue in the future.

We'll add any future ways of fixing things as we run across them here.

# Troubleshooting

## Tests not finishing? 

Cells are partially green instead of fully green?  Perhaps try `pm2 restart continuous-client` as described in https://github.com/phetsims/aqua/issues/158 