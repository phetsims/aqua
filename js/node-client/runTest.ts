// Copyright 2023-2024, University of Colorado Boulder

/**
 * Runs a CT test
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import path from 'path';
import browserPageLoad from '../../../perennial/js/common/browserPageLoad.js';
import _ from '../../../perennial/js/npm-dependencies/lodash.js';
import winston from '../../../perennial/js/npm-dependencies/winston.js';
import puppeteer from '../../../perennial/node_modules/puppeteer';
import { TestInfo } from './getNextTestInfo.js';
import sendTestResult from './sendTestResult.js';

require( 'dotenv' ).config();

/* global window */

type PromiseConstructorParam<T> = ConstructorParameters<typeof Promise<T>>[0];
type PromiseExecutorParams<T> = Parameters<PromiseConstructorParam<T>>;
type Resolve<T> = PromiseExecutorParams<T>[0];
type Reject = PromiseExecutorParams<unknown>[1];

type PageOperator<T> = ( page: object, resolve: Resolve<T>, reject: Reject ) => Promise<void>;

type BrowserPageLoadOptions<T = null> = {
  gotoTimeout: number;
  allowedTimeToLoad: number;
  rejectErrors: boolean;
  rejectPageErrors: boolean;
  waitAfterLoad: boolean;
  resolveFromLoad: boolean;
  logConsoleOutput: boolean;
  logNavigation: boolean;
  cachePages: boolean;
  logger: ( message: string ) => void;
  launchOptions: Record<string, any>;
  onLoadTimeout: null | PageOperator<T>;
  evaluate: ( ...args: any[] ) => T;
  evaluateOnNewDocument: null | ( () => void );
  onPageCreation: null | PageOperator<T>;
};
export type CTNodeClientOptions = BrowserPageLoadOptions & {
  fileServerURL: string;
  browserCreator: object;
  serverURL: string;
  ctID: string;
  old: boolean;
};


/**
 * Runs a CT test
 */
async function runTest( testInfo: TestInfo, providedOptions?: Partial<CTNodeClientOptions> ): Promise<void> {

  // Make sure not to resolve if we still have results being sent.
  let currentSendingCount = 0;

  let receivedPassFail = false; // When received a test result
  let gotNextTest = false; // When received the next-test command.

  const allowedTimeToLoad = 400000;

  // The whole log of the browser run. Keep this as one string to send it as a CT result.
  let log = '';

  const options: CTNodeClientOptions = _.merge( {
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
    logger: ( message: string ) => {
      winston.info( message );
      log += `${message}\n`;
    },
    onLoadTimeout: ( resolve: Resolve<null>, reject: Reject ) => {
      if ( !gotNextTest ) { // If we have gotten this signal, then we are already handling the resolving.
        if ( receivedPassFail && currentSendingCount === 0 ) {
          resolve( null );
        }
        else {
          reject( new Error( `Did not get next-test message in ${allowedTimeToLoad}ms (currentSendingCount ${currentSendingCount}): ${JSON.stringify( testInfo.test )}` ) );
        }
      }
    },

    evaluateOnNewDocument: () => {
      // @ts-expect-error - window from the browser?
      const oldParent = window.parent;

      // @ts-expect-error - window from the browser?
      window.parent = {
        postMessage: ( event: Event ) => {
          // @ts-expect-error - window from the browser?
          window.onPostMessageReceived && window.onPostMessageReceived( event );
          oldParent && oldParent.postMessage( event, '*' );
        }
      };
    },

    onPageCreation: async ( page: object, resolve: Resolve<null> ) => {

      const resolveIfReady = () => {
        winston.debug( `resolveIfReady, currentSendingCount:${currentSendingCount}, gotNextTest:${gotNextTest}` );
        if ( currentSendingCount === 0 && gotNextTest ) {
          winston.debug( 'resolving from test message' );
          resolve( null );
        }
      };

      // Define a window.onMessageReceivedEvent function on the page.
      // @ts-expect-error - TODO: https://github.com/phetsims/perennial/issues/369
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

          winston.info( `Server receipt: ${JSON.stringify( serverMessage )}` );
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

          winston.info( `Server receipt: ${JSON.stringify( serverMessage )}` );
          resolveIfReady();
        }
        else if ( event.type === 'test-next' ) {
          gotNextTest = true;
          resolveIfReady();
        }
      } );
    }
  }, providedOptions );

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
  }
  catch( e ) {
    throw new Error( `${e}\n${log}` ); // Post the error with the log from the browser run
  }
}

export default runTest;