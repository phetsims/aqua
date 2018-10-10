// Copyright 2018, University of Colorado Boulder
const runUnitTests = require( './runUnitTests' );
const runPage = require( './runPage' );
const puppeteer = require( 'puppeteer' );

( async () => {
  'use strict';

  const browser = await puppeteer.launch();

  console.log( 'running unit test: ' + 'http://localhost/axon/axon-tests.html' );
  var result1 = await runUnitTests( browser, 'http://localhost/axon/axon-tests.html' );
  console.log( result1 );

  console.log( 'running page: ' + 'http://localhost/faradays-law/faradays-law_en.html?brand=phet&ea&fuzzMouse' );
  var result2 = await runPage( browser, 'http://localhost/faradays-law/faradays-law_en.html?brand=phet&ea&fuzzMouse' );
  console.log( result2 );
  browser.close();
} )();
