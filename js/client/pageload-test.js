// Copyright 2020, University of Colorado Boulder

/*
 * Runs arbitrary content in an iframe (that presumably loads pageload-connector.js) and reports if it successfully
 * loads and runs for a short amount of time without erroring
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
  // If the page doesn't report back by this {number} of milliseconds, then report a failure.
  duration: {
    type: 'number',
    defaultValue: 30000
  }
} );

var iframe = aqua.createFrame();
iframe.src = options.url;

setTimeout( function() {
  aqua.simpleFail( 'Did not load in the time allowed: ' + options.duration + 'ms' );
}, options.duration );

// handling messages from the page
window.addEventListener( 'message', function( evt ) {
  if ( typeof evt.data !== 'string' ) {
    return;
  }

  var data = JSON.parse( evt.data );

  // Sent by Joist due to the postMessage* query parameters
  if ( data.type === 'pageload-load' ) {
    aqua.simplePass();
  }
  else if ( data.type === 'pageload-error' ) {
    aqua.simpleFail( data.message + '\n' + data.stack );
  }
} );
