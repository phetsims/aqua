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

  assert( process.argv[ 2 ], 'usage: node puppeteerCTClient {{SOME_IDENTIFIER_HERE}}' );
  const url = `https://bayes.colorado.edu/continuous-testing/aqua/html/continuous-loop.html?id=${process.argv[ 2 ]}`;
  const error = await puppeteerLoad( url, {
    waitAfterLoad: .5 * 60 * 1000, // 15 minutes
    allowedTimeToLoad: 120000,
    puppeteerTimeout: 1000000000,

    // A page error is what we are testing for. Don't fail the browser instance out when an assertion occurs
    resolvePageErrors: false,

    launchOptions: {

      // With this flag, temp files are written to /tmp/ on bayes, which caused https://github.com/phetsims/aqua/issues/145
      // /dev/shm/ is much bigger
      ignoreDefaultArgs: [ '--disable-dev-shm-usage' ],

      // Command line arguments passed to the chrome instance,
      args: [
        '--enable-precise-memory-info',

        // To prevent filling up `/tmp`, see https://github.com/phetsims/aqua/issues/145
        `--user-data-dir=${process.cwd()}/../tmp/puppeteerUserData/`,

        // Fork child processes directly to prevent orphaned chrome instances from lingering on bayes, https://github.com/phetsims/aqua/issues/150#issuecomment-1170140994
        '--no-zygote', '--no-sandbox'
      ]
    }
  } );
  if ( error ) {

    // Send the error to the parent Node process that spawned the worker.
    parentPort.postMessage( error );
  }

  // The worker didn't seem to exit without this line
  process.exit( 0 );
} )();
