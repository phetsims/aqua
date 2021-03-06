// Copyright 2020, University of Colorado Boulder

/**
 * Aqua-specific grunt configuration
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

'use strict';

const Gruntfile = require( '../../chipper/js/grunt/Gruntfile' );
const buildLocal = require( '../../perennial/js/common/buildLocal' );
const ContinuousServer = require( './server/ContinuousServer' );
const assert = require( 'assert' );
const grunt = require( 'grunt' ); // eslint-disable-line
const _ = require( 'lodash' ); // eslint-disable-line
const winston = require( 'winston' );

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

      const port = grunt.option( 'port' ) ? Number.parseInt( grunt.option( 'port' ), 10 ) : 45366;
      const localCount = Number.parseInt( grunt.option( 'localCount' ), 10 );
      const snapshot = grunt.option( 'snapshot' ) !== false;
      const useRootDir = !!grunt.option( 'useRootDir' );

      const serverQueryParameter = encodeURIComponent( `http://localhost:${port}` );
      const unbuiltReportURL = `${buildLocal.localTestingURL}aqua/html/continuous-unbuilt-report.html?server=${serverQueryParameter}`;
      const builtReportURL = `${buildLocal.localTestingURL}aqua/html/continuous-report.html?server=${serverQueryParameter}`;
      const loopURL = `${buildLocal.localTestingURL}aqua/html/continuous-loop.html?server=${serverQueryParameter}&id=replaceme`;

      console.log( unbuiltReportURL );
      console.log( builtReportURL );
      console.log( loopURL );

      const server = new ContinuousServer( useRootDir );
      server.startServer( port );
      server.generateReportLoop();
      server.computeWeightsLoop();

      if ( snapshot ) {
        server.createSnapshotLoop();
      }

      winston.info( `Launching ${localCount} local tasks` );
      _.range( 0, localCount ).forEach( () => {
        server.localTaskLoop();
      } );
    }
  );
};
