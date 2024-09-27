// Copyright 2020-2024, University of Colorado Boulder

/**
 * Aqua-specific grunt configuration
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

// AQUA wants to opt out of global SIGINT handling so that it can handle it itself.
global.processEventOptOut = true;

const Gruntfile = require( '../../../chipper/js/grunt/Gruntfile' );
const registerTasks = require( '../../../perennial-alias/js/grunt/util/registerTasks' );
const assert = require( 'assert' );

// Stream winston logging to the console
module.exports = grunt => {
  Gruntfile( grunt );

  // @deprecated
  grunt.registerTask(
    'client-server',
    '@deprecated. Launches puppeteer clients to run tests for CT with the following options:\n' +
    '--puppeteerClients=number : specify how many puppeteer clients to run with, defaults to 16\n' +
    '--firefoxClients=number : specify how many playwright firefox clients to run with, defaults to 0\n' +
    '--ctID=string : specify id to give to continuous-loop.html, in URL string, defaults to "Sparky". Will have the platform appended like "ID%20Puppeteer"\n' +
    '--serverURL=string : defaults to "https://sparky.colorado.edu/"\n',
    () => {
      const ContinuousServerClient = require( '../server/ContinuousServerClient' );

      // We don't finish! Don't tell grunt this...
      grunt.task.current.async();

      const options = {};
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
    }
  );

  registerTasks( grunt, __dirname + '/tasks' );
};