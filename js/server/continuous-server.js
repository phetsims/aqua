// Copyright 2020, University of Colorado Boulder

/**
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

'use strict';

const asyncFilter = require( '../../../perennial/js/common/asyncFilter' );
const cloneMissingRepos = require( '../../../perennial/js/common/cloneMissingRepos' );
const execute = require( '../../../perennial/js/common/execute' );
const getRepoList = require( '../../../perennial/js/common/getRepoList' );
const gitPull = require( '../../../perennial/js/common/gitPull' );
const gitRevParse = require( '../../../perennial/js/common/gitRevParse' );
const gruntCommand = require( '../../../perennial/js/common/gruntCommand' );
const isStale = require( '../../../perennial/js/common/isStale' );
const npmUpdate = require( '../../../perennial/js/common/npmUpdate' );
const sleep = require( '../../../perennial/js/common/sleep' );
const Snapshot = require( './Snapshot' );
const fs = require( 'fs' );
const http = require( 'http' );
const _ = require( 'lodash' ); // eslint-disable-line
const path = require( 'path' );
const url = require( 'url' );
const winston = require( 'winston' );

const PORT = 45366;
const NUMBER_OF_DAYS_TO_KEEP_SNAPSHOTS = 2; // in days, any shapshots that are older will be removed from the continuous report
const DEBUG_PRETEND_CLEAN = false;

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

// {Array.<Snapshot>} All of our snapshots
let snapshots = [];

let reportJSON = '{}';

// root of your GitHub working copy, relative to the name of the directory that the currently-executing script resides in
const rootDir = path.normalize( __dirname + '/../../../' ); // eslint-disable-line no-undef

const saveFile = `${rootDir}/aqua/.continuous-testing-state.json`;
const saveToFile = () => {
  fs.writeFileSync( saveFile, JSON.stringify( {
    snapshots: snapshots.map( snapshot => snapshot.serialize() )
  }, null, 2 ), 'utf-8' );
};
const loadFromFile = () => {
  if ( fs.existsSync( saveFile ) ) {
    snapshots = JSON.parse( fs.readFileSync( saveFile, 'utf-8' ) ).snapshots.map( Snapshot.deserialize );
  }
};

// Gets update with the current status
let snapshotStatus = 'Starting up';
const setSnapshotStatus = str => {
  snapshotStatus = `[${new Date().toLocaleString().replace( /^.*, /g, '' ).replace( ' AM', 'am' ).replace( ' PM', 'pm' )}] ${str}`;
  winston.info( `status: ${snapshotStatus}` );
};

/**
 * Records a test pass from any source.
 *
 * @param {Test} test
 * @param {string|undefined} message
 */
const testPass = ( test, message ) => {
  winston.info( `[PASS] ${test.snapshot.name} ${test.names.join( ',' )}` );
  test.recordResult( true, message );
};

/**
 * Records a test failure from any source.
 *
 * @param {Test} test
 * @param {string|undefined} message
 */
const testFail = ( test, message ) => {
  winston.info( `[FAIL] ${test.snapshot.name} ${test.names.join( ',' )}` );
  test.recordResult( false, message );
};

/**
 * Respond to an HTTP request with a response
 *
 * @param {ServerResponse} res
 * @param {Test|null} test
 */
const deliverTest = ( res, test ) => {
  const object = test.getObjectForBrowser();
  test.count++;

  winston.info( `[SEND] ${object.snapshotName} ${test.names.join( ',' )} ${object.url}` );
  res.writeHead( 200, jsonHeaders );
  res.end( JSON.stringify( object ) );
};

/**
 * Respond to an HTTP request with an empty test (will trigger checking for a new test without testing anything).
 * @private
 *
 * @param {ServerResponse} res
 */
const deliverEmptyTest = res => {
  res.writeHead( 200, jsonHeaders );
  res.end( JSON.stringify( {
    snapshotName: null,
    test: null,
    url: 'no-test.html'
  } ) );
};

/**
 * Sends a random browser test (from those with the lowest count) to the ServerResponse.
 * @private
 *
 * @param {ServerResponse} res
 * @param {boolean} es5Only
 */
const randomBrowserTest = ( res, es5Only ) => {
  if ( snapshots.length === 0 ) {
    deliverEmptyTest( res );
    return;
  }

  // Pick from one of the first two snapshots
  let queue = snapshots[ 0 ].getAvailableBrowserTests( es5Only );
  if ( snapshots.length > 1 ) {
    queue = queue.concat( snapshots[ 1 ].getAvailableBrowserTests( es5Only ) );
  }

  let lowestCount = Infinity;
  let lowestTests = [];
  queue.forEach( test => {
    if ( lowestCount > test.count ) {
      lowestCount = test.count;
      lowestTests = [];
    }
    if ( lowestCount === test.count ) {
      lowestTests.push( test );
    }
  } );

  // Deliver a random available test currently
  if ( lowestTests.length ) {
    deliverTest( res, _.sample( lowestTests ) );
  }
  else {
    deliverEmptyTest( res );
  }
};

const startServer = () => {
  // Main server creation
  http.createServer( ( req, res ) => {
    try {
      const requestInfo = url.parse( req.url, true );

      if ( requestInfo.pathname === '/aquaserver/next-test' ) {
        // ?old=true or ?old=false, determines whether ES6 or other newer features can be run directly in the browser
        randomBrowserTest( res, requestInfo.query.old === 'true' );
      }
      if ( requestInfo.pathname === '/aquaserver/test-result' ) {
        const result = JSON.parse( requestInfo.query.result );
        let message = result.message;

        const snapshot = _.find( snapshots, snapshot => snapshot.name === result.snapshotName );
        if ( snapshot ) {
          const testNames = result.test;

          const test = _.find( snapshot.tests, test => {
            return _.isEqual( testNames, test.names );
          } );
          if ( test ) {
            if ( !message || message.indexOf( 'errors.html#timeout' ) < 0 ) {
              if ( !result.passed ) {
                message = ( result.message ? ( result.message + '\n' ) : '' ) + 'id: ' + result.id;
              }
              if ( result.passed ) {
                testPass( test, message );
              }
              else {
                testFail( test, message );
              }
              saveToFile();
            }
          }
          else {
            winston.info( `Could not find test under snapshot: ${result.snapshotName} ${result.test.toString()}` );
          }
        }
        else {
          winston.info( `Could not find snapshot for name: ${result.snapshotName}` );
        }

        res.writeHead( 200, jsonHeaders );
        res.end( JSON.stringify( { received: 'true' } ) );
      }
      if ( requestInfo.pathname === '/aquaserver/snapshot-status' ) {
        res.writeHead( 200, jsonHeaders );
        res.end( JSON.stringify( {
          status: snapshotStatus
        } ) );
      }
      if ( requestInfo.pathname === '/aquaserver/report' ) {
        res.writeHead( 200, jsonHeaders );
        res.end( reportJSON );
      }
    }
    catch ( e ) {
      winston.error( e );
    }
  } ).listen( PORT );

  winston.info( `running on port ${PORT}` );
};

const cycleSnapshots = async () => {
  // {boolean} Whether our last scan of SHAs found anything stale.
  let wasStale = true;

  // when loading from a file
  if ( snapshots.length ) {
    setSnapshotStatus( 'Scanning checked out state to determine whether the server is stale' );

    wasStale = false;
    for ( const repo of Object.keys( snapshots[ 0 ].shas ) ) {
      if ( await gitRevParse( repo, 'master' ) !== snapshots[ 0 ].shas[ repo ] ) {
        wasStale = true;
        break;
      }
    }

    winston.info( `Initial wasStale: ${wasStale}` );
  }

  // initial NPM checks, so that all repos will have node_modules that need them
  for ( const repo of getRepoList( 'active-repos' ) ) {
    setSnapshotStatus( `Running initial node_modules checks: ${repo}` );
    if ( repo !== 'aqua' && fs.existsSync( `../${repo}/package.json` ) && !fs.existsSync( `../${repo}/node_modules` ) ) {
      await npmUpdate( repo );
    }
  }

  while ( true ) { // eslint-disable-line
    try {
      const staleMessage = wasStale ? 'Changes detected, waiting for stable SHAs' : 'No changes';

      const reposToCheck = getRepoList( 'active-repos' ).filter( repo => repo !== 'aqua' );

      const staleRepos = await asyncFilter( reposToCheck, async repo => {
        setSnapshotStatus( `${staleMessage}; checking ${repo}` );
        if ( DEBUG_PRETEND_CLEAN ) {
          return false;
        }
        else {
          return await isStale( repo );
        }
      } );

      if ( staleRepos.length ) {
        wasStale = true;

        setSnapshotStatus( `Stale repos (pulling/npm): ${staleRepos.join( ', ' )}` );

        for ( const repo of staleRepos ) {
          await gitPull( repo );
        }
        const clonedRepos = await cloneMissingRepos();

        // npm prune/update on any changed repos, so we can keep our npm status good in our checked out version
        for ( const repo of [ ...staleRepos, ...clonedRepos ] ) {
          if ( fs.existsSync( `../${repo}/package.json` ) ) {
            await npmUpdate( repo );
          }
        }
      }
      else {
        winston.info( 'No stale repos' );

        if ( wasStale ) {
          wasStale = false;

          winston.info( 'Stable point reached' );

          const snapshot = new Snapshot( rootDir, setSnapshotStatus );
          await snapshot.create();

          snapshots.unshift( snapshot );

          const cutoffTimestamp = Date.now() - 1000 * 60 * 60 * 24 * NUMBER_OF_DAYS_TO_KEEP_SNAPSHOTS;
          while ( snapshots.length > 70 || snapshots[ snapshots.length - 1 ].timestamp < cutoffTimestamp && !snapshots[ snapshots.length - 1 ].exists ) {
            snapshots.pop();
          }

          saveToFile();

          setSnapshotStatus( 'Removing old snapshot files' );
          const numActiveSnapshots = 3;
          for ( const snapshot of snapshots.slice( numActiveSnapshots ) ) {
            if ( snapshot.exists ) {
              await snapshot.remove();
              saveToFile();
            }
          }
        }
      }

      if ( DEBUG_PRETEND_CLEAN ) {
        await sleep( 10000000 );
      }
    }
    catch ( e ) {
      winston.error( e );
    }
  }
};

const localTaskCycle = async () => {
  while ( true ) { // eslint-disable-line
    try {
      if ( snapshots.length === 0 ) {
        await sleep( 1000 );
        continue;
      }

      // Pick from one of the first two snapshots
      let availableTests = snapshots[ 0 ].getAvailableLocalTests();
      if ( snapshots.length > 1 ) {
        availableTests = availableTests.concat( snapshots[ 1 ].getAvailableLocalTests() );
      }

      if ( !availableTests.length ) {
        await sleep( 1000 );
        continue;
      }

      const test = _.sample( availableTests );

      if ( test.type === 'lint' ) {
        test.complete = true;
        saveToFile();
        try {
          const output = await execute( gruntCommand, [ 'lint' ], `../${test.repo}` );

          testPass( test, output );
        }
        catch ( e ) {
          testFail( test, `Build failed with status code ${e.code}:\n${e.stdout}\n${e.stderr}`.trim() );
        }
        saveToFile();
      }
      else if ( test.type === 'build' ) {
        test.complete = true;
        saveToFile();
        try {
          const output = await execute( gruntCommand, [ `--brands=${test.brands.join( ',' )}`, '--lint=false' ], `../${test.repo}` );

          testPass( test, output );
          test.success = true;
        }
        catch ( e ) {
          testFail( test, `Build failed with status code ${e.code}:\n${e.stdout}\n${e.stderr}`.trim() );
        }
        saveToFile();
      }
      else {
        // uhhh, don't know what happened? Don't loop here without sleeping
        await sleep( 1000 );
      }
    }
    catch ( e ) {
      winston.error( e );
    }
  }
};

const reportTaskCycle = async () => {
  while ( true ) { // eslint-disable-line
    try {
      const testNames = _.sortBy( _.uniqWith( _.flatten( snapshots.map( snapshot => snapshot.tests.map( test => test.names ) ) ), _.isEqual ), names => names.toString() );
      const report = {
        snapshots: snapshots.map( snapshot => {
          return {
            timestamp: snapshot.timestamp,
            shas: snapshot.shas,

            // TODO: would sparse arrays be better here? probably, but slower lookup
            tests: testNames.map( names => {
              const test = snapshot.findTest( names );
              if ( test ) {
                const passedTestResults = test.results.filter( testResult => testResult.passed );
                const failedTestResults = test.results.filter( testResult => !testResult.passed );
                const failMessages = _.uniq( failedTestResults.map( testResult => testResult.message ).filter( _.identity ) );

                const result = {
                  y: passedTestResults.length,
                  n: failedTestResults.length
                };
                if ( failMessages.length ) {
                  result.m = failMessages;
                }
                return result;
              }
              else {
                return {};
              }
            } )
          };
        } ),
        testNames: testNames
      };

      reportJSON = JSON.stringify( report );
    }
    catch ( e ) {
      winston.error( e );
    }

    await sleep( 5000 );
  }
};

const numberLocal = Number.parseInt( process.argv[ 2 ], 10 ) || 1;

try {
  loadFromFile();
}
catch ( e ) {
  winston.error( `error loading from file: ${e}` );
}

startServer();
cycleSnapshots();
reportTaskCycle();

winston.info( `Launching ${numberLocal} local tasks` );
_.range( 0, numberLocal ).forEach( () => {
  localTaskCycle();
} );
