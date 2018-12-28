
# How to manage Continuous Testing (CT) service

_Everything in this document is intended to be run on bayes.colorado.edu while logged in as user phet-admin._

There are currently two separate pieces that need to run for it to behave as expected: the server, and Chrome processes doing browser tests.

# The server

Continuous testing has all of our repositories checked out at `/data/share/phet/continuous-testing`. Everything under this directory is served via HTTPS at https://bayes.colorado.edu/continuous-testing/. The server, when running, will be continually pulling every repository (with the exception of aqua itself, which it will leave on the same SHA, so that it doesn't automatically start running new continuous server code). In addition to these repositories, the `continuous-testing` directory also contains snapshot directories, e.g. `snapshot-1514489753139` and `snapshot-1514489753139-phet-io` that contain full copies of all of our repositories. All browser-based testing will load files from under a snapshot's directory, and a snapshot directory will never change SHAs or contents (besides what is built during tests).

The main server code is contained in `aqua/js/continuous-server.js`. So far, we've used pm2 (https://github.com/Unitech/pm2) to handle running the server process (handling automatic restarting, logging, etc.).

Typically, you can run `pm2 list` to display the running processes, and it will display something like:
```
┌───────────────────┬────┬──────┬───────┬────────┬─────────┬────────┬─────┬───────────┬──────────┐
│ App name          │ id │ mode │ pid   │ status │ restart │ uptime │ cpu │ mem       │ watching │
├───────────────────┼────┼──────┼───────┼────────┼─────────┼────────┼─────┼───────────┼──────────┤
│ continuous-server │ 0  │ fork │ 90467 │ online │ 0       │ 18m    │ 0%  │ 67.1 MB   │ disabled │
└───────────────────┴────┴──────┴───────┴────────┴─────────┴────────┴─────┴───────────┴──────────┘
 Use `pm2 show <id|name>` to get more details about an app
```

`pm2 start continuous-server` and `pm2 stop continuous-server` will start and stop the process. Be patient after starting CT; it make take 15 minutes for data to appear at https://bayes.colorado.edu/continuous-testing.

`pm2 logs` will show recent log lines (stored in files), and will show a stream of logs from that point on (exit with CTRL-C). `pm2 logs` should be used to diagnose any issues with the server process.

Sometimes on a system reboot, pm2 will forget about everything (we may need to set it up differently, or use an alternative). In that case:
```sh
pm2 list # see if it is started, and also starts the pm2 daemon if it wasn't running
cd /data/share/phet/continuous-testing/aqua
pm2 start js/continuous-server.js # starts the process, and adds it to the list seen in pm2 list
```

It may not remember GitHub credentials across reboots also, so if the following error message happens (or similar):
```
0|continuo | 2018-01-03T21:27:19.236Z [ERROR] Failure to check remote circuit-construction-ios-app SHA:
0|continuo |
0|continuo | fatal: could not read Username for 'https://github.com': No such device or address
```
then `cd` into a private repo directory, `git pull`, and put in the phet-dev credentials (username: phet-dev, password is in the PhET credentials document for "GitHub Machine User"). The credential helper should then remember the password for future pulls.

Additionally, if the server crashes, it currently doesn't clear the snapshot directories that it was using. Currently if I restart the server, I'll typically wipe `/data/share/phet/continuous-testing/snapshot-1*` so that we won't run out of disk space. Can be skipped for a while if restarting a lot. Also should hopefully be improved in the future if we continue to run into this.

# Chrome processes

To test in-browser things (like fuzzing sims or unit tests), the server provides a page at https://bayes.colorado.edu/continuous-testing/aqua/html/continuous-loop.html that will continuously request tests from the server, run them, and report back results in a loop. It should still work while the server is down, and will "reconnect" once the server comes back up. It takes a query parameter `id` that will be shown with the testing results.

Since we still don't have actual devices set up and running tests, we have a semi-sufficient solution of running headless Chrome processes server-side. I'll typically run 9 processes or so (running too much more actually taxes things too much, and can cause "failed to load in time" errors and such).

I'll typically have 9 screens (see https://www.gnu.org/software/screen/manual/screen.html) open, so I can get console output and restart things. Rebooting resets everything.

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

So typically to start things up, I'll `screen -S chrome-1` (chrome-1 through chrome-9) to create the screen, and then in it run:
```sh
cd /data/share/phet/continuous-testing/aqua/scripts
./bayes-chrome.sh {{NUMBER}}
```
and exit (leaving it still running). Replace `{{NUMBER}}` with the number 1 through 9 (whichever session it is).

If I need to come back and inspect the chrome instance (see if it is erroring out, etc.), `screen -r chrome-1` will re-enter the screen.

This process should leave 9 chrome processes (think more like processes per tab, running under potentially one main Chrome process) constantly running tests from the server.

# Debugging

Usually, inspect `pm2 logs` to see if something is going on. If it's scrolled past an error, you can tail the actual file that the logs stream to. Typically it might be a missing repo, a private repo that it can't resolve, or sometimes you'll need to re-clone a repo if there was a history-changing operation. (Since bayes is constantly pulling, if someone pushes a history change and then reverts it or something like that, a `git pull` won't work and recloning will be necessary).

Because pm2 stores logs under `/home/phet-admin/.pm2/logs`, it's filled up the partition for `/home` before. We've increased the size for that, but it may be an issue in the future.

We'll add any future ways of fixing things as we run across them here.

# Pulling aqua

Follow these steps to pull changes to aqua, which are not automatically pulled (see above).

1. Notify the team on slack#dev-public that you will be restarting Bayes CT
2. Log in to bayes.colorado.edu as phet-admin, requires VPN.
3. `cd /data/share/phet/continuous-testing/aqua`
4. `pm2 stop continuous-server`
5. `git pull`
6. `pm2 start continuous-server`