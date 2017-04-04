// Copyright 2016, University of Colorado Boulder

/**
 * Runs simulation tests in an iframe, and passes results to our parent frame (continuous-loop.html).
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */
/* eslint-env node */
'use strict';

var options = QueryStringMachine.getAll( {
  url: {
    type: 'string',
    defaultValue: ''
  },
  duration: {
    type: 'number',
    defaultValue: 30000
  },
  simQueryParameters: {
    type: 'string',
    defaultValue: ''
  }
} );

var iframe = document.createElement( 'iframe' );
iframe.setAttribute( 'frameborder', '0' );
iframe.setAttribute( 'seamless', '1' );
iframe.setAttribute( 'width', 1024 / 2 );
iframe.setAttribute( 'height', 768 / 2 );
document.body.appendChild( iframe );

// Add those two to our query parameters, so we get load/error messages
iframe.src = options.url + '?postMessageOnLoad&postMessageOnError&postMessageOnBeforeUnload' + ( options.simQueryParameters ? '&' + options.simQueryParameters : '' );

var hasErrored = false;
var hasLoaded = false;
var durationExpired = false;

// Our duration timeout.
setTimeout( function() {
  durationExpired = true;
  if ( !hasErrored ) {
    if ( hasLoaded ) {
      // Only pass the 'run' if it loads AND doesn't error for the entire duration
      aqua.testPass( [ 'run' ] );
    }
    else {
      // If we didn't load, fail everything
      aqua.testFail( [ 'load' ], 'Did not load in time allowed: ' + options.duration + 'ms' );
      aqua.testFail( [ 'run' ], 'Did not load in time allowed: ' + options.duration + 'ms' );
    }
    aqua.nextTest();
  }
}, options.duration );

function onSimLoad() {
  console.log( 'loaded' );
  hasLoaded = true;

  // window.open stub on child. otherwise we get tons of "Report Problem..." popups that stall
  iframe.contentWindow.open = function() {
    return {
      focus: function() {},
      blur: function() {}
    };
  };

  aqua.testPass( [ 'load' ] );
}

function onSimError( data ) {
  console.log( 'error' );
  hasErrored = true;

  if ( data.message ) {
    console.log( 'message:\n' + data.message );
  }
  if ( data.stack ) {
    console.log( 'stack:\n' + data.stack );
  }

  if ( !hasLoaded ) {
    aqua.testFail( [ 'load' ], data.message + '\n' + data.stack );
  }
  aqua.testFail( [ 'run' ], data.message + '\n' + data.stack );
  aqua.nextTest();
}

function onSimUnload() {
  console.log( 'unload' );

  if ( !durationExpired && !hasErrored ) {
    hasErrored = true;
    console.log( 'Unloaded before duration expired' );

    if ( !hasLoaded ) {
      aqua.testFail( [ 'load' ], 'Unloaded frame before complete, window.location probably changed' );
    }
    aqua.testFail( [ 'run' ], 'Unloaded frame before complete, window.location probably changed' );
    aqua.nextTest();
  }
}

// handling messages from sims
window.addEventListener( 'message', function( evt ) {
  var data = JSON.parse( evt.data );

  // Sent by Joist due to the postMessage* query parameters
  if ( data.type === 'load' ) {
    onSimLoad();
  }
  else if ( data.type === 'error' ) {
    onSimError( data );
  }
  else if ( data.type === 'beforeUnload' ) {
    onSimUnload();
  }
} );
