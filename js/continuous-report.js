// Copyright 2016, University of Colorado Boulder

/**
 * Displays a self-updating report of continuous test results based on the continuous-server.js prototype.
 *
 * See {Results} and {TestResult} type documentation from continuous-server.js
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

/* eslint-env node */
'use strict';

// Origin for our server (ignoring current port), so that we don't require localhost
var serverOrigin = window.location.protocol + '//' + window.location.hostname;

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
var visibleDialog = null;

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
var childRows = [];
// {boolean} - Whether the display is collapsed (i.e. are we hiding the child rows)
var isCollapsed = true;

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
var collapsedCheckbox = document.getElementById( 'collapsedCheckbox' );
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
  var currentPath = name ? path.concat( name ) : path;
  var results = resultNode.results;
  var passes = results.filter( function( result ) { return result.passed === true; } ).length;
  var fails = results.length - passes;

  var snapshotPasses = [];
  var snapshotFails = [];
  var snapshotMessages = [];
  var snapshotFullCoverage = []; // Whether there is full test coverage for this snapshot

  // Initialize out counts for passes/fails/messages/coverage
  snapshots.forEach( function( snapshot ) {
    var snapshotResults = results.filter( function( result ) { return result.snapshotName === snapshot.name; } );
    var currentPasses = snapshotResults.filter( function( result ) { return result.passed === true; } ).length;
    var currentFails = snapshotResults.length - currentPasses;
    snapshotPasses.push( currentPasses );
    snapshotFails.push( currentFails );
    snapshotMessages.push( results.filter( function( result ) { return !!result.message && result.snapshotName === snapshot.name; } ).map( function( result ) {
      return currentPath.join( ' : ' ) + '\n' + result.message + '\nApproximately ' + new Date( result.snapshotTimestamp ).toLocaleString();
    } ) );
    snapshotFullCoverage.push( ( passes + fails > 0 ) ? ( currentPasses + currentFails > 0 ) : true );
  } );

  // {Array.<HTMLElement>} - Part of our return value, will be constructed
  var domElements = [];

  // Process children, aggregating their counts into ours
  var childNames = Object.keys( resultNode.children ).sort();
  childNames.forEach( function( childName ) {
    var childResult = recursiveResults( childName, resultNode.children[ childName ], snapshots, name ? ( padding + '&nbsp;&nbsp;&nbsp;&nbsp;' ) : padding, currentPath );
    passes += childResult.passes;
    fails += childResult.fails;
    for ( var i = 0; i < snapshots.length; i++ ) {
      snapshotPasses[ i ] += childResult.snapshotPasses[ i ];
      snapshotFails[ i ] += childResult.snapshotFails[ i ];
      snapshotMessages[ i ] = snapshotMessages[ i ].concat( childResult.snapshotMessages[ i ] );
      snapshotFullCoverage[ i ] = snapshotFullCoverage[ i ] && childResult.snapshotFullCoverage[ i ];
    }
    domElements = domElements.concat( childResult.domElements );
  } );

  // If we have a name, we'll just handle normally, concatenating table rows
  if ( name ) {
    var selfElements = [];

    // left-most column (our name)
    var leftElement = document.createElement( 'td' );
    leftElement.innerHTML = padding + name;
    leftElement.className = passFailClass( passes, fails );
    selfElements.push( leftElement );

    // main table cells
    for ( var j = 0; j < snapshots.length; j++ ) {
      (function() {
        // our table element
        var snapshotElement = document.createElement( 'td' );
        snapshotElement.innerHTML = percentString( snapshotPasses[ j ] / ( snapshotPasses[ j ] + snapshotFails[ j ] ) );
        var messages = snapshotMessages[ j ];

        // if we have messages, construct the dialog and hook up listeners
        if ( messages.length ) {
          snapshotElement.style.border = '1px solid black';
          var snapshotDialog = document.createElement( 'span' );
          snapshotDialog.className = 'dialog element (if any)';
          for ( var m = 0; m < messages.length; m++ ) {
            var pre = document.createElement( 'pre' );
            pre.appendChild( document.createTextNode( messages[ m ] ) );
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
    var tr = document.createElement( 'tr' );
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
    var headers = [];

    // Left-column header
    var testHeader = document.createElement( 'th' );
    testHeader.innerHTML = 'Test';
    headers.push( testHeader );

    // Headers for each snapshot (show timestamp)
    for ( var k = 0; k < snapshots.length; k++ ) {
      var th = document.createElement( 'th' );
      th.className = 'snapshot-header';
      th.innerHTML = new Date( snapshots[ k ].timestamp ).toLocaleString().replace( /\//g, '&#47;' ).replace( ' ', '<br>' ).replace( ' AM', 'am' ).replace( ' PM', 'pm' );
      headers.push( th );
    }

    var headerRow = document.createElement( 'tr' );
    headers.forEach( function( th ) {
      headerRow.appendChild( th );
    } );

    var table = document.createElement( 'table' );

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
    snapshotPasses: snapshotPasses,
    snapshotFails: snapshotFails,
    snapshotMessages: snapshotMessages,
    snapshotFullCoverage: snapshotFullCoverage,
    domElements: domElements
  };
}

// Kick off a loop that will continuously request reports from the server
(function mainLoop() {
  var req = new XMLHttpRequest();
  req.onload = function() {
    setTimeout( mainLoop, 3000 );
    var data = JSON.parse( req.responseText );
    var container = document.getElementById( 'report-container' );
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
  var element = document.getElementById( 'snapshotStatus' );

  var req = new XMLHttpRequest();
  req.onload = function() {
    setTimeout( snapshotStatusLoop, 1000 );
    var data = JSON.parse( req.responseText );
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
  var element = document.getElementById( 'testStatus' );

  var req = new XMLHttpRequest();
  req.onload = function() {
    setTimeout( testStatusLoop, 1000 );
    var data = JSON.parse( req.responseText );
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
