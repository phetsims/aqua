// Copyright 2022, University of Colorado Boulder

/**
 * Sends requests to the CT server
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

const options = QueryStringMachine.getAll( {
  server: {
    type: 'string',

    // Origin for our server (ignoring current port), so that we don't require localhost
    defaultValue: `${window.location.protocol}//${window.location.hostname}`
  }
} );

const request = relativeURL => new Promise( ( resolve, reject ) => {
  const req = new XMLHttpRequest();
  req.onload = function() {
    if ( req.responseText.includes( '<title>503 Service Unavailable</title>' ) ) {
      resolve( null );
    }
    else {
      resolve( JSON.parse( req.responseText ) );
    }
  };
  req.onerror = function() {
    resolve( null );
  };
  req.open( 'get', `${options.server}${relativeURL}`, true );
  req.send();
} );

export default request;
