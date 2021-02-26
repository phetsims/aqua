// Copyright 2019, University of Colorado Boulder

/**
 * Launch puppeteer and point it to CT to help run tests faster
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

'use strict';

const puppeteer = require( 'puppeteer' );
const assert = require( 'assert' );

process.on( 'SIGINT', () => process.exit() );

( async () => {

  assert( process.argv[ 2 ], 'usage: node puppeteerHelpCT {{SOME_IDENTIFIER_HERE}}' );
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.on( 'console', msg => console.log( msg.text() ) );
  page.on( 'error', msg => console.error( 'error from puppeteer', msg ) );
  page.on( 'pageerror', msg => console.error( 'pageerror from puppeteer', msg ) );

  try {
    await page.goto( `https://bayes.colorado.edu/continuous-testing/aqua/html/continuous-loop.html?id=localPuppeteer${process.argv[ 2 ]}` );
  }
  catch( e ) {
    throw e;
  }
} )();

