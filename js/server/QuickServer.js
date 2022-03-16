// Copyright 2020-2021, University of Colorado Boulder

/**
 * Coordinates continuous testing, and provides HTTP APIs for reports or clients that run browser tests.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */


const cloneMissingRepos = require( '../../../perennial/js/common/cloneMissingRepos' );
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
const _ = require( 'lodash' ); // eslint-disable-line
const path = require( 'path' );
const url = require( 'url' );
const winston = require( 'winston' );

// Headers that we'll include in all server replies
const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

class QuickServer {
  constructor( rootDir = path.normalize( `${__dirname}/../../../` ) ) {

    // @public {*}
    this.reportState = {};

    // @public {string} - root of your GitHub working copy, relative to the name of the directory that the
    // currently-executing script resides in
    this.rootDir = rootDir;
  }

  /**
   * @public
   */
  async startMainLoop() {
    // Let it execute tests on startup once
    let forceTests = true;

    while ( true ) { // eslint-disable-line

      try {

        winston.info( 'QuickServer: cycle start' );

        const reposToCheck = getRepoList( 'active-repos' ).filter( repo => repo !== 'aqua' );

        const timestamp = Date.now();

        // TODO: don't be synchronous here
        const staleRepos = [];
        winston.info( 'QuickServer: checking stale' );
        await Promise.all( reposToCheck.map( async repo => {
          if ( await isStale( repo ) ) {
            staleRepos.push( repo );
            winston.info( `QuickServer: ${repo} stale` );
          }
        } ) );

        if ( staleRepos.length || forceTests ) {
          forceTests = false;

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
          const lintResult = await execute( gruntCommand, [ 'lint-everything' ], `${this.rootDir}/perennial`, { errors: 'resolve' } );

          winston.info( 'QuickServer: tsc' );
          const tscResult = await execute( 'tsc', [ '-b' ], `${this.rootDir}/chipper/tsconfig/all`, { errors: 'resolve' } );

          winston.info( 'QuickServer: transpiling' );
          const transpileResult = await execute( 'node', [ 'js/scripts/transpile.js' ], `${this.rootDir}/chipper`, { errors: 'resolve' } );

          winston.info( 'QuickServer: sim fuzz' );
          let simFuzz = null;
          try {
            await withServer( async port => {
              const url = `http://localhost:${port}/natural-selection/natural-selection_en.html?brand=phet&ea&debugger&fuzz`;
              const error = await puppeteerLoad( url, {
                waitAfterLoad: 10000,
                allowedTimeToLoad: 120000,
                puppeteerTimeout: 120000
              } );
              if ( error ) {
                simFuzz = error;
              }
            } );
          }
          catch( e ) {
            simFuzz = e;
          }

          winston.info( 'QuickServer: studio fuzz' );
          let studioFuzz = null;
          try {
            await withServer( async port => {
              const url = `http://localhost:${port}/studio/index.html?sim=states-of-matter&phetioDebug&phetioElementsDisplay=all&fuzz`;
              const error = await puppeteerLoad( url, {
                waitAfterLoad: 10000,
                allowedTimeToLoad: 120000,
                puppeteerTimeout: 120000
              } );
              if ( error ) {
                studioFuzz = error;
              }
            } );
          }
          catch( e ) {
            studioFuzz = e;
          }

          const executeResultToOutput = result => {
            return {
              passed: result.code === 0,
              message: `code: ${result.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
            };
          };
          const fuzzResultToOutput = result => {
            if ( result === null ) {
              return { passed: true, message: '' };
            }
            else {
              return { passed: false, message: '' + result };
            }
          };

          // This would take up too much space
          transpileResult.stdout = '';

          this.reportState = {
            lint: executeResultToOutput( lintResult ),
            tsc: executeResultToOutput( tscResult ),
            transpile: executeResultToOutput( transpileResult ),
            simFuzz: fuzzResultToOutput( simFuzz ),
            studioFuzz: fuzzResultToOutput( studioFuzz ),
            shas: shas,
            timestamp: timestamp
          };
        }
      }
      catch( e ) {
        winston.info( `QuickServer error: ${e}` );
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

        if ( requestInfo.pathname === '/aquaserver/quick-status' ) {
          res.writeHead( 200, jsonHeaders );
          res.end( JSON.stringify( this.reportState, null, 2 ) );
        }
      }
      catch( e ) {
        this.setError( `server error: ${e}` );
      }
    } ).listen( port );

    winston.info( `QuickServer: running on port ${port}` );
  }
}

module.exports = QuickServer;
