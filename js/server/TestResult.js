// Copyright 2020, University of Colorado Boulder

/**
 * Holds data related to a specific test result
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

'use strict';

const assert = require( 'assert' );

class TestResult {
  /**
   * @param {Test} test
   * @param {boolean} passed
   * @param {number} [milliseconds]
   * @param {string|null} [message]
   */
  constructor( test, passed, milliseconds = 0, message = null ) {
    assert( typeof passed === 'boolean', 'passed should be a boolean' );

    // @public {Test}
    this.test = test;

    // @public {boolean}
    this.passed = passed;

    // @public {number}
    this.milliseconds = milliseconds;

    // @public {string|null}
    this.message = message || null;
  }

  /**
   * Creates a pojo-style object for saving/restoring
   *
   * @returns {Object}
   */
  serialize() {
    return {
      passed: this.passed,
      message: this.message
    };
  }

  /**
   * Creates the in-memory representation from the serialized form
   *
   * @param {Test} test
   * @param {Object} serialization
   * @returns {TestResult}
   */
  static deserialize( test, serialization ) {
    return new TestResult( test, serialization.passed, serialization.message );
  }
}

module.exports = TestResult;
