// Copyright 2022-2023, University of Colorado Boulder

/**
 * A Node script that handles multiple browser clients for Continuous Testing's server. This file uses Workers to kick
 * off instances of Puppeteer that will load the continuous-loop. This file is hard coded to point to bayes via https,
 * and will need to be updated if that URL is no longer correct.
 *
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

const _ = require( 'lodash' );
const path = require( 'path' );
const assert = require( 'assert' );
const { Worker } = require( 'worker_threads' ); // eslint-disable-line require-statement-match
const sleep = require( '../../../perennial/js/common/sleep' );

process.on( 'SIGINT', () => process.exit( 0 ) );

class ContinuousServerClient {
  constructor( options ) {

    options = {

      // Path to the root of PhET git repos (relative to this file)
      rootDir: path.normalize( `${__dirname}/../../../` ),

      // How many instances (worker threads) should be created?
      numberOfPuppeteers: 8,
      numberOfFirefoxes: 0,
      ctID: 'Sparky',
      serverURL: 'https://sparky.colorado.edu/',
      ...options
    };

    // @public {string} - root of your GitHub working copy, relative to the name of the directory that the
    // currently-executing script resides in
    this.rootDir = options.rootDir;

    this.numberOfPuppeteers = options.numberOfPuppeteers;
    this.numberOfFirefoxes = options.numberOfFirefoxes;
    this.ctID = options.ctID;
    this.serverURL = options.serverURL;

    this.firefoxWorkers = [];
    this.puppeteerWorkers = [];
  }

  /**
   * Kick off a worker, add it to a list, and when complete, remove it from that list
   * @private
   * @param {Worker[]} workerList
   * @param {number} workerNumber
   * @param {string} clientScriptName
   * @returns {Promise<unknown>}
   */
  newClientWorker( workerList, workerNumber, clientScriptName = 'puppeteerCTClient.js' ) {

    console.log( `Worker${workerNumber} new instance` );

    const worker = new Worker( `${this.rootDir}/aqua/js/server/${clientScriptName}`, {
      argv: [ this.ctID, this.serverURL ]
    } );

    workerList.push( worker );

    worker.on( 'message', message => { console.log( `Worker${workerNumber} Message from puppeteerClient:`, message ); } );
    worker.on( 'error', e => { console.error( `Worker${workerNumber} Error from puppeteerClient:`, e ); } );
    worker.on( 'exit', code => {
      console.log( `Worker${workerNumber} instance complete` );
      const index = _.indexOf( workerList, worker );
      assert( index !== -1, 'worker must be in list' );
      workerList.splice( index, 1 );
      if ( code !== 0 ) {
        console.error( `Worker${workerNumber} stopped with exit code ${code}` );
      }
    } );
  }

  /**
   * @public
   */
  async startMainLoop() {

    let count = 0;

    console.log( `Starting up ${this.numberOfPuppeteers} test browsers` );
    console.log( `ctID: ${this.ctID}` );
    console.log( `serverURL: ${this.serverURL}` );

    while ( true ) { // eslint-disable-line no-constant-condition

      // Always keep this many workers chugging away
      while ( this.puppeteerWorkers.length < this.numberOfPuppeteers ) {
        this.newClientWorker( this.puppeteerWorkers, count++ );
      }
      // Always keep this many workers chugging away
      while ( this.firefoxWorkers.length < this.numberOfFirefoxes ) {
        this.newClientWorker( this.firefoxWorkers, count++, 'playwrightCTClient.js' );
      }

      // Check back in every 5 seconds to see if we need to restart any workers.
      await sleep( 5000 );
    }
  }
}

module.exports = ContinuousServerClient;
