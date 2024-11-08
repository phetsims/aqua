// Copyright 2024, University of Colorado Boulder
/**
 * Launches a quick server with the following options:
 * --testing : for running locally (will immediately kick into testing instead of waiting for changes)
 * --port=PORT : specify a custom port for the server interface
 *
 * Run internal tests for the Gruntfile. Note the output is reported over console.log, so be careful what you output.
 * The command invoked is something like this: execSync( `${gruntCommand} test-grunt --brands=a,b,c --lint=false --noTSC` )
 *
 * @author Michael Kauzmann (PhET Interactive Simulations)
 * @author Sam Reid (PhET Interactive Simulations)
 */

import getOption from '../../../../perennial/js/grunt/tasks/util/getOption.js';
import QuickServer from '../../server/QuickServer.js';

const port = getOption( 'port' ) ? Number( getOption( 'port' ) ) : 45367;

const testing = getOption( 'testing' );
const server = new QuickServer( {
  isTestMode: testing
} );
server.startServer( port );
server.startMainLoop().catch( e => {
  throw new Error( `Error in CTQ main loop: ${e}` );
} );