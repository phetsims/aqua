// Copyright 2016, University of Colorado Boulder

/*
 * Runs QUnit tests in an iframe, and passes results to our parent frame (continuous-loop.html).
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
    defaultValue: 400000
  }
} );

const iframe = document.createElement( 'iframe' );
iframe.setAttribute( 'frameborder', '0' );
iframe.setAttribute( 'seamless', '1' );
iframe.setAttribute( 'width', 1024 / 2 );
iframe.setAttribute( 'height', 768 / 2 );
document.body.appendChild( iframe );

iframe.src = options.url;

// Since QUnit doesn't give us an accurate "done" message, we just tally pass/fail counts and wait for a certain amount of time to report back.
let passed = 0;
let failed = 0;
let message = '';

const done = function() {
  if ( id !== null ) {
    message = passed + ' out of ' + ( passed + failed ) + ' tests passed. ' + failed + ' failed.\n' + message;
    if ( passed > 0 && failed === 0 ) {
      aqua.testPass( [], message );
    }
    else {
      aqua.testFail( [], message );
    }
    id = null;
    aqua.nextTest();
  }
};

// Supports old tests (which do not know when they are done)
let id = setTimeout( done, options.duration );

window.addEventListener( 'message', function( evt ) {
  if ( typeof evt.data !== 'string' ) {
    return;
  }

  const data = JSON.parse( evt.data );

  // Sent from all of our QUnit wrappers
  if ( data.type === 'qunit-test' ) {
    if ( data.result ) {
      passed++;
    }
    else {
      failed++;
      message += data.module + ': ' + data.name + ' failed:\n' + data.message + '\n' + data.source + '\n\n';
    }
  }

  else if ( data.type === 'qunit-done' ) {

    // Supports new tests, which know when they are done
    failed = data.failed;
    passed = data.passed;

    if ( id !== null ) {
      clearTimeout( id );
      done();
    }
  }
} );