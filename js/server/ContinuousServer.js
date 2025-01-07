// Copyright 2020-2025, University of Colorado Boulder

/**
 * Coordinates continuous testing, and provides HTTP APIs for reports or clients that run browser tests.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

const asyncFilter = require( '../../../perennial/js/common/asyncFilter' );
const cloneMissingRepos = require( '../../../perennial/js/common/cloneMissingRepos' );
const execute = require( '../../../perennial/js/common/execute' ).default;
const getRepoList = require( '../../../perennial/js/common/getRepoList' );
const gitPull = require( '../../../perennial/js/common/gitPull' );
const gitRevParse = require( '../../../perennial/js/common/gitRevParse' );
const gruntCommand = require( '../../../perennial/js/common/gruntCommand' );
const npmCommand = require( '../../../perennial/js/common/npmCommand' );
const isStale = require( '../../../perennial/js/common/isStale' );
const npmUpdate = require( '../../../perennial/js/common/npmUpdate' );
const transpileAll = require( '../../../perennial/js/common/transpileAll' );
const sleep = require( '../../../perennial/js/common/sleep' );
const Snapshot = require( './Snapshot' );
const assert = require( 'assert' );
const fs = require( 'fs' );
const http = require( 'http' );
const _ = require( 'lodash' );
const path = require( 'path' );
const url = require( 'url' );
const deleteDirectory = require( '../../../perennial/js/common/deleteDirectory' );
const winston = require( '../../../perennial/js/npm-dependencies/winston' ).default;

// in days, any snapshots that are older will be removed from the continuous report
const NUMBER_OF_DAYS_TO_KEEP_FULL_SNAPSHOTS = 4;
const MAX_SNAPSHOTS = 70; // Memory to keep test results, but not the full checkout
const NUMBER_OF_FULL_SNAPSHOTS = 20;

// Headers that we'll include in all server replies
const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

// Useful, and we can't import dot's Util here
const linear = ( a1, a2, b1, b2, a3 ) => {
  return ( b2 - b1 ) / ( a2 - a1 ) * ( a3 - a1 ) + b1;
};

// List of repos that are allowed to run tests with `npm run`
const NPM_RUN_SUPPORTED = [
  'aqua',
  'chipper',
  'perennial',
  'perennial-alias',
  'rosetta',
  'yotta',
  'scenerystack'
];

const minutesToMS = minutes => 1000 * 60 * minutes;
const hoursToMS = hours => minutesToMS( hours * 60 );
const daysToMS = days => hoursToMS( days * 24 );

// {number} - in milliseconds
const twoHours = hoursToMS( 2 );
const twelveHours = hoursToMS( 12 );

class ContinuousServer {
  /**
   * @param {boolean} useRootDir - If true, we won't create/copy, and we'll just use the files there instead
   */
  constructor( useRootDir = false ) {

    winston.info( `useRootDir: ${useRootDir}` );

    // @public {boolean}
    this.useRootDir = useRootDir;

    // @public {string} - root of your GitHub working copy, relative to the name of the directory that the
    // currently-executing script resides in
    this.rootDir = path.normalize( `${__dirname}/../../../` );

    // @public {string} - Where we'll load/save our state
    this.saveFile = `${this.rootDir}/aqua/.continuous-testing-state.json`;

    // @public {Array.<Snapshot>} - All of our snapshots
    this.snapshots = [];

    // @public {Snapshot|null} - The snapshot being created, so that if we're interrupted, we can clear the directory.
    this.pendingSnapshot = null;

    // @public {Array.<Snapshot>} - Snapshots being actively removed, but we'll want to track them in case we restart
    // before they're fully removed.
    this.trashSnapshots = [];

    // Lock writing to save file so two loops don't try to write at the same time.
    this.saveFileLocked = false;

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
    catch( e ) {
      this.setError( `error loading from file: ${e}` );
    }

    // Prune older snapshots that may have been lost from restarts during state save.
    if ( !this.useRootDir ) {
      setTimeout( () => {
        this.cleanupOrphanedSnapshots();
      }, minutesToMS( 5 ) ); // wait 5 minutes to focus on more important parts of CT on startup
    }

    this.wireUpSaveOnExit();
  }

  /**
   * @private
   */
  wireUpSaveOnExit() {
    [ 'SIGINT', 'SIGHUP', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT', 'SIGBUS', 'SIGFPE', 'SIGUSR1',
      'SIGSEGV', 'SIGUSR2', 'SIGTERM', 'beforeExit', 'uncaughtException', 'unhandledRejection'
    ].forEach( sig => process.on( sig, e => {
      winston.info( 'saving before exiting' );
      this.saveToFile();
      process.exit( 1 );
    } ) );
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

        const pathname = requestInfo.pathname;
        let body = '';

        req.on( 'data', chunk => {
          body += chunk.toString();
        } );

        req.on( 'end', () => {
          try {
            body && winston.info( 'body', body );
            const parsedBody = body ? JSON.parse( body ) : body;
            this.dispatchRequest( pathname, requestInfo, parsedBody, res );
          }
          catch( e ) {
            res.writeHead( 500, jsonHeaders );
            res.end( JSON.stringify( {
              error: e.message
            } ) );
          }
        } );
      }
      catch( e ) {
        this.setError( `server error: ${e}` );
        res.writeHead( 500, jsonHeaders );
        res.end( JSON.stringify( {
          error: e.message
        } ) );
      }
    } ).listen( port );

    winston.info( `running on port ${port}` );
  }

  /**
   *
   * @param {string} pathname - endpoint
   * @param {Object} requestInfo - see http docs
   * @param {Object} body - JSON parsed body
   * @param {Response} response - see ServerResponse
   * @private
   */
  dispatchRequest( pathname, requestInfo, body, response ) {

    if ( pathname === '/aquaserver/next-test' ) {
      this.deliverBrowserTest( response );
    }
    if ( pathname === '/aquaserver/test-result' ) {
      const result = body;
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
              message = `${result.message ? ( `${result.message}\n` ) : ''}id: ${result.id}`;
            }
            const milliseconds = Date.now() - result.timestamp;
            if ( result.passed ) {
              ContinuousServer.testPass( test, milliseconds, message );
            }
            else {
              ContinuousServer.testFail( test, milliseconds, message );
            }
          }
        }
        else {
          winston.info( `Could not find test under snapshot: ${result.snapshotName} ${result.test.toString()}` );
        }
      }
      else {
        winston.info( `Could not find snapshot for name: ${result.snapshotName}` );
      }

      response.writeHead( 200, jsonHeaders );
      response.end( JSON.stringify( { received: 'true' } ) );
    }
    if ( pathname === '/aquaserver/status' ) {
      response.writeHead( 200, jsonHeaders );
      response.end( JSON.stringify( {
        status: this.status,
        startupTimestamp: this.startupTimestamp,
        lastErrorString: this.lastErrorString
      } ) );
    }
    if ( pathname === '/aquaserver/report' ) {
      response.writeHead( 200, jsonHeaders );
      response.end( this.reportJSON );
    }
  }

  /**
   * Respond to an HTTP request with a response
   * @private
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
   */
  deliverBrowserTest( res ) {
    if ( this.snapshots.length === 0 ) {
      ContinuousServer.deliverEmptyTest( res );
      return;
    }

    // Pick from one of the first two snapshots
    let queue = this.snapshots[ 0 ].getAvailableBrowserTests();
    if ( this.snapshots.length > 1 ) {
      queue = queue.concat( this.snapshots[ 1 ].getAvailableBrowserTests() );
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
      ContinuousServer.deliverTest( res, this.weightedSampleTest( lowestTests ) );
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
    // Don't save or load state if useRootDir is true
    if ( this.useRootDir ) {
      return;
    }
    if ( this.saveFileLocked ) {
      winston.info( 'Trying to save state while already saving, skipping second save' );
      return;
    }

    this.saveFileLocked = true;

    fs.writeFileSync( this.saveFile, JSON.stringify( {
      snapshots: this.snapshots.map( snapshot => snapshot.serialize() ),
      pendingSnapshot: this.pendingSnapshot ? this.pendingSnapshot.serializeStub() : null,
      trashSnapshots: this.trashSnapshots.map( snapshot => snapshot.serializeStub() )
    }, null, 2 ), 'utf-8' );

    this.saveFileLocked = false;
  }

  /**
   * loads the state of snapshots from our save file, if it exists.
   * @public
   */
  loadFromFile() {
    // Don't save or load state if useRootDir is true
    if ( this.useRootDir ) {
      return;
    }

    if ( fs.existsSync( this.saveFile ) ) {
      let serialization;
      try {
        serialization = JSON.parse( fs.readFileSync( this.saveFile, 'utf-8' ) );
      }
      catch( e ) {
        winston.error( 'cannot parse saved state file, deleting it.' );
        fs.rmSync( this.saveFile );
        return;
      }

      this.snapshots = serialization.snapshots.map( Snapshot.deserialize );
      this.trashSnapshots = serialization.trashSnapshots ? serialization.trashSnapshots.map( Snapshot.deserializeStub ) : [];
      if ( serialization.pendingSnapshot && serialization.pendingSnapshot.directory ) {
        this.deleteTrashSnapshot( Snapshot.deserializeStub( serialization.pendingSnapshot ) );
      }
    }
  }

  /**
   * Records a test pass from any source.
   * @private
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
   * @private
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
   * Returns the weight used for a given test at the moment.
   * @public
   *
   * @param {Test} test
   * @returns {number}
   */
  getTestWeight( test ) {
    const snapshotTests = this.snapshots.map( snapshot => snapshot.findTest( test.names ) ).filter( test => !!test );

    const lastTestedIndex = _.findIndex( snapshotTests, snapshotTest => snapshotTest.results.length > 0 );
    const lastFailedIndex = _.findIndex( snapshotTests, snapshotTest => _.some( snapshotTest.results, testResult => !testResult.passed ) );

    let weight = test.priority;

    const adjustPriority = ( immediatePriorityMultiplier, twoHourPriorityMultiplier, twelveHourPriorityMultiplier, elapsed ) => {
      if ( elapsed < twoHours ) {
        weight *= linear( 0, twoHours, immediatePriorityMultiplier, twoHourPriorityMultiplier, elapsed );
      }
      else if ( elapsed < twelveHours ) {
        weight *= linear( twoHours, twelveHours, twoHourPriorityMultiplier, twelveHourPriorityMultiplier, elapsed );
      }
      else {
        weight *= twelveHourPriorityMultiplier;
      }
    };

    if ( test.repoCommitTimestamp ) {
      adjustPriority( 2, 1, 0.5, Date.now() - test.repoCommitTimestamp );
    }
    if ( test.dependenciesCommitTimestamp ) {
      adjustPriority( 1.5, 1, 0.75, Date.now() - test.dependenciesCommitTimestamp );
    }


    if ( lastFailedIndex >= 0 ) {
      // If it failed in the last 3 snapshots, test again eagerly
      if ( lastFailedIndex < 3 ) {
        weight *= 6;
      }
      else {
        weight *= 3;
      }
    }
    else {
      if ( lastTestedIndex === -1 ) {
        // If there are currently no reported results for this test in all snapshots, increase priority
        weight *= 1.5;
      }
      else if ( lastTestedIndex === 0 ) {
        // If it was last tested upon the previous snapshot
        weight *= 0.3;
      }
      else if ( lastTestedIndex === 1 ) {
        // If it was last tested upon 2 snapshots ago
        weight *= 0.7;
      }
    }

    return weight;
  }

  /**
   * Recomputes the desired weights for all recent tests.
   * @private
   */
  computeRecentTestWeights() {
    this.snapshots.slice( 0, 2 ).forEach( snapshot => snapshot.tests.forEach( test => {
      test.weight = this.getTestWeight( test );
    } ) );
  }

  /**
   * Picks a test based on the tests' relative weights.
   * @public
   *
   * @param {Array.<Test>} tests
   * @returns {Test}
   */
  weightedSampleTest( tests ) {
    assert( tests.length );

    const weights = tests.map( test => test.weight );
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
   * Deletes a snapshot marked for removal
   * @private
   *
   * @param {Snapshot} snapshot
   */
  async deleteTrashSnapshot( snapshot ) {
    winston.info( `Deleting snapshot files: ${snapshot.directory}` );
    !this.trashSnapshots.includes( snapshot ) && this.trashSnapshots.push( snapshot );

    await snapshot.remove();

    // Remove it from the snapshots
    this.trashSnapshots = this.trashSnapshots.filter( snap => snap !== snapshot );

    this.saveToFile();
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
        if ( await gitRevParse( repo, 'main' ) !== this.snapshots[ 0 ].shas[ repo ] ) {
          wasStale = true;
          break;
        }
      }

      winston.info( `Initial wasStale: ${wasStale}` );
    }

    // Kick off initial old snapshot removal
    if ( !this.useRootDir ) {
      for ( const snapshot of this.trashSnapshots ) {
        // NOTE: NO await here, we're going to do that asynchronously so we don't block
        this.deleteTrashSnapshot( snapshot );
      }
    }

    // initial NPM checks, so that all repos will have node_modules that need them
    this.setStatus( 'Running initial node_modules checks on all repos' );
    for ( const repo of getRepoList( 'active-repos' ) ) {
      if ( fs.existsSync( `../${repo}/package.json` ) && !fs.existsSync( `../${repo}/node_modules` ) ) {
        this.setStatus( `Initial npm update: ${repo}` );
        await npmUpdate( repo );
        this.setStatus( 'Running initial node_modules checks on all repos' );
      }
    }

    if ( this.useRootDir ) {
      const snapshot = new Snapshot( this.rootDir, this.setStatus.bind( this ) );

      // Create a snapshot without copying files
      await snapshot.create( true );

      this.snapshots.push( snapshot );

      this.computeRecentTestWeights();
    }

    while ( !this.useRootDir ) {
      try {
        const staleMessage = wasStale ? 'Changes detected, waiting for stable SHAs' : 'No changes';

        const reposToCheck = getRepoList( 'active-repos' );

        const staleRepos = await asyncFilter( reposToCheck, async repo => {
          this.setStatus( `${staleMessage}; checking ${repo}` );
          const doesNotExist = !fs.existsSync( `../${repo}/` ); // let's call a lack of a repo "stale" to move onto a new snapshot.
          return doesNotExist || isStale( repo );
        } );

        if ( staleRepos.length ) {
          wasStale = true;

          this.setStatus( `Stale repos (pulling/npm): ${staleRepos.join( ', ' )}` );

          const clonedRepos = await cloneMissingRepos();
          for ( const repo of staleRepos ) {
            await gitPull( repo );
          }

          // Run the following updates on any changed repos, so we can keep our npm status good in our checked out version
          // npm prune/update first
          for ( const repo of [ ...staleRepos, ...clonedRepos ] ) {
            if ( fs.existsSync( `../${repo}/package.json` ) ) {
              await npmUpdate( repo );
            }
          }

          // Output JS for any updated repos. May use the updated node_modules from the prior loop
          this.setStatus( 'Running transpileAll' );
          await transpileAll();
        }
        else {
          winston.info( 'No stale repos' );

          const completedAllTests = this.snapshots.length === 0 || this.snapshots[ 0 ].getAvailableBrowserTests( false ).filter( test => test.count === 0 ).length === 0;
          if ( wasStale ) {
            if ( new Date().getHours() < 5 && !completedAllTests ) {
              winston.info( 'Waiting until 5am (or completed tests) to create a snapshot' );
            }
            else {
              wasStale = false;

              winston.info( 'Stable point reached' );

              const snapshot = new Snapshot( this.rootDir, this.setStatus.bind( this ) );
              this.pendingSnapshot = snapshot;

              await snapshot.create();

              this.snapshots.unshift( snapshot );
              this.pendingSnapshot = null;

              const cutoffTimestamp = Date.now() - daysToMS( NUMBER_OF_DAYS_TO_KEEP_FULL_SNAPSHOTS );

              while ( ( this.snapshots.length > MAX_SNAPSHOTS ||
                        this.snapshots[ this.snapshots.length - 1 ].timestamp < cutoffTimestamp ) &&

                      // Exit the loop if the oldest snapshot is currently getting deleted, but not gone yet
                      !this.trashSnapshots.includes( this.snapshots[ this.snapshots.length - 1 ] ) ) {

                // Don't remove from the snapshots list until it is fully deleted
                const lastSnapshot = this.snapshots[ this.snapshots.length - 1 ];
                if ( lastSnapshot.exists ) {
                  // NOTE: NO await here, we're going to do that asynchronously so we don't block
                  this.deleteTrashSnapshot( lastSnapshot );
                }
                else {
                  this.snapshots.pop();
                }
              }

              this.computeRecentTestWeights();

              const toRemove = this.snapshots.slice( NUMBER_OF_FULL_SNAPSHOTS );
              this.setStatus( `Removing ${toRemove.length} old full snapshots` );
              for ( const snapshot of toRemove ) {
                if ( snapshot.exists && !this.trashSnapshots.includes( snapshot ) ) {

                  // NOTE: NO await here, we're going to do that asynchronously so we don't block
                  this.deleteTrashSnapshot( snapshot );
                }
              }

              // Save after creating the snapshot, so that if we crash here, we won't be creating permanent garbage
              // files under ct-snapshots.
              this.saveToFile();
            }
          }
        }
      }
      catch( e ) {
        this.setError( `snapshot error: ${e}` );
      }
    }
  }

  /**
   * Kicks off a loop that will try to tackle any locally-based tests available (e.g. grunt tasks, building/linting)
   * @public
   */
  async localTaskLoop() {

    while ( true ) {
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

        const test = this.weightedSampleTest( availableTests );
        const snapshot = test.snapshot;
        const startTimestamp = Date.now();

        if ( test.type === 'lint' ) {
          test.complete = true;
          try {
            const output = await execute( gruntCommand, [ 'lint', `--repo=${test.repo}`, '--disable-eslint-cache' ], `${snapshot.directory}/perennial` );

            ContinuousServer.testPass( test, Date.now() - startTimestamp, output );
          }
          catch( e ) {
            ContinuousServer.testFail( test, Date.now() - startTimestamp, `Lint failed with status code ${e.code}:\n${e.stdout}\n${e.stderr}`.trim() );
          }
        }
        else if ( test.type === 'npm-run' ) {
          test.complete = true;
          try {
            assert( NPM_RUN_SUPPORTED.includes( test.repo ), `Cannot test \`npm run\` in unsupported repo: ${test.repo}` );

            const executePromise = execute( npmCommand, [ 'run', ...test.testCommand.split( ' ' ) ], `${snapshot.directory}/${test.repo}` );
            const timeoutPromise = ( async () => {
              await sleep( 3600000 ); // 1 hour

              throw new Error( 'npm run timeout' );
            } )();

            const output = await Promise.race( [ executePromise, timeoutPromise ] );

            ContinuousServer.testPass( test, Date.now() - startTimestamp, output );
          }
          catch( e ) {
            ContinuousServer.testFail( test, Date.now() - startTimestamp, `npm run failed with status code ${e.code}:\n${e.stdout}\n${e.stderr}`.trim() );
          }
        }
        else if ( test.type === 'build' ) {
          test.complete = true;
          try {

            // --transpile=false: We don't want to transpile because we have already done so for this snapshot, and don't
            //     want to do any writing to chipper/dist while tests are potentially reading from it
            // --lint=false and --type-check=false: It will just save time to not repeat this step when other tests will handle
            //     linting and type checking.
            const output = await execute( gruntCommand, [ `--brands=${test.brands.join( ',' )}`,
              '--transpile=false', '--lint=false', '--type-check=false' ], `${snapshot.directory}/${test.repo}` );

            ContinuousServer.testPass( test, Date.now() - startTimestamp, output );
            test.success = true;
          }
          catch( e ) {
            ContinuousServer.testFail( test, Date.now() - startTimestamp, `Build failed with status code ${e.code}:\n${e.stdout}\n${e.stderr}`.trim() );
          }
        }
        else {
          // uhhh, don't know what happened? Don't loop here without sleeping please
          ContinuousServer.testFail( test, Date.now() - startTimestamp, `Unsupported local test type "${test.type}" for ${test.names}` );
          await sleep( 1000 );
        }
      }
      catch( e ) {
        this.setError( `local error: ${e}` );
      }
    }
  }

  /**
   * Starts computing weights for tests.
   * @public
   */
  async computeWeightsLoop() {

    while ( true ) {
      try {
        this.computeRecentTestWeights();
      }
      catch( e ) {
        this.setError( `weights error: ${e} ${e.stack}` );
      }

      await sleep( 30 * 1000 );
    }
  }

  /**
   * Regularly saves progress, so that when CT is restarted, not EVERYTHING is lost.
   * @public
   */
  async autosaveLoop() {

    while ( true ) {
      try {
        this.saveToFile();
      }
      catch( e ) {
        this.setError( `autosave error: ${e} ${e.stack}` );
      }
      await sleep( minutesToMS( 5 ) ); // Run this every 5 minutes
    }
  }

  /**
   * Starts generating reports from the available data.
   * @public
   */
  async generateReportLoop() {

    while ( true ) {
      try {
        winston.info( 'Generating Report' );
        const testNameMap = {};
        this.snapshots.forEach( snapshot => snapshot.tests.forEach( test => {
          testNameMap[ test.nameString ] = test.names;
        } ) );
        const testNameStrings = _.sortBy( Object.keys( testNameMap ) );
        const testNames = testNameStrings.map( nameString => testNameMap[ nameString ] );

        const elapsedTimes = testNames.map( () => 0 );
        const numElapsedTimes = testNames.map( () => 0 );

        const snapshotSummaries = [];
        for ( const snapshot of this.snapshots.slice( 0, MAX_SNAPSHOTS ) ) {
          snapshotSummaries.push( {
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
          } );
          await sleep( 0 ); // allow other async stuff to happen
        }

        const testAverageTimes = elapsedTimes.map( ( time, i ) => {
          if ( time === 0 ) {
            return time;
          }
          else {
            return time / numElapsedTimes[ i ];
          }
        } );
        const testWeights = [];
        for ( const names of testNames ) {
          const test = this.snapshots[ 0 ] && this.snapshots[ 0 ].findTest( names );
          if ( test ) {
            testWeights.push( Math.ceil( test.weight * 100 ) / 100 );
          }
          else {
            testWeights.push( 0 );
          }
          await sleep( 0 ); // allow other async stuff to happen
        }

        const report = {
          snapshots: snapshotSummaries,
          testNames: testNames,
          testAverageTimes: testAverageTimes,
          testWeights: testWeights
        };

        await sleep( 0 ); // allow other async stuff to happen

        this.reportJSON = JSON.stringify( report );
      }
      catch( e ) {
        this.setError( `report error: ${e}` );
      }

      await sleep( 5000 );
    }
  }

  /**
   * @private
   */
  cleanupOrphanedSnapshots() {
    winston.info( 'cleaning up orphaned snapshot directories' );
    try {
      const snapshotDir = `${this.rootDir}/ct-snapshots`;
      const snapshotNames = fs.readdirSync( snapshotDir );
      for ( let i = 0; i < snapshotNames.length; i++ ) {
        const timestamp = snapshotNames[ i ];
        if ( !_.find( this.snapshots, snapshot => `${snapshot.timestamp}` === timestamp ) ) {
          winston.info( `deleting orphaned snapshot: ${timestamp}` );
          deleteDirectory( `${snapshotDir}/${timestamp}` ).catch( e => winston.error( e ) );
        }
      }
    }
    catch( e ) {
      winston.error( e );
    }
  }
}

module.exports = ContinuousServer;