// Copyright 2017-2020, University of Colorado Boulder

/*
 * Runs QUnit tests in an iframe, and passes results to our parent frame (continuous-loop.html).
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
    defaultValue: 200000
  }
} );

var iframe = aqua.createFrame();
iframe.src = options.url;

// Since QUnit doesn't give us an accurate "done" message, we just tally pass/fail counts
var passed = 0;
var failed = 0;
var receivedDone = false;
var message = '';

var done = function() {
  if ( id !== null ) {
    message = iframe.src + '\n' + passed + ' out of ' + ( passed + failed ) + ' tests passed. ' + failed + ' failed.\n' + message;
    if ( !receivedDone ) {
      message += '\nDid not complete in ' + options.duration + 'ms, may not have completed all tests';
      aqua.testFail( message );
    }
    else if ( passed > 0 && failed === 0 ) {
      aqua.testPass( message );
    }
    else {
      aqua.testFail( message );
    }
    id = null;
    aqua.nextTest();
  }
};

// Supports old tests (which do not know when they are done)
var id = setTimeout( done, options.duration );

window.addEventListener( 'message', function( evt ) {
  if ( typeof evt.data !== 'string' ) {
    return;
  }

  var data = JSON.parse( evt.data );

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
      receivedDone = true;
      done();
    }
  }
} );