// Copyright 2018, University of Colorado Boulder
const runUnitTests = require( './runUnitTests' );
const runPage = require( './runPage' );
const puppeteer = require( 'puppeteer' );
const fs = require( 'fs' );

( async () => {
  'use strict';

  /**
   * Shuffles array in place.
   * @param {Array} a - items An array containing the items.
   */
    // function shuffle( a ) {
    //   var j;
    //   var x;
    //   var i;
    //   for ( i = a.length - 1; i > 0; i-- ) {
    //     j = Math.floor( Math.random() * ( i + 1 ) );
    //     x = a[ i ];
    //     a[ i ] = a[ j ];
    //     a[ j ] = x;
    //   }
    //   return a;
    // }

  const browser = await puppeteer.launch();
  const readList = filename => fs.readFileSync( '../perennial/data/' + filename, 'utf8' ).split( '\n' ).filter( name => name.length > 0 );

  // TODO: why do we have the "testable" lists?
  // const testableRunnables = readList( 'testable-runnables' );
  // const testablePhetio = readList( 'testable-phet-io' );
  const activeRepos = readList( 'active-repos' );

  // Omit phet-io-wrappers because it yields a "Calling `done` after test has completed" error.
  const index = activeRepos.indexOf( 'phet-io-wrappers' );
  activeRepos.splice( index, 1 );

  const getUnitTestFile = repo => `../${repo}/${repo}-tests.html`;
  const getUnitTestURL = repo => {
    let suffix = '';
    if ( repo === 'phet-io' ) {
      suffix = '?brand=phet-io';
    }
    return `http://localhost/${repo}/${repo}-tests.html${suffix}`;
  }; // TODO: support arbitrary prefix for localhost

  // Find repos that have qunit tests by searching for them
  const unitTests = activeRepos.filter( repo => fs.existsSync( getUnitTestFile( repo ) ) ).map( getUnitTestURL );

  const timeout = 10000;
  let passed = 0;
  let failed = 0;
  var tests = [];
  const tallyTest = result => {
    console.log( result );
    if ( result.ok ) {
      passed++;
    }
    else {
      failed++;
    }
    console.log( 'Passed: ' + passed + '/' + tests.length + ', Failed: ' + failed + '/' + tests.length );
  };

  // These are all tests
  // @formatter:off
  // unitTests.forEach( test => tests.push( { name: test, type: 'Unit Test', run: () => runUnitTests( browser, test ) } ) );
  // testableRunnables.forEach( test => tests.push( { name: test, type: 'Fuzz Test', run: () => runPage( browser, `http://localhost/${test}/${test}_en.html?brand=phet&ea&fuzzMouse`, timeout ) } ) );
  // testablePhetio.forEach( sim => tests.push( { name: sim, type: 'Fuzz Studio', run: () => runPage( browser, `http://localhost/phet-io-wrappers/studio/?sim=${sim}&phetioThrowSimErrors&fuzzMouse`, timeout ) } ) );
  // testablePhetio.forEach( sim => tests.push( { name: sim, type: 'Fuzz Mirror Inputs', run: () => runPage( browser, `http://localhost/phet-io-wrappers/mirror-inputs/?sim=${sim}&phetioThrowSimErrors&fuzzMouse`, timeout ) } ) );
  // testablePhetio.forEach( sim => tests.push( { name: sim, type: 'Fuzz State', run: () => runPage( browser, `http://localhost/phet-io-wrappers/state/?sim=${sim}&phetioThrowSimErrors&fuzzMouse&numberOfMillisecondsBetweenUpdates=50`, timeout ) } ) );
  // testablePhetio.forEach( sim => tests.push( { name: sim, type: 'PhET-iO Wrapper Tests', run: () => runPage( browser, `http://localhost/phet-io-wrappers/phet-io-wrappers-tests.html?sim=${sim}&testWrappers=false`, timeout ) } ) );

  // Run all unit tests
  unitTests.forEach( test => tests.push( { name: test, type: 'Unit Test', run: () => runUnitTests( browser, test ) } ) );
  const phetioSimsToTest = ['faradays-law'];
  phetioSimsToTest.forEach( sim => tests.push( { name: sim, type: 'Fuzz Studio', run: () => runPage( browser, `http://localhost/phet-io-wrappers/studio/?sim=${sim}&phetioThrowSimErrors&fuzzMouse`, timeout ) } ) );
  phetioSimsToTest.forEach( sim => tests.push( { name: sim, type: 'Fuzz Mirror Inputs', run: () => runPage( browser, `http://localhost/phet-io-wrappers/mirror-inputs/?sim=${sim}&phetioThrowSimErrors&fuzzMouse`, timeout ) } ) );
  phetioSimsToTest.forEach( sim => tests.push( { name: sim, type: 'Fuzz State', run: () => runPage( browser, `http://localhost/phet-io-wrappers/state/?sim=${sim}&phetioThrowSimErrors&fuzzMouse&numberOfMillisecondsBetweenUpdates=50`, timeout ) } ) );
  phetioSimsToTest.forEach( sim => tests.push( { name: sim, type: 'PhET-iO Wrapper Tests', run: () => runPage( browser, `http://localhost/phet-io-wrappers/phet-io-wrappers-tests.html?sim=${sim}&testWrappers=false`, timeout ) } ) );
  const simsToTest = ['graphing-quadratics'];
  simsToTest.forEach( test => tests.push( { name: test, type: 'Fuzz Test', run: () => runPage( browser, `http://localhost/${test}/${test}_en.html?brand=phet&ea&fuzzMouse`, timeout ) } ) );
  // @formatter:on

  console.log( 'enumerated ' + tests.length + ' tests' );
  // tests = shuffle( tests );
  for ( const test of tests ) {
    console.log( `Starting ${test.type}: ${test.name}` );
    const result = await test.run();
    tallyTest( result );
  }

  await browser.close();
} )();
