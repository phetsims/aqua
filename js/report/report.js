// Copyright 2020, University of Colorado Boulder

/**
 * Displays a self-updating report of continuous test results
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import EnumerationProperty from '../../../axon/js/EnumerationProperty.js';
import NumberProperty from '../../../axon/js/NumberProperty.js';
import Property from '../../../axon/js/Property.js';
import Enumeration from '../../../phet-core/js/Enumeration.js';
import escapeHTML from '../../../phet-core/js/escapeHTML.js';
import PhetFont from '../../../scenery-phet/js/PhetFont.js';
import Display from '../../../scenery/js/display/Display.js';
import FireListener from '../../../scenery/js/listeners/FireListener.js';
import DOM from '../../../scenery/js/nodes/DOM.js';
import HBox from '../../../scenery/js/nodes/HBox.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Rectangle from '../../../scenery/js/nodes/Rectangle.js';
import RichText from '../../../scenery/js/nodes/RichText.js';
import Text from '../../../scenery/js/nodes/Text.js';
import VBox from '../../../scenery/js/nodes/VBox.js';
import Color from '../../../scenery/js/util/Color.js';
import HorizontalAquaRadioButtonGroup from '../../../sun/js/HorizontalAquaRadioButtonGroup.js';
import Panel from '../../../sun/js/Panel.js';
import TextPushButton from '../../../sun/js/buttons/TextPushButton.js';

// window.assertions.enableAssert();

const options = QueryStringMachine.getAll( {
  server: {
    type: 'string',

    // Origin for our server (ignoring current port), so that we don't require localhost
    defaultValue: window.location.protocol + '//' + window.location.hostname
  }
} );

const passColor = new Color( 60, 255, 60 );
const passColorPartial = new Color( 170, 255, 170 );
const failColor = new Color( 255, 90, 90 );
const failColorPartial = new Color( 255, 190, 190 );
const untestedColor = new Color( 240, 240, 240 );

// {Property.<string>}
const statusProperty = new Property( 'loading...' );
const lastErrorProperty = new Property( '' );

// {Property.<number>}
const startupTimestampProperty = new NumberProperty( 0 );

statusProperty.lazyLink( status => console.log( `Status: ${status}` ) );

(function snapshotStatusLoop() {
  const req = new XMLHttpRequest();
  req.onload = function() {
    setTimeout( snapshotStatusLoop, 1000 );
    const result = JSON.parse( req.responseText );
    statusProperty.value = result.status;
    lastErrorProperty.value = result.lastErrorString;
    startupTimestampProperty.value = result.startupTimestamp;
  };
  req.onerror = function() {
    setTimeout( snapshotStatusLoop, 1000 );
    statusProperty.value = 'Could not contact server';
  };
  req.open( 'get', options.server + '/aquaserver/status', true );
  req.send();
})();

// {Property.<Object|null>}
const reportProperty = new Property( {
  snapshots: [],
  testNames: [],
  testAverageTimes: []
} );

(function reportLoop() {
  const req = new XMLHttpRequest();
  req.onload = function() {
    setTimeout( reportLoop, 20000 );
    reportProperty.value = JSON.parse( req.responseText );
  };
  req.onerror = function() {
    setTimeout( reportLoop, 20000 );

    // Show the most recent results anyway?
    // reportProperty.reset();
  };
  req.open( 'get', options.server + '/aquaserver/report', true );
  req.send();
})();

// {Property.<Array.<string>>} - Which repos to expand!
const expandedReposProperty = new Property( [] );

// {Property.<string>}
const filterStringProperty = new Property( '' );

const Sort = Enumeration.byKeys( [ 'ALPHABETICAL', 'IMPORTANCE', 'ELAPSED_TIME' ] );

// {Property.<Sort>}
const sortProperty = new EnumerationProperty( Sort, Sort.ALPHABETICAL );

const rootNode = new Node();
const display = new Display( rootNode, {
  passiveEvents: true
} );

document.body.appendChild( display.domElement );

const statusNode = new Text( '', { font: new PhetFont( { size: 14 } ) } );
statusProperty.link( status => {
  statusNode.text = status;
} );

const reportNode = new Node();

const filterElement = document.createElement( 'input' );
filterElement.type = 'text';

filterElement.addEventListener( 'change', () => {
  filterStringProperty.value = filterElement.value;
} );

const filterNode = new HBox( {
  spacing: 5,
  children: [
    new Text( 'Filter:', { font: new PhetFont( { size: 12 } ) } ),
    new DOM( filterElement )
  ]
} );

rootNode.addChild( new VBox( {
  x: 10,
  y: 10,
  spacing: 10,
  align: 'left',
  children: [
    statusNode,
    new HBox( {
      spacing: 15,
      children: [
        new TextPushButton( 'Expand all', {
          listener: () => {
            expandedReposProperty.value = _.uniq( reportProperty.value.testNames.map( names => names[ 0 ] ) );
          }
        } ),
        new TextPushButton( 'Collapse all', {
          listener: () => {
            expandedReposProperty.value = [];
          }
        } ),
        new HorizontalAquaRadioButtonGroup( sortProperty, [
          {
            value: Sort.ALPHABETICAL,
            node: new Text( 'Alphabetical', { font: new PhetFont( { size: 12 } ) } )
          },
          {
            value: Sort.IMPORTANCE,
            node: new Text( 'Importance', { font: new PhetFont( { size: 12 } ) } )
          },
          {
            value: Sort.ELAPSED_TIME,
            node: new Text( 'Elapsed Time', { font: new PhetFont( { size: 12 } ) } )
          }
        ], {
          spacing: 10
        } ),
        filterNode
      ]
    } ),
    reportNode
  ]
} ) );

let clipboard = '';
document.addEventListener( 'copy', e => {
  console.log( 'clipboard' );
  e.preventDefault();
  if ( e.clipboardData) {
    e.clipboardData.setData( 'text/plain', clipboard );
  }
  else if ( window.clipboardData ) {
    window.clipboardData.setData( 'Text', clipboard );
  }
} );

const popup = ( triggerNode, message ) => {
  const messageHTML = message.split( '\n' ).map( escapeHTML ).join( '<br>' );
  const messagesNode = new RichText( messageHTML, {
    font: new PhetFont( { size: 12 } ),
    align: 'left'
  } );
  const panel = new Panel( messagesNode, {
    backgroundPickable: true
  } );
  rootNode.addChild( panel );
  // TODO: align if it's at the bottom
  panel.left = triggerNode.right;
  panel.top = triggerNode.top;
  clipboard = message;
  panel.addInputListener( new FireListener( {
    fire: () => panel.detach()
  } ) );
};

Property.multilink( [ reportProperty, expandedReposProperty, sortProperty, filterStringProperty ], ( report, expandedRepos, sort, filterString ) => {
  let tests = [];

  const everythingName = '(everything)';

  tests.push( {
    names: [ everythingName ],
    indices: _.range( 0, report.testNames.length ),
    averageTimes: report.testAverageTimes
  } );

  // scan to determine what tests we are showing
  report.testNames.forEach( ( names, index ) => {
    if ( !expandedRepos.includes( names[ 0 ] ) ) {
      const lastTest = tests[ tests.length - 1 ];
      if ( lastTest && lastTest.names[ 0 ] === names[ 0 ] ) {
        lastTest.indices.push( index );
        lastTest.averageTimes.push( report.testAverageTimes[ index ] );
      }
      else {
        tests.push( {
          names: [ names[ 0 ] ],
          indices: [ index ],
          averageTimes: [ report.testAverageTimes[ index ] ]
        } );
      }
    }
    else {
      tests.push( {
        names: names,
        indices: [ index ],
        averageTimes: [ report.testAverageTimes[ index ] ]
      } );
    }
  } );

  // compute average times
  tests.forEach( test => {
    test.averageTime = _.mean( test.averageTimes.filter( _.identity ) ) || 0;
  } );

  if ( filterString.length ) {
    // Spaces separate multiple search terms
    filterString.split( ' ' ).forEach( filterPart => {
      tests = tests.filter( test => _.some( test.names, name => name.includes( filterPart ) ) );
    } );
  }

  if ( sort === Sort.IMPORTANCE ) {
    tests = _.sortBy( tests, test => {
      const failIndex = _.findIndex( report.snapshots, snapshot => _.some( test.indices, index => snapshot.tests[ index ].n ) );
      const passIndex = _.findIndex( report.snapshots, snapshot => _.some( test.indices, index => snapshot.tests[ index ].y ) );
      if ( failIndex >= 0 ) {
        return failIndex;
      }
      else if ( passIndex >= 0 ) {
        return passIndex + 1000;
      }
      else {
        return 10000;
      }
    } );
  }
  else if ( sort === Sort.ELAPSED_TIME ) {
    tests = _.sortBy( tests, test => -test.averageTime );
  }

  let testLabels = tests.map( test => {
    const label = new Text( test.names.join( ' : ' ), { font: new PhetFont( { size: 12 } ) } );
    if ( test.names[ 0 ] === everythingName ) {
      label.fill = '#999';
    }
    label.addInputListener( new FireListener( {
      fire: () => {
        const topLevelName = test.names[ 0 ];
        if ( test.names.length > 1 ) {
          expandedReposProperty.value = expandedReposProperty.value.filter( name => name !== topLevelName );
        }
        else {
          expandedReposProperty.value = _.uniq( [ ...expandedReposProperty.value, topLevelName ] );
        }
      }
    } ) );
    return label;
  } );

  const padding = 3;

  const snapshotLabels = report.snapshots.map( snapshot => {
    const label = new VBox( {
      spacing: 2,
      children: [
        ...new Date( snapshot.timestamp ).toLocaleString().replace( ',', '' ).replace( ' AM', 'am' ).replace( ' PM', 'pm' ).split( ' ' ).map( str => new Text( str, { font: new PhetFont( { size: 10 } ) } ) )
      ]
    } );
    label.addInputListener( new FireListener( {
      fire: () => {
        popup( label, `${snapshot.timestamp}\n${JSON.stringify( snapshot.shas, null, 2 )}` );
      }
    } ) );
    return label;
  } );

  const maxTestLabelWidth = _.max( testLabels.map( node => node.width ) );
  const maxTestLabelHeight = _.max( testLabels.map( node => node.height ) );
  const maxSnapshotLabelWidth = _.max( snapshotLabels.map( node => node.width ) );
  const maxSnapshotLabelHeight = _.max( snapshotLabels.map( node => node.height ) );

  testLabels = testLabels.map( label => {
    label.left = 0;
    label.top = 0;
    return new Rectangle( 0, 0, maxTestLabelWidth, maxTestLabelHeight, {
      fill: '#fafafa',
      children: [ label ]
    } );
  } );

  const snapshotsTestNodes = _.flatten( report.snapshots.map( ( snapshot, i ) => {
    return tests.map( ( test, j ) => {
      const x = maxTestLabelWidth + padding + i * ( maxSnapshotLabelWidth + padding );
      const y = maxSnapshotLabelHeight + padding + j * ( maxTestLabelHeight + padding );
      const background = new Rectangle( 0, 0, maxSnapshotLabelWidth, maxTestLabelHeight, {
        x: x,
        y: y
      } );

      let totalCount = 0;
      let untestedCount = 0;
      let passCount = 0;
      let failCount = 0;
      let messages = [];

      test.indices.forEach( index => {
        totalCount++;

        const snapshotTest = snapshot.tests[ index ];

        if ( typeof snapshotTest.y === 'number' ) {
          passCount += snapshotTest.y;
          failCount += snapshotTest.n;
          if ( snapshotTest.y + snapshotTest.n === 0 ) {
            untestedCount++;
          }
          if ( snapshotTest.m ) {
            messages = messages.concat( snapshotTest.m.map( message => {
              return `${report.testNames[ index ].join( ' : ' )}\n${message}`;
            } ) );
          }
        }
        else {
          untestedCount++;
        }
      } );

      const completeRatio = totalCount ? ( ( totalCount - untestedCount ) / totalCount ) : 1;

      if ( failCount > 0 ) {
        if ( untestedCount === 0 ) {
          background.fill = failColor;
        }
        else {
          background.fill = failColorPartial;
          background.addChild( new Rectangle( 0, 0, completeRatio * maxSnapshotLabelWidth, maxTestLabelHeight, {
            fill: failColor
          } ) );
        }
      }
      else if ( passCount > 0 ) {
        if ( untestedCount === 0 ) {
          background.fill = passColor;
        }
        else {
          background.fill = passColorPartial;
          background.addChild( new Rectangle( 0, 0, completeRatio * maxSnapshotLabelWidth, maxTestLabelHeight, {
            fill: passColor
          } ) );
        }
      }
      else {
        background.fill = untestedColor;
      }

      if ( messages.length ) {
        background.addInputListener( new FireListener( {
          fire: () => {
            popup( background, messages.join( '\n\n' ) );
          }
        } ) );
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
  display.width = Math.max( window.innerWidth, Math.ceil( rootNode.width ) );
  display.height = Math.max( 400, Math.ceil( rootNode.height ) ) + 100;
} );
