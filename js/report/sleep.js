// Copyright 2022, University of Colorado Boulder

/**
 * Sleeps for a certain number of milliseconds
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

export default async function( milliseconds ) {
  return new Promise( ( resolve, reject ) => {
    setTimeout( resolve, milliseconds );
  } );
}
