// Copyright 2016, University of Colorado Boulder

/**
 * Continuously loops tests, by:
 * 1. Request a test from the server (continuous-server.js)
 * 2. Run the test (reporting results back)
 * 3. Detect when we need to run another test, going to (1)
 *
 * On bayes, can open with:
 * xvfb-run --server-args='-screen 0, 1024x768x16' google-chrome -start-maximized -ignore-certificate-errors -new-window -disable-gpu https://bayes.colorado.edu/continuous-testing/aqua/html/continuous-loop.html
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

'use strict';

const options = QueryStringMachine.getAll( {
  id: {
    type: 'string'
  },
  old: {
    type: 'flag'
  }
} );

// Ignore current port, keep protocol and host.
const serverOrigin = window.location.protocol + '//' + window.location.hostname;

// iframe that will contain qunit-test.html/sim-test.html/etc.
const iframe = document.createElement( 'iframe' );
iframe.setAttribute( 'frameborder', '0' );
iframe.setAttribute( 'seamless', '1' );
iframe.setAttribute( 'width', 1024 * 0.75 );
iframe.setAttribute( 'height', 768 * 0.75 );
document.body.appendChild( iframe );

const infoElement = document.createElement( 'pre' );
document.body.appendChild( infoElement );

// {Array.<string>} - Information about the current test, filled in later.
let test = null;

// {string} - The name of the snapshot that our test is executing in, filled in later.
let snapshotName = null;

// {number} - Timeout that will force moving to another test (if our test in our iframe doesn't notify us it is time, e.g. something is broken)
let timeout = null;

/**
 * Resets our "force move to next test" timer. Should only kick in when our iframe test has failed.
 * @private
 */
function resetTimer() {
  if ( timeout !== null ) {
    clearTimeout( timeout );
  }
  timeout = setTimeout( nextTest, 5 * 60000 ); // 5min "restart, something probably broke"
}

/**
 * Kicks off moving to the next test.
 * @private
 */
function nextTest() {
  iframe.src = 'about:blank';

  const req = new XMLHttpRequest();
  req.onload = function() {
    try {
      const data = JSON.parse( req.responseText );

      // kick off loading our iframe
      iframe.src = data.url;

      // record test information
      test = data.test;
      snapshotName = data.snapshotName;

      infoElement.textContent = JSON.stringify( data, null, 2 );
      document.title = 'Continuous Testing loop for: ' + test.join( ' : ' );
    }
    catch( e ) {
      console.log( 'parse error?' );

      // On parse failure, just try again with a delay (don't hammer the server)
      setTimeout( nextTest, 5000 );
    }
  };
  req.onerror = function() {
    console.log( 'XHR error?' );

    // On connection failure, just try again with a delay (don't hammer the server)
    setTimeout( nextTest, 60000 ); // 1min
  };
  req.open( 'get', serverOrigin + '/aquaserver/next-test?old=' + options.old, true );
  req.send();
  resetTimer();
}

/**
 * Send a test result to the server.
 * @private
 *
 * @param {Array.<string>} names
 * @param {string|undefined} message
 * @param {boolean} passed
 */
function sendTestResult( names, message, passed ) {
  const req = new XMLHttpRequest();
  const result = {
    passed: passed,
    test: test.concat( names ),
    snapshotName: snapshotName,
    message: message,
    id: options.id
  };
  req.open( 'get', serverOrigin + '/aquaserver/test-result?result=' + encodeURIComponent( JSON.stringify( result ) ) );
  req.send();
  resetTimer();
}

// Listen to messages from our iframe (fired in test-client.js)
window.addEventListener( 'message', function( evt ) {
  if ( typeof evt.data !== 'string' ) {
    return;
  }

  const data = JSON.parse( evt.data );

  // test pass/fail has names,message
  if ( data.type === 'test-pass' ) {
    console.log( data.names + ' PASSED' );
    sendTestResult( data.names, data.message, true );
  }
  else if ( data.type === 'test-fail' ) {
    console.log( data.names + ' FAILED' );
    sendTestResult( data.names, data.message, false );
  }
  else if ( data.type === 'test-next' ) {
    nextTest();
  }
} );

nextTest();
