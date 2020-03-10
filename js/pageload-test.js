// Copyright 2018-2020, University of Colorado Boulder

/*
 * Runs arbitrary content in an iframe (that presumably loads pageload-connector.js) and reports if it successfully
 * loads and runs for a short amount of time without erroring
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

'use strict';

const options = QueryStringMachine.getAll( {
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

const iframe = document.createElement( 'iframe' );
iframe.setAttribute( 'frameborder', '0' );
iframe.setAttribute( 'seamless', '1' );
iframe.setAttribute( 'width', '512' );
iframe.setAttribute( 'height', '384' );
document.body.appendChild( iframe );

iframe.src = options.url;

let hasErrored = false;
let hasLoaded = false;
let durationExpired = false;

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

    aqua.testFail( [ 'load' ], iframe.src + '\n' + data.message + '\n' + data.stack );
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
  if ( data.type === 'pageload-load' ) {
    onPageLoad();
  }
  else if ( data.type === 'pageload-error' ) {
    onPageError( data );
  }
} );
