// Copyright 2018, University of Colorado Boulder

module.exports = function( browser, targetURL ) {
  'use strict';

  return new Promise( async function( resolve, reject ) {

    const page = await browser.newPage();
    page.on( 'error', msg => {
      page.close();
      clearTimeout( id );
      resolve( { result: 'error', message: msg } );
    } );
    page.on( 'pageerror', msg => {
      page.close();
      clearTimeout( id );
      resolve( { result: 'pageerror', message: msg } );
    } );
    await page.goto( targetURL );
    var id = setTimeout( async function() {
      await page.close();
      resolve( { result: 'success' } );
    }, 5000 );
  } );
};