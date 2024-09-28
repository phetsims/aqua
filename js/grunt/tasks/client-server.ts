// Copyright 2024, University of Colorado Boulder
/**
 * @deprecated
 * Launches puppeteer clients to run tests for CT with the following options:
 * --puppeteerClients=number : specify how many puppeteer clients to run with, defaults to 16
 * --firefoxClients=number : specify how many playwright firefox clients to run with, defaults to 0
 * --ctID=string : specify id to give to continuous-loop.html, in URL string, defaults to "Sparky". Will have the platform appended like "ID%20Puppeteer"
 * --serverURL=string : defaults to "https://sparky.colorado.edu/"
 *
 * @author Sam Reid (PhET Interactive Simulations)
 * @author Michael Kauzmann (PhET Interactive Simulations)
 * @deprecated
 * TODO: Delete this https://github.com/phetsims/chipper/issues/1463
 */

import grunt from '../../../../perennial/js/import-shared/grunt';
import ContinuousServerClient from '../../server/ContinuousServerClient';

// We don't finish! Don't tel l grunt this...
grunt.task.current.async();

const options: any = {};
if ( grunt.option( 'puppeteerClients' ) ) {
  options.numberOfPuppeteers = grunt.option( 'puppeteerClients' );
}
if ( grunt.option( 'firefoxClients' ) ) {
  options.numberOfFirefoxes = grunt.option( 'firefoxClients' );
}
if ( grunt.option( 'ctID' ) ) {
  options.ctID = grunt.option( 'ctID' );
}
if ( grunt.option( 'serverURL' ) ) {
  options.serverURL = grunt.option( 'serverURL' );
}

const server = new ContinuousServerClient( options );
server.startMainLoop();