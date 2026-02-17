// Copyright 2020-2024, University of Colorado Boulder

/**
 * Runs a phet-io wrapper test in an iframe, and passes results to our parent frame (continuous-loop.html).
 *
 * @author Jonathan Olson (PhET Interactive Simulations)
 */


( () => {
  const options = QueryStringMachine.getAll( {
    // The URL to be loaded
    url: {
      type: 'string',
      defaultValue: ''
    },
    // How long to wait until going to the next sim.
    // If the page doesn't report back by this {number} of milliseconds, then report a failure.
    duration: {
      type: 'number',
      defaultValue: 60000
    },

    // By default, if the load doesn't happen, we'll just skip the test
    failIfNoLoad: {
      type: 'flag'
    }
  } );

  if ( QueryStringMachine.containsKey( 'queryParameters' ) ) {
    aqua.simpleFail( 'wrapper-test does not support ?queryParameters, just put them in the url directly.' );
  }

  // Add those two to our query parameters, so we get load/error messages
  const iframe = aqua.createFrame();
  iframe.src = QueryStringMachine.appendQueryStringArray( options.url, [
    `?wrapperContinuousTest=${encodeURIComponent( aqua.options.testInfo )}`
  ] );

  let hasLoaded = false;

  const timeoutID = setTimeout( () => {
    if ( hasLoaded ) {
      aqua.simplePass(); // Only pass the 'run' if it loads AND doesn't error for the entire duration
    }
    else {
      if ( options.failIfNoLoad ) {
        aqua.simpleFail( `did not load in ${options.duration}ms` );
      }
      else {
        aqua.simpleSkip();
      }
    }
  }, options.duration );

  const testInfo = JSON.parse( aqua.options.testInfo );

  // handling messages from sims
  window.addEventListener( 'message', async evt => {
    if ( typeof evt.data !== 'string' ) {
      return;
    }
    const data = JSON.parse( evt.data );

    // Filter out any message that isn't directly from this test
    if ( data.continuousTest && _.isEqual( testInfo, data.continuousTest ) ) {
      console.log( data.type );

      // Sent by Joist due to the postMessage* query parameters
      if ( data.type === 'continuous-test-wrapper-error' ) {
        clearTimeout( timeoutID );

        const transpiledStacktrace = await window.transpileStacktrace( data.stack );
        aqua.simpleFail( `${data.message}\nSTACK: ${transpiledStacktrace}` );
      }
      else if ( data.type === 'continuous-test-wrapper-unload' ) {
        clearTimeout( timeoutID );

        aqua.simpleFail( 'Unloaded frame before complete, window.location probably changed' );
      }
      else if ( data.type === 'continuous-test-wrapper-load' ) {

        // Don't pass here, instead use the timeout as a duration for the test.
        hasLoaded = true;
      }
    }
  } );
} )();