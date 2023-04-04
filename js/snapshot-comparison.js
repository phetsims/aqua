// Copyright 2017-2023, University of Colorado Boulder

/**
 * Capable of running through sims in multiple passes (in-between code changes) to see if there is any behavioral change
 * in the sim resulting from that change.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */


( function() {
  const req = new XMLHttpRequest();
  req.onload = function() {
    const simListText = req.responseText;

    // split string into an array of sim names, ignoring blank lines
    setup( simListText.trim().replace( /\r/g, '' ).split( '\n' ) );
  };
  // location of active sims
  req.open( 'GET', '../../perennial/data/active-runnables', true );
  req.send();
} )();

function setup( simNames ) {
  const snapshots = [];
  window.snapshots = snapshots; // For debugging etc.
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
    },
    compareDescription: {
      type: 'boolean',
      defaultValue: true
    }
  } );

  const addBR = string => string + '<br/>';

  function comparePDOM( oldHTML, newHTML, message ) {
    const container = document.createElement( 'div' );
    comparisonDiv.appendChild( container );

    const diff = document.createElement( 'details' );
    const summary = document.createElement( 'summary' );
    summary.appendChild( document.createTextNode( `${message}: PDOMs different. Compare these two from webstorm diffing.` ) );
    diff.appendChild( summary );
    const diffGuts = document.createElement( 'div' );
    const oldHTMLP = document.createElement( 'p' );
    oldHTMLP.textContent = oldHTML;
    const newHTMLP = document.createElement( 'p' );
    newHTMLP.textContent = newHTML;
    diffGuts.appendChild( oldHTMLP );
    diffGuts.appendChild( newHTMLP );

    diff.appendChild( diffGuts );
    diffGuts.style.fontSize = '4px';

    container.appendChild( diff );

  }

  function compareDescriptionAlerts( oldUtterances, newUtterances, message ) {

    const onlyInOld = []; // Will hold all nodes that will be removed.
    const onlyInNew = []; // Will hold all nodes that will be "new" children (added)

    // Compute what things were added, removed, or stay.
    window.arrayDifference( oldUtterances, newUtterances, onlyInOld, onlyInNew, [] );

    const diff = document.createElement( 'details' );
    const summary = document.createElement( 'summary' );
    summary.appendChild( document.createTextNode( `${message}: Utterances different. ${oldUtterances.length} vs ${newUtterances.length} utterances` ) );
    diff.appendChild( summary );
    const diffGuts = document.createElement( 'div' );
    diff.appendChild( diffGuts );
    const oldHTMLP = document.createElement( 'p' );
    oldHTMLP.innerHTML = `Only in old:<br/> ${onlyInOld.map( addBR )}`;
    const newHTMLP = document.createElement( 'p' );
    newHTMLP.innerHTML = `Only in new:<br/> ${onlyInNew.map( addBR )}`;
    diffGuts.appendChild( oldHTMLP );
    diffGuts.appendChild( newHTMLP );

    comparisonDiv.appendChild( diff );

  }

  const iframe = document.createElement( 'iframe' );
  iframe.setAttribute( 'frameborder', '0' );
  iframe.setAttribute( 'seamless', '1' );
  iframe.setAttribute( 'width', options.simWidth );
  iframe.setAttribute( 'height', options.simHeight );
  document.body.appendChild( iframe );

  const buttonsDiv = document.createElement( 'div' );
  document.body.appendChild( buttonsDiv );

  const snapshotButton = document.createElement( 'button' );
  snapshotButton.textContent = 'Start Snapshot';
  buttonsDiv.appendChild( snapshotButton );

  const clearComparisonsButton = document.createElement( 'button' );
  clearComparisonsButton.textContent = 'Clear Comparisons';
  buttonsDiv.appendChild( clearComparisonsButton );

  const comparisonDiv = document.createElement( 'div' );
  document.body.appendChild( comparisonDiv );
  clearComparisonsButton.addEventListener( 'click', () => { comparisonDiv.innerHTML = ''; } );

  const rowMap = {};
  const table = document.createElement( 'table' );
  options.sims.forEach( sim => {
    const row = document.createElement( 'tr' );
    rowMap[ sim ] = row;
    table.appendChild( row );
    const td = document.createElement( 'td' );
    td.textContent = sim;
    row.appendChild( td );
  } );
  document.body.appendChild( table );

  const childQueryParams =
    `simSeed=${encodeURIComponent( options.simSeed )
    }&simWidth=${encodeURIComponent( options.simWidth )
    }&simHeight=${encodeURIComponent( options.simHeight )
    }&simQueryParameters=${encodeURIComponent( options.simQueryParameters )
    }&numFrames=${encodeURIComponent( options.numFrames )
    }&compareDescription=${encodeURIComponent( options.compareDescription )}`;

  function loadSim( sim ) {
    currentSim = sim;
    currentSnapshot[ currentSim ] = {
      frames: []
    };
    iframe.src = `take-snapshot.html?${childQueryParams}&url=${encodeURIComponent( `../../${sim}/${sim}_en.html` )}`;
  }

  function nextSim() {
    if ( queue.length ) {
      loadSim( queue.shift() );
    }
  }

  let globalStartTime;

  function snapshot() {
    globalStartTime = Date.now();
    currentSnapshot = {};
    snapshots.push( currentSnapshot );
    queue = queue.concat( options.sims ); // TODO: this should likely clear and reset, but since currentSnapshot is reset, everything left in the queue will be appended to the new snapshot. https://github.com/phetsims/aqua/issues/126
    nextSim();
  }

  snapshotButton.addEventListener( 'click', snapshot );

  window.addEventListener( 'message', evt => {
    if ( typeof evt.data !== 'string' ) {
      return;
    }

    const data = JSON.parse( evt.data );

    if ( data.type === 'frameEmitted' ) {
      // number, screenshot: { url, hash }
      currentSnapshot[ currentSim ].frames.push( data );
    }
    else if ( data.type === 'snapshot' ) {
      // basically hash
      const sim = currentSim;
      const snapshot = currentSnapshot;

      snapshot[ sim ].hash = data.hash;
      const td = document.createElement( 'td' );
      td.textContent = data.hash.slice( 0, 6 ) + ( options.showTime ? ` ${Date.now() - globalStartTime}` : '' );
      if ( snapshots.length > 1 && data.hash !== snapshots[ snapshots.length - 2 ][ sim ].hash ) {
        td.style.fontWeight = 'bold';
        td.style.cursor = 'pointer';
        td.addEventListener( 'click', () => {
          const newFrames = snapshot[ sim ].frames;
          const oldFrames = snapshots[ snapshots.indexOf( snapshot ) - 1 ][ sim ].frames;

          let nextIndex = 0;

          function compareNextFrame() {
            const index = nextIndex++;
            if ( index < newFrames.length && index < oldFrames.length ) {
              const oldFrame = oldFrames[ index ];
              const newFrame = newFrames[ index ];

              const dataFrameIndex = `Data Frame ${index}`;

              // support comparing the next data frame after this frame's screenshots have loaded (only when different)
              let compareNextFrameCalledFromScreenshot = false;

              // If this screenshot hash is different, then compare and display the difference in screenshots.
              if ( oldFrame.screenshot.hash !== newFrame.screenshot.hash ) {
                compareNextFrameCalledFromScreenshot = true;
                window.compareImages( oldFrames[ index ].screenshot.url, newFrames[ index ].screenshot.url,
                  dataFrameIndex, options.simWidth, options.simHeight, comparisonDataDiv => {
                    comparisonDataDiv && comparisonDiv.appendChild( comparisonDataDiv );
                    compareNextFrame();
                  } );
              }

              // Compare description via PDOM html
              if ( options.compareDescription && oldFrame.pdom.hash !== newFrame.pdom.hash ) {
                comparePDOM( oldFrame.pdom.html, newFrame.pdom.html, dataFrameIndex );

              }
              // Compare description utterances
              if ( options.compareDescription && oldFrame.descriptionAlert.hash !== newFrame.descriptionAlert.hash ) {
                compareDescriptionAlerts( oldFrame.descriptionAlert.utterances, newFrame.descriptionAlert.utterances, `${dataFrameIndex}, Description` );
              }

              // Compare voicing utterances
              if ( options.compareDescription && oldFrame.voicing.hash !== newFrame.voicing.hash ) {
                compareDescriptionAlerts( oldFrame.voicing.utterances, newFrame.voicing.utterances, `${dataFrameIndex}, Voicing` );
              }

              // Kick off the next iteration if we aren't waiting for images to load
              !compareNextFrameCalledFromScreenshot && compareNextFrame();
            }
          }

          compareNextFrame();
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
