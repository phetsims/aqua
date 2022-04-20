// Copyright 2020-2022, University of Colorado Boulder

/*
 * Runs arbitrary content in an iframe (that presumably loads pageload-connector.js) and reports if it successfully
 * loads and runs for a short amount of time without erroring
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */


( () => {
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

  const iframe = aqua.createFrame();
  iframe.src = options.url;

  setTimeout( () => {
    aqua.simpleFail( `Did not load in the time allowed: ${options.duration}ms` );
  }, options.duration );

  // handling messages from the page
  window.addEventListener( 'message', async evt => {
    if ( typeof evt.data !== 'string' ) {
      return;
    }

    const data = JSON.parse( evt.data );

    // Sent by Joist due to the postMessage* query parameters
    if ( data.type === 'pageload-load' ) {
      aqua.simplePass();
    }
    else if ( data.type === 'pageload-error' ) {
      const transpiledStacktrace = await window.transpileStacktrace( data.stack );
      aqua.simpleFail( `${data.message}\n${transpiledStacktrace}` );
    }
  } );
} )();
