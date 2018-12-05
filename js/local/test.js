// Copyright 2018, University of Colorado Boulder
const fs = require( 'fs' );
const puppeteer = require( 'puppeteer' );
const puppeteerPage = require( './puppeteerPage' );
const puppeteerQUnit = require( './puppeteerQUnit' );
const _ = require( '../../../sherpa/lib/lodash-4.17.4.js' ); // eslint-disable-line

( async () => {
  'use strict';

  // var seed = parseInt( process.argv[ 2 ], 10 );
  var groups = parseInt( process.argv[ 3 ], 10 );
  var groupIndex = parseInt( process.argv[ 4 ], 10 );
  var command = process.argv[ 5 ];

  const browser = await puppeteer.launch();
  const readList = filename => fs.readFileSync( '../perennial/data/' + filename, 'utf8' ).split( '\n' ).filter( name => name.length > 0 );

  // TODO: why do we have the "testable" lists?
  const testableRunnables = readList( 'testable-runnables' );
  // const testablePhetio = readList( 'testable-phet-io' );
  const activeRepos = readList( 'active-repos' );

  // Omit phet-io-wrappers because it yields a "Calling `done` after test has completed" error.
  const index = activeRepos.indexOf( 'phet-io-wrappers' );
  activeRepos.splice( index, 1 );

  const getUnitTestFile = repo => `../${repo}/${repo}-tests.html`;
  const getUnitTestURL = repo => {
    let suffix = '';
    if ( repo === 'phet-io' ) {
      suffix = '&brand=phet-io';
    }
    return `http://localhost/${repo}/${repo}-tests.html?ea${suffix}`;
  }; // TODO: support arbitrary prefix for localhost

  // Find repos that have qunit tests by searching for them
  const unitTests = activeRepos.filter( repo => {
    return fs.existsSync( getUnitTestFile( repo ) ) &&
           repo !== 'scenery' && // Takes too long
           repo !== 'scenery-phet'; // Takes too long
  } ).map( getUnitTestURL );

  const timeout = 6000; // Timed so it takes about the same length of time as unit tests and linting, at least on my machine!
  const allTests = [];
  const pairs = [];

  // Run all unit tests
  if ( command === 'UNIT' ) {
    unitTests.forEach( test => allTests.push( {
      name: test,
      type: 'Unit Test',
      run: () => puppeteerQUnit( browser, test )
    } ) );
  }

  // Randomly pick a subset of sims to fuzz test
  if ( command === 'FUZZ' ) {
    [ _.sample( testableRunnables, 1 ) ].forEach( test => allTests.push( {
      name: test,
      type: 'Fuzz Test',
      run: () => puppeteerPage( browser, `http://localhost/${test}/${test}_en.html?brand=phet&ea&fuzz`, timeout )
    } ) );
  }

  // const phetioSimsToTest = ['faradays-law'];
  // phetioSimsToTest.forEach( sim => tests.push( { name: sim, type: 'Fuzz Studio', run: () => puppeteerPage( browser, `http://localhost/phet-io-wrappers/studio/?sim=${sim}&phetioDebug&fuzz`, timeout ) } ) );
  // phetioSimsToTest.forEach( sim => tests.push( { name: sim, type: 'Fuzz Mirror Inputs', run: () => puppeteerPage( browser, `http://localhost/phet-io-wrappers/mirror-inputs/?sim=${sim}&phetioDebug&fuzz`, timeout ) } ) );
  // phetioSimsToTest.forEach( sim => tests.push( { name: sim, type: 'Fuzz State', run: () => puppeteerPage( browser, `http://localhost/phet-io-wrappers/state/?sim=${sim}&phetioDebug&fuzz&numberOfMillisecondsBetweenUpdates=50`, timeout ) } ) );
  // phetioSimsToTest.forEach( sim => tests.push( { name: sim, type: 'PhET-iO Wrapper Tests', run: () => puppeteerPage( browser, `http://localhost/phet-io-wrappers/phet-io-wrappers-tests.html?sim=${sim}&testWrappers=false`, timeout ) } ) );
  // const simsToTest = ['graphing-quadratics'];
  // simsToTest.forEach( test => tests.push( { name: test, type: 'Fuzz Test', run: () => puppeteerPage( browser, `http://localhost/${test}/${test}_en.html?brand=phet&ea&fuzz`, timeout ) } ) );

  // console.log( 'Found ' + allTests.length + ' tests' );
  const tests = _.partition( allTests, test => allTests.indexOf( test ) % groups === groupIndex )[ 0 ];
  // console.log( 'Running: ' + tests.map( _ => _.name ).join( '\n' ) );
  for ( const test of tests ) {
    const result = await test.run();
    pairs.push( { test, result } );
  }
  // const passedPairs = pairs.filter( pair => pair.result.ok );
  const failedPairs = pairs.filter( pair => !pair.result.ok );

  // console.log( `passed (${passedPairs.length})\n${passedPairs.map( pair => pair.test.type + ': ' + pair.test.name ).join( '\n' )}\n` );
  if ( failedPairs.length > 0 ) {
    console.log( `failed (${failedPairs.length})\n${failedPairs.map( pair => pair.test.type + ': ' + pair.test.name ).join( '\n' )}\n` );
  }

  await browser.close();
} )();
