// Copyright 2016, University of Colorado Boulder

/*
 * Common functions used to communicate from test wrappers to continuous-loop.html (assumed to be the parent frame).
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

'use strict';

const aquaOptions = QueryStringMachine.getAll( {
  testInfo: {
    type: 'string',
    defaultValue: ''
  }
} );

window.aqua = {
  /**
   * Sends a post message.
   * @private
   *
   * @param {Object} message
   */
  sendMessage: function( message ) {
    ( window.parent !== window ) && window.parent.postMessage( JSON.stringify( message ), '*' );
  },

  /**
   * Sends a test pass.
   * @public
   *
   * @param {Array.<string>} names - Test names, e.g. [ 'build-a-molecule', 'fuzz', 'require.js' ]
   * @param {string|undefined} message
   */
  testPass: function( names, message ) {
    aqua.sendMessage( {
      type: 'test-pass',
      names: names,
      message: message,
      testInfo: JSON.parse( aquaOptions.testInfo )
    } );
    console.log( '[PASS] ' + names.join( ',' ) + ' - ' + message );
  },

  /**
   * Sends a test failure.
   * @public
   *
   * @param {Array.<string>} names - Test names, e.g. [ 'build-a-molecule', 'fuzz', 'require.js' ]
   * @param {string|undefined} message
   */
  testFail: function( names, message ) {
    // Don't send timeouts as failures, since it doesn't usually indicate an underlying problem
    if ( message.indexOf( 'errors.html#timeout' ) < 0 ) {
      aqua.sendMessage( {
        type: 'test-fail',
        names: names,
        message: message,
        testInfo: JSON.parse( aquaOptions.testInfo )
      } );
    }
    console.log( '[FAIL] ' + names.join( ',' ) + ' - ' + message );
  },

  /**
   * Sends a request to move to the next test
   * @public
   */
  nextTest: function() {
    aqua.sendMessage( {
      type: 'test-next'
    } );
    console.log( '[NEXT TEST]' );
  }
};
