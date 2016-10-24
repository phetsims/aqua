// Copyright 2016, University of Colorado Boulder
(function() {
  'use strict';

  var fs = require( 'fs' );
  var webpage = require( 'webpage' );

  var simsString = fs.read( '../../chipper/data/active-runnables' );
  var simArray = simsString.split( '\n' );
  console.log( 'TESTING: ' + simArray.join( ', ' ) );
  var TEST_TIME = 1000;

  var safeMessages = [
    'enabling assert',
    'Warning: No supported audio formats found, sound will not be played.',
    'Update check failure: simulation beaker not found'
  ];
  var visit = function( index ) {
    var sim = simArray[ index ];
    var url = 'http://localhost/' + sim + '/' + sim + '_en.html?ea&brand=phet&fuzzMouse=100';
    var page = webpage.create();
    var tries = 0;
    page.onConsoleMessage = function( msg ) {
      if ( safeMessages.indexOf( msg ) < 0 ) {
        console.log( '>', msg );
      }
    };
    console.log( 'testing ' + url );
    page.open( url, function( status ) {
      var id = setInterval( function() {
        tries++;
        var time = page.evaluate( function() {
          return window.phet && window.phet.joist && window.phet.joist.elapsedTime;
        } );
        if ( time >= TEST_TIME || (time === 0 && tries > 20) || (time === null && tries > 20) ) {
          if ( time === null ) {
            console.log( 'Sim never started' );
          }
          if ( time === 0 ) {
            console.log( 'Couldn\'t connect' );
          }
          clearInterval( id );
          page.render( '../screenshots/' + sim + '.png' );

          page.onClosing = function( closingPage ) {
            var nextIndex = index + 1;
            if ( nextIndex >= simArray.length ) {
              phantom.exit(); // eslint-disable-line no-undef
            }
            else {
              visit( index + 1 );
            }
          };
          page.close();

        }
      }, 200 );
    } );
  };

  visit( 0 );
})();