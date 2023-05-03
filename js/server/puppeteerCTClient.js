// Copyright 2022-2023, University of Colorado Boulder

/**
 * Launch puppeteer and point it to CT running on a server for 15 minutes.
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

const assert = require( 'assert' );
const puppeteerLoad = require( '../../../perennial/js/common/puppeteerLoad' );
const { parentPort } = require( 'worker_threads' ); // eslint-disable-line require-statement-match

process.on( 'SIGINT', () => process.exit() );

( async () => {

  const ctID = process.argv[ 2 ];
  assert( ctID, 'usage: node puppeteerCTClient {{SOME_IDENTIFIER_HERE}} {{SERVER}}' );

  let server = process.argv[ 3 ];
  assert( server, 'usage: node puppeteerCTClient {{SOME_IDENTIFIER_HERE}} {{SERVER}}' );

  server = server.endsWith( '/' ) ? server : `${server}/`;

  // http so we don't need to overhead when running locally
  const url = `${server}continuous-testing/aqua/html/continuous-loop.html?id=${ctID}%20Puppeteer`;
  const loadingMessage = `Loading ${url}`;
  parentPort && parentPort.postMessage( loadingMessage );
  // console.log( loadingMessage );

  const error = await puppeteerLoad( url, {
    waitAfterLoad: 15 * 60 * 1000, // 15 minutes
    allowedTimeToLoad: 120000,
    gotoTimeout: 1000000000,

    // A page error is what we are testing for. Don't fail the browser instance out when an assertion occurs
    rejectPageErrors: false,

    launchOptions: {

      // With this flag, temp files are written to /tmp/ on bayes, which caused https://github.com/phetsims/aqua/issues/145
      // /dev/shm/ is much bigger
      ignoreDefaultArgs: [ '--disable-dev-shm-usage' ],

      // Command line arguments passed to the chrome instance,
      args: [
        '--enable-precise-memory-info',

        // To prevent filling up `/tmp`, see https://github.com/phetsims/aqua/issues/145
        `--user-data-dir=${process.cwd()}/../tmp/puppeteerUserData/`,

        // Fork child processes directly to prevent orphaned chrome instances from lingering on sparky, https://github.com/phetsims/aqua/issues/150#issuecomment-1170140994
        '--no-zygote',
        '--no-sandbox'
      ]
    }
  } );
  if ( error ) {
    // console.error( error );

    // Send the error to the parent Node process that spawned the worker.
    parentPort && parentPort.postMessage( error );
  }

  // The worker didn't seem to exit without this line
  process.exit( 0 );
} )();
