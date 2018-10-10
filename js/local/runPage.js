// Copyright 2018, University of Colorado Boulder

module.exports = function( browser, targetURL, timeout ) {
  'use strict';

  return new Promise( async function( resolve, reject ) {

    const page = await browser.newPage();
    let ended = false;
    const end = async function( result ) {
      if ( !ended ) {
        ended = true;
        await page.close();
        clearTimeout( id );
        resolve( result );
      }
    };

    page.on( 'error', msg => end( { ok: false, result: 'error', message: msg } ) );
    page.on( 'pageerror', msg => end( { ok: false, result: 'pageerror', message: msg } ) );

    try {
      await page.goto( targetURL );
      var id = setTimeout( async function() {
        end( { ok: true } );
      }, timeout );
    }
    catch( e ) {
      end( { ok: false, message: 'caught exception ' + e } );
    }
  } );
};