// Copyright 2022-2026, University of Colorado Boulder

/**
 * Coordinates continuous testing, and provides HTTP APIs for reports or clients that run browser tests.
 *
 * @author Jonathan Olson (PhET Interactive Simulations)
 * @author Michael Kauzmann (PhET Interactive Simulations)
 * @author Chris Klusendorf (PhET Interactive Simulations)
 */

import assert from 'assert';
import http from 'http';
import path from 'path';
import url from 'url';
import { Repo } from '../../../perennial/js/browser-and-node/PerennialTypes.js';
import cloneMissingRepos from '../../../perennial/js/common/cloneMissingRepos.js';
import deleteDirectory from '../../../perennial/js/common/deleteDirectory.js';
import execute, { ExecuteResult } from '../../../perennial/js/common/execute.js';
import getRepoList from '../../../perennial/js/common/getRepoList.js';
import gitPull from '../../../perennial/js/common/gitPull.js';
import gitRevParse from '../../../perennial/js/common/gitRevParse.js';
import gruntCommand from '../../../perennial/js/common/gruntCommand.js';
import isStale from '../../../perennial/js/common/isStale.js';
import npmUpdate from '../../../perennial/js/common/npmUpdate.js';
import puppeteerLoad from '../../../perennial/js/common/puppeteerLoad.js';
import withServer from '../../../perennial/js/common/withServer.js';
import _ from '../../../perennial/js/npm-dependencies/lodash.js';
import puppeteer from '../../../perennial/js/npm-dependencies/puppeteer.js';
import winston from '../../../perennial/js/npm-dependencies/winston.js';
import sendSlackMessage from './sendSlackMessage.js';


type TestData = {

  // Same as the keyof Tests
  name: TestName;

  passed: boolean;

  // full length message, used when someone clicks on a quickNode in CT for error details
  message: string;

  // trimmed down and separated error messages, used to track the state of individual errors and show
  // abbreviated errors for the Slack CT Notifier
  errorMessages: string[];
};

type Tests = {
  lint: TestData;
  typeCheck: TestData;
  simFuzz: TestData;
  studioFuzz: TestData;
  phetioCompare: TestData;
};
type TestName = keyof Tests;

type TestingState = {
  tests: Tests;
  shas?: Dependencies;
  timestamp?: number;
};

const ctqType: Record<string, TestName> = {
  LINT: 'lint',
  TYPE_CHECK: 'typeCheck',
  SIM_FUZZ: 'simFuzz', // Should end with "Fuzz"
  STUDIO_FUZZ: 'studioFuzz', // Should end with "Fuzz"
  PHET_IO_COMPARE: 'phetioCompare'
};

// Headers that we'll include in all server replies
const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

const MAX_SLACK_MESSAGE_CHARS = 3900;

const FUZZ_SIM = 'my-solar-system';
const STUDIO_FUZZ_SIM = 'greenhouse-effect';
const WAIT_BETWEEN_RUNS = 20000; // in ms
const EXECUTE_OPTIONS = {
  errors: 'resolve',
  childProcessOptions: {
    env: { NODE_OPTIONS: '--max-old-space-size=8192' }
  }
} as const;

type Dependencies = Record<Repo, string>;

type QuickServerOptions = {
  rootDir?: string;
  isTestMode?: boolean;
};


class QuickServer {

  // the tests object stores the results of tests so that they can be iterated through for "all results"
  declare private testingState: TestingState;

  // root of your GitHub working copy, relative to the name of the directory that the
  // currently-executing script resides in
  private readonly rootDir: string;
  // whether we are in testing mode. if true, tests are continuously forced to run
  private readonly isTestMode: boolean;

  // errors found in any given loop from any portion of the testing state
  private readonly errorMessages: string[] = [];

  // Keep track of if we should wait for the next test or not kick it off immediately.
  private forceTests: boolean;

  // How many times has the quick-test loop run
  private testCount = 0;

  // For now, provide an initial message every time, so treat it as broken when it starts
  private lastBroken = false;

  // Passed to puppeteerLoad()
  private puppeteerOptions = {};

  public constructor( providedOptions?: QuickServerOptions ) {

    const options: Required<QuickServerOptions> = _.assignIn( {
      rootDir: path.normalize( `${__dirname}/../../../` ),
      isTestMode: false
    }, providedOptions );

    this.rootDir = options.rootDir;

    this.isTestMode = options.isTestMode;

    this.forceTests = this.isTestMode;

    this.wireUpMessageOnExit();
  }

  /**
   * Send a slack message when exiting unexpectedly to say that we exited.
   */
  private wireUpMessageOnExit(): void {
    let handledSignal = false;

    // catching signals and do something before exit
    [ 'SIGINT', 'SIGHUP', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT', 'SIGBUS', 'SIGFPE', 'SIGUSR1',
      'SIGSEGV', 'SIGUSR2', 'SIGTERM', 'beforeExit', 'uncaughtException', 'unhandledRejection'
    ].forEach( sig => {
      process.on( sig, ( error: Error ) => {
        if ( !handledSignal ) {
          handledSignal = true;
          const message = `CTQ has caught ${sig} and will now exit. ${error}`;
          winston.info( message );
          this.slackMessage( message ).then( () => {
            process.exit( 1 );
          } ).catch( e => { throw e; } );
        }
      } );
    } );
  }

  private async getStaleReposFrom( reposToCheck: Repo[] ): Promise<Repo[]> {
    const staleRepos: Repo[] = [];
    await Promise.all( reposToCheck.map( async repo => {
      if ( await isStale( repo ) ) {
        staleRepos.push( repo );
        winston.info( `QuickServer: ${repo} stale` );
      }
    } ) );
    return staleRepos;
  }

  public async startMainLoop(): Promise<void> {

    // Factor out so that webstorm doesn't complain about this whole block inline with the `launch` call
    const launchOptions = {
      handleSIGHUP: false,
      handleSIGINT: false,
      handleSIGTERM: false,

      // With this flag, temp files are written to /tmp/ on bayes, which caused https://github.com/phetsims/aqua/issues/145
      // /dev/shm/ is much bigger
      ignoreDefaultArgs: [ '--disable-dev-shm-usage' ],

      // Command line arguments passed to the chrome instance,
      args: [
        '--enable-precise-memory-info',

        // To prevent filling up `/tmp`, see https://github.com/phetsims/aqua/issues/145
        `--user-data-dir=${path.normalize( `${process.cwd()}/../tmp/puppeteerUserData/` )}`,

        // Fork child processes directly to prevent orphaned chrome instances from lingering on sparky, https://github.com/phetsims/aqua/issues/150#issuecomment-1170140994
        '--no-zygote',
        '--no-sandbox'
      ]
    };

    // Launch the browser once and reuse it to generate new pages in puppeteerLoad
    const browser = await puppeteer.launch( launchOptions );

    this.puppeteerOptions = {
      waitAfterLoad: this.isTestMode ? 3000 : 10000,
      allowedTimeToLoad: 120000,
      gotoTimeout: 120000,
      browser: browser,
      logger: winston.info
    };

    while ( true ) {

      // Run the test, and let us know if we should wait for next test, or proceed immediately.
      await this.runQuickTest();

      !this.forceTests && await new Promise( resolve => setTimeout( resolve, WAIT_BETWEEN_RUNS ) );
    }
  }

  private async runQuickTest(): Promise<void> {

    try {
      const reposToCheck = this.isTestMode ? [ 'natural-selection' ] : getRepoList( 'active-repos' );

      const staleRepos = await this.getStaleReposFrom( reposToCheck );

      const timestamp = Date.now();

      if ( staleRepos.length || this.testCount === 0 || this.forceTests ) {

        winston.info( `QuickServer: stale repos: ${staleRepos}` );

        const shas = await this.synchronizeRepos( staleRepos, reposToCheck );

        // Run the tests and get the results
        this.testingState = {
          tests: await this.getTestingResults(),
          shas: shas,
          timestamp: timestamp
        };

        const brokenTests = _.filter( Object.keys( this.testingState.tests ), ( name: keyof TestingState['tests'] ) => !this.testingState.tests[ name ].passed );
        const isBroken = brokenTests.length > 0;

        winston.info( `QuickServer broken: ${isBroken}` );
        isBroken && winston.info( `QuickServer broken tests: ${brokenTests}` );

        await this.reportErrorStatus( isBroken );

        this.lastBroken = isBroken;
      }
      this.forceTests = this.isTestMode;
    }
    catch( e ) {
      winston.info( `QuickServer error: ${e}` );
      console.error( e );
      this.forceTests = true; // ensure we immediately kick off next test
    }
  }

  private async getTestingResults(): Promise<Tests> {
    winston.info( 'QuickServer: Starting all tests' );

    const results: Partial<Tests> = {};

    const populate = async ( testPromise: Promise<TestData> ) => {
      const start = Date.now();
      const testData = await testPromise;
      results[ testData.name ] = testData;
      winston.info( `QuickServer: finished ${testData.name} in ${Date.now() - start}ms` );
    };

    await Promise.all( [
      populate( this.testLint() ),
      populate( this.testTypeCheck() ),
      populate( this.testSimFuzz() ),
      populate( this.testStudioFuzz() ),
      populate( this.testPhetioCompare() )
    ] );

    return results as Tests;
  }

  private async testLint(): Promise<TestData> {
    const result = await execute( gruntCommand, [ 'lint', '--all', '--hide-progress-bar' ], `${this.rootDir}/perennial`, EXECUTE_OPTIONS );
    return this.executeResultToTestData( ctqType.LINT, result );
  }

  private async testTypeCheck(): Promise<TestData> {

    // Use grunt so that it works across platforms, launching `tsc` directly as the command on windows results in ENOENT -4058.
    // Pretty false will make the output more machine-readable.
    const result = await execute( gruntCommand, [ 'type-check', '--all', '--pretty', 'false' ], `${this.rootDir}/chipper`, EXECUTE_OPTIONS );
    return this.executeResultToTestData( ctqType.TYPE_CHECK, result );
  }

  private async testPhetioCompare(): Promise<TestData> {
    const args = [
      'compare-phet-io-api',
      '--transpile=false',
      `--workers=${this.isTestMode ? 4 : 10}`,
      ...[ this.isTestMode ? '--repo=projectile-data-lab' : '--simList=../perennial/data/phet-io-api-stable' ]
    ];
    const result = await execute( gruntCommand, args, `${this.rootDir}/chipper`, EXECUTE_OPTIONS );
    return this.executeResultToTestData( ctqType.PHET_IO_COMPARE, result );
  }

  private async transpile(): Promise<void> {
    const result = await execute( gruntCommand, [ 'transpile', '--all' ], `${this.rootDir}/chipper`, EXECUTE_OPTIONS );
    if ( result.code !== 0 ) {
      winston.error( result.stderr + result.stdout );
    }
  }

  private async testSimFuzz(): Promise<TestData> {
    let simFuzz: string | null = null;
    try {
      await withServer( async ( port: number ) => {
        const url = `http://localhost:${port}/${FUZZ_SIM}/${FUZZ_SIM}_en.html?brand=phet&ea&debugger&fuzz`;
        await puppeteerLoad( url, this.puppeteerOptions );
      } );
    }
    catch( e ) {
      if ( e instanceof Error ) {
        simFuzz = e.toString();
      }
    }

    return this.fuzzResultToTestData( ctqType.SIM_FUZZ, simFuzz );
  }

  private async testStudioFuzz(): Promise<TestData> {
    let studioFuzz: string | null = null;
    try {
      await withServer( async ( port: number ) => {
        const url = `http://localhost:${port}/studio/index.html?sim=${STUDIO_FUZZ_SIM}&phetioElementsDisplay=all&fuzz&phetioWrapperDebug=true`;
        await puppeteerLoad( url, this.puppeteerOptions );
      } );
    }
    catch( e ) {
      if ( e instanceof Error ) {
        studioFuzz = e.toString();
      }
    }

    return this.fuzzResultToTestData( ctqType.STUDIO_FUZZ, studioFuzz );
  }

  private async synchronizeRepos( staleRepos: Repo[], allRepos: Repo[] ): Promise<Dependencies> {

    // When testing, assume the current codebase is correct.
    if ( this.isTestMode ) {
      winston.info( 'QuickServer: ignoring synchronizeRepos while in testing mode.' );
      return null as unknown as Dependencies;
    }

    for ( const repo of staleRepos ) {
      winston.info( `QuickServer: pulling ${repo}` );
      await gitPull( repo );
    }

    winston.info( 'QuickServer: cloning missing repos' );
    const clonedRepos = await cloneMissingRepos();

    const npmUpdateList = getRepoList( 'npm-update' );

    for ( const repo of [ ...staleRepos, ...clonedRepos ] ) {
      if ( npmUpdateList.includes( repo ) ) {
        winston.info( `QuickServer: npm update ${repo}` );
        await npmUpdate( repo );
      }
    }

    winston.info( 'QuickServer: checking SHAs' );
    const shas: Dependencies = {};
    for ( const repo of allRepos ) {
      shas[ repo ] = await gitRevParse( repo, 'main' );
    }

    // Periodically clean chipper/dist, but not on the first time for easier local testing
    // If CTQ takes 1 minute to run, then this will happen every 16 hours or so.
    if ( this.testCount++ % 1000 === 999 ) {
      await deleteDirectory( `${this.rootDir}/chipper/dist` );
    }

    await this.transpile();

    return shas;
  }

  /**
   * Starts the HTTP server part (that will connect with any reporting features).
   */
  public startServer( port: number ): void {

    // Main server creation
    http.createServer( ( req, res ) => {
      try {
        const requestInfo = url.parse( req.url!, true );

        if ( requestInfo.pathname === '/quickserver/status' ) {
          res.writeHead( 200, jsonHeaders );
          res.end( JSON.stringify( this.testingState, null, 2 ) );
        }
      }
      catch( e ) {
        winston.error( `server error: ${e}` );
      }
    } ).listen( port );

    winston.info( `QuickServer: running on port ${port}` );
  }

  /**
   * Checks the error messages and reports the current status to the logs and Slack.
   */
  private async reportErrorStatus( broken: boolean ): Promise<void> {

    // Robustness handling just in case there are errors that are tracked from last broken state
    if ( !broken ) {
      this.errorMessages.length = 0;
    }

    if ( this.lastBroken && !broken ) {
      winston.info( 'broken -> passing, sending CTQ passing message to Slack' );
      await this.slackMessage( 'CTQ passing' );
    }
    else if ( !broken && this.testCount === 1 ) {
      winston.info( 'startup -> passing, sending CTQ startup-passing message to Slack' );
      await this.slackMessage( 'CTQ started up and passing' );
    }
    else if ( broken ) {
      await this.handleBrokenState();
    }
    else {
      winston.info( 'passing -> passing' );
    }
  }

  /**
   * When in a broken state, handle all cases that may occur:
   * - Newly broken (report everything)
   * - Same broken as last state (report nothing)
   * - Some new items are broken (report only new things)
   * - Some previously broken items have been fixed (update internal state but no new reporting)
   */
  private async handleBrokenState(): Promise<void> {

    // The message reported to slack, depending on our state
    let message = '';

    // Number of errors that were not in the previous broken state
    let newErrorCount = 0;

    // Keep track of the previous errors that still exist so we don't duplicate reporting
    const previousErrorsFound = [];

    const checkForNewErrors = ( testResult: TestData ) => {
      !testResult.passed && testResult.errorMessages.forEach( errorMessage => {

        let isPreexisting = false;

        for ( let i = 0; i < this.errorMessages.length; i++ ) {
          const preexistingErrorMessage = this.errorMessages[ i ];

          // Remove spaces for a bit more maintainability in case the spacing of errors changes for an outside reason
          if ( preexistingErrorMessage.replace( /\s/g, '' ) === errorMessage.replace( /\s/g, '' ) ) {
            isPreexisting = true;
            break;
          }
        }

        // If this message matches any we currently have
        if ( isPreexisting ) {
          previousErrorsFound.push( errorMessage );
        }
        else {
          this.errorMessages.push( errorMessage );
          message += `\n${errorMessage}`;
          newErrorCount++;
        }
      } );
    };

    // See if there are any new errors in our tests
    ( Object.keys( this.testingState.tests ) as unknown as TestName[] ).forEach( testKeyName => checkForNewErrors( this.testingState.tests[ testKeyName ] ) );

    if ( message.length > 0 ) {

      if ( previousErrorsFound.length || this.lastBroken ) {
        winston.info( 'broken -> more broken, sending additional CTQ failure message to Slack' );
        const sForFailure = newErrorCount > 1 ? 's' : '';
        message = `CTQ additional failure${sForFailure}:\n\`\`\`${message}\`\`\``;

        if ( previousErrorsFound.length ) {
          assert( this.lastBroken, 'Last cycle must be broken if pre-existing errors were found' );
          const sForError = previousErrorsFound.length > 1 ? 's' : '';
          const sForRemain = previousErrorsFound.length === 1 ? 's' : '';
          message += `\n${previousErrorsFound.length} pre-existing error${sForError} remain${sForRemain}.`;
        }
        else {
          assert( this.lastBroken, 'Last cycle must be broken if no pre-existing errors were found and you made it here' );
          message += '\nAll other pre-existing errors fixed.';
        }
      }
      else {
        winston.info( 'passing -> broken, sending CTQ failure message to Slack' );
        message = `CTQ failing:
\`\`\`
${message.slice( 0, MAX_SLACK_MESSAGE_CHARS )}
${message.length > MAX_SLACK_MESSAGE_CHARS ? '\n(truncated) . . .' : ''}
\`\`\``;
      }

      await this.slackMessage( message );
    }
    else {
      winston.info( 'broken -> broken, no new failures to report to Slack' );
      assert( newErrorCount === 0, 'No new errors if no message' );
      assert( previousErrorsFound.length, 'Previous errors must exist if no new errors are found and CTQ is still broken' );
    }
  }

  /**
   * send a message to slack, with error handling
   */
  private async slackMessage( message: string ): Promise<void> {
    try {
      winston.info( `Sending to slack: ${message}` );
      await sendSlackMessage( message, this.isTestMode );
    }
    catch( e ) {
      winston.info( `Slack error: ${e}` );
      console.error( e );
    }
  }

  private executeResultToTestData( name: TestName, result: ExecuteResult ): TestData {
    return {
      name: name,
      passed: result.code === 0,
      message: `code: ${result.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      errorMessages: result.code === 0 ? [] : this.parseCompositeError( result.stdout, name, result.stderr )
    };
  }

  private fuzzResultToTestData( name: TestName, result: string | null ): TestData {
    if ( result === null ) {
      return { name: name, passed: true, message: '', errorMessages: [] };
    }
    else {

      // We want to remove the "port" variation so that the same sim error has the same error message
      result = result.replace( /localhost:\d+/g, 'localhost:8080' );
      return { name: name, passed: false, message: '' + result, errorMessages: this.parseCompositeError( result, name ) };
    }
  }

  private splitAndTrimMessage( message: string ): string[] {
    return message.split( /\r?\n/ ).map( line => line.trim() ).filter( line => line.length > 0 );
  }

  /**
   * Parses individual errors out of a collection of the same type of error, e.g. lint
   *  stderr only if the error is in the running process, and not the report
   */
  private parseCompositeError( message: string, name: string, stderr = '' ): string[] {
    const errorMessages = [];

    // If there is stderr from a process, assume that means there was a problem conducting the test, and ignore the message
    if ( stderr ) {
      errorMessages.push( `error testing ${name}: ${stderr}` );
      return errorMessages;
    }

    // most lint and type check errors have a file associated with them. look for them in a line via 4 sets of slashes
    // Extensions should match those found in CHIPPER/lint
    // Don't match to the end of the line ($),  because tsc puts the file and error on the same line.
    const fileNameRegex = /^[^\s]*([\\/][^/\\]+){4}[^\s]*(\.js|\.ts|\.jsx|\.tsx|\.cjs|\.mjs)/;
    const lintProblemRegex = /^\d+:\d+\s+error\s+/; // row:column  error  {{ERROR}}

    if ( name === ctqType.LINT ) {
      let currentFilename: string | null = null;

      // split up the error message by line for parsing
      const messageLines = this.splitAndTrimMessage( message.trim() );

      // Look for a filename. once found, all subsequent lines are an individual errors to add until the next filename is reached
      messageLines.forEach( line => {
        if ( currentFilename ) {

          // Assumes here that all problems are directly below the filename (no white spaces)
          if ( lintProblemRegex.test( line ) ) {
            errorMessages.push( `lint: ${currentFilename} -- ${line}` );
          }
          else {
            currentFilename = null;
          }
        }
        else {
          if ( fileNameRegex.test( line ) ) {
            currentFilename = line.match( fileNameRegex )![ 0 ];
          }
        }
      } );
    }
    else if ( name === ctqType.TYPE_CHECK ) {

      // split up the error message by line for parsing
      const messageLines = this.splitAndTrimMessage( message );

      // Some errors span multiple lines, like a stack, but each new error starts with a file/row/column/error number
      let currentError = '';
      const addCurrentError = () => {
        if ( currentError.length ) {
          errorMessages.push( currentError );
        }
      };

      // look for a filename. if found, all subsequent lines that don't contain filenames are part of the same error to
      // add until a new filename line is found
      messageLines.forEach( line => {
        if ( fileNameRegex.test( line ) ) {
          addCurrentError();

          currentError = `type-check: ${line}`;
        }
        else {
          currentError += `\n${line}`;
        }
      } );

      // Push the final error file
      addCurrentError();
    }

    // if we are not a lint or type check error, or if those errors were not able to be parsed above, send the whole message
    if ( !errorMessages.length ) {
      errorMessages.push( `${name}: ${message}` );
    }
    return errorMessages;
  }
}

export default QuickServer;