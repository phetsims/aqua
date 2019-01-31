// Copyright 2017, University of Colorado Boulder

/**
 * TODO doc
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

'use strict';

(function() {
  const req = new XMLHttpRequest();
  req.onload = function() {
    const simListText = req.responseText;

    // split string into an array of sim names, ignoring blank lines
    setup( simListText.trim().replace( /\r/g, '' ).split( '\n' ) );
  };
  // location of active sims
  req.open( 'GET', '../../perennial/data/active-runnables', true );
  req.send();
})();

function setup( simNames ) {
  const snapshots = [];
  let queue = [];
  let currentSnapshot;
  let currentSim;

  const options = QueryStringMachine.getAll( {
    sims: {
      type: 'array',
      elementSchema: { type: 'string' },
      defaultValue: simNames
    },
    simSeed: {
      type: 'number',
      defaultValue: 4 // Ideal constant taken from https://xkcd.com/221/, DO NOT CHANGE, it's random!
    },
    simWidth: {
      type: 'number',
      defaultValue: 1024 / 4
    },
    simHeight: {
      type: 'number',
      defaultValue: 768 / 4
    },
    // Note: always assumed to be something?
    simQueryParameters: {
      type: 'string',
      defaultValue: 'brand=phet&ea'
    },
    numFrames: {
      type: 'number',
      defaultValue: 10
    },
    showTime: {
      type: 'boolean',
      defaultValue: true
    }
  } );

  function imageToContext( image ) {
    const canvas = document.createElement( 'canvas' );
    const context = canvas.getContext( '2d' );
    canvas.width = options.simWidth;
    canvas.height = options.simHeight;
    context.drawImage( image, 0, 0 );
    return context;
  }
  function contextToData( context ) {
    return context.getImageData( 0, 0, options.simWidth, options.simHeight );
  }
  function dataToCanvas( data ) {
    const canvas = document.createElement( 'canvas' );
    const context = canvas.getContext( '2d' );
    canvas.width = options.simWidth;
    canvas.height = options.simHeight;
    context.putImageData( data, 0, 0 );
    return canvas;
  }
  function compare( imageA, imageB, msg ) {
    const threshold = 0;

    const a = contextToData( imageToContext( imageA ) );
    const b = contextToData( imageToContext( imageB ) );

    let largestDifference = 0;
    let totalDifference = 0;
    const colorDiffData = document.createElement( 'canvas' ).getContext( '2d' ).createImageData( a.width, a.height );
    const alphaDiffData = document.createElement( 'canvas' ).getContext( '2d' ).createImageData( a.width, a.height );
    for ( let i = 0; i < a.data.length; i++ ) {
      const diff = Math.abs( a.data[ i ] - b.data[ i ] );
      if ( i % 4 === 3 ) {
        colorDiffData.data[ i ] = 255;
        alphaDiffData.data[ i ] = 255;
        alphaDiffData.data[ i - 3 ] = diff; // red
        alphaDiffData.data[ i - 2 ] = diff; // green
        alphaDiffData.data[ i - 1 ] = diff; // blue
      }
      else {
        colorDiffData.data[ i ] = diff;
      }
      const alphaIndex = ( i - ( i % 4 ) + 3 );
      // grab the associated alpha channel and multiply it times the diff
      const alphaMultipliedDiff = ( i % 4 === 3 ) ? diff : diff * ( a.data[ alphaIndex ] / 255 ) * ( b.data[ alphaIndex ] / 255 );

      totalDifference += alphaMultipliedDiff;
      // if ( alphaMultipliedDiff > threshold ) {
        // console.log( message + ': ' + Math.abs( a.data[i] - b.data[i] ) );
      largestDifference = Math.max( largestDifference, alphaMultipliedDiff );
        // isEqual = false;
        // break;
      // }
    }

    const averageDifference = totalDifference / ( 4 * a.width * a.height );

    if ( averageDifference > threshold ) {
      const container = document.createElement( 'div' );
      comparisonDiv.appendChild( container );

      container.appendChild( document.createTextNode( msg + ', largest: ' + largestDifference + ', average: ' + averageDifference ) );
      container.appendChild( document.createElement( 'br' ) );

      container.appendChild( dataToCanvas( a ) );
      container.appendChild( dataToCanvas( b ) );
      container.appendChild( dataToCanvas( colorDiffData ) );
      // container.appendChild( dataToCanvas( alphaDiffData ) );
    }
  }

  const iframe = document.createElement( 'iframe' );
  iframe.setAttribute( 'frameborder', '0' );
  iframe.setAttribute( 'seamless', '1' );
  iframe.setAttribute( 'width', options.simWidth );
  iframe.setAttribute( 'height', options.simHeight );
  document.body.appendChild( iframe );

  const snapshotButton = document.createElement( 'button' );
  snapshotButton.textContent = 'Start Snapshot';
  snapshotButton.style.display = 'block';
  document.body.appendChild( snapshotButton );

  const comparisonDiv = document.createElement( 'div' );
  document.body.appendChild( comparisonDiv );

  const rowMap = {};
  const table = document.createElement( 'table' );
  options.sims.forEach( function( sim ) {
    const row = document.createElement( 'tr' );
    rowMap[ sim ] = row;
    table.appendChild( row );
    const td = document.createElement( 'td' );
    td.textContent = sim;
    row.appendChild( td );
  } );
  document.body.appendChild( table );

  const childQueryParams =
    'simSeed=' + encodeURIComponent( options.simSeed ) +
    '&simWidth=' + encodeURIComponent( options.simWidth ) +
    '&simHeight=' + encodeURIComponent( options.simHeight ) +
    '&simQueryParameters=' + encodeURIComponent( options.simQueryParameters ) +
    '&numFrames=' + encodeURIComponent( options.numFrames );

  function loadSim( sim ) {
    currentSim = sim;
    currentSnapshot[ currentSim ] = {
      screenshots: []
    };
    iframe.src = 'snapshot.html?' + childQueryParams + '&url=' + encodeURIComponent( '../../' + sim + '/' + sim + '_en.html' );
  }
  function nextSim() {
    if ( queue.length ) {
      loadSim( queue.shift() );
    }
    else {
      // TODO
    }
  }

  let globalStartTime;

  function snapshot() {
    globalStartTime = Date.now();
    currentSnapshot = {};
    snapshots.push( currentSnapshot );
    queue = queue.concat( options.sims );
    nextSim();
  }

  snapshotButton.addEventListener( 'click', snapshot );

  window.addEventListener( 'message', function( evt ) {
    if ( typeof evt.data !== 'string' ) {
      return;
    }

    const data = JSON.parse( evt.data );

    if ( data.type === 'screenshot' ) {
      // number, url, hash
      currentSnapshot[ currentSim ].screenshots.push( data );
    }
    else if ( data.type === 'snapshot' ) {
      // basically hash
      const sim = currentSim;
      const snapshot = currentSnapshot;

      snapshot[ sim ].hash = data.hash;
      const td = document.createElement( 'td' );
      td.textContent = data.hash.slice( 0, 6 ) + ( options.showTime ? ' ' + ( Date.now() - globalStartTime ) : '' );
      if ( snapshots.length > 1 && data.hash !== snapshots[ snapshots.length - 2 ][ sim ].hash ) {
        td.style.fontWeight = 'bold';
        td.addEventListener( 'click', function() {
          const newScreenshots = snapshot[ sim ].screenshots;
          const oldScreenshots = snapshots[ snapshots.indexOf( snapshot ) - 1 ][ sim ].screenshots;

          let nextIndex = 0;
          function run() {
            const index = nextIndex++;
            if ( index < newScreenshots.length && index < oldScreenshots.length ) {
              const newImage = document.createElement( 'img' );
              newImage.addEventListener( 'load', function() {
                const oldImage = document.createElement( 'img' );
                oldImage.addEventListener( 'load', function() {
                  compare( oldImage, newImage, 'Snapshot ' + index );
                  run();
                } );
                oldImage.src = oldScreenshots[ index ].url;
              } );
              newImage.src = newScreenshots[ index ].url;
            }
          }
          run();
        } );
      }
      rowMap[ sim ].appendChild( td );
      nextSim();
    }
    else if ( data.type === 'error' ) {
      const errorTd = document.createElement( 'td' );
      errorTd.textContent = 'err';
      rowMap[ currentSim ].appendChild( errorTd );
      nextSim();
    }
  } );

  snapshot();
}
