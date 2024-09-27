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
import grunt from '../../../../perennial/js/import-shared/grunt';
import winston from '../../../../perennial/js/import-shared/winston';
import runNextTest from '../../node-client/runNextTest';

winston.default.transports.console.level = 'info';

// We don't finish! Don't tell grunt this...
grunt.task.current.async();

const options: any = {};
const browser = grunt.option( 'browser' );
if ( browser ) {
  if ( browser === 'firefox' ) {
    options.browserCreator = require( 'playwright' ).firefox;
  }
  else if ( browser === 'safari' ) {
    options.browserCreator = require( 'playwright' ).webkit;
  }
  else {
    assert( browser === 'puppeteer', 'supported browsers: puppeteer or firefox or webkit' );
  }
}
if ( grunt.option( 'ctID' ) ) {
  options.ctID = grunt.option( 'ctID' );
}
if ( grunt.option( 'serverURL' ) ) {
  options.serverURL = grunt.option( 'serverURL' );
}
if ( grunt.option( 'fileServerURL' ) ) {
  options.fileServerURL = grunt.option( 'fileServerURL' );
}

winston.info( 'Starting node client' );
winston.info( `Config: ${JSON.stringify( options )}` );

( async () => {
  while ( true ) {
    await runNextTest( options );
  }
} )();
