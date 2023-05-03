// Copyright 2023, University of Colorado Boulder

/**
 * Launch playwright and point it to CT running on a server for 15 minutes.
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

const assert = require( 'assert' );
const playwrightLoad = require( '../../../perennial/js/common/playwrightLoad' );
const { parentPort } = require( 'worker_threads' ); // eslint-disable-line require-statement-match
const playwright = require( '../../../perennial/node_modules/playwright' );

process.on( 'SIGINT', () => process.exit() );

( async () => {

  const ctID = process.argv[ 2 ];
  assert( ctID, 'usage: node puppeteerCTClient {{SOME_IDENTIFIER_HERE}} {{SERVER}}' );

  let server = process.argv[ 3 ];
  assert( server, 'usage: node puppeteerCTClient {{SOME_IDENTIFIER_HERE}} {{SERVER}}' );

  server = server.endsWith( '/' ) ? server : `${server}/`;

  // http so we don't need to overhead when running locally
  const url = `${server}continuous-testing/aqua/html/continuous-loop.html?id=${ctID}%20Playwright%20Firefox`;
  const loadingMessage = `Loading ${url}`;
  parentPort && parentPort.postMessage( loadingMessage );
  // console.log( loadingMessage );

  const error = await playwrightLoad( url, {
    testingBrowserCreator: playwright.firefox, // hard coded to firefox at this time
    waitAfterLoad: 10 * 60 * 1000, // 15 minutes
    allowedTimeToLoad: 2 * 60 * 1000,
    gotoTimeout: 1000000000, // a long time

    // A page error is what we are testing for. Don't fail the browser instance out when an assertion occurs
    rejectPageErrors: false
  } );
  if ( error ) {
    // console.error( error );

    // Send the error to the parent Node process that spawned the worker.
    parentPort && parentPort.postMessage( error );
  }

  // The worker didn't seem to exit without this line
  process.exit( 0 );
} )();
