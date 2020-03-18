// Copyright 2017-2020, University of Colorado Boulder

/**
 * Continuous testing server-side code. Has three responsibilities:
 *
 * 1. Loop checking whether newer SHAs are available upstream. When a newer SHA is detected, a "stale" flag is set, and repos are pulled. It
 *    continues looping until ALL repos are up-to-date (to ensure we catch all pushes if many repos are being pushed to), then creates a snapshot.
 *    A snapshot is a full copy of all repository contents at specific SHAs, that can be tested from without being updated.
 * 2. Build the latest snapshot with multiple build threads. They look for any unbuilt repo from the last snapshot and built it (so we can get lint
 *    results and test the built sims).
 * 3. A server on port 45366, which takes requests:
 *   - /next-test: returns a browser-based test (contains information on the snapshot, test, and URL), for consumption by continuous-loop.html
 *   - /test-result: accepts test results to be recorded (sent by continuous-loop.js)
 *   - /results: returns a summary of test results, for consumption by continuous-report.html
 *
 * {Test}s have the type: {
 *   count: {number} - Number of times we've sent this test to a browser
 *   snapshotName: {string} - Name of a snapshot (see {Snapshot}).
 *   test: {Array.<string>} - The 'path' of the test, e.g. [ 'build-a-molecule', 'fuzz', 'require.js' ]
 *   url: {string} - The url to load in an iframe to execute this test.
 *   old: [{boolean}] - Whether this test can be run on "older" browsers without full ES6 support or compilation
 * }
 *
 * {Snapshot}s have the type: {
 *   name: {string} - e.g. 'snapshot-1483546457349'
 *   exists: {boolean} - Whether it exists on disk
 *   timestamp: {number} - Epoch milliseconds
 *   testQueue: {Array.<Test>} - Available browser tests. Can be appended to (For example, when the build finishes)
 *   buildStatus: {Object} - Keys are repo names, undefined means available to be built. Otherwise it's 'building' or 'built' depending on status
 *   repos: {Array.<string>} - All repository names in active-repos for this snapshot
 *   runnableRepos: {Array.<string>} - All runnable repositories in active-runnables for this snapshot
 *   buildables: {Array.<{repo:{string},phetio:{boolean}}>} - Anything we can 'grunt' with normal behavior, typically runnables + scenery/kite/dot
 * }
 *
 * {TestResult}s have the type: {
 *   passed: {boolean} - Whether the test passed
 *   snapshotName: {string} - See {Snapshot}
 *   snapshotTimestamp: {number} - See {Snapshot}
 *   message: {string} - Message unique to this TestResult
 * }
 *
 * {Results} have the type: {
 *   children: {Array.<Results>} - We have a tree-like structure
 *   results: {Array.<TestResult>} - The results of tests for this particular entry.
 * }
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

'use strict';

const child_process = require( 'child_process' );
const fs = require( 'fs' );
const http = require( 'http' );
const ncp = require( 'ncp' ).ncp; // eslint-disable-line
const path = require( 'path' );
const rimraf = require( 'rimraf' );
const url = require( 'url' );

const port = 45366;

// constants
const IS_WIN = /^win/.test( process.platform );
const GIT_CMD = 'git';
const GRUNT_CMD = IS_WIN ? 'grunt.cmd' : 'grunt'; // needs to be a slightly different command for Windows
const NPM_CMD = IS_WIN ? 'npm.cmd' : 'npm'; // needs to be a slightly different command for Windows
const CLONE_MISSING_CMD = './perennial/bin/clone-missing-repos.sh';
const NUMBER_OF_DAYS_TO_KEEP_SNAPSHOTS = 2; // in days, any shapshots that are older will be removed from the continuous report

// Gets update with the current status
let snapshotStatus = 'Starting up';

function setSnapshotStatus( str ) {
  snapshotStatus = '[' + new Date().toLocaleString().replace( /^.*, /g, '' ).replace( ' AM', 'am' ).replace( ' PM', 'pm' ) + '] ' + str;
}

// To improve log visibility
const ANSI_RED = '\x1b[31m';
const ANSI_GREEN = '\x1b[32m';
const ANSI_RESET = '\x1b[0m';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

// root of your GitHub working copy, relative to the name of the directory that the currently-executing script resides in
const rootDir = path.normalize( __dirname + '/../../' ); // eslint-disable-line no-undef

/**
 * Logs a 'DEBUG' line, so we can filter these out later.
 * @private
 *
 * @param {string} str
 */
function debugLog( str ) {
  // const line = '[DEBUG] ' + str;
  // console.log( new Date().toISOString() + ' ' + line );
}

/**
 * Logs a 'INFO' line, so we can filter these out later.
 * @private
 *
 * @param {string} str
 */
function infoLog( str ) {
  const line = '[INFO] ' + str;
  console.log( new Date().toISOString() + ' ' + ANSI_GREEN + line + ANSI_RESET );
}

/**
 * Logs a 'ERROR' line, so we can filter these out later.
 * @private
 *
 * @param {string} str
 */
function errorLog( str ) {
  const line = '[ERROR] ' + str;
  console.log( new Date().toISOString() + ' ' + ANSI_RED + line + ANSI_RESET );
}

/**
 * Asynchronous for-each, iterates through the items and applies the function. Assumes callback is called with no arguments.
 * @private
 *
 * @param {Array.<*>} items - Things that get passed to apply's first param
 * @param {Function} apply - apply( item: {*}, callback: {Function}, errorCallback: {Function} )
 * @param {Function} callback - callback()
 * @param {Function} errorCallback - errorCallback( message: {string} )
 */
function forEachCallback( items, apply, callback, errorCallback ) {
  const localItems = items.slice();

  function cycle() {
    if ( localItems.length ) {
      apply( localItems.shift(), cycle, errorCallback );
    }
    else {
      callback();
    }
  }

  cycle();
}

/**
 * Asynchronous for-each, iterates through the items and applies the function. Assumes callback is called with no arguments.
 * @private
 *
 * Executes in parallel.
 *
 * @param {number} maxConcurrent - THe maximum number of concurrent tasts here that should execute.
 * @param {Array.<*>} items - Things that get passed to apply's first param
 * @param {Function} apply - apply( item: {*}, callback: {Function}, errorCallback: {Function} )
 * @param {Function} callback - callback()
 * @param {Function} errorCallback - errorCallback( message: {string} )
 */
function forEachCallbackParallel( maxConcurrent, items, apply, callback, errorCallback ) {
  const localItems = items.slice();

  const expectedCount = localItems.length;
  let count = 0;
  let errored = false;

  function localCallback() {
    if ( ++count === expectedCount ) {
      callback();
    }
    else if ( !errored ) {
      launch();
    }
  }

  function localError( message ) {
    if ( !errored ) {
      errored = true;
      errorCallback( message );
    }
  }

  function launch() {
    if ( localItems.length ) {
      apply( localItems.shift(), localCallback, localError );
    }
  }

  for ( let i = 0; i < Math.min( expectedCount, maxConcurrent ); i++ ) {
    launch();
  }
}

/**
 * Asynchronous filter, iterates through the items and applies the predicate (filtering the array). Calls callback with the array of items that the predicate
 * returned true for.
 * @private
 *
 * @param {Array.<*>} items - Things that get passed to predicate's first param
 * @param {Function} predicate - predicate( item: {*}, callback: {Function}, errorCallback: {Function} )
 * @param {Function} callback - callback( items: {Array.<*>} )
 * @param {Function} errorCallback - errorCallback( message: {string} )
 */
function filterCallback( items, predicate, callback, errorCallback ) {
  const result = [];
  const localItems = items.slice();

  function cycle() {
    if ( localItems.length ) {
      const item = localItems.shift();
      predicate( item, function( included ) {
        if ( included ) {
          result.push( item );
        }
        cycle();
      }, errorCallback );
    }
    else {
      callback( result );
    }
  }

  cycle();
}

/**
 * Executes a command, with specific arguments and in a specific directory (cwd). When it is completed successfully
 * (exit code of the process was 0), the callback will be called.
 * @private
 *
 * If the command fails (exit code non-zero), the error override callback will be called.
 *
 * @param {string} cmd - The process to execute. Should be on the current path.
 * @param {Array.<string>} args - Array of arguments. No need to extra-quote things.
 * @param {string} cwd - The working directory where the process should be run from
 * @param {Function} callback - callback( stdout: {string}, stderr: {string} ), called when successful
 * @param {Function} errorCallback - errorCallback( stdout: {string}, stderr: {string}, code: {number} ) called when unsuccessful
 */
function execute( cmd, args, cwd, callback, errorCallback ) {
  const process = child_process.spawn( cmd, args, {
    cwd: cwd
  } );
  debugLog( 'running ' + cmd + ' ' + args.join( ' ' ) + ' in ' + cwd );

  // Will be appended
  let stdoutData = '';
  let stderrData = '';

  process.stderr.on( 'data', function( data ) {
    stderrData += data;
    debugLog( 'stderr: ' + data );
  } );
  process.stdout.on( 'data', function( data ) {
    stdoutData += data;
    debugLog( 'stdout: ' + data );
  } );

  process.on( 'close', function( code ) {
    if ( code !== 0 ) {
      errorCallback( stdoutData, stderrData, code );
    }
    else {
      callback( stdoutData, stderrData );
    }
  } );
}

/**
 * Asynchronously gets a list of all repo names.
 * @private
 *
 * @param {Function} callback - callback( repos: {Array.<string>} ), called when successful
 * @param {Function} errorCallback - errorCallback( message: {string} ) called when unsuccessful
 */
function getRepos( callback, errorCallback ) {
  fs.readFile( rootDir + '/perennial/data/active-repos', 'utf8', function( err, data ) {
    if ( err ) {
      errorCallback( 'Could not open active-repos: ' + err );
    }
    else {
      callback( data.trim().replace( /\r/g, '' ).split( '\n' ) );
    }
  } );
}

/**
 * Asynchronously gets a list of runnable repo names.
 * @private
 *
 * @param {Function} callback - callback( repos: {Array.<string>} ), called when successful
 * @param {Function} errorCallback - errorCallback( message: {string} ) called when unsuccessful
 */
function getRunnableRepos( callback, errorCallback ) {
  fs.readFile( rootDir + '/perennial/data/testable-runnables', 'utf8', function( err, data ) {
    if ( err ) {
      errorCallback( 'Could not open active-runnables: ' + err );
    }
    else {
      callback( data.trim().replace( /\r/g, '' ).split( '\n' ) );
    }
  } );
}

/**
 * Asynchronously gets a list of phet-io sim repo names
 * @private
 *
 * @param {Function} callback - callback( repos: {Array.<string>} ), called when successful
 * @param {Function} errorCallback - errorCallback( message: {string} ) called when unsuccessful
 */
function getPhetioRepos( callback, errorCallback ) {
  fs.readFile( rootDir + '/perennial/data/testable-phet-io', 'utf8', function( err, data ) {
    if ( err ) {
      errorCallback( 'Could not open phet-io: ' + err );
    }
    else {
      callback( data.trim().replace( /\r/g, '' ).split( '\n' ) );
    }
  } );
}

/**
 * Asynchronously gets a list of phet-io sim repo names
 * @private
 *
 * @param {Function} callback - callback( repos: {Array.<string>} ), called when successful
 * @param {Function} errorCallback - errorCallback( message: {string} ) called when unsuccessful
 */
function getPhetioReposValidated( callback, errorCallback ) {
  fs.readFile( rootDir + '/perennial/data/testable-phet-io-validated', 'utf8', function( err, data ) {
    if ( err ) {
      errorCallback( 'Could not open phet-io: ' + err );
    }
    else {
      callback( data.trim().replace( /\r/g, '' ).split( '\n' ) );
    }
  } );
}

/**
 * Asynchronously gets a list of accessible sim repo names
 * @private
 *
 * @param {Function} callback - callback( repos: {Array.<string>} ), called when successful
 * @param {Function} errorCallback - errorCallback( message: {string} ) called when unsuccessful
 */
function getInteractiveDescriptionsRepos( callback, errorCallback ) {
  fs.readFile( rootDir + '/perennial/data/interactive-descriptions', 'utf8', function( err, data ) {
    if ( err ) {
      errorCallback( 'Could not open interactive-descriptions: ' + err );
    }
    else {
      callback( data.trim().replace( /\r/g, '' ).split( '\n' ) );
    }
  } );
}

/**
 * Asynchronously checks whether a repo is not up-to-date with origin/master
 * @private
 *
 * @param {string} repo - Repo name
 * @param {Function} callback - callback( isStale: {boolean} ), called when successful
 * @param {Function} errorCallback - errorCallback( message: {string} ) called when unsuccessful
 */
function isRepoStale( repo, callback, errorCallback ) {
  if ( repo === 'aqua' ) {
    callback( false );
  }
  else {
    execute( GIT_CMD, [ 'rev-parse', 'master' ], rootDir + '/' + repo, function( stdout, stderr ) {
      const currentSHA = stdout.trim();
      if ( currentSHA.length === 40 ) {
        execute( GIT_CMD, [ 'ls-remote', 'https://github.com/phetsims/' + repo + '.git', 'refs/heads/master' ], rootDir + '/' + repo, function( stdout, stderr ) {
          const remoteSHA = stdout.slice( 0, stdout.indexOf( '\t' ) );
          if ( remoteSHA.length === 40 ) {
            debugLog( 'SHAs equal: ' + ( currentSHA === remoteSHA ) );
            const isStale = currentSHA !== remoteSHA;
            if ( isStale ) {
              infoLog( repo + ' stale' );
            }
            callback( isStale );
          }
          else {
            errorCallback( 'Does not look like remote ' + repo + ' SHA: ' + remoteSHA );
          }
        }, function( stdout, stderr, code ) {
          errorCallback( 'Failure to check remote ' + repo + ' SHA:\n' + stdout + '\n' + stderr );
        } );
      }
      else {
        errorCallback( 'Does not look like current ' + repo + ' SHA: ' + currentSHA );
      }
    }, function( stdout, stderr, code ) {
      errorCallback( 'Failure to check current ' + repo + ' SHA:\n' + stdout + '\n' + stderr );
    } );
  }
}

/**
 * Asynchronously checks whether a repo should have node modules (and thus npm updates)
 * @private
 *
 * @param {string} repo - Repo name
 * @param {Function} callback - callback( isStale: {boolean} ), called when successful
 * @param {Function} errorCallback - errorCallback( message: {string} ) called when unsuccessful
 */
function doesRepoHaveNodeModules( repo, callback, errorCallback ) {
  fs.access( rootDir + '/' + repo + '/package.json', function( err ) {
    callback( !err );
  } );
}

/**
 * Asynchronously updates node modules for a repo.
 * @private
 *
 * Make to handle parallel npm updates.
 *
 * @param {Object} repoInfo - { base: {string}, repo: {string} }
 * @param {Function} callback - callback(), called when successful
 * @param {Function} errorCallback - errorCallback( message: {string} ) called when unsuccessful
 */
function npmUpdateRepoInfo( repoInfo, callback, errorCallback ) {
  const dir = repoInfo.base + '/' + repoInfo.repo;
  fs.access( dir, function( err ) {
    if ( err ) {
      errorCallback( 'Could not access directory for npm update: ' + dir );
    }
    else {
      execute( NPM_CMD, [ 'update', '--cache=../npm-caches/' + repoInfo.repo, '--tmp=../npm-tmp' ], repoInfo.base + '/' + repoInfo.repo, function( stdout, stderr ) {
        callback();
      }, function( stdout, stderr, code ) {
        errorCallback( 'Failure to npm update ' + repoInfo.base + '/' + repoInfo.repo + ':\n' + stdout + '\n' + stderr );
      } );
    }
  } );
}

/**
 * Asynchronously builds a repo
 * @private
 *
 * @param {string} repo - Repository name to grunt
 * @param {Array.<string>} parameters - Parameters passed to grunt
 * @param {Function} callback - callback(), called when successful
 * @param {Function} errorCallback - errorCallback( message: {string} ) called when unsuccessful
 */
function gruntRepo( repo, parameters, callback, errorCallback ) {
  execute( GRUNT_CMD, parameters, rootDir + '/' + repo, function( stdout, stderr ) {
    callback();
  }, function( stdout, stderr, code ) {
    errorCallback( 'Failure to grunt ' + repo + ':\n' + stdout + '\n' + stderr );
  } );
}

/**
 * Asynchronously lints everything
 * @private
 *
 * @param {Snapshot} snapshot - The snapshot to grunt lint-everything
 * @param {Function} callback - callback(), called when successful
 * @param {Function} errorCallback - errorCallback( message: {string} ) called when unsuccessful
 */
function lintEverything( snapshot, callback, errorCallback ) {
  execute( GRUNT_CMD, [ 'lint-everything' ], rootDir + '/' + snapshot.name + '/perennial', function( stdout, stderr ) {
    callback();
  }, function( stdout, stderr, code ) {
    errorCallback( 'Failure to lint everything:\n' + stdout + '\n' + stderr );
  } );
}

// Kicks off linting of everything
function testLintEverything( snapshot, callback ) {
  lintEverything( snapshot, function() {
    testPass( snapshot, [ 'perennial', 'lint-everything' ] );
    infoLog( 'lint-everything passed: ' + snapshot.name );
    callback();
  }, function( message ) {
    testFail( snapshot, [ 'perennial', 'lint-everything' ], message );
    infoLog( 'lint-everything failed: ' + snapshot.name );
    callback();
  } );
}

/**
 * Asynchronously "npm update" all repos that have a package.json
 * @private
 *
 * @param {string} baseDir - The base directory for where all repos should be npm updated
 * @param {Function} callback - callback(), called when successful
 * @param {Function} errorCallback - errorCallback( message: {string} ) called when unsuccessful
 */
function npmUpdateRoot( baseDir, callback, errorCallback ) {
  getRepos( function( repos ) {
    filterCallback( repos, doesRepoHaveNodeModules, function( nodeRepos ) {
      const nodeDirectories = nodeRepos.map( function( repo ) {
        return {
          base: baseDir,
          repo: repo
        };
      } );
      forEachCallbackParallel( 4, nodeDirectories, npmUpdateRepoInfo, callback, errorCallback );
    }, errorCallback );
  }, errorCallback );
}

/**
 * Asynchronously gets a list of all repo names for out-of-date repos.
 * @private
 *
 * @param {Function} callback - callback( repos: {Array.<string>} ), called when successful
 * @param {Function} errorCallback - errorCallback( message: {string} ) called when unsuccessful
 */
function getStaleRepos( callback, errorCallback ) {
  getRepos( function( repos ) {
    filterCallback( repos, isRepoStale, callback, errorCallback );
  }, errorCallback );
}

/**
 * Asynchronously pulls a repository.
 * @private
 *
 * @param {string} repo - Repository name to pull
 * @param {Function} callback - callback(), called when successful
 * @param {Function} errorCallback - errorCallback( message: {string} ) called when unsuccessful
 */
function pullRepo( repo, callback, errorCallback ) {
  execute( GIT_CMD, [ 'pull' ], rootDir + '/' + repo, function( stdout, stderr ) {
    callback();
  }, function( stdout, stderr, code ) {
    errorCallback( 'Failure to pull ' + repo + ':\n' + stdout + '\n' + stderr );
  } );
}

function pullRepos( repos, callback, errorCallback ) {
  forEachCallback( repos, pullRepo, callback, errorCallback );
}

/**
 * Asynchronously clones any missing repositories.
 * @private
 *
 * @param {Function} callback - callback( stdout, stderr ), called when successful
 * @param {Function} errorCallback - errorCallback( message: {string} ) called when unsuccessful
 */
function cloneMissingRepos( callback, errorCallback ) {
  debugLog( 'Cloning missing repos' );

  execute( CLONE_MISSING_CMD, [], rootDir, callback, errorCallback );
}

/**
 * Asynchronously copies a repo to a location.
 * @private
 *
 * @param {string} repo
 * @param {string} location - Location for the copy
 * @param {Function} callback - callback(), called when successful
 * @param {Function} errorCallback - errorCallback( message: {string} ) called when unsuccessful
 */
function copyRepoToLocation( repo, location, callback, errorCallback ) {
  debugLog( 'copying ' + repo + ' into ' + location );

  // Copy each directory, skipping node_modules
  ncp( rootDir + '/' + repo, location, {
    filter: function( path ) {
      return path.indexOf( 'node_modules' ) < 0;
    }
  }, function( err ) {
    if ( err ) {
      errorCallback( 'ncp error: ' + err );
    }
    else {
      callback();
    }
  } );
}

function copyReposToSnapshot( repos, snapshotName, callback, errorCallback ) {
  forEachCallback( repos, function( repo, nextCallback, nextErrorCallback ) {
    copyRepoToLocation( repo, rootDir + '/' + snapshotName + '/' + repo, nextCallback, nextErrorCallback );
  }, function() {
    forEachCallback( repos, function( repo, nextCallback, nextErrorCallback ) {
      copyRepoToLocation( repo, rootDir + '/' + snapshotName + '-phet-io/' + repo, nextCallback, nextErrorCallback );
    }, callback, errorCallback );
  }, errorCallback );
}

/**
 * Creates a snapshot object.
 * @private
 *
 * @param {Function} callback - callback( snapshot ), called when successful
 * @param {Function} errorCallback - errorCallback( message: {string} ) called when unsuccessful
 * @returns {Snapshot} snapshot
 */
function createSnapshot( callback, errorCallback ) {
  const timestamp = Date.now();
  const snapshotName = 'snapshot-' + timestamp;
  const snapshot = {
    name: snapshotName,
    exists: true,
    timestamp: timestamp,
    testQueue: [], // Filled in later, and can be appended to
    buildStatus: {
      // Filled in by build handling
    },
    repos: [], // Filled in later
    runnableRepos: [], // Filled in later
    buildables: [] // Filled in later
  };
  infoLog( 'Creating snapshot ' + snapshotName );
  setSnapshotStatus( 'Initializing new snapshot' );
  fs.mkdir( rootDir + '/' + snapshotName, function( err ) {
    if ( err ) {
      errorCallback( 'Could not create snapshot dir ' + snapshotName + ': ' + err );
    }
    else {
      fs.mkdir( rootDir + '/' + snapshotName + '-phet-io', function( err ) {
        if ( err ) {
          errorCallback( 'Could not create phet-io snapshot dir ' + snapshotName + '-phet-io: ' + err );
        }
        else {
          // TODO: async/await https://github.com/phetsims/aqua/issues/68
          getRepos( function( repos ) {
            snapshot.repos = repos;
            getPhetioRepos( function( phetioRepos ) {
              snapshot.phetioRepos = phetioRepos;
              getPhetioReposValidated( function( phetioReposValidated ) {
                snapshot.phetioReposValidated = phetioReposValidated;
                getRunnableRepos( function( runnableRepos ) {
                  snapshot.runnableRepos = runnableRepos;
                  getInteractiveDescriptionsRepos( function( interactiveDescriptionRepos ) {
                    snapshot.interactiveDescriptionRepos = interactiveDescriptionRepos;

                    snapshot.buildables = runnableRepos.concat( 'scenery', 'kite', 'dot' ).map( function( repo ) {
                      return {
                        repo: repo,
                        phetio: false
                      };
                    } ).concat( phetioRepos.map( function( repo ) {
                      return {
                        repo: repo,
                        phetio: true
                      };
                    } ) );
                    setSnapshotStatus( 'Copying snapshot files' );
                    copyReposToSnapshot( repos, snapshotName, function() {
                      setSnapshotStatus( 'Running npm update for phet brand' );
                      npmUpdateRoot( rootDir + '/' + snapshotName, function() {
                        setSnapshotStatus( 'Running npm update for phet-io brand' );
                        npmUpdateRoot( rootDir + '/' + snapshotName + '-phet-io', function() {
                          // final snapshot prep

                          // Add require.js tests immediately
                          snapshot.runnableRepos.forEach( function( runnableRepo ) {
                            snapshot.testQueue.push( {
                              count: 0,
                              snapshotName: snapshotName,
                              test: [ runnableRepo, 'fuzz', 'require.js' ],
                              url: 'sim-test.html?url=' + encodeURIComponent( '../../' + snapshotName + '/' + runnableRepo + '/' + runnableRepo + '_en.html' ) + '&simQueryParameters=' + encodeURIComponent( 'brand=phet&ea&fuzz&memoryLimit=1000' )
                            } );
                            snapshot.testQueue.push( {
                              count: 0,
                              snapshotName: snapshotName,
                              test: [ runnableRepo, 'xss-fuzz' ],
                              url: 'sim-test.html?url=' + encodeURIComponent( '../../' + snapshotName + '/' + runnableRepo + '/' + runnableRepo + '_en.html' ) + '&simQueryParameters=' + encodeURIComponent( 'brand=phet&ea&fuzz&stringTest=xss&memoryLimit=1000' )
                            } );
                          } );

                          // phet-io brand tests
                          snapshot.phetioRepos.forEach( function( phetioRepo ) {
                            const validated = snapshot.phetioReposValidated.indexOf( phetioRepo ) >= 0;
                            const validatedParam = validated ? '&phetioValidateTandems' : '';
                            snapshot.testQueue.push( {
                              count: 0,
                              snapshotName: snapshotName,
                              test: [ phetioRepo, 'phet-io-fuzz', 'require.js' ],
                              url: 'sim-test.html?url=' + encodeURIComponent( '../../' + snapshotName + '/' + phetioRepo + '/' + phetioRepo + '_en.html' ) +
                                   '&simQueryParameters=' + encodeURIComponent( 'brand=phet-io&phetioStandalone&ea' + validatedParam + '&fuzz&memoryLimit=1000' )
                            } );

                            // fuzz test important wrappers
                            snapshot.testQueue.push( {
                              count: 0,
                              snapshotName: snapshotName,
                              test: [ phetioRepo, 'phet-io-studio-fuzz', 'require.js' ],
                              url: 'sim-test.html?url=' + encodeURIComponent( `../../${snapshotName}/studio/?sim=${phetioRepo}&phetioDebug&fuzz&postMessageToParent` )
                            } );
                            snapshot.testQueue.push( {
                              count: 0,
                              snapshotName: snapshotName,
                              test: [ phetioRepo, 'phet-io-state-fuzz', 'require.js' ],
                              url: 'sim-test.html?url=' + encodeURIComponent( `../../${snapshotName}/phet-io-wrappers/state/?sim=${phetioRepo}&phetioDebug&fuzz&postMessageToParent` )
                            } );
                            snapshot.testQueue.push( {
                              count: 0,
                              snapshotName: snapshotName,
                              test: [ phetioRepo, 'phet-io-mirror-inputs-fuzz', 'require.js' ],
                              url: 'sim-test.html?url=' + encodeURIComponent( `../../${snapshotName}/phet-io-wrappers/mirror-inputs/?sim=${phetioRepo}&phetioDebug&fuzz&postMessageToParent` )
                            } );
                          } );

                          // accessible tests
                          snapshot.interactiveDescriptionRepos.forEach( interactiveDescriptionRepo => {
                            snapshot.testQueue.push( {
                              count: 0,
                              snapshotName: snapshotName,
                              test: [ interactiveDescriptionRepo, 'interactive-description-fuzz', 'require.js' ],
                              url: 'sim-test.html?url=' + encodeURIComponent( '../../' + snapshotName + '/' + interactiveDescriptionRepo + '/' + interactiveDescriptionRepo + '_en.html' ) + '&simQueryParameters=' + encodeURIComponent( 'brand=phet&ea&fuzz&supportsDescriptions&memoryLimit=1000' )
                            } );
                            snapshot.testQueue.push( {
                              count: 0,
                              snapshotName: snapshotName,
                              test: [ interactiveDescriptionRepo, 'interactive-description-fuzzBoard', 'require.js' ],
                              url: 'sim-test.html?url=' + encodeURIComponent( '../../' + snapshotName + '/' + interactiveDescriptionRepo + '/' + interactiveDescriptionRepo + '_en.html' ) + '&simQueryParameters=' + encodeURIComponent( 'brand=phet&ea&fuzzBoard&supportsDescriptions&memoryLimit=1000' )
                            } );
                          } );

                          // phet-io wrappers tests for each PhET-iO Sim
                          snapshot.phetioRepos.forEach( function( phetioRepo ) {
                            snapshot.testQueue.push( {
                              count: 0,
                              snapshotName: snapshotName,
                              test: [ phetioRepo, 'phet-io-tests', 'no-assert' ],

                              // Use the QUnit harness since errors are reported to QUnit
                              url: 'qunit-test.html?url=' + encodeURIComponent( '../../' + snapshotName + '/phet-io-wrappers/phet-io-wrappers-tests.html?sim=' + phetioRepo )
                            } );
                            snapshot.testQueue.push( {
                              count: 0,
                              snapshotName: snapshotName,
                              test: [ phetioRepo, 'phet-io-tests', 'assert' ],

                              // Use the QUnit harness since errors are reported to QUnit
                              url: 'qunit-test.html?url=' + encodeURIComponent( '../../' + snapshotName + '/phet-io-wrappers/phet-io-wrappers-tests.html?sim=' + phetioRepo + '&phetioDebug' )
                            } );
                          } );

                          // repo-specific Unit tests (require.js mode) from `grunt generate-test-harness`
                          [ 'axon', 'balloons-and-static-electricity', 'circuit-construction-kit-common', 'dot', 'kite', 'phetcommon', 'phet-core', 'query-string-machine', 'scenery', 'tandem' ].forEach( function( repo ) {

                            // All tests should work with no query parameters, with assertions enables and also in phet-io brand
                            [ '', '?ea', '?brand=phet-io', '?ea&brand=phet-io' ].forEach( function( queryString ) {
                              snapshot.testQueue.push( {
                                count: 0,
                                snapshotName: snapshotName,
                                test: [ repo, 'top-level-unit-tests', 'require.js' + queryString ],
                                url: 'qunit-test.html?url=' + encodeURIComponent( '../../' + snapshotName + '/' + repo + '/' + repo + '-tests.html' + queryString )
                              } );
                            } );
                          } );

                          // phet-io unit tests
                          [ '?brand=phet-io', '?ea&brand=phet-io' ].forEach( function( queryString ) {
                            snapshot.testQueue.push( {
                              count: 0,
                              snapshotName: snapshotName,
                              test: [ 'phet-io', 'top-level-unit-tests', 'require.js' + queryString ],
                              url: 'qunit-test.html?url=' + encodeURIComponent( '../../' + snapshotName + '/phet-io/phet-io-tests.html' + queryString )
                            } );
                          } );

                          // Kick off linting everything once we have a new snapshot
                          testLintEverything( snapshot, function() {
                            // If we have anything else that we want to grunt in chipper, put it here
                          } );

                          // Page-load tests
                          [
                            {
                              repo: 'dot',
                              urls: [
                                '', // the root URL
                                'tests/',
                                'tests/playground.html'
                              ]
                            },
                            {
                              repo: 'kite',
                              urls: [
                                '', // the root URL
                                'tests/playground.html',
                                'tests/visual-shape-test.html'
                              ]
                            },
                            {
                              repo: 'scenery',
                              urls: [
                                '', // the root URL
                                'tests/',
                                'tests/playground.html',
                                'tests/renderer-comparison.html?renderers=canvas,svg,dom',
                                'tests/text-quality-test.html'
                              ]
                            }
                          ].forEach( ( { repo, urls } ) => {
                            urls.forEach( pageloadRelativeURL => {
                              const relativePath = snapshot.name + '/' + repo;
                              snapshot.testQueue.push( {
                                count: 0,
                                snapshotName: snapshot.name,
                                test: [ repo, 'pageload', '/' + pageloadRelativeURL ],
                                url: 'pageload-test.html?url=' + encodeURIComponent( '../../' + relativePath + '/' + pageloadRelativeURL )
                              } );
                            } );
                          } );

                          // NOTE: add other normal tests here (that don't require building)

                          callback( snapshot );
                        }, errorCallback );
                      }, errorCallback );
                    }, errorCallback );
                  }, errorCallback );
                }, errorCallback );
              }, errorCallback );
            }, errorCallback );
          }, errorCallback );
        }
      } );
    }
  } );
}

/**
 * Removes the files created by a snapshot.
 * @private
 *
 * @param {Snapshot} snapshot
 * @param {Function} callback - callback(), called when successful
 * @param {Function} errorCallback - errorCallback( message: {string} ) called when unsuccessful
 */
function removeSnapshot( snapshot, callback, errorCallback ) {
  infoLog( 'Removing snapshot ' + snapshot.name );
  // e.g. rm -Rf
  debugLog( 'Rimraffing ' + snapshot.name );
  rimraf( rootDir + '/' + snapshot.name, function( err ) {
    if ( err ) {
      errorCallback( 'rimraf: ' + err );
    }
    else {
      rimraf( rootDir + '/' + snapshot.name + '-phet-io', function( err ) {
        if ( err ) {
          errorCallback( 'rimraf phet-io: ' + err );
        }
        else {
          snapshot.exists = false;
          callback();
        }
      } );
    }
  } );
}

/**
 * Respond to an HTTP request with a response with the given {Test}.
 * @private
 *
 * @param {ServerResponse} res
 * @param {Test} test
 */
function deliverTest( res, test ) {
  test.count++;
  infoLog( 'Delivering test: ' + JSON.stringify( test, null, 2 ) );
  res.writeHead( 200, jsonHeaders );
  res.end( JSON.stringify( test ) );
}

/**
 * Respond to an HTTP request with an empty test (will trigger checking for a new test without testing anything).
 * @private
 *
 * @param {ServerResponse} res
 */
function deliverEmptyTest( res ) {
  deliverTest( res, {
    count: 0,
    test: null,
    url: 'no-test.html'
  } );
}

// {boolean} Whether our last scan of SHAs found anything stale.
let wasStale = true;

// {Array.<Snapshot>} All of our snapshots
const snapshots = [];

// {Results} Main results, with the addition of the snapshots reference
const testResults = {
  children: {},
  results: [],
  snapshots: snapshots
};

/**
 * Adds a test result into our {Results} object.
 * @private
 *
 * @param {boolean} passed
 * @param {Snapshot} snapshot
 * @param {Array.<string>} test - The path
 * @param {string} message
 */
function addResult( passed, snapshot, test, message ) {
  const localTest = test.slice();
  let container = testResults;
  while ( localTest.length ) {
    const testName = localTest.shift();
    if ( container.children[ testName ] ) {
      container = container.children[ testName ];
    }
    else {
      const newContainer = {
        children: {},
        results: []
      };
      container.children[ testName ] = newContainer;
      container = newContainer;
    }
  }

  container.results.push( {
    passed: passed,
    snapshotName: snapshot.name,
    snapshotTimestamp: snapshot.timestamp,
    message: message
  } );

  // NOTE: we could remove stale tests here?
}

function getCutoffTimestamp() {
  return Date.now() - 1000 * 60 * 60 * 24 * NUMBER_OF_DAYS_TO_KEEP_SNAPSHOTS;
}

function removeResultsForSnapshot( container, snapshot ) {
  container.results = container.results.filter( function( testResult ) {
    return testResult.snapshotName !== snapshot.name;
  } );

  container.children && Object.keys( container.children ).forEach( function( childKey ) {
    removeResultsForSnapshot( container.children[ childKey ], snapshot );
  } );
}

/**
 * Looks up a {Snapshot} given the name.
 * @private
 *
 * @param {string} snapshotName
 * @returns {Snapshot|null} - null only on failure
 */
function findSnapshot( snapshotName ) {
  for ( let i = 0; i < snapshots.length; i++ ) {
    if ( snapshots[ i ].name === snapshotName ) {
      return snapshots[ i ];
    }
  }
  errorLog( 'Could not find snapshot: ' + snapshotName );
  return null;
}

/**
 * Records a test pass from any source.
 * @private
 *
 * @param {Snapshot} snapshot
 * @param {Array.<string>} test - The path
 * @param {string|undefined} message
 */
function testPass( snapshot, test, message ) {
  if ( snapshot === null ) {
    throw new Error( 'Snapshot null: ' + JSON.stringify( test ) + ' + ' + JSON.stringify( message ) );
  }
  infoLog( '[PASS] ' + snapshot.name + ' ' + test.join( ',' ) + ': ' + message );
  addResult( true, snapshot, test, message );
}

/**
 * Records a test failure from any source.
 * @private
 *
 * @param {Snapshot} snapshot
 * @param {Array.<string>} test - The path
 * @param {string|undefined} message
 */
function testFail( snapshot, test, message ) {
  infoLog( '[FAIL] ' + snapshot.name + ' ' + test.join( ',' ) + ': ' + message );
  addResult( false, snapshot, test, message );
}

// Main server creation
http.createServer( function( req, res ) {
  const requestInfo = url.parse( req.url, true );

  if ( requestInfo.pathname === '/aquaserver/next-test' ) {
    // ?old=true or ?old=false, determines whether ES6 or other newer features can be run directly in the browser
    randomBrowserTest( res, requestInfo.query.old === 'true' );
  }
  if ( requestInfo.pathname === '/aquaserver/test-result' ) {
    const result = JSON.parse( requestInfo.query.result );
    const snapshot = findSnapshot( result.snapshotName );
    const test = result.test;
    let message = result.message;
    if ( !message || message.indexOf( 'errors.html#timeout' ) < 0 ) {
      if ( !result.passed ) {
        message = ( result.message ? ( result.message + '\n' ) : '' ) + 'id: ' + result.id;
      }
      if ( result.passed ) {
        testPass( snapshot, test, message );
      }
      else {
        testFail( snapshot, test, message );
      }
    }
    res.writeHead( 200, jsonHeaders );
    res.end( JSON.stringify( { received: 'true' } ) );
  }
  if ( requestInfo.pathname === '/aquaserver/results' ) {
    res.writeHead( 200, jsonHeaders );
    res.end( JSON.stringify( testResults ) );
  }
  if ( requestInfo.pathname === '/aquaserver/snapshot-status' ) {
    res.writeHead( 200, jsonHeaders );
    res.end( JSON.stringify( {
      status: snapshotStatus
    } ) );
  }
  if ( requestInfo.pathname === '/aquaserver/test-status' ) {
    res.writeHead( 200, jsonHeaders );
    res.end( JSON.stringify( {
      zeroCounts: snapshots[ 0 ] ? snapshots[ 0 ].testQueue.filter( function( test ) { return test.count === 0; } ).length : 0
    } ) );
  }
} ).listen( port );

infoLog( 'running on port ' + port + ' with root directory ' + rootDir );

/**
 * Sends a random browser test (from those with the lowest count) to the ServerResponse.
 * @private
 *
 * @param {ServerResponse} res
 * @param {boolean} - Whether
 */
function randomBrowserTest( res, isOld ) {
  if ( snapshots.length > 0 ) {
    // Pick from one of the first two snapshots
    let queue = snapshots[ 0 ].testQueue;
    if ( snapshots.length > 1 ) {
      queue = queue.concat( snapshots[ 1 ].testQueue );
    }

    // Only give "old" tests to browsers that can't handle require.js mode
    if ( isOld ) {
      queue = queue.filter( test => test.old );
    }

    let lowestCount = Infinity;
    let lowestTests = [];
    queue.forEach( function( test ) {
      if ( lowestCount > test.count ) {
        lowestCount = test.count;
        lowestTests = [];
      }
      if ( lowestCount === test.count ) {
        lowestTests.push( test );
      }
    } );

    // Deliver a random available test currently
    if ( lowestTests.length > 0 ) {
      const test = lowestTests[ Math.floor( lowestTests.length * Math.random() ) ];
      deliverTest( res, test );
    }
    else {
      deliverEmptyTest( res );
    }
  }
  else {
    deliverEmptyTest( res );
  }
}

// Main loop that checks SHAs and creates snapshots. Responsible for adding entries to the snapshots array.
function snapshotLoop() {
  if ( wasStale ) {
    setSnapshotStatus( 'Checking for commits (changes detected, waiting for stable SHAs)' );
  }
  else {
    setSnapshotStatus( 'Checking for commits (no changes since last snapshot)' );
  }
  getStaleRepos( function( staleRepos ) {
    if ( staleRepos.length ) {
      wasStale = true;
      infoLog( 'Stale repos: ' + staleRepos.join( ', ' ) );

      setSnapshotStatus( 'Pulling repos: ' + staleRepos.join( ', ' ) );
      pullRepos( staleRepos, function() {
        cloneMissingRepos( function() {
          snapshotLoop();
        }, function( errorMessage ) {
          errorLog( errorMessage );
          snapshotLoop(); // try recovering
        } );
      }, function( errorMessage ) {
        errorLog( errorMessage );
        snapshotLoop(); // try recovering
      } );
    }
    else {
      infoLog( 'No stale repos' );
      if ( wasStale ) {
        wasStale = false;
        infoLog( 'Stable point reached' );
        createSnapshot( function( snapshot ) {
          snapshots.unshift( snapshot );

          const cutoffTimestamp = getCutoffTimestamp();
          while ( snapshots.length > 70 || snapshots[ snapshots.length - 1 ].timestamp < cutoffTimestamp && !snapshots[ snapshots.length - 1 ].exists ) {
            removeResultsForSnapshot( testResults, snapshots.pop() );
          }

          setSnapshotStatus( 'Removing old snapshot files' );
          const numActiveSnapshots = 3;
          if ( snapshots.length > numActiveSnapshots ) {
            const lastSnapshot = snapshots[ numActiveSnapshots ];
            removeSnapshot( lastSnapshot, function() {
              snapshotLoop();
            }, function( errorMessage ) {
              errorLog( errorMessage );
              snapshotLoop();
            } );
          }
          else {
            snapshotLoop();
          }
        }, function( errorMessage ) {
          errorLog( errorMessage );
          snapshotLoop();
        } );
      }
      else {
        snapshotLoop();
      }
    }
  }, function( errorMessage ) {
    errorLog( errorMessage );
    snapshotLoop(); // try recovering
  } );
}

snapshotLoop();

// Main build loop. Call once for every build "thread"
function buildLoop() {
  setTimeout( function() {
    if ( snapshots.length > 0 ) {
      const snapshot = snapshots[ 0 ];
      const buildable = snapshot.buildables[ Math.floor( snapshot.buildables.length * Math.random() ) ];
      const repo = buildable.repo;
      const phetio = buildable.phetio;
      const id = repo + ( phetio ? '-phet-io' : '' );
      const relativePath = snapshot.name + ( phetio ? '-phet-io' : '' ) + '/' + repo;
      const parameters = [];
      if ( phetio ) {
        parameters.push( '--brands=phet,phet-io' );
      }
      else {
        parameters.push( '--brands=phet' );
      }
      if ( snapshot.buildStatus[ id ] === undefined ) {
        snapshot.buildStatus[ id ] = 'building';

        infoLog( 'building ' + relativePath );
        gruntRepo( relativePath, parameters, function() {
          testPass( snapshot, [ repo, 'build', phetio ? 'phet-io' : 'phet' ] );
          snapshot.buildStatus[ id ] = 'passed';
          infoLog( 'build passed: ' + relativePath );
          if ( snapshot.runnableRepos.indexOf( repo ) >= 0 ) {
            snapshot.testQueue.push( {
              count: 0,
              snapshotName: snapshot.name,
              test: [ repo, 'fuzz', 'built' + ( phetio ? '-phet-io' : '' ) ],
              url: 'sim-test.html?url=' + encodeURIComponent( '../../' + relativePath + '/build/' + ( phetio ? 'phet-io' : 'phet' ) + '/' + repo + ( phetio ? '_all_phet-io' : '_en_phet' ) + '.html' ) + '&simQueryParameters=' + encodeURIComponent( 'fuzz&memoryLimit=1000' + ( phetio ? '&phetioStandalone' : '' ) ),
              old: true
            } );
          }
          if ( snapshot.interactiveDescriptionRepos.indexOf( repo ) >= 0 && !phetio ) {
            snapshot.testQueue.push( {
              count: 0,
              snapshotName: snapshot.name,
              test: [ repo, 'interactive-description-fuzz', 'built' + ( phetio ? '-phet-io' : '' ) ],
              url: 'sim-test.html?url=' + encodeURIComponent( '../../' + relativePath + '/build/phet/' + repo + '_en_phet.html' ) + '&simQueryParameters=' + encodeURIComponent( 'fuzz&supportsDescriptions&memoryLimit=1000' ),
              old: true
            } );
            snapshot.testQueue.push( {
              count: 0,
              snapshotName: snapshot.name,
              test: [ repo, 'interactive-description-fuzzBoard', 'built' + ( phetio ? '-phet-io' : '' ) ],
              url: 'sim-test.html?url=' + encodeURIComponent( '../../' + relativePath + '/build/phet/' + repo + '_en_phet.html' ) + '&simQueryParameters=' + encodeURIComponent( 'fuzzBoard&supportsDescriptions&memoryLimit=1000' ),
              old: true
            } );
          }
          // Pageload built tests (once per repo, so not including with phetio mode)
          if ( !phetio ) {
            const testURLs = {
              dot: [
                'doc/',
                'examples/',
                'examples/convex-hull-2.html'
              ],
              kite: [
                'doc/',
                'examples/'
              ],
              scenery: [
                'doc/',
                'doc/a-tour-of-scenery.html',
                'doc/accessibility.html',
                'doc/implementation-notes.html',
                'doc/user-input.html',
                'examples/',
                'examples/cursors.html',
                'examples/hello-world.html',
                'examples/input-multiple-displays.html',
                'examples/input.html',
                'examples/mouse-wheel.html',
                'examples/multi-touch.html',
                'examples/nodes.html',
                'examples/shapes.html',
                'examples/sprites.html',
                // 'examples/webglnode.html', // currently disabled, since it fails without webgl
                'tests/text-bounds-comparison.html'
              ]
            };
            if ( testURLs[ repo ] ) {
              testURLs[ repo ].forEach( pageloadRelativeURL => {
                snapshot.testQueue.push( {
                  count: 0,
                  snapshotName: snapshot.name,
                  test: [ repo, 'pageload', '/' + pageloadRelativeURL ],
                  url: 'pageload-test.html?url=' + encodeURIComponent( '../../' + relativePath + '/' + pageloadRelativeURL ),
                  old: true
                } );
              } );
            }
          }
          buildLoop();
        }, function( message ) {
          testFail( snapshot, [ repo, 'build', phetio ? 'phet-io' : 'phet' ], message );
          snapshot.buildStatus[ id ] = 'failed';
          infoLog( 'build failed: ' + relativePath );
          buildLoop();
        } );
      }
      else {
        buildLoop();
      }
    }
    else {
      buildLoop();
    }
  }, 50 );
}

buildLoop();
buildLoop();
buildLoop();
buildLoop();
buildLoop();
buildLoop();
buildLoop();
buildLoop();
