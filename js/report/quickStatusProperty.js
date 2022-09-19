// Copyright 2022, University of Colorado Boulder

/**
 * Properties based on status (auto-updating from /quickserver/status)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Property from '../../../axon/js/Property.js';
import request from './request.js';
import sleep from './sleep.js';
import { default as statusProperty } from './statusProperty.js';

// {Property.<*>}
const quickStatusProperty = new Property( {} );

// Snapshot quick status loop
( async () => {
  while ( true ) { // eslint-disable-line no-constant-condition
    const result = await request( '/quickserver/status' );
    if ( result ) {
      quickStatusProperty.value = result;
    }
    else {
      statusProperty.value = 'QuickServer error';
    }
    await sleep( 10000 );
  }
} )();

export default quickStatusProperty;
