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
const fs = require( 'fs' );
const _ = require( 'lodash' ); // eslint-disable-line

class CTSnapshot {
  /**
   * Creates this snapshot.
   * @public
   *
   * @param {string} rootDir
   * @param {function({string})} setSnapshotStatus
   */
  async create( rootDir, setSnapshotStatus ) {

    // @private {string}
    this.rootDir = rootDir;

    // @private {function}
    this.setSnapshotStatus = setSnapshotStatus;

    const timestamp = Date.now();
    const snapshotDir = `${rootDir}/ct-snapshots`;

    this.setSnapshotStatus( `Initializing new snapshot: ${timestamp}` );

    // @public {number}
    this.timestamp = timestamp;

    // @public {string}
    this.name = `snapshot-${timestamp}`;

    // @public {boolean}
    this.exists = true;

    // @public {string}
    this.phetDir = `${snapshotDir}/${timestamp}-phet`;
    this.phetioDir = `${snapshotDir}/${timestamp}-phet-io`;

    if ( !fs.existsSync( snapshotDir ) ) {
      await createDirectory( snapshotDir );
    }
    await createDirectory( this.phetDir );
    await createDirectory( this.phetioDir );

    this.setSnapshotStatus( 'Copying snapshot files' );

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
      await copyDirectory(  `${rootDir}/${repo}`, `${this.phetDir}/${repo}`, {} );
      await copyDirectory(  `${rootDir}/${repo}`, `${this.phetioDir}/${repo}`, {} );
    }

    // @public {Array.<Object>}
    this.tests = JSON.parse( await execute( 'node', [ 'js/listContinuousTests.js' ], '../perennial' ) ).map( test => {
      test.snapshot = this;
      return test;
    } );
    this.browserTests = this.tests.filter( test => [ 'sim-test', 'qunit-test', 'pageload-test' ].includes( test.type ) ).map( test => {
      test.count = 0;
      return test;
    } );
    this.lintTests = this.tests.filter( test => test.type === 'lint' ).map( test => {
      test.complete = false;
      return test;
    } );
    this.buildTests = this.tests.filter( test => test.type === 'build' ).map( test => {
      test.complete = false;
      test.success = false;
      return test;
    } );
  }

  /**
   * Removes the snapshot's files.
   * @public
   */
  async remove() {
    await deleteDirectory( this.phetDir );
    await deleteDirectory( this.phetioDir );

    this.exists = false;
  }

  getAvailableBrowserTests( es5Only ) {
    return this.browserTests.filter( test => {
      if ( es5Only && !test.es5 ) {
        return false;
      }

      if ( test.buildDependencies ) {
        for ( const dependency of test.buildDependencies ) {
          if ( !_.some( this.buildTests, buildTest => buildTest.repo === dependency && buildTest.brand === test.brand && buildTest.success ) ) {
            return false;
          }
        }
      }

      return true;
    } );
  }
}

module.exports = CTSnapshot;
