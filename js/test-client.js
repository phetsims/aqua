// Copyright 2017-2019, University of Colorado Boulder

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
   * @param {string|undefined} message
   */
  testPass: function( message ) {
    aqua.sendMessage( {
      type: 'test-pass',
      message: message,
      testInfo: JSON.parse( aquaOptions.testInfo )
    } );
    console.log( '[PASS] ' + message );
  },

  /**
   * Sends a test failure.
   * @public
   *
   * @param {string|undefined} message
   */
  testFail: function( message ) {
    // Don't send timeouts as failures, since it doesn't usually indicate an underlying problem
    if ( message.indexOf( 'errors.html#timeout' ) < 0 ) {
      aqua.sendMessage( {
        type: 'test-fail',
        message: message,
        testInfo: JSON.parse( aquaOptions.testInfo )
      } );
    }
    console.log( '[FAIL] ' + message );
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
