// Copyright 2020, University of Colorado Boulder

/**
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

'use strict';

const asyncFilter = require( '../../perennial/js/common/asyncFilter' );
const cloneMissingRepos = require( '../../perennial/js/common/cloneMissingRepos' );
const getRepoList = require( '../../perennial/js/common/getRepoList' );
const gitPull = require( '../../perennial/js/common/gitPull' );
const isStale = require( '../../perennial/js/common/isStale' );
const npmUpdate = require( '../../perennial/js/common/npmUpdate' );
const CTSnapshot = require( './CTSnapshot' );
const fs = require( 'fs' );
const http = require( 'http' );
const _ = require( 'lodash' ); // eslint-disable-line
const path = require( 'path' );
const url = require( 'url' );
const winston = require( 'winston' );

const PORT = 45366;
const NUMBER_OF_DAYS_TO_KEEP_SNAPSHOTS = 2; // in days, any shapshots that are older will be removed from the continuous report

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

// {Array.<Snapshot>} All of our snapshots
const snapshots = [];

// {Results} Main results, with the addition of the snapshots reference
const testResults = {
  children: {},
  results: [],
  snapshots: snapshots
};

// root of your GitHub working copy, relative to the name of the directory that the currently-executing script resides in
const rootDir = path.normalize( __dirname + '/../../' ); // eslint-disable-line no-undef

// Gets update with the current status
let snapshotStatus = 'Starting up';
const setSnapshotStatus = str => {
  snapshotStatus = `[${new Date().toLocaleString().replace( /^.*, /g, '' ).replace( ' AM', 'am' ).replace( ' PM', 'pm' )}] ${str}`;
  winston.info( `status: ${snapshotStatus}` );
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
const addResult = ( passed, snapshot, test, message ) => {
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
};

/**
 * Records a test pass from any source.
 *
 * @param {Snapshot} snapshot
 * @param {Array.<string>} test - The path
 * @param {string|undefined} message
 */
const testPass = ( snapshot, test, message ) => {
  if ( snapshot === null ) {
    throw new Error( 'Snapshot null: ' + JSON.stringify( test ) + ' + ' + JSON.stringify( message ) );
  }
  winston.info( '[PASS] ' + snapshot.name + ' ' + test.join( ',' ) + ': ' + message );
  addResult( true, snapshot, test, message );
};

/**
 * Records a test failure from any source.
 *
 * @param {Snapshot} snapshot
 * @param {Array.<string>} test - The path
 * @param {string|undefined} message
 */
const testFail = ( snapshot, test, message ) => {
  winston.info( '[FAIL] ' + snapshot.name + ' ' + test.join( ',' ) + ': ' + message );
  addResult( false, snapshot, test, message );
};

/**
 * Respond to an HTTP request with a response with the given {Test}.
 * @private
 *
 * @param {ServerResponse} res
 * @param {Test|null} test
 */
const deliverTest = ( res, test ) => {
  let url;
  const base = test ? `../../${test.brand === 'phet-io' ? test.phetioDir : test.phetDir}` : '';

  if ( test === null ) {
    url = 'no-test.html';
  }
  else if ( test.type === 'sim-test' ) {
    url = 'sim-test.html?url=' + encodeURIComponent( `${base}/test.url` ) + '&simQueryParameters=' + encodeURIComponent( test.queryParameters );
  }
  else if ( test.type === 'qunit-test' ) {
    url = 'qunit-test.html?url=' + encodeURIComponent( `${base}/test.url` );
  }
  else if ( test.type === 'pageload-test' ) {
    url = 'pageload-test.html?url=' + encodeURIComponent( `${base}/test.url` );
  }
  else {
    url = 'no-test.html';
  }

  if ( test ) {
    test.count++;
  }

  const object = {
    count: test ? test.count : 0,
    snapshotName: test ? test.snapshot.name : null,
    test: test ? test.test : null,
    url: url
  };

  winston.info( 'Delivering test: ' + JSON.stringify( object, null, 2 ) );
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
  deliverTest( res, null );
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
  if ( lowestTests.length > 0 ) {
    const test = lowestTests[ Math.floor( lowestTests.length * Math.random() ) ];
    deliverTest( res, test );
  }
  else {
    deliverEmptyTest( res );
  }
};

const startServer = () => {
  // Main server creation
  http.createServer( ( req, res ) => {
    const requestInfo = url.parse( req.url, true );

    if ( requestInfo.pathname === '/aquaserver/next-test' ) {
      // ?old=true or ?old=false, determines whether ES6 or other newer features can be run directly in the browser
      randomBrowserTest( res, requestInfo.query.old === 'true' );
    }
    if ( requestInfo.pathname === '/aquaserver/test-result' ) {
      const result = JSON.parse( requestInfo.query.result );

      const snapshot = _.find( snapshots, snapshot => snapshot.name === result.snapshotName );
      if ( snapshot ) {
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
      }
      else {
        winston.info( `Could not find snapshot: ${snapshot}` );
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
        zeroCounts: snapshots[ 0 ] ? snapshots[ 0 ].browserTests.filter( test => test.count === 0 ).length : 0
      } ) );
    }
  } ).listen( PORT );

  winston.info( `running on port ${PORT}` );
};

const removeResultsForSnapshot = ( container, snapshot ) => {
  container.results = container.results.filter( testResult => testResult.snapshotName !== snapshot.name );

  container.children && Object.keys( container.children ).forEach( childKey => {
    removeResultsForSnapshot( container.children[ childKey ], snapshot );
  } );
};

const cycleSnapshots = async () => {
  // {boolean} Whether our last scan of SHAs found anything stale.
  let wasStale = true;

  while ( true ) { // eslint-disable-line
    try {
      if ( wasStale ) {
        setSnapshotStatus( 'Checking for commits (changes detected, waiting for stable SHAs)' );
      }
      else {
        setSnapshotStatus( 'Checking for commits (no changes since last snapshot)' );
      }

      const reposToCheck = getRepoList( 'active-repos' ).filter( repo => repo !== 'aqua' );

      const staleRepos = await asyncFilter( reposToCheck, async repo => {
        winston.info( `Checking stale: ${repo}` );
        return await isStale( repo );
      } );

      if ( staleRepos.length ) {
        wasStale = true;

        winston.info( `Stale repos: ${staleRepos.join( ', ' )}` );
        setSnapshotStatus( `Pulling repos: ${staleRepos.join( ', ' )}` );

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

          const snapshot = new CTSnapshot();
          await snapshot.create( rootDir, setSnapshotStatus );

          snapshots.unshift( snapshot );

          const cutoffTimestamp = Date.now() - 1000 * 60 * 60 * 24 * NUMBER_OF_DAYS_TO_KEEP_SNAPSHOTS;
          while ( snapshots.length > 70 || snapshots[ snapshots.length - 1 ].timestamp < cutoffTimestamp && !snapshots[ snapshots.length - 1 ].exists ) {
            removeResultsForSnapshot( testResults, snapshots.pop() );
          }

          setSnapshotStatus( 'Removing old snapshot files' );
          const numActiveSnapshots = 3;
          if ( snapshots.length > numActiveSnapshots ) {
            const lastSnapshot = snapshots[ numActiveSnapshots ];
            await lastSnapshot.remove();
          }
        }
      }
    }
    catch ( e ) {
      winston.error( e );
    }
  }
};

startServer();
cycleSnapshots();
