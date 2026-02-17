// Copyright 2022-2024, University of Colorado Boulder

/**
 * Sleeps for a certain number of milliseconds
 *
 * @author Jonathan Olson (PhET Interactive Simulations)
 */

export default async function( milliseconds ) {
  return new Promise( ( resolve, reject ) => {
    setTimeout( resolve, milliseconds );
  } );
}