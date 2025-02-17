// Copyright 2024-2025, University of Colorado Boulder
/**
 * Launches a continuous testing server with the following options:
 * --localCount=COUNT : [REQUIRED] specifies how many local build/grunt/etc. tasks should run in the background
 * --port=PORT : specify a custom port for the server interface
 * --useRootDir : when provided, files will not be copied (it will create one snapshot pointing to the root directly)
 * --snapshot=false : when set to false, it will avoid creating any snapshots at all (loading previous state only)
 *
 * @author Sam Reid (PhET Interactive Simulations)
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import assert from 'assert';
import getOption from '../../../../perennial/js/grunt/tasks/util/getOption.js';
import _ from '../../../../perennial/js/npm-dependencies/lodash.js';
import winston from '../../../../perennial/js/npm-dependencies/winston.js';
import ContinuousServer from '../../server/ContinuousServer.js';

winston.default.transports.console.level = 'info';

assert( getOption( 'localCount' ), 'Please specify --localCount=NUMBER, for specifying the number of local threads running things like grunt tasks' );

const port = getOption( 'port' ) ? Number( getOption( 'port' ) ) : 45366;
const localCount = Number( getOption( 'localCount' ) );
const snapshot = getOption( 'snapshot' ) !== false;
const useRootDir = !!getOption( 'useRootDir' );

const serverQueryParameter = encodeURIComponent( `http://localhost:${port}` );
const unbuiltReportURL = `http://localhost:${port}/aqua/html/continuous-unbuilt-report.html?server=${serverQueryParameter}`;
const builtReportURL = `http://localhost:${port}/aqua/html/continuous-report.html?server=${serverQueryParameter}`;
const loopURL = `http://localhost:${port}/aqua/html/continuous-loop.html?server=${serverQueryParameter}&id=REPLACE_ME`;

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