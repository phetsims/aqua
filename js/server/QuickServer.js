// Copyright 2022-2023, University of Colorado Boulder

/**
 * Coordinates continuous testing, and provides HTTP APIs for reports or clients that run browser tests.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 * @author Michael Kauzmann (PhET Interactive Simulations)
 * @author Chris Klusendorf (PhET Interactive Simulations)
 */

const cloneMissingRepos = require( '../../../perennial/js/common/cloneMissingRepos' );
const deleteDirectory = require( '../../../perennial/js/common/deleteDirectory' );
const execute = require( '../../../perennial/js/common/execute' );
const getRepoList = require( '../../../perennial/js/common/getRepoList' );
const gitPull = require( '../../../perennial/js/common/gitPull' );
const gitRevParse = require( '../../../perennial/js/common/gitRevParse' );
const gruntCommand = require( '../../../perennial/js/common/gruntCommand' );
const isStale = require( '../../../perennial/js/common/isStale' );
const npmUpdate = require( '../../../perennial/js/common/npmUpdate' );
const puppeteerLoad = require( '../../../perennial/js/common/puppeteerLoad' );
const withServer = require( '../../../perennial/js/common/withServer' );
const assert = require( 'assert' );
const http = require( 'http' );
const _ = require( 'lodash' );
const path = require( 'path' );
const url = require( 'url' );
const winston = require( 'winston' );
const puppeteer = require( 'puppeteer' );
const sendSlackMessage = require( './sendSlackMessage' );

const ctqType = {
  LINT: 'lint',
  TSC: 'tsc',
  SIM_FUZZ: 'simFuzz', // Should end with "Fuzz"
  STUDIO_FUZZ: 'studioFuzz' // Should end with "Fuzz"
};

// Headers that we'll include in all server replies
const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

const FUZZ_SIM = 'natural-selection';
const STUDIO_FUZZ_SIM = 'states-of-matter';
const WAIT_BETWEEN_RUNS = 20000; // in ms
const EXECUTE_OPTIONS = { errors: 'resolve' };

class QuickServer {
  constructor( options ) {

    options = {
      rootDir: path.normalize( `${__dirname}/../../../` ),
      isTestMode: false,
      ...options
    };

    // @public {*} - the tests object stores the results of tests so that they can be iterated through for "all results"
    this.testingState = { tests: {} };

    // @public {string} - root of your GitHub working copy, relative to the name of the directory that the
    // currently-executing script resides in
    this.rootDir = options.rootDir;

    // @public {boolean} - whether we are in testing mode. if true, tests are continuously forced to run
    this.isTestMode = options.isTestMode;

    // @private {string[]} - errors found in any given loop from any portion of the testing state
    this.errorMessages = [];

    // Keep track of if we should wait for the next test or not kick it off immediately.
    this.forceTests = this.isTestMode;

    // How many times has the quick-test loop run
    this.testCount = 0;

    // For now, provide an initial message every time, so treat it as broken when it starts
    this.lastBroken = false;

    // Passed to puppeteerLoad()
    this.puppeteerOptions = {};

    this.wireUpMessageOnExit();
  }

  /**
   * Send a slack message when exiting unexpectedly to say that we exited.
   * @private
   */
  wireUpMessageOnExit() {

    // catching signals and do something before exit
    [ 'SIGINT', 'SIGHUP', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT', 'SIGBUS', 'SIGFPE', 'SIGUSR1',
      'SIGSEGV', 'SIGUSR2', 'SIGTERM', 'beforeExit', 'uncaughtException', 'unhandledRejection'
    ].forEach( sig => {
      process.on( sig, () => {
        const message = `CTQ has caught ${sig} and will now exit.`;
        winston.info( message );
        this.slackMessage( message ).then( () => {
          process.exit( 1 );
        } );
      } );
    } );
  }

  // @private
  async getStaleReposFrom( reposToCheck ) {
    const staleRepos = [];
    await Promise.all( reposToCheck.map( async repo => {
      if ( await isStale( repo ) ) {
        staleRepos.push( repo );
        winston.info( `QuickServer: ${repo} stale` );
      }
    } ) );
    return staleRepos;
  }

  /**
   * @public
   */
  async startMainLoop() {

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
        `--user-data-dir=${process.cwd()}/../tmp/puppeteerUserData/`,

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
      browser: browser
    };

    while ( true ) { // eslint-disable-line no-constant-condition

      // Run the test, and let us know if we should wait for next test, or proceed immediately.
      await this.runQuickTest();

      !this.forceTests && await new Promise( resolve => setTimeout( resolve, WAIT_BETWEEN_RUNS ) );
    }
  }

  /**
   * @private
   */
  async runQuickTest() {

    try {
      const reposToCheck = this.isTestMode ? [ 'natural-selection' ] : getRepoList( 'active-repos' );

      const staleRepos = await this.getStaleReposFrom( reposToCheck );

      const timestamp = Date.now();

      if ( staleRepos.length || this.testCount === 0 || this.forceTests ) {

        winston.info( `QuickServer: stale repos: ${staleRepos}` );

        const shas = await this.synchronizeRepos( staleRepos, reposToCheck );

        // Run the tests and get the results
        this.testingState = {
          tests: {
            lint: this.executeResultToTestData( await this.testLint(), ctqType.LINT ),
            tsc: this.executeResultToTestData( await this.testTSC(), ctqType.TSC ),
            simFuzz: this.fuzzResultToTestData( await this.testSimFuzz(), ctqType.SIM_FUZZ ),
            studioFuzz: this.fuzzResultToTestData( await this.testStudioFuzz(), ctqType.STUDIO_FUZZ )
          },
          shas: shas,
          timestamp: timestamp
        };

        const broken = this.isBroken( this.testingState );

        winston.info( `QuickServer broken: ${broken}` );

        await this.reportErrorStatus( broken );

        this.lastBroken = broken;
      }
      this.forceTests = this.isTestMode;
    }
    catch( e ) {
      winston.info( `QuickServer error: ${e}` );
      console.error( e );
      this.forceTests = true; // ensure we immediately kick off next test
    }
  }

  /**
   * @private
   * @param {Object} testingState
   * @returns {boolean}
   */
  isBroken( testingState = this.testingState ) {
    return _.some( Object.keys( testingState.tests ), name => !testingState.tests[ name ].passed );
  }

  /**
   * @private
   @returns {Promise<{code:number,stdout:string,stderr:string}>}
   */
  async testLint() {
    winston.info( 'QuickServer: linting' );
    return execute( gruntCommand, [ 'lint-everything', '--hide-progress-bar' ], `${this.rootDir}/perennial`, EXECUTE_OPTIONS );
  }

  /**
   * @private
   * @returns {Promise<{code:number,stdout:string,stderr:string}>}
   */
  async testTSC() {
    winston.info( 'QuickServer: tsc' );

    // Use the "node" executable so that it works across platforms, launching `tsc` as the command on windows results in ENOENT -4058.
    // Pretty false will make the output more machine readable.
    return execute( 'node', [ '../../../chipper/node_modules/typescript/bin/tsc', '--pretty', 'false' ],
      `${this.rootDir}/chipper/tsconfig/all`, EXECUTE_OPTIONS );
  }

  /**
   * @private
   * @returns {Promise<{code:number,stdout:string,stderr:string}>}
   */
  async transpile() {
    winston.info( 'QuickServer: transpiling' );
    return execute( 'node', [ 'js/scripts/transpile.js' ], `${this.rootDir}/chipper`, EXECUTE_OPTIONS );
  }

  /**
   * @private
   * @returns {Promise<string|null>}
   */
  async testSimFuzz() {
    winston.info( 'QuickServer: sim fuzz' );

    let simFuzz = null;
    try {
      await withServer( async port => {
        const url = `http://localhost:${port}/${FUZZ_SIM}/${FUZZ_SIM}_en.html?brand=phet&ea&debugger&fuzz`;
        await puppeteerLoad( url, this.puppeteerOptions );
      } );
    }
    catch( e ) {
      simFuzz = e.toString();
    }
    return simFuzz;
  }

  /**
   * @private
   * @returns {Promise<string|null>}
   */
  async testStudioFuzz() {
    winston.info( 'QuickServer: studio fuzz' );

    let studioFuzz = null;
    try {
      await withServer( async port => {
        const url = `http://localhost:${port}/studio/index.html?sim=${STUDIO_FUZZ_SIM}&phetioElementsDisplay=all&fuzz&phetioWrapperDebug=true`;
        await puppeteerLoad( url, this.puppeteerOptions );
      } );
    }
    catch( e ) {
      studioFuzz = e.toString();
    }
    return studioFuzz;
  }

  /**
   * @private
   * @param {string[]} staleRepos
   * @param {string[]} allRepos
   * @returns {Promise<Object<string,string>>} - shas for repos
   */
  async synchronizeRepos( staleRepos, allRepos ) {
    for ( const repo of staleRepos ) {
      winston.info( `QuickServer: pulling ${repo}` );
      await gitPull( repo );
    }

    winston.info( 'QuickServer: cloning missing repos' );
    const clonedRepos = await cloneMissingRepos();

    for ( const repo of [ ...staleRepos, ...clonedRepos ] ) {
      if ( [ 'chipper', 'perennial', 'perennial-alias' ].includes( repo ) ) {
        winston.info( `QuickServer: npm update ${repo}` );
        await npmUpdate( repo );
      }
    }

    winston.info( 'QuickServer: checking SHAs' );
    const shas = {};
    for ( const repo of allRepos ) {
      shas[ repo ] = await gitRevParse( repo, 'master' );
    }

    // Periodically clean chipper/dist, but not on the first time for easier local testing
    // If CTQ takes 1 minute to run, then this will happen every 16 hours or so.
    if ( this.testCount++ % 1000 === 999 && !this.isTestMode ) {
      await deleteDirectory( `${this.rootDir}/chipper/dist` );
    }

    await this.transpile();

    return shas;
  }

  /**
   * Starts the HTTP server part (that will connect with any reporting features).
   * @public
   *
   * @param {number} port
   */
  startServer( port ) {
    assert( typeof port === 'number', 'port should be a number' );

    // Main server creation
    http.createServer( ( req, res ) => {
      try {
        const requestInfo = url.parse( req.url, true );

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
   *
   * @param {boolean} broken
   * @private
   */
  async reportErrorStatus( broken ) {

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
   *
   * @private
   */
  async handleBrokenState() {

    // The message reported to slack, depending on our state
    let message = '';

    // Number of errors that were not in the previous broken state
    let newErrorCount = 0;

    // Keep track of the previous errors that still exist so we don't duplicate reporting
    const previousErrorsFound = [];

    const checkForNewErrors = testResult => {
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
    Object.keys( this.testingState.tests ).forEach( testKeyName => checkForNewErrors( this.testingState.tests[ testKeyName ] ) );

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
        message = 'CTQ failing:\n```' + message + '```';
      }

      await this.slackMessage( message, this.isTestMode );
    }
    else {
      winston.info( 'broken -> broken, no new failures to report to Slack' );
      assert( newErrorCount === 0, 'No new errors if no message' );
      assert( previousErrorsFound.length, 'Previous errors must exist if no new errors are found and CTQ is still broken' );
    }
  }

  /**
   * send a message to slack, with error handling
   * @param {string} message
   * @returns {Promise<void>}
   * @private
   */
  async slackMessage( message ) {
    try {
      winston.info( `Sending to slack: ${message}` );
      await sendSlackMessage( message, this.isTestMode );
    }
    catch( e ) {
      winston.info( `Slack error: ${e}` );
      console.error( e );
    }
  }

  /**
   * @private
   * @param {string} result
   * @param {string} name
   * @returns {{errorMessages: string[], passed: boolean, message: string}}
   */
  executeResultToTestData( result, name ) {
    return {
      passed: result.code === 0,

      // full length message, used when someone clicks on a quickNode in CT for error details
      message: `code: ${result.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,

      // trimmed down and separated error messages, used to track the state of individual errors and show
      // abbreviated errors for the Slack CT Notifier
      errorMessages: result.code === 0 ? [] : this.parseCompositeError( result.stdout, name, result.stderr )
    };
  }


  /**
   * @private
   * @param {string} result
   * @param {string} name
   * @returns {{errorMessages: string[], passed: boolean, message: string}}
   */
  fuzzResultToTestData( result, name ) {
    if ( result === null ) {
      return { passed: true, message: '', errorMessages: [] };
    }
    else {

      // We want to remove the "port" variation so that the same sim error has the same error message
      result = result.replace( /localhost:\d+/g, 'localhost:8080' );
      return { passed: false, message: '' + result, errorMessages: this.parseCompositeError( result, name ) };
    }
  }

  /**
   * @private
   * @param {string} message
   * @returns {string}
   */
  splitAndTrimMessage( message ) {
    return message.split( /\r?\n/ ).map( line => line.trim() ).filter( line => line.length > 0 );
  }

  /**
   * Parses individual errors out of a collection of the same type of error, e.g. lint
   *
   * @param {string} message
   * @param {string} name
   * @param {string} stderr - if the error is in the running process, and not the report
   * @returns {string[]}
   * @private
   */
  parseCompositeError( message, name, stderr = '' ) {
    const errorMessages = [];

    // If there is stderr from a process, assume that means there was a problem conducting the test, and ignore the message
    if ( stderr ) {
      errorMessages.push( `error testing ${name}: ${stderr}` );
      return errorMessages;
    }

    // most lint and tsc errors have a file associated with them. look for them in a line via 4 sets of slashes
    // Extensions should match those found in CHIPPER/lint
    // Don't match to the end of the line ($),  because tsc puts the file and error on the same line.
    const fileNameRegex = /^[^\s]*([\\/][^/\\]+){4}[^\s]*(\.js|\.ts|\.jsx|\.tsx|\.cjs|\.mjs)/;
    const lintProblemRegex = /^\d+:\d+\s+error\s/; // row:column error {{ERROR}}

    if ( name === ctqType.LINT ) {
      let currentFilename = null;

      // This message is duplicated in CHIPPER/lint, please change cautiously.
      const IMPORTANT_MESSAGE = 'All results (repeated from above)';
      assert( message.includes( IMPORTANT_MESSAGE ), 'expected formatting from lint ' + message );
      message = message.split( IMPORTANT_MESSAGE )[ 1 ].trim();

      // split up the error message by line for parsing
      const messageLines = this.splitAndTrimMessage( message );

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

        if ( !currentFilename && fileNameRegex.test( line ) ) {
          currentFilename = line.match( fileNameRegex )[ 0 ];
        }
      } );
    }
    else if ( name === ctqType.TSC ) {

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

          currentError = `tsc: ${line}`;
        }
        else {
          currentError += `\n${line}`;
        }
      } );

      // Push the final error file
      addCurrentError();
    }

    // if we are not a lint or tsc error, or if those errors were not able to be parsed above, send the whole message
    if ( !errorMessages.length ) {
      errorMessages.push( `${name}: ${message}` );
    }
    return errorMessages;
  }
}

module.exports = QuickServer;
