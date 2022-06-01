// Copyright 2022, University of Colorado Boulder

/**
 * A Node script that handles multiple browser clients for Continuous Testing's server. This file uses Workers to kick
 * off instances of Puppeteer that will load the continuous-loop. This file is hard coded to point to bayes via https,
 * and will need to be updated if that URL is no longer correct.
 *
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

const _ = require( 'lodash' ); // eslint-disable-line require-statement-match
const path = require( 'path' );
const assert = require( 'assert' );
const { Worker } = require( 'worker_threads' ); // eslint-disable-line require-statement-match
const sleep = require( '../../../perennial/js/common/sleep' );

process.on( 'SIGINT', () => process.exit( 0 ) );

class ContinuousServerClient {
  constructor( options ) {

    options = {
      rootDir: path.normalize( `${__dirname}/../../../` ),
      numberOfPuppeteers: 16,
      ...options
    };

    // @public {string} - root of your GitHub working copy, relative to the name of the directory that the
    // currently-executing script resides in
    this.rootDir = options.rootDir;

    this.numberOfPuppeteers = options.numberOfPuppeteers;
  }

  /**
   * Kick off a worker, add it to a list, and when complete, remove it from that list
   * @private
   * @param {Worker[]} workerList
   * @returns {Promise<unknown>}
   */
  newClientWorker( workerList ) {
    //first argument is filename of the worker
    const worker = new Worker( `${this.rootDir}/aqua/js/server/puppeteerCTClient.js`, { argv: [ 'Bayes%20Puppeteer' ] } );
    workerList.push( worker );
    worker.on( 'message', message => { console.log( 'Message from puppeteerClient:', message ); } );
    worker.on( 'error', e => { console.error( 'Error from puppeteerClient:', e ); } );
    worker.on( 'exit', code => {
      const index = _.indexOf( workerList, worker );
      assert( index !== -1, 'worker must be in list' );
      workerList.splice( index, 1 );
      if ( code !== 0 ) {
        console.error( `Worker stopped with exit code ${code}` );
      }
    } );
  }

  /**
   * @public
   */
  async startMainLoop() {

    const workers = [];

    while ( true ) { // eslint-disable-line
      while ( workers.length < this.numberOfPuppeteers ) {
        this.newClientWorker( workers );
      }

      // Check back in every 30 seconds to see if we need to restart any workers.
      await sleep( 30000 );
    }
  }
}

module.exports = ContinuousServerClient;
