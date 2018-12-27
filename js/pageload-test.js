// Copyright 2016, University of Colorado Boulder

/*
 * Runs arbitrary content in an iframe (that presumably loads pageload-connector.js) and reports if it successfully
 * loads and runs for a short amount of time without erroring
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

'use strict';

var options = QueryStringMachine.getAll( {
  url: {
    type: 'string',
    defaultValue: ''
  },
  // If the page doesn't report back by this {number} of milliseconds, then report a failure.
  duration: {
    type: 'number',
    defaultValue: 30000
  }
} );

var iframe = document.createElement( 'iframe' );
iframe.setAttribute( 'frameborder', '0' );
iframe.setAttribute( 'seamless', '1' );
iframe.setAttribute( 'width', 1024 / 2 );
iframe.setAttribute( 'height', 768 / 2 );
document.body.appendChild( iframe );

iframe.src = options.url;

var hasErrored = false;
var hasLoaded = false;
var durationExpired = false;

// Our duration timeout.
setTimeout( function() {
  if ( !hasLoaded && !hasErrored && !durationExpired ) {
    durationExpired = true;
    aqua.testFail( [ 'load' ], 'Did not load in the time allowed: ' + options.duration + 'ms' );
    aqua.nextTest();
  }
}, options.duration );

function onPageLoad() {
  console.log( 'loaded' );
  if ( !hasLoaded && !hasErrored && !durationExpired ) {
    hasLoaded = true;
    aqua.testPass( [ 'load' ] );
    aqua.nextTest();
  }
}

function onPageError( data ) {
  console.log( 'error' );
  if ( !hasLoaded && !hasErrored && !durationExpired ) {
    hasErrored = true;

    if ( data.message ) {
      console.log( 'message:\n' + data.message );
    }
    if ( data.stack ) {
      console.log( 'stack:\n' + data.stack );
    }

    aqua.testFail( [ 'load' ], data.message + '\n' + data.stack );
    aqua.nextTest();
  }
}

// handling messages from sims
window.addEventListener( 'message', function( evt ) {
  var data = JSON.parse( evt.data );

  // Sent by Joist due to the postMessage* query parameters
  if ( data.type === 'pageload-load' ) {
    onPageLoad();
  }
  else if ( data.type === 'pageload-error' ) {
    onPageError( data );
  }
} );
