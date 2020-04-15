// Copyright 2017-2020, University of Colorado Boulder

/**
 * Runs simulation tests in an iframe, and passes results to our parent frame (continuous-loop.html).
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

'use strict';

const options = QueryStringMachine.getAll( {
  url: {
    type: 'string',
    defaultValue: ''
  },
  duration: {
    type: 'number',
    defaultValue: 120000
  },
  simQueryParameters: {
    type: 'string',
    defaultValue: ''
  }
} );

const iframe = document.createElement( 'iframe' );
iframe.setAttribute( 'frameborder', '0' );
iframe.setAttribute( 'seamless', '1' );
iframe.setAttribute( 'width', '512' );
iframe.setAttribute( 'height', '384' );
document.body.appendChild( iframe );

// Add those two to our query parameters, so we get load/error messages
iframe.src = QueryStringMachine.appendQueryStringArray( options.url,
  [ '?postMessageOnLoad&postMessageOnError&postMessageOnBeforeUnload', options.simQueryParameters ] );

let hasErrored = false;
let hasLoaded = false;
let durationExpired = false;

// Our duration timeout.
setTimeout( function() {
  durationExpired = true;
  if ( !hasErrored ) {
    if ( hasLoaded ) {
      // Only pass the 'run' if it loads AND doesn't error for the entire duration
      aqua.testPass();
    }
    else {
      // If we didn't load, assume it's because of testing load (don't fail for now, but leave in commented bits)
      // aqua.testFail( 'Did not load in time allowed: ' + options.duration + 'ms' );
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

  const failMessage = iframe.src + '\n' + ( options.simQueryParameters ? ( 'Query: ' + options.simQueryParameters + '\n' ) : '' ) + data.message + '\n' + data.stack;

  aqua.testFail( failMessage );
  aqua.nextTest();
}

function onSimUnload() {
  console.log( 'unload' );

  if ( !durationExpired && !hasErrored ) {
    hasErrored = true;
    console.log( 'Unloaded before duration expired' );

    aqua.testFail( 'Unloaded frame before complete, window.location probably changed' );
    aqua.nextTest();
  }
}

// handling messages from sims
window.addEventListener( 'message', function( evt ) {
  if ( typeof evt.data !== 'string' ) {
    return;
  }
  const data = JSON.parse( evt.data );

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
