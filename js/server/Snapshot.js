// Copyright 2020-2022, University of Colorado Boulder

/**
 * Holds data related to a CT snapshot
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */


const copyDirectory = require( '../../../perennial/js/common/copyDirectory' );
const createDirectory = require( '../../../perennial/js/common/createDirectory' );
const deleteDirectory = require( '../../../perennial/js/common/deleteDirectory' );
const execute = require( '../../../perennial/js/common/execute' );
const getRepoList = require( '../../../perennial/js/common/getRepoList' );
const gitLastCommitTimestamp = require( '../../../perennial/js/common/gitLastCommitTimestamp' );
const gitRevParse = require( '../../../perennial/js/common/gitRevParse' );
const Test = require( './Test' );
const fs = require( 'fs' );
const winston = require( 'winston' );

class Snapshot {
  /**
   * @param {string} rootDir
   * @param {function({string})} setStatus
   */
  constructor( rootDir, setStatus ) {
    // @public {string}
    this.rootDir = rootDir;

    // @private {function}
    this.setStatus = setStatus;

    // @private {boolean}
    this.constructed = false;
  }

  /**
   * Creates this snapshot.
   * @public
   *
   * @param {boolean} [useRootDir] - If true, we won't create/copy, and we'll just use the files there instead
   */
  async create( useRootDir = false ) {

    const timestamp = Date.now();
    const snapshotDir = `${this.rootDir}/ct-snapshots`;

    this.setStatus( `Initializing new snapshot: ${timestamp}` );

    // @public {boolean}
    this.useRootDir = useRootDir;

    // @public {number}
    this.timestamp = timestamp;

    // @public {string}
    this.name = `snapshot-${timestamp}`;

    // @public {boolean}
    this.exists = true;

    // @public {string|null} - Set to null when it's deleted fully
    this.directory = useRootDir ? this.rootDir : `${snapshotDir}/${timestamp}`;

    if ( !useRootDir ) {
      if ( !fs.existsSync( snapshotDir ) ) {
        await createDirectory( snapshotDir );
      }
      await createDirectory( this.directory );
    }

    // @public {Array.<string>}
    this.repos = getRepoList( 'active-repos' );

    // @public {Object} - maps repo {string} => sha {string}
    this.shas = {};
    for ( const repo of this.repos ) {
      this.shas[ repo ] = await gitRevParse( repo, 'master' );
    }

    if ( !useRootDir ) {
      for ( const repo of this.repos ) {
        this.setStatus( `Copying snapshot files: ${repo}` );
        await copyDirectory( `${this.rootDir}/${repo}`, `${this.directory}/${repo}`, {} );
      }
    }

    this.setStatus( 'Scanning commit timestamps' );

    const lastRepoTimestamps = {};
    for ( const repo of this.repos ) {
      lastRepoTimestamps[ repo ] = await gitLastCommitTimestamp( repo );
    }

    const lastRunnableTimestamps = {};
    for ( const repo of getRepoList( 'active-runnables' ) ) {
      this.setStatus( `Scanning dependencies for timestamps: ${repo}` );
      try {
        const output = await execute( 'node', [ 'js/scripts/print-dependencies.js', repo ], `${this.rootDir}/chipper` );
        const dependencies = output.trim().split( ',' );
        let timestamp = 0;
        for ( const dependency of dependencies ) {
          const dependencyTime = lastRepoTimestamps[ dependency ];
          if ( dependencyTime && dependencyTime > timestamp ) {
            timestamp = dependencyTime;
          }
        }
        if ( timestamp ) {
          lastRunnableTimestamps[ repo ] = timestamp;
        }
      }
      catch( e ) {
        winston.error( `Could not read dependencies of repo ${repo}: ${e}` );
      }
    }

    this.setStatus( 'Loading tests from perennial' );

    // @public {Array.<Test>}
    this.tests = JSON.parse( await execute( 'node', [ 'js/listContinuousTests.js' ], '../perennial' ) ).map( description => {
      const potentialRepo = description && description.test && description.test[ 0 ];

      return new Test( this, description, lastRepoTimestamps[ potentialRepo ] || 0, lastRunnableTimestamps[ potentialRepo ] || 0 );
    } );

    const listContinuousTestsTest = new Test( this, {
      test: [ 'perennial', 'listContinuousTests' ],
      type: 'internal'
    }, lastRepoTimestamps.perennial || 0, lastRunnableTimestamps.perennial || 0 );
    this.tests.push( listContinuousTestsTest );

    let continuousTestErrorString = '';

    // @public {Object.<nameString:string,Test>} - ephemeral, we use this.tests for saving things
    this.testMap = {};
    this.tests.forEach( test => {
      if ( this.testMap[ test.nameString ] ) {
        continuousTestErrorString += `Duplicate test specified in listContinuousTests: ${test.nameString}\n`;
      }
      this.testMap[ test.nameString ] = test;
    } );

    if ( continuousTestErrorString.length ) {
      listContinuousTestsTest.recordResult( false, 0, continuousTestErrorString );
    }
    else {
      listContinuousTestsTest.recordResult( true, 0, null );
    }

    this.constructed = true;
  }

  /**
   * Removes the snapshot's files.
   * @public
   */
  async remove() {
    this.exists = false;

    if ( !this.useRootDir ) {
      await deleteDirectory( this.directory );
    }

    this.directory = null;
  }

  /**
   * Finds a given test by its names.
   * @public
   *
   * @param {Array.<string>} names
   * @returns {Test|null}
   */
  findTest( names ) {
    return this.testMap[ Test.namesToNameString( names ) ] || null;
  }

  /**
   * Returns all of the available local tests.
   * @public
   *
   * @returns {Array.<Object>}
   */
  getAvailableLocalTests() {
    return this.tests.filter( test => test.isLocallyAvailable() );
  }

  /**
   * Returns all of the available browser tests.
   * @public
   *
   * @param {boolean} es5Only
   * @returns {Array.<Object>}
   */
  getAvailableBrowserTests( es5Only ) {
    return this.tests.filter( test => test.isBrowserAvailable( es5Only ) );
  }

  /**
   * Creates a pojo-style object for saving/restoring
   * @public
   *
   * @returns {Object}
   */
  serialize() {
    if ( !this.constructed ) {
      return this.serializeStub();
    }
    else {
      return {
        rootDir: this.rootDir,
        useRootDir: this.useRootDir,
        timestamp: this.timestamp,
        constructed: this.constructed,
        name: this.name,
        exists: this.exists,
        directory: this.directory,
        repos: this.repos,
        shas: this.shas,
        tests: this.tests.map( test => test.serialize() )
      };
    }
  }

  /**
   * Creates a pojo-style object for saving/restoring, but meant for tracking references so we can clean up things.
   * @public
   *
   * @returns {Object}
   */
  serializeStub() {
    return {
      rootDir: this.rootDir,
      constructed: this.constructed,
      directory: this.directory,
      useRootDir: this.useRootDir
    };
  }

  /**
   * Creates the in-memory representation from the serialized form
   * @public
   *
   * @param {Object} serialization
   * @returns {Snapshot}
   */
  static deserialize( serialization ) {
    const snapshot = new Snapshot( serialization.rootDir, () => {} );

    snapshot.useRootDir = serialization.useRootDir || false;
    snapshot.constructed = serialization.constructed === undefined ? true : serialization.constructed;
    snapshot.timestamp = serialization.timestamp;
    snapshot.name = serialization.name;
    snapshot.exists = serialization.exists;
    snapshot.directory = serialization.directory;
    snapshot.repos = serialization.repos;
    snapshot.shas = serialization.shas;
    snapshot.tests = serialization.tests.map( testSerialization => Test.deserialize( snapshot, testSerialization ) );
    snapshot.testMap = {};
    snapshot.tests.forEach( test => {
      snapshot.testMap[ test.nameString ] = test;
    } );

    return snapshot;
  }

  /**
   * Creates the in-memory representation from the stub serialized form
   * @public
   *
   * @param {Object} serialization
   * @returns {Snapshot}
   */
  static deserializeStub( serialization ) {
    const snapshot = new Snapshot( serialization.rootDir, () => {} );

    snapshot.constructed = serialization.constructed === undefined ? true : serialization.constructed;
    snapshot.directory = serialization.directory;
    snapshot.useRootDir = serialization.useRootDir || false;

    return snapshot;
  }
}

module.exports = Snapshot;
