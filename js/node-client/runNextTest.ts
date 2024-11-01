// Copyright 2023-2024, University of Colorado Boulder

import winston from '../../../perennial/js/npm-dependencies/winston.js';
import getNextTestInfo from './getNextTestInfo.js';
import runTest, { CTNodeClientOptions } from './runTest.js';
import sendTestResult from './sendTestResult.js';

/**
 * Runs the next browser CT test
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */
async function runNextTest( options: Partial<CTNodeClientOptions> ): Promise<boolean> {

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
      lastFailure = e;
    }
  }

  const message = `Tried to run ${attemptCount} times, never completed, failure: ${lastFailure}`;
  winston.error( `FAILED TO RUN TEST, ${message}` );
  testInfo && winston.error( 'Failure sent to CT: ' + JSON.stringify( await sendTestResult( message, testInfo, false, options ) ) );
  return false;
}

export default runNextTest;