// Copyright 2018-2023, University of Colorado Boulder


const fs = require( 'fs' );
const puppeteer = require( 'puppeteer' );
const puppeteerQUnit = require( './puppeteerQUnit' );
const _ = require( '../../../sherpa/lib/lodash-4.17.4' );
const child_process = require( 'child_process' );

( async () => {

  const groups = Number( process.argv[ 2 ] );
  const groupIndex = Number( process.argv[ 3 ] );
  const say = _.includes( process.argv, '--say' );

  const browser = await puppeteer.launch();
  const readList = filename => fs.readFileSync( `../perennial/data/${filename}`, 'utf8' ).split( '\n' ).filter( name => name.length > 0 );

  const activeRepos = readList( 'active-repos' );

  // Omit phet-io-wrappers because it yields a "Calling `done` after test has completed" error.
  const index = activeRepos.indexOf( 'phet-io-wrappers' );
  activeRepos.splice( index, 1 );

  const getUnitTestFile = repo => `../${repo}/${repo}-tests.html`;
  const getUnitTestURL = repo => {
    let suffix = '';
    if ( repo === 'phet-io' ) {
      suffix = '&brand=phet-io';
    }

    // TODO: support arbitrary prefix for localhost (https://github.com/phetsims/aqua/issues/81)
    return `http://localhost/${repo}/${repo}-tests.html?ea${suffix}`;
  };

  // Find repos that have qunit tests by searching for them
  const unitTests = activeRepos.filter( repo => {
    return fs.existsSync( getUnitTestFile( repo ) ) &&
           repo !== 'scenery' && // Takes too long
           repo !== 'scenery-phet'; // Takes too long
  } ).map( getUnitTestURL );

  const allTests = [];
  const pairs = [];

  // Run all unit tests
  unitTests.forEach( test => allTests.push( {
    name: test,
    type: 'Unit Test',
    run: () => puppeteerQUnit( browser, test )
  } ) );

  const tests = _.partition( allTests, test => allTests.indexOf( test ) % groups === groupIndex )[ 0 ];
  for ( let i = 0; i < tests.length; i++ ) {
    const test = tests[ i ];
    const result = await test.run();
    pairs.push( { test: test, result: result } );
  }
  // const passedPairs = pairs.filter( pair => pair.result.ok );
  const failedPairs = pairs.filter( pair => !pair.result.ok );

  // console.log( `passed (${passedPairs.length})\n${passedPairs.map( pair => pair.test.type + ': ' + pair.test.name ).join( '\n' )}\n` );
  if ( failedPairs.length > 0 ) {
    console.log( `failed (${failedPairs.length})\n${failedPairs.map( pair => `${pair.test.type}: ${pair.test.name}\n${JSON.stringify( pair.result )}` ).join( '\n' )}\n` );
    say && child_process.execSync( 'say Unit test failed' );
  }
  else {
    console.log( `completed ${pairs.length} unit tests, all passed` );
  }

  await browser.close();
} )();
