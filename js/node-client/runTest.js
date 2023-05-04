// Copyright 2023, University of Colorado Boulder

/**
 * Runs a CT test
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

const _ = require( 'lodash' );
const sendTestResult = require( './sendTestResult' );
const puppeteer = require( '../../../perennial/node_modules/puppeteer' );
const winston = require( 'winston' );
const sleep = require( '../../../perennial/js/common/sleep' );

/**
 * Runs a CT test
 * @public
 *
 * @param {Object} testInfo
 * @param {Object} [options]
 * @returns {Promise}
 */
module.exports = async function( testInfo, options ) {
  options = _.extend( {
    server: 'https://sparky.colorado.edu', // {string} - The server to use
    browserCreator: puppeteer,
    browser: null,

    launchOptions: {
      args: [
        '--disable-gpu'
      ]
    }
  }, options );

  const majorTimeout = 280000;
  const bailTimout = 400000;

  const testInfoQueryParam = `testInfo=${encodeURIComponent( JSON.stringify( {
    test: testInfo.test,
    snapshotName: testInfo.snapshotName,
    timestamp: testInfo.timestamp
  } ) )}`;

  const url = `${options.server}/continuous-testing/aqua/html/${testInfo.url}${testInfo.url.includes( '?' ) ? '&' : '?'}${testInfoQueryParam}`;

  const ownsBrowser = !options.browser;

  let browser;
  let page;
  let log = '';

  // Gets included in any error/fail messages
  const logResult = message => {
    winston.info( message );
    log += `${message}\n`;
  };

  try {
    browser = options.browser || await options.browserCreator.launch( options.launchOptions );

    page = await browser.newPage();
    await page.setDefaultNavigationTimeout( majorTimeout );

    // TODO: have pendingPassFail when the result isn't sent
    let receivedPassFail = false;
    let gotNextTest = false;

    // promote for use outside the closure
    let resolve;
    let reject;
    const promise = new Promise( ( res, rej ) => {
      resolve = res;
      reject = rej;
    } );

    // Define a window.onMessageReceivedEvent function on the page.
    await page.exposeFunction( 'onPostMessageReceived', async e => {
      try {
        e = JSON.parse( e );
      }
      catch( e ) {
        return;
      }

      if ( e.type === 'test-pass' ) {
        receivedPassFail = true;

        winston.info( 'Sending PASS result' );
        const serverMessage = await sendTestResult( e.message, testInfo, true, options );
        winston.info( `Server receipt: ${JSON.stringify( serverMessage )}` );
      }
      else if ( e.type === 'test-fail' ) {
        receivedPassFail = false;

        winston.info( 'Sending FAIL result' );
        const serverMessage = await sendTestResult( `${e.message}\n${log}`, testInfo, false, options );
        winston.info( `Server receipt: ${JSON.stringify( serverMessage )}` );
      }
      else if ( e.type === 'test-next' ) {
        gotNextTest = true;
        resolve();
      }
    } );

    // Support puppeteer (evaluateOnNewDocument) or playwright (addInitScript)
    await ( ( page.evaluateOnNewDocument || page.addInitScript )( () => {
      const oldParent = window.parent;

      window.parent = {
        postMessage: e => {
          window.onPostMessageReceived && window.onPostMessageReceived( e );
          if ( oldParent ) {
            oldParent.postMessage( e );
          }
        }
      };
    } ) );

    page.on( 'response', async response => {
      // 200 and 300 class status are most likely fine here
      if ( response.url() === url && response.status() >= 400 ) {
        logResult( `[ERROR] Could not load from status: ${response.status()}` );
      }
    } );
    page.on( 'console', msg => logResult( `[CONSOLE] ${msg.text()}` ) );

    page.on( 'error', message => {
      logResult( `[ERROR] ${message}` );
    } );
    page.on( 'pageerror', message => {
      logResult( `[PAGE ERROR] ${message}` );
    } );
    page.on( 'framenavigated', frame => {
      logResult( `[NAVIGATED] ${frame.url()}` );
    } );

    // Run asynchronously
    ( async () => {
      await sleep( bailTimout );
      if ( !gotNextTest ) {
        if ( receivedPassFail ) {
          resolve();
        }
        else {
          reject( new Error( `Did not get next-test message in ${bailTimout}ms` ) );
        }
      }
    } )();

    logResult( `[URL] ${url}` );
    await page.goto( url, {
      timeout: majorTimeout
    } );
    await promise;
    winston.debug( 'promise resolved' );

    !page.isClosed() && await page.close();
    winston.debug( 'page closed' );

    // If we created a temporary browser, close it
    ownsBrowser && await browser.close();
    winston.debug( 'browser closed' );
  }

  catch( e ) {
    page && !page.isClosed() && await page.close();
    ownsBrowser && await browser.close();
    throw new Error( `${e}\n${log}` );
  }
};
