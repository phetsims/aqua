// Copyright 2016, University of Colorado Boulder
(function() {
  'use strict';

  // modules
  var child_process = require( 'child_process' );

  // constants
  var spawn = child_process.spawn;

  var spawnOutput = function( cmd, args, options, callback ) {
    if ( options.skip ) {
      callback();
    }
    else {
      var exec = spawn( cmd, args ); // TODO: machine specific for cron
      exec.stdout.on( 'data', function( data ) {
        process.stdout.write( data );
      } );
      exec.stderr.on( 'data', function( data ) {
        process.stdout.write( 'ERR> ' + data );
      } );
      exec.stderr.on( 'close', function( code ) {
        callback();
      } );
    }
  };

  // Clean.  Danger Will Robinson, don't delete your hard drive please.  The extra path entry is to help ensure we
  // don't delete the wrong screenshots directory somehow.
  spawnOutput( 'rm', [ '-rf', '../../aqua/screenshots' ], {}, function() {

    // Pull everything
    spawnOutput( 'pull-all.sh', [], { skip: true }, function() {

      // Clone any new repos
      spawnOutput( 'clone-missing-repos.sh', [], {}, function() {

        // Run phantom tests
        spawnOutput( 'phantomjs', [ 'test-sims.js' ], {}, function() {
          console.log( 'done' );
        } );
      } );
    } );
  } );

})();