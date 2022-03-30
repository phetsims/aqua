// Copyright 2020-2021, University of Colorado Boulder

/**
 * Runs simulation tests in an iframe, and passes results to our parent frame (continuous-loop.html).
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

let sourceMapConsumerInitialized = false;

/**
 * Use the sourcemap of each file to output a "transpiled" stack trace
 * @param {string} str
 * @returns {Promise<string>}
 */
const transpileStacktrace = async str => {

  // The transpiled stack trace is accumulated here
  const newStackLines = [];

  const stack = window.stackTraceParser.parse( str );
  if ( stack.length === 0 ) {
    throw new Error( 'No stack found' );
  }

  const header = str.split( '\n' ).find( line => line.trim().length > 0 );
  newStackLines.push( header ); // TODO for REVIEWER: Should we keep or omit this?

  // Iterate over each element in the stack. Use for loop because it works well with await
  for ( let i = 0; i < stack.length; i++ ) {
    const lineNumber = stack[ i ].lineNumber;
    const methodName = stack[ i ].methodName;
    const file = stack[ i ].file;
    const column = stack[ i ].column;
    if ( lineNumber === null || lineNumber < 1 ) {
      newStackLines.push( `    at ${methodName || ''}` );
    }
    else {

      // Load the text of the source file over the network
      // TODO for REVIEWER: Should we cache these?
      const response = await window.fetch( file );
      const text = await response.text();

      const lines = text.split( '\n' );

      // The source map is in the last line
      const lastLine = lines[ lines.length - 1 ];

      // Strip the encoded sourcemap
      const KEY = 'base64,';
      const index = lastLine.indexOf( KEY );
      if ( index > 0 ) {
        const substring = lastLine.substring( index + KEY.length );

        // Decode from base64
        const a = atob( substring );

        // Initialize lazily, to avoid the initialization if not necessary.
        if ( !sourceMapConsumerInitialized ) {

          // TODO for REVIEWER: Should we put this file or contents in sherpa?
          // TODO for REVIEWER: I don't know enough about how the iframes are set up to know if this
          // work can be shared across different instances
          window.sourceMap.SourceMapConsumer.initialize( {
            'lib/mappings.wasm': 'https://unpkg.com/source-map@0.7.3/lib/mappings.wasm'
          } );
          sourceMapConsumerInitialized = true;
        }

        const smc = await new window.sourceMap.SourceMapConsumer( a );
        const pos = smc.originalPositionFor( { line: lineNumber, column: column } );
        if ( pos && pos.line !== null ) {
          newStackLines.push( `    at ${pos.name || ''} (${pos.source}:${pos.line}:${pos.column})` );
        }
      }
      else {
        newStackLines.push( `    at ${methodName || ''} (${file}:${lineNumber}:${column})` );
      }
    }
  }
  return newStackLines.join( '\n' );
};

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

        // TODO for REVIEWER: How does this behave for built sim stacks?  Should it be skipped for those?
        const transpiledStack = await transpileStacktrace( data.stack );
        aqua.simpleFail( `${failPrefix + data.message}\n${transpiledStack}` );
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
