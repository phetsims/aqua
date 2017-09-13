// Copyright 2017, University of Colorado Boulder

/**
 * TODO doc
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */
/* eslint-env node */
'use strict';

(function() {
  var req = new XMLHttpRequest();
  req.onload = function() {
    var simListText = req.responseText;

    // split string into an array of sim names, ignoring blank lines
    setup( simListText.trim().replace( /\r/g, '' ).split( '\n' ) );
  };
  // location of active sims
  req.open( 'GET', '../../chipper/data/active-runnables', true );
  req.send();
})();

function setup( simNames ) {
  var snapshots = [];
  var queue = [];
  var currentSnapshot;
  var currentSim;

  var options = QueryStringMachine.getAll( {
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
    }
  } );

  var iframe = document.createElement( 'iframe' );
  iframe.setAttribute( 'frameborder', '0' );
  iframe.setAttribute( 'seamless', '1' );
  iframe.setAttribute( 'width', options.simWidth );
  iframe.setAttribute( 'height', options.simHeight );
  document.body.appendChild( iframe );

  var snapshotButton = document.createElement( 'button' );
  snapshotButton.textContent = 'Start Snapshot';
  snapshotButton.style.display = 'block';
  document.body.appendChild( snapshotButton );

  var rowMap = {};
  var table = document.createElement( 'table' );
  options.sims.forEach( function( sim ) {
    var row = document.createElement( 'tr' );
    rowMap[ sim ] = row;
    table.appendChild( row );
    var td = document.createElement( 'td' );
    td.textContent = sim;
    row.appendChild( td );
  } );
  document.body.appendChild( table );

  var childQueryParams =
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

  function snapshot() {
    currentSnapshot = {};
    snapshots.push( currentSnapshot );
    queue = queue.concat( options.sims );
    nextSim();
  }

  snapshotButton.addEventListener( 'click', snapshot );

  window.addEventListener( 'message', function( evt ) {
    var data = JSON.parse( evt.data );

    if ( data.type === 'screenshot' ) {
      // number, url, hash
      currentSnapshot[ currentSim ].screenshots.push( data );
    }
    else if ( data.type === 'snapshot' ) {
      // basically hash
      currentSnapshot[ currentSim ].hash = data.hash;
      var td = document.createElement( 'td' );
      td.textContent = data.hash.slice( 0, 6 );
      if ( snapshots.length > 1 && data.hash !== snapshots[ snapshots.length - 2 ][ currentSim ].hash ) {
        td.style.fontWeight = 'bold';
      }
      rowMap[ currentSim ].appendChild( td );
      nextSim();
    }
    else if ( data.type === 'error' ) {
      var errorTd = document.createElement( 'td' );
      errorTd.textContent = 'err';
      rowMap[ currentSim ].appendChild( errorTd );
      nextSim();
    }
  } );

  snapshot();
}
