// Copyright 2023-2026, University of Colorado Boulder

/**
 * Runs a CT test
 *
 * @author Jonathan Olson (PhET Interactive Simulations)
 */

const _ = require( 'lodash' );
const sendTestResult = require( './sendTestResult' );
const puppeteer = require( '../../../perennial/node_modules/puppeteer' );
const browserPageLoad = require( '../../../perennial/js/common/browserPageLoad' );
const winston = require( '../../../perennial/js/npm-dependencies/winston' ).default;
const path = require( 'path' );
require( 'dotenv' ).config();

/* global window */

/**
 * Runs a CT test
 * @public
 *
 * @param {Object} testInfo
 * @param {Object} [options] - see browserPageLoad
 * @returns {Promise}
 */
module.exports = async function( testInfo, options ) {

  // Make sure not to resolve if we still have results being sent.
  let currentSendingCount = 0;

  let receivedPassFail = false; // When received a test result
  let gotNextTest = false; // When received the next-test command.

  // Test must be totally complete. This is needed because we set resolveFromLoad:false below, see https://github.com/phetsims/aqua/issues/222
  const allowedTimeToComplete = 200 * 60000; // in ms
  const allowedTimeToLoad = 6.5 * 60000; // in ms, page must load and be testing

  const completionTimeoutID = setTimeout( () => {
    throw new Error( `runTest did not complete its test in ${( allowedTimeToComplete / 60000 ).toFixed( 1 )} minutes: ${JSON.stringify( testInfo )}` );
  }, allowedTimeToComplete );

  // The whole log of the browser run. Keep this as one string to send it as a CT result.
  let log = '';

  options = _.merge( {
    fileServerURL: 'https://sparky.colorado.edu/continuous-testing', // {string} - The server to use
    browserCreator: puppeteer,

    gotoTimeout: 280000,
    allowedTimeToLoad: allowedTimeToLoad,
    rejectErrors: false,
    rejectPageErrors: false,

    // We will resolve ourselves
    waitAfterLoad: 0,
    resolveFromLoad: false,

    logConsoleOutput: true,
    logNavigation: true,

    // Fixed https://github.com/phetsims/aqua/issues/191
    cachePages: false,

    // Keep track of all messages to send them out with our CT reporting
    logger: message => {
      winston.info( message );
      log += `${message}\n`;
    },
    onLoadTimeout: ( resolve, reject ) => {
      if ( !gotNextTest ) { // If we have gotten this signal, then we are already handling the resolving.
        if ( receivedPassFail && currentSendingCount === 0 ) {
          resolve();
        }
        else {
          reject( new Error( `Did not get next-test message in ${allowedTimeToLoad}ms (currentSendingCount ${currentSendingCount}): ${JSON.stringify( testInfo.test )}` ) );
        }
      }
    },

    evaluateOnNewDocument: () => {
      const oldParent = window.parent;

      window.parent = {
        postMessage: event => {
          window.onPostMessageReceived && window.onPostMessageReceived( event );
          oldParent && oldParent.postMessage( event, '*' );
        }
      };
    },

    onPageCreation: async ( page, resolve ) => {

      const resolveIfReady = () => {
        winston.debug( `resolveIfReady, currentSendingCount:${currentSendingCount}, gotNextTest:${gotNextTest}` );
        if ( currentSendingCount === 0 && gotNextTest ) {
          winston.debug( 'resolving from test message' );
          resolve();
        }
      };

      // Define a window.onMessageReceivedEvent function on the page.
      await page.exposeFunction( 'onPostMessageReceived', async event => {
        try {
          event = JSON.parse( event );
        }
        catch( e ) {
          return;
        }

        if ( event.type === 'test-pass' ) {
          receivedPassFail = true;
          winston.info( 'Sending PASS result' );

          currentSendingCount++;
          const serverMessage = await sendTestResult( event.message, testInfo, true, options );
          currentSendingCount--;

          winston.info( `Server receipt: ${serverMessage ? JSON.stringify( serverMessage ) : serverMessage}` );
          resolveIfReady();
        }
        else if ( event.type === 'test-fail' ) {
          receivedPassFail = true;
          winston.info( 'Sending FAIL result' );

          currentSendingCount++;
          const serverMessage = await sendTestResult( `${event.message}
====================
FULL LOG:
${log}`,
            testInfo, false, options );
          currentSendingCount--;

          winston.info( `Server receipt: ${serverMessage ? JSON.stringify( serverMessage ) : serverMessage}` );
          resolveIfReady();
        }
        else if ( event.type === 'test-next' ) {
          gotNextTest = true;
          resolveIfReady();
        }
      } );
    }
  }, options );

  // Puppeteer-specific Options
  if ( options.browserCreator === puppeteer ) {

    // Do NOT merge all options here, it will mutate the other options like browserCreator (effecting tripple equals checking)
    options.launchOptions = _.merge( {

      // With this flag, temp files are written to /tmp/ on bayes, which caused https://github.com/phetsims/aqua/issues/145
      // /dev/shm/ is much bigger, so don't provide this disabling flag
      ignoreDefaultArgs: [ '--disable-dev-shm-usage' ],
      args: [
        '--disable-gpu',

        '--enable-precise-memory-info',

        // To prevent filling up `/tmp`, see https://github.com/phetsims/aqua/issues/145
        `--user-data-dir=${path.join( process.cwd(), '/../tmp/puppeteerUserData/' )}`,

        // Fork child processes directly to prevent orphaned chrome instances from lingering on sparky, https://github.com/phetsims/aqua/issues/150#issuecomment-1170140994
        '--no-zygote',
        '--no-sandbox'
      ]
    }, options.launchOptions );
  }

  const testInfoQueryParam = `testInfo=${encodeURIComponent( JSON.stringify( {
    test: testInfo.test,
    snapshotName: testInfo.snapshotName,
    timestamp: testInfo.timestamp
  } ) )}`;

  const url = `${options.fileServerURL}/aqua/html/${testInfo.url}${testInfo.url.includes( '?' ) ? '&' : '?'}${testInfoQueryParam}`;

  try {
    await browserPageLoad( options.browserCreator, url, options );
    clearTimeout( completionTimeoutID );
  }
  catch( e ) {
    throw new Error( `${e}\n${log}` ); // Post the error with the log from the browser run
  }
};