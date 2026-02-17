// Copyright 2017-2024, University of Colorado Boulder

/**
 * Aqua-specific grunt configuration
 *
 * @author Jonathan Olson (PhET Interactive Simulations)
 */

// AQUA wants to opt out of global SIGINT handling so that it can handle it itself.
global.processEventOptOut = true;

const Gruntfile = require( '../chipper/Gruntfile.cjs' );
const registerTasks = require( '../perennial-alias/js/grunt/commonjs/registerTasks.js' );

// Stream winston logging to the console
module.exports = grunt => {
  Gruntfile( grunt );

  registerTasks( grunt, `${__dirname}/js/grunt/tasks` );
};