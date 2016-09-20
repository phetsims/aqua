// Copyright 2016, University of Colorado Boulder
(function() {
  'use strict';

  var fs = require( 'fs' );
  var webpage = require( 'webpage' );

  var simsString = fs.read( '../../chipper/data/active-runnables' );
  console.log( simsString );
  var simArray = simsString.split( '\n' );
  console.log( simArray );
  var TEST_TIME = 1000;

  var visit = function( index ) {
    var sim = simArray[ index ];
    var url = 'http://localhost/' + sim + '/' + sim + '_en.html?ea&brand=phet&fuzzMouse=100';
    var page = webpage.create();
    var tries = 0;
    page.onConsoleMessage = function( msg ) {
      console.log( '>', msg );
    };
    console.log( 'testing ' + url );
    page.open( url, function( status ) {
      var id = setInterval( function() {
        tries++;
        var time = page.evaluate( function() {
          return window.phet && window.phet.joist && window.phet.joist.elapsedTime;
        } );
        console.log( time );
        if ( time >= TEST_TIME || (time === 0 && tries > 20) || (time === null && tries > 20) ) {
          if ( time === null ) {
            console.log( 'Sim never started' );
          }
          if ( time === 0 ) {
            console.log( 'Couldnt connect' );
          }
          clearInterval( id );
          page.render( '../screenshots/' + sim + '.png' );
          var nextIndex = index + 1;
          if ( nextIndex >= simArray.length ) {
            phantom.exit();
          }
          page.close();
          visit( index + 1 );
        }
      }, 200 );
    } );
  };

  visit( 0 );
})();