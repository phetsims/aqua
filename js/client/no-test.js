// Copyright 2020-2021, University of Colorado Boulder

/*
 * Does nothing for a certain amount of time, then goes to the next test
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */


( () => {
  const options = QueryStringMachine.getAll( {

    // How long to wait until going to the next sim.
    // If the page doesn't report back by this {number} of milliseconds, then report a failure.
    duration: {
      type: 'number',
      defaultValue: 10000
    }
  } );

  setTimeout( () => {
    aqua.nextTest();
  }, options.duration );
} )();
