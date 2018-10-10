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
  // const testableRunnables = readList( 'testable-runnables' );
  // const testablePhetIO = readList( 'testable-phet-io' );
  const activeRepos = readList( 'active-repos' );

  const getUnitTestFile = repo => `../${repo}/${repo}-tests.html`;
  const getUnitTestURL = repo => `http://localhost/${repo}/${repo}-tests.html`; // TODO: support arbitrary prefix

  // Find repos that have qunit tests by searching for them
  var unitTests = activeRepos.filter( repo => fs.existsSync( getUnitTestFile( repo ) ) ).map( getUnitTestURL );

  console.log( unitTests );
  console.log( 'found ' + unitTests.length + ' repos with unit tests' );

  // console.log( 'running unit test: ' + 'http://localhost/axon/axon-tests.html' );
  // var result1 = await runUnitTests( browser, 'http://localhost/axon/axon-tests.html' );
  // console.log( result1 );

  for ( const unitTest of unitTests ) {
    console.log( 'running unit test: ' + unitTest );
    var result = await runUnitTests( browser, unitTest );
    console.log( result );
  }

  console.log( 'running page: ' + 'http://localhost/faradays-law/faradays-law_en.html?brand=phet&ea&fuzzMouse' );
  var result2 = await runPage( browser, 'http://localhost/faradays-law/faradays-law_en.html?brand=phet&ea&fuzzMouse' );
  console.log( result2 );

  await browser.close();
} )();
