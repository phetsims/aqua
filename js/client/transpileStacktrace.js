// Copyright 2022, University of Colorado Boulder

let sourceMapConsumerInitialized = false;

/**
 * Use the sourcemap of each file to output a "transpiled" stack trace
 * @param {string} str
 * @returns {Promise<string>}
 */
window.transpileStacktrace = async str => {

  // The transpiled stack trace is accumulated here
  const newStackLines = [];

  const stack = window.stackTraceParser.parse( str );
  if ( stack.length === 0 ) {
    throw new Error( 'No stack found' );
  }

  const header = str.split( '\n' ).find( line => line.trim().length > 0 );

  // The header may be redundant with the stack trace, but we keep it in case it is useful
  newStackLines.push( header );

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

      // Load the text of the source file over the network to get the sourcemap
      const response = await fetch( file );
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

          // Load the mappings, but only when we have an error that needs to be transpiled.
          window.sourceMap.SourceMapConsumer.initialize( {
            'lib/mappings.wasm': '../../sherpa/lib/source-map-lib-mappings-0.7.3.wasm'
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