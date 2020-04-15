// Copyright 2020, University of Colorado Boulder

/**
 * Holds data related to a CT snapshot
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

'use strict';

const copyDirectory = require( '../../perennial/js/common/copyDirectory' );
const createDirectory = require( '../../perennial/js/common/createDirectory' );
const deleteDirectory = require( '../../perennial/js/common/deleteDirectory' );
const execute = require( '../../perennial/js/common/execute' );
const getRepoList = require( '../../perennial/js/common/getRepoList' );
const gitRevParse = require( '../../perennial/js/common/gitRevParse' );
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

    // @public {Array.<string>}
    this.npmInstalledRepos = [];

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
    await deleteDirectory( this.directory );

    this.exists = false;
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
}

module.exports = Snapshot;
