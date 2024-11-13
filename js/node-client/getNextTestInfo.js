// Copyright 2023-2024, University of Colorado Boulder

/**
 * Returns CT data for the next test to run (for browser-based testing)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

const _ = require( 'lodash' );
const axios = require( '../../../perennial/js/npm-dependencies/axios.js' ).default;

/**
 * Returns CT data for the next test to run (for browser-based testing)
 * @public
 *
 * @param {Object} [options]
 * @returns {Promise.<Object>} - Resolves with data
 */
module.exports = async function( options ) {
  options = _.assignIn( {
    serverURL: 'https://sparky.colorado.edu', // {string} - The server to use
    old: false // {boolean} - Provided for compatibility/testing, anything using this should be new enough

  }, options );

  let response = null;
  try {
    response = await axios( `${options.serverURL}/aquaserver/next-test?old=${options.old}` );
  }
  catch( e ) {
    throw new Error( `axios failure code ${e.response.status} getting next-test: ${e.message}` );
  }

  if ( response?.status !== 200 ) {
    throw new Error( `nextTest request failed with status ${response.status} ${response}` );
  }

  return response?.data || null;
};