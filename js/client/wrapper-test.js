// Copyright 2020-2022, University of Colorado Boulder

/**
 * Runs a phet-io wrapper test in an iframe, and passes results to our parent frame (continuous-loop.html).
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
      defaultValue: 60000
    },

    // By default, if the load doesn't happen, we'll just skip the test
    failIfNoLoad: {
      type: 'flag'
    }
  } );

  // Add those two to our query parameters, so we get load/error messages
  const iframe = aqua.createFrame();
  iframe.src = QueryStringMachine.appendQueryStringArray( options.url, [
    `?wrapperContinuousTest=${encodeURIComponent( aqua.options.testInfo )}`
  ] );

  let hasLoaded = false;

  setTimeout( () => {
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

        const transpiledStacktrace = await window.transpileStacktrace( data.stack );
        aqua.simpleFail( `${data.message}\n${transpiledStacktrace}` );
      }
      else if ( data.type === 'continuous-test-wrapper-unload' ) {
        aqua.simpleFail( 'Unloaded frame before complete, window.location probably changed' );
      }
      else if ( data.type === 'continuous-test-wrapper-load' ) {
        // NOTE: loads may happen more than once, e.g. the mirror wrapper
        hasLoaded = true;
      }
    }
  } );
} )();
