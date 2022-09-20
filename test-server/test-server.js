// Copyright 2016, University of Colorado Boulder


const http = require( 'http' );
const child_process = require( 'child_process' );
const spawn = child_process.spawn;
const path = require( 'path' );

const port = 45361;

// constants
const IS_WIN = /^win/.test( process.platform );
const GRUNT_CMD = IS_WIN ? 'grunt.cmd' : 'grunt'; // needs to be a slightly different command for Windows
const NPM_CMD = IS_WIN ? 'npm.cmd' : 'npm'; // needs to be a slightly different command for Windows

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

// root of your GitHub working copy, relative to the name of the directory that the currently-executing script resides in
const rootDir = path.normalize( `${__dirname}/../../` );

const server = http.createServer( ( req, res ) => {
  const simName = req.url.slice( 1 );

  // validate that it is lower-case with hyphens
  for ( let i = 0; i < simName.length; i++ ) {
    const charCode = simName.charCodeAt( i );
    if ( charCode !== '-'.charCodeAt( 0 ) && ( charCode < 'a'.charCodeAt( 0 ) || charCode > 'z'.charCodeAt( 0 ) ) ) {
      res.writeHead( 403, jsonHeaders );
      res.end( JSON.stringify( {
        output: 'Sim name is invalid',
        success: false
      } ) );
      return;
    }
  }

  function simLog( str ) {
    console.log( `[${new Date().toLocaleString()} ${simName}] ${str}` );
  }

  const success = false;
  let output = '';

  simLog( 'requested' );

  const npmUpdate = spawn( NPM_CMD, [ 'update' ], {
    cwd: rootDir + simName
  } );
  simLog( 'npm update' );
  npmUpdate.stderr.on( 'data', data => {
    output += data;
    simLog( `npm update stderr: ${data}` );
  } );
  npmUpdate.on( 'close', code => {
    simLog( `npm update exit code: ${code}` );

    // npm update failure
    if ( code !== 0 ) {
      res.writeHead( 500, jsonHeaders );
      res.end( JSON.stringify( {
        sim: simName,
        output: `npm update exit code: ${code}`,
        success: false
      } ) );
    }
    // npm update success, continue with grunt
    else {
      const grunt = spawn( GRUNT_CMD, [ '--no-color' ], {
        cwd: rootDir + simName
      } );
      simLog( 'grunt' );

      // accumulate output, send success response if we detect it
      grunt.stdout.on( 'data', data => {
        output += data.toString();
      } );

      grunt.stderr.on( 'data', data => {
        output += data;
        simLog( `grunt stderr: ${data}` );
      } );

      // if no success has been sent, send a response when closed (failure depending on the code)
      grunt.on( 'close', code => {
        simLog( `grunt exited with code ${code}` );
        if ( !success ) {
          res.writeHead( 200, jsonHeaders );
          res.end( JSON.stringify( {
            sim: simName,
            success: code === 0,
            output: output
          } ) );
        }
      } );
    }
  } );
} );

server.setTimeout( 0 );
server.listen( port );

console.log( `running on port ${port} with root directory ${rootDir}` );
