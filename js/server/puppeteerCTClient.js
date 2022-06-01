// Copyright 2022, University of Colorado Boulder

/**
 * Launch puppeteer and point it to CT running on bayes for 15 minutes.
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

const assert = require( 'assert' );
const puppeteerLoad = require( '../../../perennial/js/common/puppeteerLoad' );
const { parentPort } = require( 'worker_threads' ); // eslint-disable-line require-statement-match

process.on( 'SIGINT', () => process.exit() );

( async () => {

  assert( process.argv[ 2 ], 'usage: node puppeteerHelpCT {{SOME_IDENTIFIER_HERE}}' );
  const url = `https://bayes.colorado.edu/continuous-testing/aqua/html/continuous-loop.html?id=${process.argv[ 2 ]}`;
  const error = await puppeteerLoad( url, {
    waitAfterLoad: 15 * 60 * 1000, // 15 minutes
    allowedTimeToLoad: 120000,
    puppeteerTimeout: 1000000000,

    // A page error is what we are testing for. Don't fail the browser instance out when an assertion occurs
    resolvePageErrors: false
  } );
  if ( error ) {
    parentPort.postMessage( error );
  }

  // The worker didn't seem to exit without this line
  process.exit( 0 );
} )();
