// Copyright 2016, University of Colorado Boulder
(function() {
  'use strict';

  // modules
  var child_process = require( 'child_process' );

  // constants
  var spawn = child_process.spawn;

  var running = false;

  var launch = function() {
    console.log( 'MYCRON STARTED.' );
    running = true;
    var exec = spawn( 'node', [ 'aqua.js' ] );

    exec.stdout.on( 'data', function( data ) {
      process.stdout.write( data );
    } );
    exec.stderr.on( 'data', function( data ) {
      console.log( 'ERR: ' + data );
    } );
    exec.on( 'close', function() {
      console.log( 'MYCRON FINISHED.' );
      running = false;
    } );
  };
  setInterval( function() {
    if ( !running ) {
      launch();
    }
  }, 100 );


})();