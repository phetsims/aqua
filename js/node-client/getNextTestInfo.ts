// Copyright 2023-2024, University of Colorado Boulder

import axios, { AxiosResponse } from 'axios';
import _ from '../../../perennial/js/npm-dependencies/lodash.js';
import { CTNodeClientOptions } from './runTest.js';

export type TestInfo = {
  snapshotName: string;
  test: string[];
  url: string;
  timestamp: number;
};

/**
 * Returns CT data for the next test to run (for browser-based testing)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */
async function getNextTestInfo( providedOptions?: Partial<CTNodeClientOptions> ): Promise<TestInfo> {
  const options = _.assignIn( {
    serverURL: 'https://sparky.colorado.edu', // {string} - The server to use
    old: false // {boolean} - Provided for compatibility/testing, anything using this should be new enough
  }, providedOptions );

  let response: AxiosResponse<TestInfo> | null = null;
  try {
    response = await axios( `${options.serverURL}/aquaserver/next-test?old=${options.old}` );
  }
  catch( e: any ) {
    if ( e instanceof Error ) {

      // @ts-expect-error - it is an axios error
      throw new Error( `axios failure code ${e.response.status} getting next-test: ${e.message}` );
    }
  }

  if ( response?.status !== 200 ) {
    throw new Error( `nextTest request failed with status ${response!.status} ${response}` );
  }

  return response?.data || null;
}

export default getNextTestInfo;