// Copyright 2017-2022, University of Colorado Boulder

/*
 * Runs QUnit tests in an iframe, and passes results to our parent frame (continuous-loop.html).
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */


( () => {
  const options = QueryStringMachine.getAll( {
    url: {
      type: 'string',
      defaultValue: ''
    },
    duration: {
      type: 'number',
      defaultValue: 300000
    }
  } );

  const iframe = aqua.createFrame();
  iframe.src = options.url;

  // Since QUnit doesn't give us an accurate "done" message, we just tally pass/fail counts
  let passed = 0;
  let failed = 0;
  let receivedDone = false;
  let message = '';
  let error = '';

  const done = function() {
    if ( id !== null ) {
      message = `${iframe.src}\n${passed} out of ${passed + failed} tests passed. ${failed} failed.\n${message}`;
      if ( !receivedDone ) {
        if ( error ) {
          message += `\n${error}`;
        }
        else {
          message += `\nDid not complete in ${options.duration}ms, may not have completed all tests`;
        }
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
  let id = setTimeout( done, options.duration );

  window.addEventListener( 'message', async evt => {
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
        message += `${data.module}: ${data.name} failed:\n${data.message}\n${data.source}\n\n`;
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
    else if ( data.type === 'error' ) {
      clearTimeout( id );

      const transpiledStacktrace = await window.transpileStacktrace( data.stack );
      error = data.message + transpiledStacktrace;
      done();
    }
  } );
} )();