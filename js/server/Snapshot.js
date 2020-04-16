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
const gitRevParse = require( '../../../perennial/js/common/gitRevParse' );
const Test = require( './Test' );
const fs = require( 'fs' );
const _ = require( 'lodash' ); // eslint-disable-line

class Snapshot {
  /**
   * @param {string} rootDir
   * @param {function({string})} setSnapshotStatus
   */
  constructor( rootDir, setSnapshotStatus ) {
    // @private {string}
    this.rootDir = rootDir;

    // @private {function}
    this.setSnapshotStatus = setSnapshotStatus;
  }

  /**
   * Creates this snapshot.
   * @public
   */
  async create() {

    const timestamp = Date.now();
    const snapshotDir = `${this.rootDir}/ct-snapshots`;

    this.setSnapshotStatus( `Initializing new snapshot: ${timestamp}` );

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
      this.setSnapshotStatus( `Copying snapshot files: ${repo}` );
      await copyDirectory( `${this.rootDir}/${repo}`, `${this.directory}/${repo}`, {} );
    }

    this.setSnapshotStatus( 'Loading tests from perennial' );

    // @public {Array.<Test>}
    this.tests = JSON.parse( await execute( 'node', [ 'js/listContinuousTests.js' ], '../perennial' ) ).map( description => {
      return new Test( this, description );
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
    // TODO: can increase performance with different lookups
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
