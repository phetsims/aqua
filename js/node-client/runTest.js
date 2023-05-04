// Copyright 2023, University of Colorado Boulder

/**
 * Runs a CT test
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

const _ = require( 'lodash' );
const sendTestResult = require( './sendTestResult' );
const puppeteer = require( 'puppeteer' );
const winston = require( 'winston' );
const sleep = require( '../../../perennial/js/common/sleep' );

/**
 * Runs a CT test
 * @public
 *
 * @param {Object} testInfo
 * @param {Object} [options]
 * @returns {Promise.<Object>} - Resolves with data
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
  winston.info( 'testing url', url );

  const ownsBrowser = !options.browser;

  let browser;
  let page;

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
      // winston.info( 'postMessage', e );

      try {
        e = JSON.parse( e );
      }
      catch( e ) {
        return;
      }

      if ( e.type === 'test-pass' ) {
        receivedPassFail = true;

        winston.info( 'PASS received, sending' );
        winston.info( await sendTestResult( e.message, testInfo, true, options ) );
      }
      else if ( e.type === 'test-fail' ) {
        receivedPassFail = false;

        winston.info( 'FAIL received, sending' );
        winston.info( await sendTestResult( e.message, testInfo, false, options ) );
      }
      else if ( e.type === 'test-next' ) {
        gotNextTest = true;
        resolve();
      }
    } );

    await page.evaluateOnNewDocument( () => {
      const oldParent = window.parent;

      window.parent = {
        postMessage: e => {
          window.onPostMessageReceived && window.onPostMessageReceived( e );
          if ( oldParent ) {
            oldParent.postMessage( e );
          }
        }
      };
    } );

    page.on( 'response', async response => {

      // 200 and 300 class status are most likely fine here
      if ( response.url() === url && response.status() >= 400 ) {
        winston.info( `Could not load from status: ${response.status()}` );
      }
    } );
    page.on( 'console', msg => winston.info( 'console', msg.text() ) );

    page.on( 'error', message => {
      winston.info( `puppeteer error: ${message}` );
      // reject( new Error( message ) );
    } );
    page.on( 'pageerror', message => {
      // if ( options.rejectPageErrors ) {
        winston.info( `puppeteer pageerror: ${message}` );
        // reject( new Error( message ) );
      // }
    } );
    // page.on( 'frameattached', async frame => {
    //   winston.info( 'attached', frame.url() );
    // } );
    // page.on( 'framedetached', async frame => {
    //   winston.info( 'detached', frame.url() );
    // } );
    page.on( 'framenavigated', async frame => {
      winston.info( 'navigated', frame.url() );
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
    await page.goto( url, {
      timeout: majorTimeout
    } );
    const result = await promise;
    winston.info( 'promise resolved' );

    !page.isClosed() && await page.close();
    winston.info( 'page closed' );

    // If we created a temporary browser, close it
    ownsBrowser && await browser.close();
    winston.info( 'browser closed' );

    return result;
  }

  catch( e ) {
    page && !page.isClosed() && await page.close();
    ownsBrowser && await browser.close();
    throw e;
  }
};
