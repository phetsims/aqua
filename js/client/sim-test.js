// Copyright 2020-2022, University of Colorado Boulder

/**
 * Runs simulation tests in an iframe, and passes results to our parent frame (continuous-loop.html).
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
      defaultValue: 120000
    },

    // By default, if the load doesn't happen, we'll just skip the test
    failIfNoLoad: {
      type: 'flag'
    },

    simQueryParameters: {
      type: 'string',
      defaultValue: ''
    }
  } );

  // Add those two to our query parameters, so we get load/error messages
  const iframe = aqua.createFrame();
  iframe.src = QueryStringMachine.appendQueryStringArray( options.url, [
    `?continuousTest=${encodeURIComponent( aqua.options.testInfo )}`,
    options.simQueryParameters
  ] );

  const failPrefix = ( options.simQueryParameters ? ( `Query: ${options.simQueryParameters}\n` ) : '' );

  let hasLoaded = false;

  const timeoutID = setTimeout( () => {
    if ( hasLoaded ) {
      aqua.simplePass(); // Only pass the 'run' if it loads AND doesn't error for the entire duration
    }
    else {
      if ( options.failIfNoLoad ) {
        aqua.simpleFail( `${failPrefix}did not load in ${options.duration}ms` );
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
      if ( data.type === 'continuous-test-error' ) {
        clearTimeout( timeoutID );
        const transpiledStacktrace = await window.transpileStacktrace( data.stack );
        aqua.simpleFail( `${failPrefix + data.message}\n${transpiledStacktrace}` );
      }
      else if ( data.type === 'continuous-test-unload' ) {
        clearTimeout( timeoutID );
        aqua.simpleFail( `${failPrefix}Unloaded frame before complete, window.location probably changed` );
      }
      else if ( data.type === 'continuous-test-load' ) {
        hasLoaded = true;
      }
      else if ( data.type === 'continuous-test-pass' ) {
        clearTimeout( timeoutID );
        aqua.simplePass();
      }
    }
  } );
} )();
