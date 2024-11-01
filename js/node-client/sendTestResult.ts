// Copyright 2023-2024, University of Colorado Boulder

/**
 * Sends a CT test result
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import axios from 'axios';
import _ from '../../../perennial/js/npm-dependencies/lodash.js';
import winston from '../../../perennial/js/npm-dependencies/winston.js';
import { TestInfo } from './getNextTestInfo.js';
import { CTNodeClientOptions } from './runTest.js';

/**
 * Sends a CT test result
 */
async function sendTestResult( message: string | undefined, testInfo: TestInfo, passed: boolean, providedOptions?: Partial<CTNodeClientOptions> ): Promise<object> {
  const options = _.assignIn( {
    serverURL: 'https://sparky.colorado.edu', // {string} - The server to use
    ctID: 'Sparky Node Puppeteer' // {string} - The ID of the client
  }, providedOptions );

  winston.info( `Sending test result [${passed ? 'PASS' : 'FAIL'}]${message === undefined ? '' : ` with message:\n${message}...`}` );

  const result = {
    passed: passed,
    test: testInfo.test,
    snapshotName: testInfo.snapshotName,
    timestamp: testInfo.timestamp,
    message: message,
    id: options.ctID
  };

  const response = await axios( {
    method: 'post',
    url: `${options.serverURL}/aquaserver/test-result`,
    data: result
  } );
  return response.data;
}

export default sendTestResult;