// Copyright 2018, University of Colorado Boulder
const fs = require( 'fs' );
const puppeteer = require( 'puppeteer' );
const runPage = require( './runPage' );
const runUnitTests = require( './runUnitTests' );
const _ = require( '../../../sherpa/lib/lodash-4.17.4.js' ); // eslint-disable-line

( async () => {
  'use strict';

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
      suffix = '?brand=phet-io';
    }
    return `http://localhost/${repo}/${repo}-tests.html${suffix}`;
  }; // TODO: support arbitrary prefix for localhost

  // Find repos that have qunit tests by searching for them
  const unitTests = activeRepos.filter( repo => {
    return fs.existsSync( getUnitTestFile( repo ) ) && repo !== 'scenery' && repo !== 'scenery-phet';
  } ).map( getUnitTestURL );

  const timeout = 5000;
  let passed = 0;
  let failed = 0;
  var tests = [];
  const pairs = [];
  const tallyTest = ( test, result ) => {
    console.log( result );
    if ( result.ok ) {
      passed++;
    }
    else {
      failed++;
    }
    console.log( 'Passed: ' + passed + '/' + tests.length + ', Failed: ' + failed + '/' + tests.length );
    pairs.push( { test, result } );
  };

  // Run all unit tests
  unitTests.forEach( test => tests.push( {
    name: test,
    type: 'Unit Test',
    run: () => runUnitTests( browser, test )
  } ) );

  // Randomly pick a subset of sims to fuzz test
  console.log( testableRunnables );
  console.log( _.sample( testableRunnables, 1 ) );
  [ _.sample( testableRunnables, 1 ) ].forEach( test => tests.push( {
    name: test,
    type: 'Fuzz Test',
    run: () => runPage( browser, `http://localhost/${test}/${test}_en.html?brand=phet&ea&fuzz`, timeout )
  } ) );

  // const phetioSimsToTest = ['faradays-law'];
  // phetioSimsToTest.forEach( sim => tests.push( { name: sim, type: 'Fuzz Studio', run: () => runPage( browser, `http://localhost/phet-io-wrappers/studio/?sim=${sim}&phetioDebug&fuzz`, timeout ) } ) );
  // phetioSimsToTest.forEach( sim => tests.push( { name: sim, type: 'Fuzz Mirror Inputs', run: () => runPage( browser, `http://localhost/phet-io-wrappers/mirror-inputs/?sim=${sim}&phetioDebug&fuzz`, timeout ) } ) );
  // phetioSimsToTest.forEach( sim => tests.push( { name: sim, type: 'Fuzz State', run: () => runPage( browser, `http://localhost/phet-io-wrappers/state/?sim=${sim}&phetioDebug&fuzz&numberOfMillisecondsBetweenUpdates=50`, timeout ) } ) );
  // phetioSimsToTest.forEach( sim => tests.push( { name: sim, type: 'PhET-iO Wrapper Tests', run: () => runPage( browser, `http://localhost/phet-io-wrappers/phet-io-wrappers-tests.html?sim=${sim}&testWrappers=false`, timeout ) } ) );
  // const simsToTest = ['graphing-quadratics'];
  // simsToTest.forEach( test => tests.push( { name: test, type: 'Fuzz Test', run: () => runPage( browser, `http://localhost/${test}/${test}_en.html?brand=phet&ea&fuzz`, timeout ) } ) );

  console.log( 'enumerated ' + tests.length + ' tests' );
  // tests = shuffle( tests );
  for ( const test of tests ) {
    console.log( `Starting ${test.type}: ${test.name}` );
    const result = await test.run();
    tallyTest( test, result );
  }
  var passedPairs = pairs.filter( pair => pair.result.ok );
  var failedPairs = pairs.filter( pair => !pair.result.ok );

  console.log();
  console.log( `passed (${passedPairs.length})\n${passedPairs.map( pair => pair.test.type + ': ' + pair.test.name ).join( '\n' )}\n` );
  console.log( `failed (${failedPairs.length})\n${failedPairs.map( pair => pair.test.type + ': ' + pair.test.name ).join( '\n' )}\n` );

  await browser.close();
} )();
