// Copyright 2023-2024, University of Colorado Boulder

/**
 * Sends a CT test result
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

const _ = require( 'lodash' );
const axios = require( '../../../perennial/js/npm-dependencies/axios' ).default;
const winston = require( '../../../perennial/js/npm-dependencies/winston' ).default;

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
  options = _.assignIn( {
    serverURL: 'https://sparky.colorado.edu', // {string} - The server to use
    ctID: 'Sparky Node Puppeteer' // {string} - The ID of the client
  }, options );

  winston.info( `Sending test result [${passed ? 'PASS' : 'FAIL'}]${message === undefined ? '' : ` with message:\n${message}...`}` );

  const result = {
    passed: passed,
    test: testInfo.test,
    snapshotName: testInfo.snapshotName,
    timestamp: testInfo.timestamp,
    message: message,
    id: options.ctID
  };

  try {
    const response = await axios( {
      method: 'post',
      url: `${options.serverURL}/aquaserver/test-result`,
      data: result
    } );
    return response.data;
  }
  catch( e ) {
    winston.error( 'Error sending test-result' );
    winston.error( e );
  }
  return null;
};