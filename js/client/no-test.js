// Copyright 2020, University of Colorado Boulder

/*
 * Does nothing for a certain amount of time, then goes to the next test
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

'use strict';

const options = QueryStringMachine.getAll( {
  duration: {
    type: 'number',
    defaultValue: 10000
  }
} );

setTimeout( function() {
  aqua.nextTest();
}, options.duration );
