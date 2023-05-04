// Copyright 2023, University of Colorado Boulder

/**
 * Runs the next browser CT test
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

const getNextTestInfo = require( './getNextTestInfo' );
const runTest = require( './runTest' );
const sendTestResult = require( './sendTestResult' );
const winston = require( 'winston' );

/**
 * Runs the next browser CT test
 * @public
 *
 * @param {Object} [options]
 * @returns {Promise}
 */
module.exports = async function( options ) {

  const testInfo = await getNextTestInfo( options );
  winston.info( 'testInfo', JSON.stringify( testInfo ) );

  const attemptCount = 3;
  let attemptsLeft = attemptCount;

  let lastFailure;

  while ( attemptsLeft-- > 0 ) {
    try {
      await runTest( testInfo, options );
      winston.debug( 'runTest completed' );
      return;
    }
    catch( e ) {
      lastFailure = e;
    }
  }

  winston.info( 'FAILED TO RUN TEST' );
  winston.info( await sendTestResult( `Tried to run ${attemptCount} times, never completed, failure: ${lastFailure}`, testInfo, false, options ) );
};
