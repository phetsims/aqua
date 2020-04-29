// Copyright 2020, University of Colorado Boulder

/**
 * Runs a phet-io wrapper test in an iframe, and passes results to our parent frame (continuous-loop.html).
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

'use strict';

// Because ES5 for IE11 compatibility
/* eslint-disable no-var */

var options = QueryStringMachine.getAll( {
  url: {
    type: 'string',
    defaultValue: ''
  },
  duration: {
    type: 'number',
    defaultValue: 60000
  },

  // By default, if the load doesn't happen, we'll just skip the test
  failIfNoLoad: {
    type: 'flag'
  }
} );

// Add those two to our query parameters, so we get load/error messages
var iframe = aqua.createFrame();
iframe.src = QueryStringMachine.appendQueryStringArray( options.url, [
  '?wrapperContinuousTest=' + encodeURIComponent( aqua.options.testInfo )
] );

var hasLoaded = false;

setTimeout( function() {
  if ( hasLoaded ) {
    aqua.simplePass(); // Only pass the 'run' if it loads AND doesn't error for the entire duration
  }
  else {
    if ( options.failIfNoLoad ) {
      aqua.simpleFail( 'did not load in ' + options.duration + 'ms' );
    }
    else {
      aqua.simpleSkip();
    }
  }
}, options.duration );

var testInfo = JSON.parse( aqua.options.testInfo );

// handling messages from sims
window.addEventListener( 'message', function( evt ) {
  if ( typeof evt.data !== 'string' ) {
    return;
  }
  var data = JSON.parse( evt.data );

  // Filter out any message that isn't directly from this test
  if ( data.continuousTest && _.isEqual( testInfo, data.continuousTest ) ) {
    console.log( data.type );

    // Sent by Joist due to the postMessage* query parameters
    if ( data.type === 'continuous-test-wrapper-error' ) {
      aqua.simpleFail( data.message + '\n' + data.stack );
    }
    else if ( data.type === 'continuous-test-wrapper-unload' ) {
      aqua.simpleFail( 'Unloaded frame before complete, window.location probably changed' );
    }
    else if ( data.type === 'continuous-test-wrapper-load' ) {
      // NOTE: loads may happen more than once, e.g. the mirror wrapper
      hasLoaded = true;
    }
  }
} );