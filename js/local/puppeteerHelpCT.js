// Copyright 2019-2022, University of Colorado Boulder

/**
 * Launch puppeteer and point it to CT to help run tests faster
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */


const puppeteerLoad = require( '../../../perennial-alias/js/common/puppeteerLoad' );
const assert = require( 'assert' );

process.on( 'SIGINT', () => process.exit() );

( async () => {

  assert( process.argv[ 2 ], 'usage: node puppeteerHelpCT {{SOME_IDENTIFIER_HERE}}' );
  while ( true ) { // eslint-disable-line no-constant-condition

    await puppeteerLoad( `https://bayes.colorado.edu/continuous-testing/aqua/html/continuous-loop.html?id=localPuppeteer${process.argv[ 2 ]}`, {
      waitAfterLoad: 100000
    } );
  }
} )();

