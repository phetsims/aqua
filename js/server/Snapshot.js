// Copyright 2020, University of Colorado Boulder

/**
 * Holds data related to a CT snapshot
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

'use strict';

const copyDirectory = require( '../../../perennial/js/common/copyDirectory' );
const createDirectory = require( '../../../perennial/js/common/createDirectory' );
const deleteDirectory = require( '../../../perennial/js/common/deleteDirectory' );
const execute = require( '../../../perennial/js/common/execute' );
const getRepoList = require( '../../../perennial/js/common/getRepoList' );
const gitLastCommitTimestamp = require( '../../../perennial/js/common/gitLastCommitTimestamp' );
const gitRevParse = require( '../../../perennial/js/common/gitRevParse' );
const Test = require( './Test' );
const fs = require( 'fs' );
const _ = require( 'lodash' ); // eslint-disable-line
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
  }

  /**
   * Creates this snapshot.
   * @public
   */
  async create() {

    const timestamp = Date.now();
    const snapshotDir = `${this.rootDir}/ct-snapshots`;

    this.setStatus( `Initializing new snapshot: ${timestamp}` );

    // @public {number}
    this.timestamp = timestamp;

    // @public {string}
    this.name = `snapshot-${timestamp}`;

    // @public {boolean}
    this.exists = true;

    // @public {string}
    this.directory = `${snapshotDir}/${timestamp}`;

    if ( !fs.existsSync( snapshotDir ) ) {
      await createDirectory( snapshotDir );
    }
    await createDirectory( this.directory );

    // @public {Array.<string>}
    this.repos = getRepoList( 'active-repos' );

    // @public {Object} - maps repo {string} => sha {string}
    this.shas = {};
    for ( const repo of this.repos ) {
      this.shas[ repo ] = await gitRevParse( repo, 'master' );
    }

    for ( const repo of this.repos ) {
      this.setStatus( `Copying snapshot files: ${repo}` );
      await copyDirectory( `${this.rootDir}/${repo}`, `${this.directory}/${repo}`, {} );
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
      catch ( e ) {
        winston.error( `Could not read dependencies of repo ${repo}: ${e}` );
      }
    }

    this.setStatus( 'Loading tests from perennial' );

    // @public {Array.<Test>}
    this.tests = JSON.parse( await execute( 'node', [ 'js/listContinuousTests.js' ], '../perennial' ) ).map( description => {
      const potentialRepo = description && description.test && description.test[ 0 ];

      return new Test( this, description, lastRepoTimestamps[ potentialRepo ] || 0, lastRunnableTimestamps[ potentialRepo ] || 0 );
    } );
  }

  /**
   * Removes the snapshot's files.
   * @public
   */
  async remove() {
    this.exists = false;

    await deleteDirectory( this.directory );
  }

  /**
   * Finds a given test by its names.
   * @public
   *
   * @param {Array.<string>} names
   * @returns {Test|null}
   */
  findTest( names ) {
    // TODO: can increase performance with different lookups (e.g. binary?)
    return _.find( this.tests, test => _.isEqual( test.names, names ) );
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
   *
   * @returns {Object}
   */
  serialize() {
    return {
      rootDir: this.rootDir,
      timestamp: this.timestamp,
      name: this.name,
      exists: this.exists,
      directory: this.directory,
      repos: this.repos,
      shas: this.shas,
      tests: this.tests.map( test => test.serialize() )
    };
  }

  /**
   * Creates the in-memory representation from the serialized form
   *
   * @param {Object} serialization
   * @returns {Snapshot}
   */
  static deserialize( serialization ) {
    const snapshot = new Snapshot( serialization.rootDir, () => {} );

    snapshot.timestamp = serialization.timestamp;
    snapshot.name = serialization.name;
    snapshot.exists = serialization.exists;
    snapshot.directory = serialization.directory;
    snapshot.repos = serialization.repos;
    snapshot.shas = serialization.shas;
    snapshot.tests = serialization.tests.map( testSerialization => Test.deserialize( snapshot, testSerialization ) );

    return snapshot;
  }
}

module.exports = Snapshot;
