// Copyright 2022, University of Colorado Boulder

/**
 * Coordinates continuous testing, and provides HTTP APIs for reports or clients that run browser tests.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
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
const _ = require( 'lodash' ); // eslint-disable-line require-statement-match
const path = require( 'path' );
const url = require( 'url' );
const winston = require( 'winston' );
const puppeteer = require( 'puppeteer' );
const sendSlackMessage = require( './sendSlackMessage' );

const ctqType = {
  LINT: 'lint',
  TSC: 'tsc',
  TRANSPILE: 'transpile',
  SIM_FUZZ: 'simFuzz',
  STUDIO_FUZZ: 'studioFuzz'
};

// Headers that we'll include in all server replies
const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

// For now, provide an initial message every time, so treat it as broken when it starts
let lastBroken = false;

class QuickServer {
  constructor( options ) {

    options = {
      rootDir: path.normalize( `${__dirname}/../../../` ),
      isTestMode: false,
      ...options
    };

    // @public {*}
    this.testingState = {};

    // @public {string} - root of your GitHub working copy, relative to the name of the directory that the
    // currently-executing script resides in
    this.rootDir = options.rootDir;

    // @public {boolean} - whether we are in testing mode. if true, tests are continuously forced to run
    this.isTestMode = options.isTestMode;

    // @private {string[]} - errors found in any given loop
    this.errorMessages = [];
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
    // Let it execute tests on startup once
    let forceTests = true;
    let count = 0;

    // Launch the browser once and reuse it to generate new pages in puppeteerLoad
    const browser = await puppeteer.launch( {

      // With this flag, temp files are written to /tmp/ on bayes, which caused https://github.com/phetsims/aqua/issues/145
      // /dev/shm/ is much bigger
      ignoreDefaultArgs: [ '--disable-dev-shm-usage' ],

      // Command line arguments passed to the chrome instance,
      args: [
        '--enable-precise-memory-info',

        // To prevent filling up `/tmp`, see https://github.com/phetsims/aqua/issues/145
        `--user-data-dir=${process.cwd()}/../tmp/puppeteerUserData/`
      ]
    } );

    const puppeteerOptions = {
      waitAfterLoad: 10000,
      allowedTimeToLoad: 120000,
      puppeteerTimeout: 120000,
      browser: browser
    };

    while ( true ) { // eslint-disable-line no-constant-condition

      try {
        const reposToCheck = getRepoList( 'active-repos' ).filter( repo => repo !== 'aqua' );

        let staleRepos = await this.getStaleReposFrom( reposToCheck );

        const timestamp = Date.now();

        if ( staleRepos.length || forceTests ) {
          forceTests = this.isTestMode;

          // don't hold for 20 seconds when forcing.
          if ( !forceTests ) {

            // wait 20 seconds before checking for stale repos to give multi-repo pushes a chance to make it in this round
            await new Promise( resolve => setTimeout( resolve, 20000 ) );
            staleRepos = await this.getStaleReposFrom( reposToCheck );
          }

          winston.info( `QuickServer: stale repos: ${staleRepos}` );

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
          for ( const repo of reposToCheck ) {
            shas[ repo ] = await gitRevParse( repo, 'master' );
          }

          winston.info( 'QuickServer: linting' );
          const lintResult = await execute( gruntCommand, [ 'lint-everything', '--hide-progress-bar' ], `${this.rootDir}/perennial`, { errors: 'resolve' } );

          // Periodically clean chipper/dist, but not on the first time for easier local testing
          if ( count++ % 10 === 2 ) {
            await deleteDirectory( `${this.rootDir}/chipper/dist` );
          }

          winston.info( 'QuickServer: tsc' );
          const tscResult = await execute( '../../node_modules/typescript/bin/tsc', [], `${this.rootDir}/chipper/tsconfig/all`, { errors: 'resolve' } );

          winston.info( 'QuickServer: transpiling' );
          const transpileResult = await execute( 'node', [ 'js/scripts/transpile.js' ], `${this.rootDir}/chipper`, { errors: 'resolve' } );

          winston.info( 'QuickServer: sim fuzz' );

          let simFuzz = null;
          try {
            await withServer( async port => {
              const url = `http://localhost:${port}/natural-selection/natural-selection_en.html?brand=phet&ea&debugger&fuzz`;
              await puppeteerLoad( url, puppeteerOptions );
            } );
          }
          catch( e ) {
            simFuzz = e;
          }

          winston.info( 'QuickServer: studio fuzz' );
          let studioFuzz = null;
          try {
            await withServer( async port => {
              const url = `http://localhost:${port}/studio/index.html?sim=states-of-matter&phetioElementsDisplay=all&fuzz`;
              await puppeteerLoad( url, puppeteerOptions );
            } );
          }
          catch( e ) {
            studioFuzz = e;
          }

          const executeResultToOutput = ( result, name ) => {
            return {
              passed: result.code === 0,

              // full length message, used when someone clicks on a quickNode in CT for error details
              message: `code: ${result.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,

              // trimmed down and separated error messages, used to track the state of individual errors and show
              // abbreviated errors for the Slack CT Notifier
              errorMessages: result.code === 0 ? [] : this.parseErrors( result.stdout, name )
            };
          };
          const fuzzResultToOutput = ( result, name ) => {
            if ( result === null ) {
              return { passed: true, message: '', errorMessages: [] };
            }
            else {
              return { passed: false, message: '' + result, errorMessages: this.parseErrors( result, name ) };
            }
          };

          // This would take up too much space
          transpileResult.stdout = '';

          this.testingState = {
            lint: executeResultToOutput( lintResult, ctqType.LINT ),
            tsc: executeResultToOutput( tscResult, ctqType.TSC ),
            transpile: executeResultToOutput( transpileResult, ctqType.TRANSPILE ),
            simFuzz: fuzzResultToOutput( simFuzz, ctqType.SIM_FUZZ ),
            studioFuzz: fuzzResultToOutput( studioFuzz, ctqType.STUDIO_FUZZ ),
            shas: shas,
            timestamp: timestamp
          };

          try {
            const broken = !this.testingState.lint.passed ||
                           !this.testingState.tsc.passed ||
                           !this.testingState.transpile.passed ||
                           !this.testingState.simFuzz.passed ||
                           !this.testingState.studioFuzz.passed;

            await this.reportErrorStatus( broken, lastBroken );

            lastBroken = broken;
          }
          catch( e ) {
            winston.info( `Slack error: ${e}` );
          }
        }
      }
      catch( e ) {
        winston.info( `QuickServer error: ${e}` );
        forceTests = true;
      }
    }
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
        this.setError( `server error: ${e}` );
      }
    } ).listen( port );

    winston.info( `QuickServer: running on port ${port}` );
  }

  /**
   * Checks the error messages and reports the current status to the logs and Slack.
   *
   * @param {boolean} broken
   * @param {boolean} lastBroken
   * @private
   * TODO for @chrisklus: add comments to this function
   */
  async reportErrorStatus( broken, lastBroken ) {
    if ( lastBroken === true && !broken ) {
      this.errorMessages.length = 0;
      winston.info( 'broken -> passing, sending CTQ passing message to Slack' );
      await sendSlackMessage( 'CTQ passing', this.isTestMode );
    }
    else if ( broken ) {
      let message = '';
      let newErrorCount = 0;
      const previousErrorsFound = [];

      const check = result => {
        if ( !result.passed ) {
          result.errorMessages.forEach( errorMessage => {
            if ( _.every( this.errorMessages, preExistingErrorMessage => {
              const preExistingErrorMessageWithNoSpaces = preExistingErrorMessage.replace( /\s/g, '' );
              const newErrorMessageWithNoSpaces = errorMessage.replace( /\s/g, '' );
              return preExistingErrorMessageWithNoSpaces !== newErrorMessageWithNoSpaces;
            } ) ) {
              this.errorMessages.push( errorMessage );
              message += `\n${errorMessage}`;
              newErrorCount++;
            }
            else {
              previousErrorsFound.push( errorMessage );
            }
          } );
        }
      };

      check( this.testingState.lint );
      check( this.testingState.tsc );
      check( this.testingState.transpile );
      check( this.testingState.simFuzz );
      check( this.testingState.studioFuzz );

      if ( message.length > 0 ) {

        if ( previousErrorsFound.length || lastBroken ) {
          winston.info( 'broken -> more broken, sending additional CTQ failure message to Slack' );
          const sForFailure = newErrorCount > 1 ? 's' : '';
          message = `CTQ additional failure${sForFailure}:\n\`\`\`${message}\`\`\``;

          if ( previousErrorsFound.length ) {
            assert && assert( lastBroken, 'Last cycle must be broken if pre-existing errors were found' );
            const sForError = previousErrorsFound.length > 1 ? 's' : '';
            const sForRemain = previousErrorsFound.length === 1 ? 's' : '';
            message += `\n${previousErrorsFound.length} other pre-existing error${sForError} remain${sForRemain}.`;
          }
          else {
            assert && assert( lastBroken, 'Last cycle must be broken if no pre-existing errors were found and you made it here' );
            message += '\nAll other pre-existing errors fixed.';
          }
        }
        else {
          winston.info( 'passing -> broken, sending CTQ failure message to Slack' );
          message = 'CTQ failing:\n```' + message + '```';
        }

        winston.info( message );
        await sendSlackMessage( message, this.isTestMode );
      }
      else {
        winston.info( 'broken -> broken, no new failures to report to Slack' );
        assert && assert( previousErrorsFound.length, 'Previous errors must exist if no new errors are found and CTQ is still broken' );
      }
    }
    else {
      winston.info( 'passing -> passing' );
    }
  }

  /**
   * Parses individual errors out of a collection of the same type of error, e.g. lint
   *
   * @param {string} message
   * @param {string} name
   * @returns {string[]}
   * @private
   */
  parseErrors( message, name ) {
    const errorMessages = [];

    // most lint and tsc errors have a file associated with them. look for them in a line via slashes
    const fileNameRegex = /.*\/.+\/.+\/.+\/.+/;

    // split up the error message by line for parsing
    const messageLines = message.split( /\r?\n/ );

    if ( name === ctqType.LINT ) {
      let currentFilename = null;

      // look for a filename. once found, all subsequent lines are an individual errors to add until a blank line is reached
      messageLines.forEach( line => {
        if ( currentFilename ) {
          if ( line.length > 0 ) {
            errorMessages.push( `lint: ${currentFilename}${line}` );
          }
          else {
            currentFilename = null;
          }
        }
        else if ( fileNameRegex.test( line ) ) {
          currentFilename = line.match( fileNameRegex )[ 0 ];
        }
      } );
    }
    else if ( name === ctqType.TSC ) {
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
        else if ( currentError.length && line.length ) {
          currentError += `\n${line}`;
        }
      } );
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
