// Copyright 2020, University of Colorado Boulder

/**
 * Displays a self-updating report of continuous test results
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Property from '../../../axon/js/Property.js';
import Display from '../../../scenery/js/display/Display.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Rectangle from '../../../scenery/js/nodes/Rectangle.js';
import Text from '../../../scenery/js/nodes/Text.js';
import VBox from '../../../scenery/js/nodes/VBox.js';
import Color from '../../../scenery/js/util/Color.js';

window.assertions.enableAssert();

const options = QueryStringMachine.getAll( {
  server: {
    type: 'string',

    // Origin for our server (ignoring current port), so that we don't require localhost
    defaultValue: window.location.protocol + '//' + window.location.hostname
  }
} );

const passColor = new Color( 60, 255, 60 );
const failColor = new Color( 255, 90, 90 );
const mixedColor = new Color( 255,210,80 );
const unincludedColor = new Color( 128, 128, 128 );
const untestedColor = new Color( 240, 240, 240 );

// Property.<string>
const snapshotStatusProperty = new Property( 'unknown status' );

snapshotStatusProperty.lazyLink( status => console.log( `Status: ${status}` ) );

(function snapshotStatusLoop() {
  const req = new XMLHttpRequest();
  req.onload = function() {
    setTimeout( snapshotStatusLoop, 1000 );
    snapshotStatusProperty.value = JSON.parse( req.responseText ).status;
  };
  req.onerror = function() {
    setTimeout( snapshotStatusLoop, 1000 );
    snapshotStatusProperty.value = 'Could not contact server';
  };
  req.open( 'get', options.server + '/aquaserver/snapshot-status', true );
  req.send();
})();

// Property.<Object|null>
const reportProperty = new Property( {
  snapshots: [],
  testNames: []
} );

(function reportLoop() {
  const req = new XMLHttpRequest();
  req.onload = function() {
    setTimeout( reportLoop, 20000 );
    reportProperty.value = JSON.parse( req.responseText );
  };
  req.onerror = function() {
    setTimeout( reportLoop, 20000 );
    reportProperty.reset();
  };
  req.open( 'get', options.server + '/aquaserver/report', true );
  req.send();
})();

const rootNode = new Node();
const display = new Display( rootNode, {
  passiveEvents: true
} );

document.body.appendChild( display.domElement );

const statusNode = new Text( '', { fontSize: 14 } );
snapshotStatusProperty.link( status => {
  statusNode.text = status;
} );

const reportNode = new Node();

rootNode.addChild( new VBox( {
  spacing: 10,
  align: 'left',
  children: [ statusNode, reportNode ]
} ) );

reportProperty.link( report => {
  const testLabels = report.testNames.map( names => new Text( names.join( ' : ' ), { fontSize: 12 } ) );

  const padding = 3;

  const snapshotLabels = report.snapshots.map( snapshot => new VBox( {
    spacing: 2,
    children: [
      ...new Date( snapshot.timestamp ).toLocaleString().replace( ',', '' ).replace( ' AM', 'am' ).replace( ' PM', 'pm' ).split( ' ' ).map( str => new Text( str, { fontSize: 10 } ) )
    ],
    cursor: 'pointer'
  } ) );

  const maxTestLabelWidth = _.max( testLabels.map( node => node.width ) );
  const maxTestLabelHeight = _.max( testLabels.map( node => node.height ) );
  const maxSnapshotLabelWidth = _.max( snapshotLabels.map( node => node.width ) );
  const maxSnapshotLabelHeight = _.max( snapshotLabels.map( node => node.height ) );

  const snapshotsTestNodes = _.flatten( report.snapshots.map( ( snapshot, i ) => {
    return report.testNames.map( ( names, j ) => {
      const test = _.find( snapshot.tests, test => _.isEqual( names, test.names ) );

      const background = new Rectangle( 0, 0, maxSnapshotLabelWidth, maxTestLabelHeight, {
        x: maxTestLabelWidth + padding + i * ( maxSnapshotLabelWidth + padding ),
        y: maxSnapshotLabelHeight + padding + j * ( maxTestLabelHeight + padding )
      } );

      if ( test ) {
        if ( test.passCount > 0 && test.failCount === 0 ) {
          background.fill = passColor;
        }
        else if ( test.passCount === 0 && test.failCount > 0 ) {
          background.fill = failColor;
        }
        else if ( test.passCount === 0 && test.failCount === 0 ) {
          background.fill = untestedColor;
        }
        else {
          background.fill = mixedColor;
        }
      }
      else {
        background.fill = unincludedColor;
      }

      return background;
    } );
  } ) );

  testLabels.forEach( ( label, i ) => {
    label.left = 0;
    label.top = i * ( maxTestLabelHeight + padding ) + maxSnapshotLabelHeight + padding;
  } );
  snapshotLabels.forEach( ( label, i ) => {
    label.top = 0;
    label.left = ( maxTestLabelWidth + padding ) + i * ( maxSnapshotLabelWidth + padding );
  } );

  reportNode.children = [
    ...testLabels,
    ...snapshotLabels,
    ...snapshotsTestNodes
  ];
} );

display.initializeEvents();
display.updateOnRequestAnimationFrame( dt => {
  display.width = Math.ceil( rootNode.width );
  display.height = Math.ceil( rootNode.height );
} );
