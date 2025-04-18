// Copyright 2020-2025, University of Colorado Boulder

/**
 * Holds data related to a specific test.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */


const TestResult = require( './TestResult' );
const assert = require( 'assert' );
const _ = require( 'lodash' );

// constants
const LOCAL_TEST_TYPES = [
  'lint',
  'build',
  'npm-run'
];

const BROWSER_TEST_TYPES = [
  'sim-test',
  'qunit-test',
  'pageload-test',
  'wrapper-test'
];

const TEST_TYPES = [
  ...LOCAL_TEST_TYPES,
  ...BROWSER_TEST_TYPES,
  'internal' // Used for tests that aqua itself generates
];

class Test {
  /**
   * @param {Snapshot} snapshot
   * @param {Object} description - from listContinuousTests.js
   * @param {number} repoCommitTimestamp
   * @param {number} dependenciesCommitTimestamp
   */
  constructor( snapshot, description, repoCommitTimestamp, dependenciesCommitTimestamp = 0 ) {
    assert( Array.isArray( description.test ), 'Test descriptions should have a test-name array' );
    assert( typeof description.type === 'string', 'Test descriptions should have a type' );
    assert( TEST_TYPES.includes( description.type ), `Unknown type: ${description.type}` );

    // @public {Snapshot}
    this.snapshot = snapshot;

    // @private {Object} - Saved for future serialization
    this.description = description;

    // @public {number}
    this.repoCommitTimestamp = repoCommitTimestamp;
    this.dependenciesCommitTimestamp = dependenciesCommitTimestamp;

    // @public {Array.<string>}
    this.names = description.test;

    // @public {string} - Used for faster lookups, single tests, etc. - ephemeral
    this.nameString = Test.namesToNameString( this.names );

    // @public {string}
    this.type = description.type;

    // @public {Array.<TestResult>}
    this.results = [];

    // @public {number}
    this.priority = 1;

    // @public {number} - ephemeral
    this.weight = 1; // a default so things will work in case it isn't immediately set

    if ( description.priority ) {
      assert( typeof description.priority === 'number', 'priority should be a number' );

      this.priority = description.priority;
    }

    // @public {string|null}
    this.repo = null;

    if ( LOCAL_TEST_TYPES.includes( this.type ) ) {
      assert( typeof description.repo === 'string', `${this.type} tests should have a repo` );

      this.repo = description.repo;
    }

    // @public {Array.<string>}
    this.brands = null;

    if ( this.type === 'build' ) {
      assert( Array.isArray( description.brands ), 'build tests should have a brands' );

      this.brands = description.brands;
    }

    // @public {string|null}
    this.url = null;

    if ( BROWSER_TEST_TYPES.includes( this.type ) ) {
      assert( typeof description.url === 'string', `${this.type} tests should have a url` );

      this.url = description.url;
    }

    // @public {string|null}
    this.queryParameters = null;

    if ( description.queryParameters ) {
      assert( typeof description.queryParameters === 'string', 'queryParameters should be a string if provided' );
      this.queryParameters = description.queryParameters;
    }

    // @public {string|null}
    this.testQueryParameters = null;

    if ( description.testQueryParameters ) {
      assert( typeof description.testQueryParameters === 'string', 'testQueryParameters should be a string if provided' );
      this.testQueryParameters = description.testQueryParameters;
    }

    // @public {Array.<string>} - The repos that need to be built before this test will be provided
    this.buildDependencies = [];

    if ( description.buildDependencies ) {
      assert( Array.isArray( description.buildDependencies ), 'buildDependencies should be an array' );

      this.buildDependencies = description.buildDependencies;
    }

    // @public {boolean} - For server-side tests run only once
    this.complete = false;

    // @public {boolean} - For server-side tests run only once, indicating it was successful
    this.success = false;

    // @public {number} - For browser-side tests, the number of times we have sent this test to a browser
    this.count = 0;
  }

  get testCommand() {
    assert( this.type === 'npm-run', 'command only supported for npm running' );
    return this.description.command;
  }

  /**
   * Records a test result
   * @public
   *
   * @param {boolean} passed
   * @param {number} milliseconds
   * @param {string|null} [message]
   */
  recordResult( passed, milliseconds, message ) {
    this.results.push( new TestResult( this, passed, milliseconds, message ) );
  }

  /**
   * Whether this test can be run locally.
   * @public
   *
   * @returns {boolean}
   */
  isLocallyAvailable() {
    return !this.complete && LOCAL_TEST_TYPES.includes( this.type );
  }

  /**
   * Whether this test can be run in a browser.
   * @public
   *
   * @returns {boolean}
   */
  isBrowserAvailable() {
    if ( !BROWSER_TEST_TYPES.includes( this.type ) ) {
      return false;
    }

    if ( this.buildDependencies ) {
      for ( const repo of this.buildDependencies ) {
        const buildTest = _.find( this.snapshot.tests, test => test.type === 'build' && test.repo === repo );

        if ( !buildTest || !buildTest.success ) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Returns the object sent to the browser for this test.
   * @public
   *
   * @returns {Object}
   */
  getObjectForBrowser() {
    assert( BROWSER_TEST_TYPES.includes( this.type ), 'Needs to be a browser test' );

    const baseURL = this.snapshot.useRootDir ? '../..' : `../../ct-snapshots/${this.snapshot.timestamp}`;
    let url;

    if ( this.type === 'sim-test' ) {
      url = `sim-test.html?url=${encodeURIComponent( `${baseURL}/${this.url}` )}`;

      if ( this.queryParameters ) {
        url += `&simQueryParameters=${encodeURIComponent( this.queryParameters )}`;
      }
    }
    else if ( this.type === 'qunit-test' ) {
      url = `qunit-test.html?url=${encodeURIComponent( `${baseURL}/${this.url}` )}`;
    }
    else if ( this.type === 'pageload-test' ) {
      url = `pageload-test.html?url=${encodeURIComponent( `${baseURL}/${this.url}` )}`;
    }
    else if ( this.type === 'wrapper-test' ) {
      url = `wrapper-test.html?url=${encodeURIComponent( `${baseURL}/${this.url}` )}`;
    }
    if ( this.testQueryParameters ) {
      url = `${url}&${this.testQueryParameters}`;
    }

    return {
      snapshotName: this.snapshot.name,
      test: this.names,
      url: url,
      timestamp: Date.now()
    };
  }

  /**
   * Returns a single string from a list of names
   * @public
   *
   * @param {Array.<string>} names
   * @returns {string}
   */
  static namesToNameString( names ) {
    return names.join( '.' );
  }

  /**
   * Creates a pojo-style object for saving/restoring
   * @public
   *
   * @returns {Object}
   */
  serialize() {
    return {
      description: this.description,
      results: this.results.map( testResult => testResult.serialize() ),
      complete: this.complete,
      success: this.success,
      count: this.count,
      repoCommitTimestamp: this.repoCommitTimestamp,
      dependenciesCommitTimestamp: this.dependenciesCommitTimestamp
    };
  }

  /**
   * Creates the in-memory representation from the serialized form
   * @public
   *
   * @param {Snapshot} snapshot
   * @param {Object} serialization
   * @returns {Test}
   */
  static deserialize( snapshot, serialization ) {
    const test = new Test( snapshot, serialization.description, serialization.repoCommitTimestamp, serialization.dependenciesCommitTimestamp );

    test.complete = serialization.complete;
    test.success = serialization.success;
    test.count = serialization.count;

    test.results = serialization.results.map( resultSerialization => TestResult.deserialize( test, resultSerialization ) );

    return test;
  }
}

module.exports = Test;