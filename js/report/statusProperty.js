// Copyright 2022, University of Colorado Boulder

/**
 * Properties based on status (auto-updating from /aquaserver/status)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import NumberProperty from '../../../axon/js/NumberProperty.js';
import Property from '../../../axon/js/Property.js';
import request from './request.js';
import sleep from './sleep.js';

// {Property.<string>}
const statusProperty = new Property( 'loading...' );
const lastErrorProperty = new Property( '' );

// {Property.<number>}
const startupTimestampProperty = new NumberProperty( 0 );

// Snapshot status loop
( async () => {
  while ( true ) { // eslint-disable-line no-constant-condition
    const result = await request( '/aquaserver/status' );
    if ( result ) {
      statusProperty.value = result.status;
      lastErrorProperty.value = result.lastErrorString;
      startupTimestampProperty.value = result.startupTimestamp;
    }
    await sleep( 1000 );
  }
} )();

export default statusProperty;
export { lastErrorProperty, startupTimestampProperty };
