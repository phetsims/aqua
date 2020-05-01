// Copyright 2020, University of Colorado Boulder

/**
 * Runs unit tests on a single repo.  If no unit tests are defined, this succeeds.  This outputs exit codes
 * in order to be compatible with usage as a precommit hook.
 *
 * USAGE:
 * cd ${repo}
 * node ../aqua/js/local/qunit-main.js
 *
 * @author Sam Reid (PhET Interactive Simulations)
 */

const path = require( 'path' );
const fs = require( 'fs' );

// Identify the current repo
const repo = process.cwd().split( path.sep ).pop();

const puppeteer = require( 'puppeteer' );
const puppeteerQUnit = require( './puppeteerQUnit' );
const buildLocal = require( '../../../perennial/js/common/buildLocal' );

( async () => {
  const testFilePath = `${repo}/${repo}-tests.html`;
  const exists = fs.existsSync( `../${testFilePath}` );
  if ( exists ) {
    const browser = await puppeteer.launch();
    const result = await puppeteerQUnit( browser, `${buildLocal.localTestingURL}/${testFilePath}?ea` );
    await browser.close();
    console.log( `${repo}: ${result.ok}` );
    process.exit( result.ok ? 0 : 1 );
  }
  else {
    process.exit( 0 );
  }
} )();