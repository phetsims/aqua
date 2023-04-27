// Copyright 2020-2023, University of Colorado Boulder

/**
 * Aqua-specific grunt configuration
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */


const Gruntfile = require( '../../chipper/js/grunt/Gruntfile' );
const ContinuousServer = require( './server/ContinuousServer' );
const ContinuousServerClient = require( './server/ContinuousServerClient' );
const assert = require( 'assert' );
const _ = require( 'lodash' ); // eslint-disable-line require-statement-match
const winston = require( 'winston' );
const QuickServer = require( './server/QuickServer' );

module.exports = grunt => {
  Gruntfile( grunt );

  grunt.registerTask(
    'continuous-server',
    'Launches a continuous server with the following options:\n' +
    '--localCount=COUNT : [REQUIRED] specifies how many local build/grunt/etc. tasks should run in the background\n' +
    '--port=PORT : specify a custom port for the server interface\n' +
    '--useRootDir : when provided, files will not be copied (it will create one snapshot pointing to the root directly)\n' +
    '--snapshot=false : when set to false, it will avoid creating any snapshots at all (loading previous state only)\n',
    () => {
      // We don't finish! Don't tell grunt this...
      grunt.task.current.async();

      assert( grunt.option( 'localCount' ), 'Please specify --localCount=NUMBER, for specifying the number of local threads running things like grunt tasks' );

      const port = grunt.option( 'port' ) ? Number( grunt.option( 'port' ) ) : 45366;
      const localCount = Number( grunt.option( 'localCount' ) );
      const snapshot = grunt.option( 'snapshot' ) !== false;
      const useRootDir = !!grunt.option( 'useRootDir' );

      const serverQueryParameter = encodeURIComponent( `http://localhost:${port}` );
      const unbuiltReportURL = `http://localhost:${port}/aqua/html/continuous-unbuilt-report.html?server=${serverQueryParameter}`;
      const builtReportURL = `http://localhost:${port}/aqua/html/continuous-report.html?server=${serverQueryParameter}`;
      const loopURL = `http://localhost:${port}/aqua/html/continuous-loop.html?server=${serverQueryParameter}&id=replaceme`;

      console.log( unbuiltReportURL );
      console.log( builtReportURL );
      console.log( loopURL );

      const server = new ContinuousServer( useRootDir );
      server.startServer( port );
      server.generateReportLoop();
      server.computeWeightsLoop();
      server.autosaveLoop();

      if ( snapshot ) {
        server.createSnapshotLoop();
      }

      winston.info( `Launching ${localCount} local tasks` );
      _.range( 0, localCount ).forEach( () => {
        server.localTaskLoop();
      } );
    }
  );

  grunt.registerTask(
    'quick-server',
    'Launches a quick server with the following options:\n' +
    '--testing : for running locally (will immediately kick into testing instead of waiting for changes)\n' +
    '--port=PORT : specify a custom port for the server interface\n',
    () => {
      // We don't finish! Don't tell grunt this...
      grunt.task.current.async();

      const port = grunt.option( 'port' ) ? Number( grunt.option( 'port' ) ) : 45367;

      const testing = grunt.option( 'testing' );
      const server = new QuickServer( {
        isTestMode: testing
      } );
      server.startServer( port );
      server.startMainLoop();
    }
  );

  grunt.registerTask(
    'client-server',
    'Launches puppeteer clients to run tests for CT with the following options:\n' +
    '--clients=number : specify how many puppeteer clients to run with, defaults to 16\n' +
    '--ctID=string : specify id to give to continuous-loop.html, in URL string, defaults to "Sparky%20Puppeteer"\n' +
    '--serverURL=string : defaults to "https://sparky.colorado.edu/"\n',
    () => {

      // We don't finish! Don't tell grunt this...
      grunt.task.current.async();

      const options = {};
      if ( grunt.option( 'clients' ) ) {
        options.numberOfPuppeteers = grunt.option( 'clients' );
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
};
