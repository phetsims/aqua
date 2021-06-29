// Copyright 2020-2021, University of Colorado Boulder

/*
 * Common functions used to communicate from test wrappers to continuous-loop.html (assumed to be the parent frame).
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */


( () => {
  const aquaOptions = QueryStringMachine.getAll( {
    testInfo: {
      type: 'string',
      defaultValue: '{}'
    },
    width: {
      type: 'number',
      defaultValue: 512
    },
    height: {
      type: 'number',
      defaultValue: 384
    }
  } );

  let sentMessage = false;
  let iframe = null;

  window.aqua = {
    // @public {Object}
    options: aquaOptions,

    /**
     * Creates an iframe, adds it to the body, and returns it
     * @public
     *
     * @returns {HTMLIFrameElement}
     */
    createFrame: function() {
      iframe = document.createElement( 'iframe' );
      iframe.setAttribute( 'frameborder', '0' );
      iframe.setAttribute( 'seamless', '1' );
      iframe.setAttribute( 'width', `${aquaOptions.width}` );
      iframe.setAttribute( 'height', `${aquaOptions.height}` );
      document.body.appendChild( iframe );
      return iframe;
    },

    /**
     * Moves to the next test, clearing out the iframe.
     * @public
     */
    simpleFinish: function() {
      if ( iframe ) {
        iframe.src = 'about:blank';
      }
      aqua.nextTest();
    },

    /**
     * Records a pass for a pass/skip/fail test.
     * @public
     *
     * @param {string} [message]
     */
    simplePass: function( message ) {
      if ( sentMessage ) { return; }
      sentMessage = true;

      aqua.testPass( message );
      aqua.simpleFinish();
    },

    /**
     * Records a skip for a pass/skip/fail test.
     * @public
     */
    simpleSkip: function() {
      if ( sentMessage ) { return; }
      sentMessage = true;

      aqua.simpleFinish();
    },

    /**
     * Records a fail for a pass/skip/fail test.
     * @public
     *
     * @param {string} message
     */
    simpleFail: function( message ) {
      if ( sentMessage ) { return; }
      sentMessage = true;

      aqua.testFail( ( iframe ? `${iframe.src}\n` : '' ) + message );
      aqua.simpleFinish();
    },

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
      console.log( `[PASS] ${message}` );
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
      console.log( `[FAIL] ${message}` );
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
} )();
