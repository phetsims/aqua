// Copyright 2024, University of Colorado Boulder
/**
 * Launches puppeteer clients to run tests for CT with the following options:
 * --browser=string : specify what browser to test on, supported: "puppeteer" or "firefox"
 * --ctID=string : specify id to give to CT reporting, defaults to "Sparky Node Client"
 * --serverURL=string : defaults to "https://sparky.colorado.edu/. For local testing --serverURL=http://localhost:45366"
 * --fileServerURL=string : defaults to "https://sparky.colorado.edu/continuous-testing. For local testing --fileServerURL=http://localhost"
 *
 * @author Michael Kauzmann (PhET Interactive Simulations)
 * @author Sam Reid (PhET Interactive Simulations)
 */

import assert from 'assert';
import sleep from '../../../../perennial/js/common/sleep.js';
import getOption from '../../../../perennial/js/grunt/tasks/util/getOption.js';
import playwright from '../../../../perennial/js/npm-dependencies/playwright.js';
import winston from '../../../../perennial/js/npm-dependencies/winston.js';
import runNextTest from '../../node-client/runNextTest.js';

winston.default.transports.console.level = 'info';

const options: {
  browserCreator?: playwright.BrowserType<unknown>;
  ctID?: string;
  serverURL?: string;
  fileServerURL?: string;
} = {};
const browser = getOption( 'browser' );
if ( browser ) {

  if ( browser === 'firefox' ) {
    options.browserCreator = playwright.firefox;
  }
  else if ( browser === 'safari' ) {
    options.browserCreator = playwright.webkit;
  }
  else {
    assert( browser === 'puppeteer', 'supported browsers: puppeteer or firefox or webkit' );
  }
}
if ( getOption( 'ctID' ) ) {
  options.ctID = getOption( 'ctID' );
}
if ( getOption( 'serverURL' ) ) {
  options.serverURL = getOption( 'serverURL' );
}
if ( getOption( 'fileServerURL' ) ) {
  options.fileServerURL = getOption( 'fileServerURL' );
}

winston.info( 'Starting node client' );
winston.info( `Config: ${JSON.stringify( options )}` );

( async () => {
  while ( true ) {
    const success = await runNextTest( options );
    if ( !success ) {
      winston.error( 'running test unsuccessful, waiting a few seconds to run next test' );
      await sleep( 5000 );
    }
  }
} )();