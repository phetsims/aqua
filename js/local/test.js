// Copyright 2018, University of Colorado Boulder
const runUnitTests = require( './runUnitTests' );
const runPage = require( './runPage' );
const puppeteer = require( 'puppeteer' );

( async () => {
  'use strict';

  const browser = await puppeteer.launch();

  var x = await runUnitTests( browser, 'http://localhost/axon/axon-tests.html' );
  console.log( x );
  var z = await runPage( browser, 'http://localhost/faradays-law/faradays-law_en.html?brand=phet&ea&fuzzMouse' );
  console.log( z );
  browser.close();
} )();
