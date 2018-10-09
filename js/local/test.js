// Copyright 2018, University of Colorado Boulder
const testPage = require( './testPage' );

( async () => {
  'use strict';

  var x = await testPage( 'http://localhost/axon/axon-tests.html' );
  console.log( 'await complete!' );
  console.log( x );

  // Promise.all( [ testPage ] ).then( function( values ) {
  //   console.log( values );
  // } );

  // const targetURL = 'http://localhost/scenery/scenery-tests.html?ea';
  // await testPage( 'http://localhost/axon/axon-tests.html' );
} )();
