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

  for ( const unitTest of unitTests ) {
    console.log( 'running unit test: ' + unitTest );
    const result = await runUnitTests( browser, unitTest );
    tallyTest( result );
  }

  for ( const activeRunnable of testableRunnables ) {
    console.log( 'running page: ' + activeRunnable );
    const result = await runPage( browser, `http://localhost/${activeRunnable}/${activeRunnable}_en.html?brand=phet&ea&fuzzMouse`, timeout );
    tallyTest( result );
  }

  for ( const sim of testablePhetIO ) {
    console.log( 'running testable phet-io: ' + sim );
    const result = await runPage( browser, `http://localhost/phet-io-wrappers/studio/?sim=${sim}&phetioThrowSimErrors&fuzzMouse`, timeout );
    tallyTest( result );
  }

  for ( const sim of testablePhetIO ) {
    console.log( 'running testable phet-io: ' + sim );
    const result = await runPage( browser, `http://localhost/phet-io-wrappers/mirror-inputs/?sim=${sim}&phetioThrowSimErrors&fuzzMouse`, timeout );
    tallyTest( result );
  }

  for ( const sim of testablePhetIO ) {
    console.log( 'running testable phet-io: ' + sim );
    const result = await runPage( browser, `http://localhost/phet-io-wrappers/state/?sim=${sim}&phetioThrowSimErrors&fuzzMouse&numberOfMillisecondsBetweenUpdates=50`, timeout );
    tallyTest( result );
  }

  for ( const sim of testablePhetIO ) {
    console.log( 'running testable phet-io: ' + sim );
    const result = await runPage( browser, `http://localhost/phet-io-wrappers/phet-io-wrappers-tests.html/?sim=${sim}`, timeout );
    tallyTest( result );
  }

  await browser.close();
} )();
