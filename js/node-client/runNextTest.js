// Copyright 2023-2026, University of Colorado Boulder

/**
 * Runs the next browser CT test
 *
 * @author Jonathan Olson (PhET Interactive Simulations)
 */

const getNextTestInfo = require( './getNextTestInfo' );
const runTest = require( './runTest' );
const sendTestResult = require( './sendTestResult' );
const winston = require( '../../../perennial/js/npm-dependencies/winston' ).default;

/**
 * Runs the next browser CT test
 * @public
 *
 * @param {Object} [options]
 * @returns {Promise}
 */
module.exports = async function( options ) {

  const attemptCount = 3;
  let attemptsLeft = attemptCount;

  let lastFailure;

  let testInfo = null;
  while ( attemptsLeft-- > 0 ) {
    try {
      if ( !testInfo ) {
        testInfo = await getNextTestInfo( options );
        winston.info( 'testInfo', JSON.stringify( testInfo ) );
      }
      if ( testInfo ) {
        await runTest( testInfo, options );
        winston.debug( 'runTest completed' );
        return true;
      }
    }
    catch( e ) {
      winston.debug( `failure in test attempt loop: ${e}` );
      lastFailure = e;
    }
  }

  const message = `Tried to run ${attemptCount} times, never completed, failure: ${lastFailure}`;
  winston.error( `FAILED TO RUN TEST, ${message}` );
  testInfo && winston.error( await sendTestResult( message, testInfo, false, options ) );
  return false;
};