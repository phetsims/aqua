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
const path = require( 'path' );
const sleep = require( '../../../perennial/js/common/sleep' );
require( 'dotenv' ).config();

/**
 * Runs a CT test
 * @public
 *
 * @param {Object} testInfo
 * @param {Object} [options]
 * @returns {Promise}
 */
module.exports = async function( testInfo, options ) {
  options = _.merge( {
    serverURL: 'https://sparky.colorado.edu', // {string} - The server to use
    browserCreator: puppeteer,
    browser: null, // If provided, browserCreator is not used to create a browser, and this browser is not closed.

    launchOptions: {
      args: [
        '--disable-gpu'
      ]
    }
  }, options );

  // Puppeteer-specific Options
  if ( options.browserCreator === puppeteer ) {

    // Do NOT merge all options here, it will mutate the other options like browserCreator (effecting tripple equals checking)
    options.launchOptions = _.merge( {

      // With this flag, temp files are written to /tmp/ on bayes, which caused https://github.com/phetsims/aqua/issues/145
      // /dev/shm/ is much bigger
      ignoreDefaultArgs: [ '--disable-dev-shm-usage' ],
      args: [
        '--disable-gpu',

        '--enable-precise-memory-info',

        // To prevent filling up `/tmp`, see https://github.com/phetsims/aqua/issues/145
        `--user-data-dir=${path.normalize( `${process.cwd()}/../tmp/puppeteerUserData/` )}`,

        // Fork child processes directly to prevent orphaned chrome instances from lingering on sparky, https://github.com/phetsims/aqua/issues/150#issuecomment-1170140994
        '--no-zygote',
        '--no-sandbox'
      ]
    }, options.launchOptions );
  }

  const majorTimeout = 280000;
  const bailTimout = 400000;

  const testInfoQueryParam = `testInfo=${encodeURIComponent( JSON.stringify( {
    test: testInfo.test,
    snapshotName: testInfo.snapshotName,
    timestamp: testInfo.timestamp
  } ) )}`;

  // const url = `${options.serverURL}/continuous-testing/aqua/html/${testInfo.url}${testInfo.url.includes( '?' ) ? '&' : '?'}${testInfoQueryParam}`;
  const url = `http://localhost:8080/aqua/html/wrapper-test.html?url=..%2F..%2Fphet-io-wrappers%2Fmigration%2F%3Fsim%3Dmolecule-polarity%26locales%3D*%26phetioDebug%3Dtrue%26phetioWrapperDebug%3Dtrue%26fuzz%26oldVersion%3D1.2%26migrationRate%3D1000%26silent%26webgl%3Dfalse&testInfo=%7B%22test%22%3A%5B%22molecule-polarity%22%2C%22migration%22%2C%221.2-%3Emaster%22%5D%2C%22snapshotName%22%3A%22snapshot-1687971529669%22%2C%22timestamp%22%3A1687971977115%7D`;

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

    // The API for playwright was much more complicated, so just support puppeteer
    if ( !options.browser && options.browserCreator === puppeteer &&
         process.env.BASIC_PASSWORD && process.env.BASIC_USERNAME ) {
      await page.authenticate( { username: process.env.BASIC_USERNAME, password: process.env.BASIC_PASSWORD } );
    }

    // TODO: have pendingPassFail when the result isn't sent, https://github.com/phetsims/aqua/issues/178
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
    await ( ( page.evaluateOnNewDocument || page.addInitScript ).call( page, () => {
      const oldParent = window.parent;

      window.parent = {
        postMessage: e => {
          window.onPostMessageReceived && window.onPostMessageReceived( e );
          oldParent && oldParent.postMessage( e, '*' );
        }
      };
    } ) );

    page.on( 'response', async response => {
      // 200 and 300 class status are most likely fine here
      if ( response.url() === url && response.status() >= 400 ) {
        logResult( `[ERROR] Could not load from status: ${response.status()}` );
      }
    } );
    page.on( 'console', msg => {
      let messageTxt = msg.text();

      // Append the location to messages that would benefit from it.
      if ( messageTxt.includes( 'net:' ) || messageTxt.includes( 'Failed to load resource' ) ) {
        messageTxt += `: \t ${msg.location().url}`;
      }
      logResult( `[CONSOLE] ${messageTxt}` );
    } );

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
          reject( new Error( `Did not get next-test message in ${bailTimout}ms: ${JSON.stringify( testInfo.test )}` ) );
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
    ownsBrowser && browser && await browser.close();
    throw new Error( `${e}\n${log}` );
  }
};
