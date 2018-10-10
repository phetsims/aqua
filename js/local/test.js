// Copyright 2018, University of Colorado Boulder
const runUnitTests = require( './runUnitTests' );
const runPage = require( './runPage' );
const puppeteer = require( 'puppeteer' );
const fs = require( 'fs' );

( async () => {
  'use strict';

  const browser = await puppeteer.launch();
  const readList = filename => fs.readFileSync( '../perennial/data/' + filename, 'utf8' ).split( '\n' ).filter( name => name.length > 0 );

  // TODO: why do we have the "testable" lists?
  const testableRunnables = readList( 'testable-runnables' );
  const testablePhetIO = readList( 'testable-phet-io' );
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

  console.log( unitTests );
  console.log( 'found ' + unitTests.length + ' repos with unit tests' );

  const timeout = 10000;
  let passed = 0;
  let failed = 0;
  const tallyTest = result => {
    console.log( result );
    if ( result.ok ) {
      passed++;
    }
    else {
      failed++;
    }
    var total = passed + failed;
    console.log( 'Passed: ' + passed + '/' + total + ', Failed: ' + failed + '/' + total );
  };

  var tests = [];
  unitTests.forEach( test => tests.push( {
    name: test,
    type: 'Unit Test',
    run: () => runUnitTests( browser, test )
  } ) );
  testableRunnables.forEach( test => tests.push( {
    name: test,
    type: 'Fuzz Test',
    run: () => runPage( browser, `http://localhost/${test}/${test}_en.html?brand=phet&ea&fuzzMouse`, timeout )
  } ) );
  testablePhetIO.forEach( sim => tests.push( {
    name: sim,
    type: 'Fuzz Studio',
    run: runPage( browser, `http://localhost/phet-io-wrappers/studio/?sim=${sim}&phetioThrowSimErrors&fuzzMouse`, timeout )
  } ) );
  testablePhetIO.forEach( sim => tests.push( {
    name: sim,
    type: 'Fuzz Mirror Inputs',
    run: runPage( browser, `http://localhost/phet-io-wrappers/mirror-inputs/?sim=${sim}&phetioThrowSimErrors&fuzzMouse`, timeout )
  } ) );
  testablePhetIO.forEach( sim => tests.push( {
    name: sim,
    type: 'Fuzz State',
    run: runPage( browser, `http://localhost/phet-io-wrappers/state/?sim=${sim}&phetioThrowSimErrors&fuzzMouse&numberOfMillisecondsBetweenUpdates=50`, timeout )
  } ) );
  testablePhetIO.forEach( sim => tests.push( {
    name: sim,
    type: 'PhET-iO Wrapper Tests',
    run: runPage( browser, `http://localhost/phet-io-wrappers/phet-io-wrappers-tests.html/?sim=${sim}`, timeout )
  } ) );

  console.log( 'enumerated ' + tests.length + ' tests' );

  for ( const test of tests ) {
    console.log( `Starting ${test.type}: ${test.name}` );
    const result = await test.run();
    tallyTest( result );
  }

  await browser.close();
} )();
