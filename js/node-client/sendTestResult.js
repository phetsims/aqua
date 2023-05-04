// Copyright 2023, University of Colorado Boulder

/**
 * Sends a CT test result
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

const _ = require( 'lodash' );
const axios = require( 'axios' );
const winston = require( 'winston' );

/**
 * Sends a CT test result
 * @public
 *
 * @param {string|undefined} message
 * @param {Object} testInfo - The original test request from getNextTestInfo
 * @param {boolean} passed
 * @param {Object} [options]
 * @returns {Promise.<Object>} - Resolves with data
 */
module.exports = async function( message, testInfo, passed, options ) {
  options = _.extend( {
    server: 'https://sparky.colorado.edu', // {string} - The server to use
    id: 'node-client' // {string} - The ID of the client
  }, options );

  winston.info( `Sending test result [${passed ? 'PASS' : 'FAIL'}]${message === undefined ? '' : ` with message:\n${message}`}` );

  const result = {
    passed: passed,
    test: testInfo.test,
    snapshotName: testInfo.snapshotName,
    timestamp: testInfo.timestamp,
    message: message,
    id: options.id
  };

  return ( await axios( `${options.server}/aquaserver/test-result?result=${encodeURIComponent( JSON.stringify( result ) )}` ) ).data;
};
