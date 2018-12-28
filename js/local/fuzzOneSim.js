// Copyright 2018, University of Colorado Boulder

'use strict';

const puppeteer = require( 'puppeteer' );
const puppeteerPage = require( './puppeteerPage' );
const _ = require( '../../../sherpa/lib/lodash-4.17.4.js' ); // eslint-disable-line
const child_process = require( 'child_process' );

( async () => {

  const say = _.includes( process.argv, '--say' );

  const sim = process.argv[ 2 ];
  const url = `http://localhost/${sim}/${sim}_en.html?brand=phet&ea&fuzz`;

  const browser = await puppeteer.launch();
  const timeout = 6000; // Timed so it takes about the same length of time as unit tests and linting, at least on my machine!

  console.log( `Fuzzing ${sim}...` );
  const result = await puppeteerPage( browser, url, timeout );

  if ( !result.ok ) {
    console.log( `failed fuzzing ${sim}, see ${url}, message:\n${result.message}` );
    say && child_process.execSync( 'say Fuzz test failed' );
  }

  // const phetioSimsToTest = ['faradays-law'];
  // phetioSimsToTest.forEach( sim => tests.push( { name: sim, type: 'Fuzz Studio', run: () => puppeteerPage( browser, `http://localhost/phet-io-wrappers/studio/?sim=${sim}&phetioDebug&fuzz`, timeout ) } ) );
  // phetioSimsToTest.forEach( sim => tests.push( { name: sim, type: 'Fuzz Mirror Inputs', run: () => puppeteerPage( browser, `http://localhost/phet-io-wrappers/mirror-inputs/?sim=${sim}&phetioDebug&fuzz`, timeout ) } ) );
  // phetioSimsToTest.forEach( sim => tests.push( { name: sim, type: 'Fuzz State', run: () => puppeteerPage( browser, `http://localhost/phet-io-wrappers/state/?sim=${sim}&phetioDebug&fuzz&numberOfMillisecondsBetweenUpdates=50`, timeout ) } ) );
  // phetioSimsToTest.forEach( sim => tests.push( { name: sim, type: 'PhET-iO Wrapper Tests', run: () => puppeteerPage( browser, `http://localhost/phet-io-wrappers/phet-io-wrappers-tests.html?sim=${sim}&testWrappers=false`, timeout ) } ) );
  // const simsToTest = ['graphing-quadratics'];
  // simsToTest.forEach( test => tests.push( { name: test, type: 'Fuzz Test', run: () => puppeteerPage( browser, `http://localhost/${test}/${test}_en.html?brand=phet&ea&fuzz`, timeout ) } ) );

  await browser.close();
} )();
