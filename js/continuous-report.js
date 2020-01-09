// Copyright 2017-2019, University of Colorado Boulder

/**
 * Displays a self-updating report of continuous test results based on the continuous-server.js prototype.
 *
 * See {Results} and {TestResult} type documentation from continuous-server.js
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

'use strict';

// Origin for our server (ignoring current port), so that we don't require localhost
const serverOrigin = window.location.protocol + '//' + window.location.hostname;

/**
 * Returns a CSS class to use given the number of passing results and failing results.
 * @private
 *
 * @param {number} passes
 * @param {number} fails
 * @returns {string} - CSS class
 */
function passFailClass( passes, fails ) {
  if ( passes === 0 && fails === 0 ) {
    return 'status-empty';
  }
  else if ( passes > 0 && fails === 0 ) {
    return 'status-pass';
  }
  else if ( passes === 0 && fails > 0 ) {
    return 'status-fail';
  }
  else {
    return 'status-mixed';
  }
}

// {HTMLElement|null} - Our currently visible dialog element (if any)
let visibleDialog = null;

/**
 * Shows the given element as a dialog, hiding any other dialog if it existed.
 * @private
 *
 * @param {HTMLElement|null} element - To hide all dialogs, pass null
 */
function showDialog( element ) {
  if ( visibleDialog ) {
    document.body.removeChild( visibleDialog );
  }
  visibleDialog = null;
  if ( element ) {
    visibleDialog = element;
    document.body.appendChild( visibleDialog );
  }
}
// Clicks to the background will remove dialogs
document.body.addEventListener( 'click', function() {
  showDialog( null );
} );

/**
 * Turn a ratio to a visible percentage.
 * @private
 *
 * @param {number} ratio
 * @returns {string}
 */
function percentString( ratio ) {
  if ( isNaN( ratio ) ) {
    return ' - ';
  }
  return '' + Math.floor( ratio * 100 );
}

// {Array.<HTMLTableRowElement>} - Our current rows that are not top-level (but are nested below). Will be hidden on collapse.
let childRows = [];
// {boolean} - Whether the display is collapsed (i.e. are we hiding the child rows)
let isCollapsed = true;

/**
 * Updates child row visibility.
 * @private
 */
function updateCollapsed() {
  childRows.forEach( function( row ) {
    row.style.display = isCollapsed ? 'none' : 'table-row';
  } );
}

// Hook our checkbox to handle the collapsed state.
const collapsedCheckbox = document.getElementById( 'collapsedCheckbox' );
collapsedCheckbox.addEventListener( 'change', function() {
  isCollapsed = collapsedCheckbox.checked;
  updateCollapsed();
} );

/**
 * Returns a structure with information on a subtree of the results.
 * @private
 *
 * Returns results of the following duck-type:
 * {
   *   passes: {number} - Total number of passed tests in the subtree
   *   fails: {number} - Total number of failed tests in the subtree
   *   recentPasses: {number} - Passed tests in the subtree for the latest snapshot
   *   recentFails: {number} - Failed tests in the subtree for the latest snapshot
   *   snapshotPasses: {Array.<number>} - Total number of passed tests in the subtree, indexed by the snapshot index.
   *   snapshotFails: {Array.<number>} - Total number of failed tests in the subtree, indexed by the snapshot index.
   *   snapshotMessages: {Array.<string>} - Concatenated messages recorded by tests, indexed by the snapshot index.
   *   snapshotFullCoverage: {Array.<boolean>} - Whether this subtree has complete coverage for the snapshot, indexed by the snapshot index.
   *   domElements: {Array.<HTMLElement>} - Typically <tr> elements for rows of the table we are constructing, except at the top level it consists of one element (the table)
   * }
 *
 * @param {string|null} name - null indicates we are the top-level results node.
 * @param {Results} resultNode - The subtree
 * @param {Array.<Snapshot>} - All visible snapshots
 * @param {string} padding - What to append to the left in front of the name.
 * @param {Array.<string>} path - e.g. [ 'build-a-molecule', 'fuzz', 'require.js' ] - The subtree's parent identifier
 * @returns {Object} - See above.
 */
function recursiveResults( name, resultNode, snapshots, padding, path ) {
  const currentPath = name ? path.concat( name ) : path;
  const results = resultNode.results;
  let passes = results.filter( function( result ) { return result.passed === true; } ).length;
  let fails = results.length - passes;
  const recentResults = results.filter( function( result ) { return result.snapshotName === snapshots[ 0 ].name; } );
  let recentPasses = recentResults.filter( function( result ) { return result.passed === true; } ).length;
  let recentFails = recentResults.length - recentPasses;

  const snapshotPasses = [];
  const snapshotFails = [];
  const snapshotMessages = [];
  const snapshotFullCoverage = []; // Whether there is full test coverage for this snapshot

  // Initialize out counts for passes/fails/messages/coverage
  snapshots.forEach( function( snapshot ) {
    const snapshotResults = results.filter( function( result ) { return result.snapshotName === snapshot.name; } );
    const currentPasses = snapshotResults.filter( function( result ) { return result.passed === true; } ).length;
    const currentFails = snapshotResults.length - currentPasses;
    snapshotPasses.push( currentPasses );
    snapshotFails.push( currentFails );
    snapshotMessages.push( results.filter( function( result ) { return !!result.message && result.snapshotName === snapshot.name; } ).map( function( result ) {
      return currentPath.join( ' : ' ) + '\n' + result.message + '\nApproximately ' + new Date( result.snapshotTimestamp ).toLocaleString();
    } ) );
    snapshotFullCoverage.push( ( passes + fails > 0 ) ? ( currentPasses + currentFails > 0 ) : true );
  } );

  // {Array.<HTMLElement>} - Part of our return value, will be constructed
  let domElements = [];

  // Process children, aggregating their counts into ours
  const childNames = Object.keys( resultNode.children ).sort();
  childNames.forEach( function( childName ) {
    const childResult = recursiveResults( childName, resultNode.children[ childName ], snapshots, name ? ( padding + '&nbsp;&nbsp;&nbsp;&nbsp;' ) : padding, currentPath );
    passes += childResult.passes;
    fails += childResult.fails;
    recentPasses += childResult.recentPasses;
    recentFails += childResult.recentFails;
    for ( let i = 0; i < snapshots.length; i++ ) {
      snapshotPasses[ i ] += childResult.snapshotPasses[ i ];
      snapshotFails[ i ] += childResult.snapshotFails[ i ];
      snapshotMessages[ i ] = snapshotMessages[ i ].concat( childResult.snapshotMessages[ i ] );
      snapshotFullCoverage[ i ] = snapshotFullCoverage[ i ] && childResult.snapshotFullCoverage[ i ];
    }
    domElements = domElements.concat( childResult.domElements );
  } );

  // If we have a name, we'll just handle normally, concatenating table rows
  if ( name ) {
    const selfElements = [];

    // left-most column (our name)
    const leftElement = document.createElement( 'td' );
    leftElement.innerHTML = padding + name;
    leftElement.className = passFailClass( recentPasses, recentFails );
    selfElements.push( leftElement );

    // main table cells
    for ( let j = 0; j < snapshots.length; j++ ) {
      (function() {
        // our table element
        const snapshotElement = document.createElement( 'td' );
        snapshotElement.innerHTML = percentString( snapshotPasses[ j ] / ( snapshotPasses[ j ] + snapshotFails[ j ] ) );
        const messages = snapshotMessages[ j ];

        const uniqueMessages = [];
        const uniqueMessageMap = {};
        messages.forEach( function( message ) {
          if ( !uniqueMessageMap[ message ] ) {
            uniqueMessages.push( message );
          }
          uniqueMessageMap[ message ] = true;
        } );

        // if we have messages, construct the dialog and hook up listeners
        if ( uniqueMessages.length ) {
          snapshotElement.style.border = '1px solid black';
          const snapshotDialog = document.createElement( 'span' );
          snapshotDialog.className = 'snapshotDialog';

          const openLink = document.createElement( 'div' );
          openLink.className = 'linky';
          openLink.addEventListener( 'click', function( evt ) {
            const w = window.open();
            w.document.body.innerHTML =
              uniqueMessages.map( function( message ) {
                return '<pre>\n' + message.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' ) + '\n</pre>';
              } ).join( '' );
          } );
          openLink.innerHTML = 'Open in new tab';
          snapshotDialog.appendChild( openLink );

          for ( let m = 0; m < uniqueMessages.length; m++ ) {
            const pre = document.createElement( 'pre' );
            pre.appendChild( document.createTextNode( uniqueMessages[ m ] ) );
            snapshotDialog.appendChild( pre );
          }
          // absorb events so they don't trigger the document.body listener
          snapshotElement.addEventListener( 'click', function( evt ) {
            showDialog( snapshotDialog );
            evt.stopPropagation();
          } );
          snapshotDialog.addEventListener( 'click', function( evt ) {
            evt.stopPropagation();
          } );
          snapshotElement.style.cursor = 'pointer';
        }

        // apply styling
        snapshotElement.className = passFailClass( snapshotPasses[ j ], snapshotFails[ j ] ) +
                                    ' cell-ratio' +
                                    ( snapshotFullCoverage[ j ] ? ' coverage-full' : ' coverage-partial' );
        selfElements.push( snapshotElement );
      })();
    }

    // Construct our table row
    const tr = document.createElement( 'tr' );
    if ( currentPath.length > 1 ) {
      childRows.push( tr );
    }
    selfElements.forEach( function( td ) {
      tr.appendChild( td );
    } );

    domElements = [ tr ].concat( domElements );
  }
  // With no name, we are the top level. Construct the actual table
  else {
    const headers = [];

    // Left-column header
    const testHeader = document.createElement( 'th' );
    testHeader.innerHTML = 'Test';
    headers.push( testHeader );

    // Headers for each snapshot (show timestamp)
    for ( let k = 0; k < snapshots.length; k++ ) {
      const th = document.createElement( 'th' );
      th.className = 'snapshot-header';
      th.innerHTML = new Date( snapshots[ k ].timestamp ).toLocaleString().replace( /\//g, '&#47;' ).replace( ' ', '<br>' ).replace( ' AM', 'am' ).replace( ' PM', 'pm' );
      headers.push( th );
    }

    const headerRow = document.createElement( 'tr' );
    headers.forEach( function( th ) {
      headerRow.appendChild( th );
    } );

    const table = document.createElement( 'table' );

    table.appendChild( headerRow );
    domElements.forEach( function( element ) {
      table.appendChild( element );
    } );

    // The returned dom element will just have our table
    domElements = [ table ];
  }

  return {
    passes: passes,
    fails: fails,
    recentPasses: recentPasses,
    recentFails: recentFails,
    snapshotPasses: snapshotPasses,
    snapshotFails: snapshotFails,
    snapshotMessages: snapshotMessages,
    snapshotFullCoverage: snapshotFullCoverage,
    domElements: domElements
  };
}

// Kick off a loop that will continuously request reports from the server
(function mainLoop() {
  const req = new XMLHttpRequest();
  req.onload = function() {
    setTimeout( mainLoop, 3000 );
    const data = JSON.parse( req.responseText );
    const container = document.getElementById( 'report-container' );
    while ( container.childNodes.length ) {
      container.removeChild( container.childNodes[ 0 ] );
    }
    childRows = []; // clear these so we don't keep references to old rows
    container.appendChild( recursiveResults( null, data, data.snapshots, '', [] ).domElements[ 0 ] );
    updateCollapsed();
  };
  req.onerror = function() {
    setTimeout( mainLoop, 3000 );
    console.log( 'XHR error?' );
  };
  req.open( 'get', serverOrigin + '/aquaserver/results', true ); // enable CORS
  req.send();
})();

(function snapshotStatusLoop() {
  const element = document.getElementById( 'snapshotStatus' );

  const req = new XMLHttpRequest();
  req.onload = function() {
    setTimeout( snapshotStatusLoop, 1000 );
    const data = JSON.parse( req.responseText );
    element.innerHTML = data.status;
  };
  req.onerror = function() {
    setTimeout( snapshotStatusLoop, 1000 );
    element.innerHTML = '<span style="color: red;">Could not contact server</span>';
    console.log( 'XHR error?' );
  };
  req.open( 'get', serverOrigin + '/aquaserver/snapshot-status', true ); // enable CORS
  req.send();
})();

(function testStatusLoop() {
  const element = document.getElementById( 'testStatus' );

  const req = new XMLHttpRequest();
  req.onload = function() {
    setTimeout( testStatusLoop, 1000 );
    const data = JSON.parse( req.responseText );
    element.innerHTML = data.zeroCounts;
  };
  req.onerror = function() {
    setTimeout( testStatusLoop, 1000 );
    element.innerHTML = '<span style="color: red;">Could not contact server</span>';
    console.log( 'XHR error?' );
  };
  req.open( 'get', serverOrigin + '/aquaserver/test-status', true ); // enable CORS
  req.send();
})();
