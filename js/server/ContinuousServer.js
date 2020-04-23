// Copyright 2020, University of Colorado Boulder

/**
 * Coordinates continuous testing, and provides HTTP APIs for reports or clients that run browser tests.
 *
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
const assert = require( 'assert' );
const fs = require( 'fs' );
const http = require( 'http' );
const _ = require( 'lodash' ); // eslint-disable-line
const path = require( 'path' );
const url = require( 'url' );
const winston = require( 'winston' );

const NUMBER_OF_DAYS_TO_KEEP_SNAPSHOTS = 2; // in days, any shapshots that are older will be removed from the continuous report
const DEBUG_PRETEND_CLEAN = false;

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

class ContinuousServer {
  constructor() {

    // @public {string} - root of your GitHub working copy, relative to the name of the directory that the
    // currently-executing script resides in
    this.rootDir = path.normalize( __dirname + '/../../../' );

    // @public {string} - Where we'll load/save our state
    this.saveFile = `${this.rootDir}/aqua/.continuous-testing-state.json`;

    // @public {Array.<Snapshot>} All of our snapshots
    this.snapshots = [];

    // @public {string}
    this.reportJSON = '{}';

    // @public {string}
    this.status = 'Starting up';

    // @public {string}
    this.lastErrorString = '';

    // @public {number}
    this.startupTimestamp = Date.now();

    try {
      this.loadFromFile();
    }
    catch ( e ) {
      this.setError( `error loading from file: ${e}` );
    }
  }

  /**
   * Starts the HTTP server part (that will connect with any reporting features).
   * @public
   *
   * @param {number} port
   */
  startServer( port ) {
    assert( typeof port === 'number', 'port should be a number' );

    // Main server creation
    http.createServer( ( req, res ) => {
      try {
        const requestInfo = url.parse( req.url, true );

        if ( requestInfo.pathname === '/aquaserver/next-test' ) {
          // ?old=true or ?old=false, determines whether ES6 or other newer features can be run directly in the browser
          this.deliverBrowserTest( res, requestInfo.query.old === 'true' );
        }
        if ( requestInfo.pathname === '/aquaserver/test-result' ) {
          const result = JSON.parse( requestInfo.query.result );
          let message = result.message;

          const snapshot = _.find( this.snapshots, snapshot => snapshot.name === result.snapshotName );
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
                const milliseconds = Date.now() - result.timestamp;
                if ( result.passed ) {
                  ContinuousServer.testPass( test, milliseconds, message );
                }
                else {
                  ContinuousServer.testFail( test, milliseconds, message );
                }
                this.saveToFile();
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
        if ( requestInfo.pathname === '/aquaserver/status' ) {
          res.writeHead( 200, jsonHeaders );
          res.end( JSON.stringify( {
            status: this.status,
            startupTimestamp: this.startupTimestamp,
            lastErrorString: this.lastErrorString
          } ) );
        }
        if ( requestInfo.pathname === '/aquaserver/report' ) {
          res.writeHead( 200, jsonHeaders );
          res.end( this.reportJSON );
        }
      }
      catch ( e ) {
        this.setError( `server error: ${e}` );
      }
    } ).listen( port );

    winston.info( `running on port ${port}` );
  }

  /**
   * Respond to an HTTP request with a response
   *
   * @param {ServerResponse} res
   * @param {Test|null} test
   */
  static deliverTest( res, test ) {
    const object = test.getObjectForBrowser();
    test.count++;

    winston.info( `[SEND] ${object.snapshotName} ${test.names.join( ',' )} ${object.url}` );
    res.writeHead( 200, jsonHeaders );
    res.end( JSON.stringify( object ) );
  }

  /**
   * Respond to an HTTP request with an empty test (will trigger checking for a new test without testing anything).
   * @private
   *
   * @param {ServerResponse} res
   */
  static deliverEmptyTest( res ) {
    res.writeHead( 200, jsonHeaders );
    res.end( JSON.stringify( {
      snapshotName: null,
      test: null,
      url: 'no-test.html'
    } ) );
  }

  /**
   * Sends a random browser test (from those with the lowest count) to the ServerResponse.
   * @private
   *
   * @param {ServerResponse} res
   * @param {boolean} es5Only
   */
  deliverBrowserTest( res, es5Only ) {
    if ( this.snapshots.length === 0 ) {
      ContinuousServer.deliverEmptyTest( res );
      return;
    }

    // Pick from one of the first two snapshots
    let queue = this.snapshots[ 0 ].getAvailableBrowserTests( es5Only );
    if ( this.snapshots.length > 1 ) {
      queue = queue.concat( this.snapshots[ 1 ].getAvailableBrowserTests( es5Only ) );
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
      ContinuousServer.deliverTest( res, ContinuousServer.weightedSampleTest( lowestTests ) );
    }
    else {
      ContinuousServer.deliverEmptyTest( res );
    }
  }

  /**
   * Sets the status message.
   * @public
   *
   * @param {string} str
   */
  setStatus( str ) {
    this.status = `[${new Date().toLocaleString().replace( /^.*, /g, '' ).replace( ' AM', 'am' ).replace( ' PM', 'pm' )}] ${str}`;
    winston.info( `status: ${this.status}` );
  }

  /**
   * Sets the last error message.
   * @public
   *
   * @param {string} message
   */
  setError( message ) {
    this.lastErrorString = `${new Date().toUTCString()}: ${message}`;

    winston.error( message );
  }

  /**
   * Saves the state of snapshots to our save file.
   * @public
   */
  saveToFile() {
    fs.writeFileSync( this.saveFile, JSON.stringify( {
      snapshots: this.snapshots.map( snapshot => snapshot.serialize() )
    }, null, 2 ), 'utf-8' );
  }

  /**
   * loads the state of snapshots from our save file, if it exists.
   * @public
   */
  loadFromFile() {
    if ( fs.existsSync( this.saveFile ) ) {
      this.snapshots = JSON.parse( fs.readFileSync( this.saveFile, 'utf-8' ) ).snapshots.map( Snapshot.deserialize );
    }
  }

  /**
   * Records a test pass from any source.
   *
   * @param {Test} test
   * @param {number} milliseconds
   * @param {string|undefined} message
   */
  static testPass( test, milliseconds, message ) {
    winston.info( `[PASS] ${test.snapshot.name} ${test.names.join( ',' )} ${milliseconds}` );
    test.recordResult( true, milliseconds, message );
  }

  /**
   * Records a test failure from any source.
   *
   * @param {Test} test
   * @param {number} milliseconds
   * @param {string|undefined} message
   */
  static testFail( test, milliseconds, message ) {
    winston.info( `[FAIL] ${test.snapshot.name} ${test.names.join( ',' )} ${milliseconds}` );
    test.recordResult( false, milliseconds, message );
  }

  /**
   * Picks a test based on the tests' relative weights.
   * @public
   *
   * @param {Array.<Test>} tests
   * @returns {Test}
   */
  static weightedSampleTest( tests ) {
    assert( tests.length );

    const weights = tests.map( test => {
      const lastTestedIndex = _.findIndex( this.snapshots, snapshot => {
        const snapshotTest = snapshot.findTest( test.names );
        return snapshotTest && snapshotTest.results.length > 0;
      } );
      const lastFailedIndex = _.findIndex( this.snapshots, snapshot => {
        const snapshotTest = snapshot.findTest( test.names );
        return snapshotTest && _.some( snapshotTest.results, testResult => testResult.passed );
      } );

      let weight = test.priority;

      if ( lastFailedIndex >= 0 ) {
        if ( lastFailedIndex < 3 ) {
          weight *= 6;
        }
        else {
          weight *= 3;
        }
      }
      else {
        if ( lastTestedIndex === -1 ) {
          weight *= 1.5;
        }
        else if ( lastTestedIndex === 0 ) {
          weight *= 0.3;
        }
        else if ( lastTestedIndex === 1 ) {
          weight *= 0.7;
        }
      }

      return weight;
    } );

    const totalWeight = _.sum( weights );

    const cutoffWeight = totalWeight * Math.random();
    let cumulativeWeight = 0;

    for ( let i = 0; i < tests.length; i++ ) {
      cumulativeWeight += weights[ i ];
      if ( cumulativeWeight >= cutoffWeight ) {
        return tests[ i ];
      }
    }

    // The fallback is the last test
    return tests[ tests.length - 1 ];
  }

  /**
   * Kicks off a loop that will create snapshots.
   * @public
   */
  async createSnapshotLoop() {
    // {boolean} Whether our last scan of SHAs found anything stale.
    let wasStale = true;

    // when loading from a file
    if ( this.snapshots.length ) {
      this.setStatus( 'Scanning checked out state to determine whether the server is stale' );

      wasStale = false;
      for ( const repo of Object.keys( this.snapshots[ 0 ].shas ) ) {
        if ( await gitRevParse( repo, 'master' ) !== this.snapshots[ 0 ].shas[ repo ] ) {
          wasStale = true;
          break;
        }
      }

      winston.info( `Initial wasStale: ${wasStale}` );
    }

    // initial NPM checks, so that all repos will have node_modules that need them
    for ( const repo of getRepoList( 'active-repos' ) ) {
      this.setStatus( `Running initial node_modules checks: ${repo}` );
      if ( repo !== 'aqua' && fs.existsSync( `../${repo}/package.json` ) && !fs.existsSync( `../${repo}/node_modules` ) ) {
        await npmUpdate( repo );
      }
    }

    while ( true ) { // eslint-disable-line
      try {
        const staleMessage = wasStale ? 'Changes detected, waiting for stable SHAs' : 'No changes';

        const reposToCheck = getRepoList( 'active-repos' ).filter( repo => repo !== 'aqua' );

        const staleRepos = await asyncFilter( reposToCheck, async repo => {
          this.setStatus( `${staleMessage}; checking ${repo}` );
          if ( DEBUG_PRETEND_CLEAN ) {
            return false;
          }
          else {
            return await isStale( repo );
          }
        } );

        if ( staleRepos.length ) {
          wasStale = true;

          this.setStatus( `Stale repos (pulling/npm): ${staleRepos.join( ', ' )}` );

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

            const snapshot = new Snapshot( this.rootDir, this.setStatus.bind( this ) );
            await snapshot.create();

            this.snapshots.unshift( snapshot );

            const cutoffTimestamp = Date.now() - 1000 * 60 * 60 * 24 * NUMBER_OF_DAYS_TO_KEEP_SNAPSHOTS;
            while ( this.snapshots.length > 70 || this.snapshots[ this.snapshots.length - 1 ].timestamp < cutoffTimestamp && !this.snapshots[ this.snapshots.length - 1 ].exists ) {
              this.snapshots.pop();
            }

            this.saveToFile();

            this.setStatus( 'Removing old snapshot files' );
            const numActiveSnapshots = 3;
            for ( const snapshot of this.snapshots.slice( numActiveSnapshots ) ) {
              if ( snapshot.exists ) {
                await snapshot.remove();
                this.saveToFile();
              }
            }
          }
        }

        if ( DEBUG_PRETEND_CLEAN ) {
          await sleep( 10000000 );
        }
      }
      catch ( e ) {
        this.setError( `snapshot error: ${e}` );
      }
    }
  }

  /**
   * Kicks off a loop that will try to tackle any locally-based tests available (e.g. grunt tasks, building/linting)
   * @public
   */
  async localTaskLoop() {
    while ( true ) { // eslint-disable-line
      try {
        if ( this.snapshots.length === 0 ) {
          await sleep( 1000 );
          continue;
        }

        // Pick from one of the first two snapshots
        let availableTests = this.snapshots[ 0 ].getAvailableLocalTests();
        if ( this.snapshots.length > 1 ) {
          availableTests = availableTests.concat( this.snapshots[ 1 ].getAvailableLocalTests() );
        }

        if ( !availableTests.length ) {
          await sleep( 1000 );
          continue;
        }

        const test = ContinuousServer.weightedSampleTest( availableTests );
        const startTimestamp = Date.now();

        if ( test.type === 'lint' ) {
          test.complete = true;
          this.saveToFile();
          try {
            const output = await execute( gruntCommand, [ 'lint' ], `../${test.repo}` );

            ContinuousServer.testPass( test, Date.now() - startTimestamp, output );
          }
          catch ( e ) {
            ContinuousServer.testFail( test, Date.now() - startTimestamp, `Build failed with status code ${e.code}:\n${e.stdout}\n${e.stderr}`.trim() );
          }
          this.saveToFile();
        }
        else if ( test.type === 'build' ) {
          test.complete = true;
          this.saveToFile();
          try {
            const output = await execute( gruntCommand, [ `--brands=${test.brands.join( ',' )}`, '--lint=false' ], `../${test.repo}` );

            ContinuousServer.testPass( test, Date.now() - startTimestamp, output );
            test.success = true;
          }
          catch ( e ) {
            ContinuousServer.testFail( test, Date.now() - startTimestamp, `Build failed with status code ${e.code}:\n${e.stdout}\n${e.stderr}`.trim() );
          }
          this.saveToFile();
        }
        else {
          // uhhh, don't know what happened? Don't loop here without sleeping
          await sleep( 1000 );
        }
      }
      catch ( e ) {
        this.setError( `local error: ${e}` );
      }
    }
  }

  async generateReportLoop() {
    while ( true ) { // eslint-disable-line
      try {
        const testNames = _.sortBy( _.uniqWith( _.flatten( this.snapshots.map( snapshot => snapshot.tests.map( test => test.names ) ) ), _.isEqual ), names => names.toString() );
        const elapsedTimes = testNames.map( () => 0 );
        const numElapsedTimes = testNames.map( () => 0 );
        const snapshotSummaries = this.snapshots.map( snapshot => {
          return {
            timestamp: snapshot.timestamp,
            shas: snapshot.shas,
            tests: testNames.map( ( names, i ) => {
              const test = snapshot.findTest( names );
              if ( test ) {
                const passedTestResults = test.results.filter( testResult => testResult.passed );
                const failedTestResults = test.results.filter( testResult => !testResult.passed );
                const failMessages = _.uniq( failedTestResults.map( testResult => testResult.message ).filter( _.identity ) );
                test.results.forEach( testResult => {
                  if ( testResult.milliseconds ) {
                    elapsedTimes[ i ] += testResult.milliseconds;
                    numElapsedTimes[ i ]++;
                  }
                } );

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
        } );
        const testAverageTimes = elapsedTimes.map( ( time, i ) => {
          if ( time === 0 ) {
            return time;
          }
          else {
            return time / numElapsedTimes[ i ];
          }
        } );

        const report = {
          snapshots: snapshotSummaries,
          testNames: testNames,
          testAverageTimes: testAverageTimes
        };

        this.reportJSON = JSON.stringify( report );
      }
      catch ( e ) {
        this.setError( `report error: ${e}` );
      }

      await sleep( 5000 );
    }
  }
}

module.exports = ContinuousServer;
