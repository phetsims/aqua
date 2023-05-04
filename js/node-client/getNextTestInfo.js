// Copyright 2023, University of Colorado Boulder

/**
 * Returns CT data for the next test to run (for browser-based testing)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

const _ = require( 'lodash' );
const axios = require( 'axios' );

/**
 * Returns CT data for the next test to run (for browser-based testing)
 * @public
 *
 * @param {Object} [options]
 * @returns {Promise.<Object>} - Resolves with data
 */
module.exports = async function( options ) {
  options = _.extend( {
    server: 'https://sparky.colorado.edu', // {string} - The server to use
    old: false // {boolean} - Provided for compatibility/testing, anything using this should be new enough

  }, options );

  const response = await axios( `${options.server}/aquaserver/next-test?old=${options.old}` );

  if ( response.status !== 200 ) {
    throw new Error( `nextTest request failed with status ${response.status} ${response}` );
  }

  return response.data;
};
